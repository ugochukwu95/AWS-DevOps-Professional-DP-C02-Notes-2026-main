# 16 Metrics, logs and autoscaling (Weeks 11-13)

**Goal**: see what taskq is doing (metrics and logs), scale the api automatically on CPU, and explain why the autoscaler did or didn't act.

## The three layers of observability you need first

| Signal | Question | taskq source | Tool |
| --- | --- | --- | --- |
| **Resource metrics** | How much CPU and memory does each pod and node use? | kubelet / cAdvisor | **metrics-server** → `kubectl top`, HPA |
| **Application metrics** | Requests, errors, queue depth | `/metrics` on api :8080 and worker :8081 | Prometheus (optional) or CloudWatch |
| **Logs** | What happened, in order? | JSON lines on stdout (`log/slog`) | `kubectl logs`; Fluent Bit → CloudWatch Logs on EKS |
| **Events** | What did Kubernetes do? | The API server | `kubectl get events` (about 1 hour retention) |

Start with metrics-server and `kubectl logs`. Add Prometheus only when you have a question they can't answer.

## metrics-server
It scrapes each kubelet's resource metrics every 15s and serves them through the `metrics.k8s.io` API. It isn't a time-series database: it holds only current values.

```bash
# kind: the kubelets use self-signed certificates, so allow insecure TLS (lab only)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system patch deploy metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl -n kube-system rollout status deploy/metrics-server

# EKS: install the managed add-on instead (no TLS patch needed)
aws eks create-addon --cluster-name taskq --addon-name metrics-server

kubectl top nodes
kubectl -n taskq top pods --containers
```

`kubectl top` says `error: Metrics API not available` until metrics-server is ready. That's the same error the HPA will report.

## Logs
taskq logs JSON, one object per line, so you can filter by field:

```bash
kubectl -n taskq logs deploy/worker --since=10m | jq -c 'select(.msg=="job failed")'
kubectl -n taskq logs -l app.kubernetes.io/name=api --prefix --tail=50 | grep '"code":5'
kubectl -n taskq logs <pod> --previous         # the container that crashed
```

Container logs live **on the node** (`/var/log/pods/...`) and are rotated by the kubelet. They disappear when the pod is deleted or the node is replaced. That's why production clusters ship them elsewhere.

### On EKS: CloudWatch Container Insights and logs
The **Amazon CloudWatch Observability** add-on installs the CloudWatch agent (node and pod metrics: Container Insights) and Fluent Bit (container logs to CloudWatch Logs). It needs IAM, again through Pod Identity:

```bash
# Role trusted by pods.eks.amazonaws.com with the CloudWatchAgentServerPolicy managed policy
aws eks create-addon --cluster-name taskq --addon-name amazon-cloudwatch-observability \
  --pod-identity-associations serviceAccount=cloudwatch-agent,roleArn=arn:aws:iam::<acct>:role/taskq-cloudwatch
```

Then, in CloudWatch Logs Insights on `/aws/containerinsights/taskq/application`:

```
fields @timestamp, kubernetes.pod_name, log_processed.msg, log_processed.job
| filter kubernetes.namespace_name = "taskq" and log_processed.level = "ERROR"
| sort @timestamp desc
```

Exercise: add the add-on to [main.tf](taskq/terraform/eks/main.tf) yourself, with a `worker_pod_identity`-style module block for its role.

### Optional: Prometheus
If you want PromQL and Grafana, `kube-prometheus-stack` (Helm) gives you Prometheus, Alertmanager, Grafana, kube-state-metrics and node-exporter. Scrape taskq with a PodMonitor:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: taskq
  namespace: taskq
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app.kubernetes.io/part-of: taskq
  podMetricsEndpoints:
    - port: http      # api
    - port: health    # worker
```

Queries worth knowing:

| Question | PromQL |
| --- | --- |
| Request rate by code | `sum by (code) (rate(taskq_http_requests_total[5m]))` |
| Queue backlog | `taskq_jobs{status="pending"}` (it's a gauge, so take `max`, since every api pod reports it) |
| Job failure rate | `rate(taskq_jobs_failed_total[5m])` |
| CPU throttling | `rate(container_cpu_cfs_throttled_periods_total{namespace="taskq"}[5m]) / rate(container_cpu_cfs_periods_total{namespace="taskq"}[5m])` |
| Recent OOM kills | `kube_pod_container_status_last_terminated_reason{namespace="taskq",reason="OOMKilled"}` |
| Restarts | `increase(kube_pod_container_status_restarts_total{namespace="taskq"}[1h])` |

## Horizontal Pod Autoscaler (HPA)
Every 15s the HPA controller computes:

```
desired replicas = ceil(current replicas × current metric / target metric)
```

For CPU, "current metric" is **average usage as a percentage of the CPU request**. So with a request of 50m and a target of 70%, the HPA aims for about 35m per pod. Without a CPU request, the HPA can't compute utilization and reports `<unknown>`.

Behaviours to know:
- **Scale-up** is fast by default. **Scale-down** waits for a 5-minute stabilization window (the chart sets it explicitly), to avoid flapping.
- Pods that aren't ready, or have just started, are treated conservatively, so a slow startup delays scaling.
- `minReplicas` ≥ 2 keeps redundancy. `maxReplicas` protects the database from too many connections (each api pod opens up to 5).

### Lab 16.1: Autoscale the api
With Argo CD (note 15), set `api.hpa.enabled: true` in [values-kind.yaml](taskq/helm/taskq/values-kind.yaml), then commit and push. With plain manifests, use `kubectl -n taskq autoscale deploy api --cpu-percent=70 --min=2 --max=6`.

```bash
kubectl -n taskq get hpa api -w          # TARGETS shows cpu: 4%/70%

# Generate load from inside the cluster
kubectl -n taskq run load --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'while true; do curl -s -o /dev/null http://api/jobs/1; done'
kubectl -n taskq run load2 --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'while true; do curl -s -o /dev/null http://api/jobs/1; done'

kubectl -n taskq describe hpa api        # events: "New size: 4; reason: cpu resource utilization above target"
kubectl -n taskq top pods -l app.kubernetes.io/name=api
kubectl -n taskq delete pod load load2
# watch it scale down after about 5 minutes
```

Write down: how long did scale-up take from load start to new pods being Ready? Which parts of that time were HPA sync, scheduling, image pull and probes?

### Why the HPA didn't scale: checklist
1. `kubectl describe hpa`: conditions `AbleToScale`, `ScalingActive`, `ScalingLimited`, and the events.
2. `<unknown>` targets: metrics-server missing, or no CPU request on the container.
3. Already at `maxReplicas`.
4. New pods are `Pending`: no room on the nodes. The HPA did its job; you need **node** autoscaling.
5. The load isn't CPU-bound. taskq's api waits on Postgres, so CPU stays low while latency climbs. CPU is the wrong signal for I/O-bound services.

## Scaling the worker
CPU is a poor signal for the worker too. What matters is **queue depth** (`taskq_jobs{status="pending"}`). Options:
- An HPA on an **external or custom metric**, through a Prometheus adapter or CloudWatch metrics adapter.
- **KEDA**, which scales Deployments on queue length, a SQL query or many other sources, including scale to zero.

Both add a component. Keep the worker at a fixed count unless you have a backlog problem to solve, and practise explaining when you'd add KEDA.

## Node autoscaling (concepts only)
The HPA adds pods; something must add **nodes** when pods are Pending:
- **Cluster Autoscaler** adjusts the managed node group's ASG desired size (within min and max) when pods can't be scheduled, and removes underused nodes.
- **Karpenter** watches Pending pods and launches right-sized EC2 instances directly, then consolidates.
- **EKS Auto Mode** does it for you.

Each one respects PDBs when removing nodes (note 17).

**Check yourself**
1. The HPA shows `cpu: <unknown>/70%`. Give two causes.
2. Request 50m, target 70%, 2 pods averaging 105m. How many replicas will the HPA want?
3. Why is CPU the wrong metric for the worker, and what would you use?
4. Logs from a pod on a node that was terminated yesterday: where are they?
