# 02 Linux processes and container networking (Weeks 1-2)

**Goal**: explain, hop by hop, how `curl localhost:8080/jobs` on your Mac reaches the Go process inside a container, and know where to look when it doesn't.

A container is not a VM. It is **an ordinary Linux process** with:
- **namespaces**: what it can *see* (its own PID tree, network stack, filesystem, hostname)
- **cgroups**: what it can *use* (CPU, memory, PIDs)
- a **root filesystem** from the image layers

Everything Kubernetes does to a pod ultimately becomes these three things on a node.

## Where Linux is on a Mac
macOS isn't Linux. Docker Desktop runs a small Linux VM, and every container (including the kind nodes) runs inside it. To look at the "host" the containers really run on:

```bash
# A root shell in the Docker Desktop VM's namespaces
docker run --rm -it --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh
```

You'll use this to see container processes, veth interfaces and iptables rules. A general-purpose network toolbox image is also handy:

```bash
docker pull nicolaka/netshoot   # dig, curl, ss, tcpdump, ip, iptables, nc...
```

## Part 1: Processes

### Concepts

| Concept | What to know |
| --- | --- |
| **PID 1** | The first process in a PID namespace. In a container, that's your entrypoint. If PID 1 exits, the container stops |
| **Signals** | `SIGTERM` (15) asks a process to stop and can be handled. `SIGKILL` (9) can't be caught. `docker stop` and the kubelet send SIGTERM, wait for the grace period (10s Docker, 30s Kubernetes), then SIGKILL |
| **PID 1 is special** | The kernel does **not** apply default signal actions to PID 1. If your program doesn't install a SIGTERM handler, SIGTERM is ignored and you always wait for the SIGKILL |
| **Shell vs exec form** | `ENTRYPOINT /api` (shell form) runs `/bin/sh -c /api`, so the shell is PID 1 and may not forward signals. `ENTRYPOINT ["/api"]` (exec form) makes your binary PID 1 |
| **Zombies** | Exited children that nobody `wait()`ed for. PID 1 must reap them. Go binaries that don't fork are fine. Shell-script entrypoints that spawn children need `tini` or `--init` |
| **Exit codes** | `0` success, `1` app error, `137` = 128+9 (SIGKILL, often OOM), `143` = 128+15 (SIGTERM) |

taskq handles this with `signal.NotifyContext(ctx, SIGINT, SIGTERM)`: the api calls `srv.Shutdown()`, and the worker finishes its current job. See [cmd/api/main.go](taskq/cmd/api/main.go).

### Lab 1.1: Run taskq as plain processes
```bash
cd Kubernetes/taskq
make pg-up                    # needs the kind network: run `make cluster-up` first, or pg-up creates it
make run-api                  # terminal 1
make run-worker               # terminal 2
curl -s -XPOST localhost:8080/jobs -d '{"payload":{"n":1}}'
curl -s localhost:8080/jobs/1 | jq
```

In a third terminal:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E '8080|8081|5432'   # who is listening on what
pgrep -fl 'cmd/api'                                       # find the process
kill -TERM <pid>                                          # watch terminal 1 log "shutting down"
```

### Lab 1.2: Signals and PID 1 in a container
```bash
docker build -t taskq:dev .
docker run -d --name api --network kind -p 8080:8080 \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' taskq:dev

docker top api                 # PID as seen from the VM: a normal process
docker exec -it api sh         # fails: distroless has no shell (you'll use nsenter / kubectl debug instead)
time docker stop api           # returns in well under 10s because SIGTERM is handled
docker logs api | tail -3      # "shutting down"
docker inspect api --format '{{.State.ExitCode}}'
docker rm api
```

Now break it on purpose: write a two-line Dockerfile with `FROM alpine` and `ENTRYPOINT sleep 1000` (shell form, no handler). Run `time docker stop` on it. It takes 10 seconds and exits with 137. Explain why.

### Lab 1.3: See the namespaces
```bash
docker run -d --name api --network kind -p 8080:8080 \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' taskq:dev
PID=$(docker inspect -f '{{.State.Pid}}' api)

# Inside the VM shell from "Where Linux is on a Mac":
ls -l /proc/$PID/ns              # net, pid, mnt, uts, ipc, cgroup: compare to `ls -l /proc/1/ns`
cat /proc/$PID/cgroup            # its cgroup path
nsenter -t $PID -n ip addr       # the container's network namespace: eth0 with a 172.x IP
nsenter -t $PID -n ss -ltn       # listening on *:8080
```

`nsenter -t $PID -n` runs a command from the VM inside the container's **network** namespace only, so you get the VM's tools with the container's view of the network. `kubectl debug` (note 10) does the same thing for pods.

## Part 2: Container networking

### Concepts

| Piece | What it is |
| --- | --- |
| **Network namespace** | A separate network stack: interfaces, routes, iptables, ports |
| **veth pair** | A virtual cable. One end is `eth0` in the container, the other end is `vethXXXX` attached to a bridge on the host |
| **Bridge** | A virtual switch (`docker0`, or `br-<id>` for user-defined networks such as `kind`) that connects the veths |
| **Port publishing** (`-p 8080:8080`) | A DNAT rule (or `docker-proxy`): traffic to host:8080 is rewritten to container-ip:8080 |
| **Masquerade (SNAT)** | Outbound traffic from containers gets the host's IP so replies come back |
| **Embedded DNS** (127.0.0.11) | On user-defined networks, Docker resolves container names (`taskq-pg`). The default `bridge` network doesn't |

### The path of `curl localhost:8080/jobs` (container on Docker Desktop)

```mermaid
flowchart LR
  curl[curl on macOS] -->|"localhost:8080"| ddfwd[Docker Desktop port forwarder]
  ddfwd -->|"into the VM"| vmport[VM host port 8080]
  vmport -->|"DNAT"| bridge[br-kind bridge]
  bridge -->|"veth pair"| eth0[container eth0 172.18.0.x]
  eth0 --> proc["/api listening on :8080"]
  proc -->|"DNS taskq-pg via 127.0.0.11"| pg[(taskq-pg 5432)]
```

1. macOS: `curl` connects to `127.0.0.1:8080`. Docker Desktop's backend listens there and forwards the connection into the VM.
2. VM: the published port matches a DNAT rule, so the destination becomes `172.18.0.x:8080`.
3. The packet goes across the `kind` bridge, through the veth pair, and arrives on the container's `eth0`.
4. The process is listening on `0.0.0.0:8080` (Go's `":8080"`), so the kernel hands it the connection.
5. To reach Postgres, the api resolves `taskq-pg` via Docker's embedded DNS, then connects over the same bridge.

### Lab 2.1: Look at each hop
```bash
docker network inspect kind | jq '.[0].Containers'          # containers and IPs on the bridge
docker port api                                              # 8080/tcp -> 0.0.0.0:8080
docker run --rm --network container:api nicolaka/netshoot ip addr      # share api's netns
docker run --rm --network container:api nicolaka/netshoot ss -ltnp
docker run --rm --network container:api nicolaka/netshoot cat /etc/resolv.conf   # nameserver 127.0.0.11
docker run --rm --network container:api nicolaka/netshoot dig taskq-pg
```

In the VM shell:

```bash
ip link | grep veth                 # one veth per container
iptables -t nat -S | grep 8080      # the DNAT rule for the published port
```

### Lab 2.2: Classic failures (break each one, then fix it)

| Break it | Symptom | How you prove it |
| --- | --- | --- |
| Run with `-p 8080:9090` (wrong container port) | `curl: (52) Empty reply` or connection reset | `docker port api`, then `ss -ltn` in the netns shows 8080, not 9090 |
| Run with `-e PORT=9090 -p 8080:8080` | Same as above | Logs say `listening :9090` |
| Run on the default bridge (omit `--network kind`) | `/readyz` returns "database unreachable ... lookup taskq-pg" | `dig taskq-pg` fails: the default bridge has no embedded DNS |
| `docker stop taskq-pg` | `/healthz` 200, `/readyz` 503, `POST /jobs` 503 | Readiness separates "process alive" from "can do work" |
| An app that listens on `127.0.0.1:8080` | Works with `docker exec curl`, fails from the host | `ss -ltn` shows `127.0.0.1:8080`. Loopback inside the netns isn't reachable via eth0 |

The last row is one of the most common real-world bugs: a dev server that binds to localhost works on a laptop and fails in every container.

## How this maps to Kubernetes
- A **pod** is one network namespace shared by its containers. Containers in a pod talk over `localhost`.
- The **CNI plugin** (kindnet locally, VPC CNI on EKS) creates the veth pair and assigns the pod IP.
- A **Service** is a virtual IP that kube-proxy turns into DNAT rules, just like `-p`, but load-balanced across pods.
- **CoreDNS** replaces Docker's embedded DNS.

**Check yourself**
1. Your container exits with code 137 and you never sent a signal. What are the two most likely reasons? (OOM kill, or a stop timeout followed by SIGKILL.)
2. Why does `docker stop` take exactly 10 seconds for some images?
3. Draw the hops for `curl localhost:8080` and name the Linux feature behind each.
4. Two containers on the same `kind` network: by name or IP, and why does it work there but not on `bridge`?
