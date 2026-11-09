# 09 RBAC and ServiceAccounts (Weeks 3-6)

**Goal**: explain how the API server decides whether a request is allowed, give each workload and person the minimum access they need, and debug a `Forbidden` error quickly.

## Authentication, then authorization, then admission
Every API request passes three gates:

| Gate | Question | Examples |
| --- | --- | --- |
| **Authentication** | Who are you? | Client certificates (kind's admin kubeconfig), ServiceAccount tokens, OIDC, AWS IAM on EKS (note 13) |
| **Authorization** | Are you allowed to do *this verb* on *this resource* in *this namespace*? | **RBAC** |
| **Admission** | Is the object acceptable (and should it be modified)? | Pod Security Admission, LimitRange defaults, webhooks |

Kubernetes has **no user objects**. A "user" is whatever string the authenticator returns (`jane`, `arn:aws:iam::...`), plus groups. Only **ServiceAccounts** are real API objects.

## RBAC objects

| Object | Scope | Purpose |
| --- | --- | --- |
| **Role** | Namespace | A set of rules: `apiGroups` + `resources` + `verbs` |
| **ClusterRole** | Cluster | The same, for cluster-scoped resources (nodes, PVs) or for reuse across namespaces |
| **RoleBinding** | Namespace | Grants a Role *or ClusterRole* to subjects **in that namespace** |
| **ClusterRoleBinding** | Cluster | Grants a ClusterRole everywhere |

Subjects are a `User`, a `Group`, or a `ServiceAccount`. RBAC is **additive only**: there are no deny rules, so the only way to remove access is to remove a binding.

Built-in ClusterRoles worth knowing: `view`, `edit`, `admin` (bind them per namespace with a RoleBinding) and `cluster-admin` (everything).

### Verbs

| Verb | kubectl |
| --- | --- |
| `get`, `list`, `watch` | `get`, `describe`, `-w` |
| `create`, `update`, `patch`, `delete` | `apply`, `edit`, `delete` |
| Subresources such as `pods/log`, `pods/exec`, `pods/portforward`, `deployments/scale` | `logs`, `exec`, `port-forward`, `scale` |

`pods/exec` is effectively full access to the container and its Secrets. Grant it carefully.

## taskq's RBAC
[60-rbac.yaml](taskq/k8s/60-rbac.yaml) defines a `taskq-viewer` Role (read pods, logs, Services, Deployments, events) and binds it to the group `taskq-viewers`. In week 9 you'll map an AWS IAM role to that group on EKS.

### Lab 9.1: Test permissions with impersonation
You're `cluster-admin` on kind, so you can impersonate anyone:

```bash
kubectl auth whoami
kubectl auth can-i --list -n taskq --as=jane --as-group=taskq-viewers
kubectl auth can-i get pods -n taskq --as=jane --as-group=taskq-viewers         # yes
kubectl auth can-i get secrets -n taskq --as=jane --as-group=taskq-viewers      # no
kubectl auth can-i create pods/exec -n taskq --as=jane --as-group=taskq-viewers # no
kubectl auth can-i get pods -n kube-system --as=jane --as-group=taskq-viewers   # no
kubectl get pods -n taskq --as=jane --as-group=taskq-viewers
kubectl get secrets -n taskq --as=jane --as-group=taskq-viewers                 # Forbidden
```

Read the Forbidden message carefully. It names the user, verb, resource, API group and namespace, which is everything you need to write the missing rule.

## ServiceAccounts
Every pod runs as a ServiceAccount (`default` if unspecified). With a token mounted, the pod can call the Kubernetes API as that identity.

taskq's api and worker never call the Kubernetes API, so [15-serviceaccounts.yaml](taskq/k8s/15-serviceaccounts.yaml) creates one ServiceAccount each with `automountServiceAccountToken: false`. Why one per workload even without permissions?
- **Cloud IAM attaches to ServiceAccounts.** On EKS, the worker's ServiceAccount gets S3 access through Pod Identity (note 13). The api must not get that.
- Least privilege by default: if someone later binds a role to `default`, every pod in the namespace gets it.

Tokens today are **projected, short-lived and audience-bound** (rotated by the kubelet, about 1 hour), not the old non-expiring Secret tokens.

### Lab 9.2: A pod that talks to the API
Build a tiny "job auditor" that lists pods, to feel the full loop: ServiceAccount, Role, RoleBinding, token.

```bash
kubectl -n taskq create serviceaccount auditor
kubectl -n taskq run auditor --rm -it --image=nicolaka/netshoot --restart=Never \
  --overrides='{"spec":{"serviceAccountName":"auditor"}}' -- bash
# inside:
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
curl -s --cacert $CA -H "Authorization: Bearer $TOKEN" \
  https://kubernetes.default.svc/api/v1/namespaces/taskq/pods | head -20
# 403 Forbidden: "system:serviceaccount:taskq:auditor" cannot list pods
```

In another terminal, grant the minimum and retry the `curl`:

```bash
kubectl -n taskq create role pod-reader --verb=get,list --resource=pods
kubectl -n taskq create rolebinding auditor-pod-reader --role=pod-reader --serviceaccount=taskq:auditor
kubectl auth can-i list pods -n taskq --as=system:serviceaccount:taskq:auditor   # yes
```

Decode the token's claims to see what it really is:

```bash
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null; echo   # iss, aud, exp, sub=system:serviceaccount:taskq:auditor
```

Clean up with `kubectl -n taskq delete sa auditor; kubectl -n taskq delete role pod-reader; kubectl -n taskq delete rolebinding auditor-pod-reader`.

## Pod Security Admission
Namespace labels decide which pod security standard is enforced. taskq's [00-namespace.yaml](taskq/k8s/00-namespace.yaml) enforces `baseline` (no privileged pods, host namespaces or hostPath) and **warns** on `restricted` (non-root, no privilege escalation, capabilities dropped, seccomp).

```bash
kubectl -n taskq run priv --image=nginx --overrides='{"spec":{"containers":[{"name":"priv","image":"nginx","securityContext":{"privileged":true}}]}}'
# Error: violates PodSecurity "baseline:latest": privileged
kubectl -n taskq run plain --image=nginx      # allowed, but prints restricted warnings
kubectl -n taskq delete pod plain
```

taskq's own pods meet `restricted`: `runAsNonRoot`, numeric UID 65532 from the [Dockerfile](taskq/Dockerfile), `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault` and a read-only root filesystem.

## Debugging Forbidden: the checklist
1. **Who am I?** `kubectl auth whoami` (or `--as`). On EKS this is where IAM mapping bugs show up.
2. **What exactly was denied?** Read the verb, resource, group and namespace in the message.
3. **Can I?** `kubectl auth can-i <verb> <resource> -n <ns> --as=<who>`.
4. **What bindings exist?** `kubectl get rolebindings,clusterrolebindings -A -o wide | grep <subject>`.
5. **Common mistakes**: a Role in the wrong namespace, a binding to `serviceaccount:default` instead of the app's ServiceAccount, the wrong `apiGroups` (Deployments are `apps`, not `""`), a missing subresource (`pods/log`).

**Check yourself**
1. Why is "can create pods in namespace X" nearly equivalent to "can read all Secrets in X"?
2. RoleBinding to a ClusterRole: what scope does the grant have?
3. Why give the api its own ServiceAccount if it has no RBAC permissions?
4. A CI pipeline needs to deploy taskq. Write the minimum Role.
