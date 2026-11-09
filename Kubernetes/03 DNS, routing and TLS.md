# 03 DNS, routing and TLS (Weeks 1-2)

**Goal**: when a connection fails, you can tell whether it's a name problem (DNS), a path problem (routing or firewall), a port problem (nothing listening), or a trust problem (TLS). They have different symptoms.

| Error | Layer | First command |
| --- | --- | --- |
| `no such host`, `NXDOMAIN`, `SERVFAIL` | DNS | `dig <name>` |
| `i/o timeout`, hangs then fails | Routing, firewall or security group (packets dropped) | `ip route get <ip>`, `nc -vz -w3 <ip> <port>` |
| `connection refused` | Host reached, nothing listening on that port (or a REJECT rule) | `ss -ltn` on the target |
| `connection reset` | Something accepted, then killed the connection (crashing app, proxy, wrong protocol) | Logs on the target, `curl -v` |
| `x509: certificate signed by unknown authority`, `certificate is valid for X, not Y` | TLS | `openssl s_client` |

Learn this table by heart. "Timeout" vs "refused" alone tells you a lot.

## Part 1: DNS

### Concepts
- **`/etc/resolv.conf`** tells the resolver which nameserver to ask (`nameserver`), which suffixes to try (`search`), and how (`options ndots:N`).
- **`ndots`**: if a name has fewer than N dots, the search suffixes are tried **first**. In Kubernetes, `ndots:5` means `api.example.com` (2 dots) is first tried as `api.example.com.taskq.svc.cluster.local`, then `.svc.cluster.local`, then `.cluster.local`, and only then as-is. A trailing dot (`api.example.com.`) skips the search list.
- **Record types you'll meet**: `A`/`AAAA` (IP), `CNAME` (alias, which is what `ExternalName` Services are), `SRV` (port and host, which Kubernetes creates for named Service ports), `PTR` (reverse).
- **TTL and caching**: a stale cache can keep sending you to an old IP. CoreDNS caches for 30s by default.

### Kubernetes DNS names

| Name | Resolves to |
| --- | --- |
| `api` (from a pod in `taskq`) | The `api` Service's ClusterIP, via the search list |
| `api.taskq` | Same, from any namespace |
| `api.taskq.svc.cluster.local` | Fully qualified |
| `postgres-0.postgres.taskq.svc.cluster.local` | A specific StatefulSet pod (headless Service) |
| `postgres.taskq.svc.cluster.local` for a headless Service | The pod IPs directly (no ClusterIP) |

### Lab 3.1: Docker DNS
```bash
docker run --rm --network kind nicolaka/netshoot cat /etc/resolv.conf
docker run --rm --network kind nicolaka/netshoot dig taskq-pg +short
docker run --rm nicolaka/netshoot dig taskq-pg          # default bridge: NXDOMAIN or uses your Mac's DNS
docker run --rm nicolaka/netshoot dig example.com +trace | tail -5
```

### Lab 3.2: Kubernetes DNS (after note 00 step 7)
```bash
kubectl -n taskq run dns --rm -it --image=nicolaka/netshoot --restart=Never -- bash
# inside the pod:
cat /etc/resolv.conf                     # nameserver 10.96.0.10, search taskq.svc.cluster.local ..., ndots:5
dig api.taskq.svc.cluster.local +short   # the ClusterIP
dig +search api +short                   # same, through the search list
dig postgres.taskq.svc.cluster.local     # ClusterIP for the external Service
dig _http._tcp.api.taskq.svc.cluster.local SRV
dig example.com +search +showsearch      # watch it try the cluster suffixes first (ndots)
```

Then look at the server side:

```bash
kubectl -n kube-system get svc kube-dns                 # 10.96.0.10, the IP in resolv.conf
kubectl -n kube-system get cm coredns -o yaml           # the Corefile: kubernetes plugin, forward . /etc/resolv.conf, cache 30
kubectl -n kube-system logs -l k8s-app=kube-dns
```

**Check yourself**: a pod resolves `api` fine but `api.example.com` takes 5 seconds. Why? (ndots:5 means several failing cluster-suffix lookups first. Fix with a trailing dot, or `dnsConfig.options ndots: 2`.)

## Part 2: Routing

### Concepts
- A **route table** says: for destination X, send via interface Y (and gateway Z). The most specific prefix wins, and `default` is the catch-all.
- **`ip route get <ip>`** answers "which way will a packet to this IP go?" Always ask that before guessing.
- **NAT** rewrites addresses: DNAT for inbound (published ports, Services), SNAT/masquerade for outbound (containers going to the internet, pods going to an off-cluster database).
- **Pod networking (kind)**: each node gets a pod CIDR (for example `10.244.1.0/24`). kindnet adds routes on each node, such as "10.244.2.0/24 via the IP of taskq-worker2".

### Lab 3.3: Read the routes
```bash
# A pod's view
kubectl -n taskq run net --rm -it --image=nicolaka/netshoot --restart=Never -- ip route
# A node's view
docker exec taskq-worker ip route                    # routes to other nodes' pod CIDRs
kubectl get nodes -o custom-columns=NAME:.metadata.name,PODCIDR:.spec.podCIDR
docker exec taskq-worker ip route get 10.244.2.5     # which interface and next hop
```

### Lab 3.4: Timeout vs refused
```bash
kubectl -n taskq run net --rm -it --image=nicolaka/netshoot --restart=Never -- bash
nc -vz -w3 postgres 5432        # open
nc -vz -w3 postgres 5433        # refused: the host is there, nothing on 5433
nc -vz -w3 10.255.255.1 5432    # timeout: no route or dropped
```

## Part 3: TLS

### Concepts
- **What TLS gives you**: encryption, integrity, and **server identity** (the certificate proves "I am `api.taskq.local`" because a CA you trust signed it).
- **The handshake (TLS 1.3, simplified)**: ClientHello (SNI, which is the hostname you want, and the supported ciphers) → ServerHello and the certificate chain → the client verifies the chain to a trusted root, verifies the hostname against the SAN, and checks validity dates → keys are agreed and encrypted traffic starts.
- **SAN (Subject Alternative Name)**: the hostnames a certificate is valid for. The CN field is ignored by modern clients. Most "valid for X, not Y" errors are a SAN mismatch.
- **Chain**: leaf → intermediate(s) → root. Servers must send the intermediates. "Works in a browser, fails with curl" often means a missing intermediate.
- **Where TLS terminates**: at the load balancer (ALB with an ACM certificate, note 14), at an ingress, or in the app. Behind the terminator, traffic is plain HTTP unless you re-encrypt.
- **Postgres TLS**: `sslmode=disable|require|verify-full`. Only `verify-full` checks identity.

### Lab 3.5: Inspect real certificates
```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | head -20
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
curl -v https://example.com 2>&1 | grep -E 'SSL|subject|issuer|expire'
```

### Lab 3.6: A self-signed CA for the api
Make your own CA, issue a certificate for `api.taskq.local`, and terminate TLS in front of the api with a tiny Go reverse proxy, or just inspect the certificate.

```bash
mkdir -p /tmp/tls && cd /tmp/tls
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout ca.key -out ca.crt -subj "/CN=taskq-lab-ca"
openssl req -newkey rsa:2048 -nodes -keyout api.key -out api.csr -subj "/CN=api.taskq.local"
printf "subjectAltName=DNS:api.taskq.local,DNS:localhost" > san.ext
openssl x509 -req -in api.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 7 -out api.crt -extfile san.ext
openssl x509 -in api.crt -noout -text | grep -A1 'Subject Alternative Name'

# A throwaway TLS server using the certificate
openssl s_server -accept 8443 -cert api.crt -key api.key -www &
curl https://localhost:8443                       # fails: unknown authority
curl --cacert ca.crt https://localhost:8443       # works: localhost is in the SAN
curl --cacert ca.crt --resolve wrong.local:8443:127.0.0.1 https://wrong.local:8443   # fails: SAN mismatch
kill %1
```

In Kubernetes this pair becomes a `kubernetes.io/tls` Secret: `kubectl create secret tls api-tls --cert=api.crt --key=api.key`.

## Readiness check for Weeks 1-2
Without notes, on a whiteboard or in your journal:
1. Trace `curl localhost:8080/jobs` to the Go process when taskq runs (a) as a Docker container, and (b) behind a kind NodePort Service. Name every hop and the Linux feature behind it (port forwarding, DNAT, bridge, veth, netns, socket).
2. Then work through this checklist when it fails:

| Question | Command |
| --- | --- |
| Is the process running, and did it crash? | `docker ps -a`, `docker logs`, exit code |
| Is it listening, on which address and port? | `ss -ltn` in its netns |
| Is the port published or mapped correctly? | `docker port`, Service `targetPort` |
| Does the name resolve, and to what? | `dig` from the client's netns |
| Is there a route, and is it timing out or refused? | `ip route get`, `nc -vz` |
| Is TLS the issue? | `curl -v`, `openssl s_client` |
| Is it the dependency, not the app? | `/readyz`, logs mentioning Postgres |
