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
| **Zombies** | Exited children that nobody `wait()`ed for. PID 1 must reap them. See [Zombie processes](#zombie-processes) below |
| **Exit codes** | `0` success, `1` app error, `137` = 128+9 (SIGKILL, often OOM), `143` = 128+15 (SIGTERM) |

### Zombie processes
Linux keeps processes in a parent–child tree. The first process the kernel starts in a namespace has PID 1. In a container, whatever you set as `ENTRYPOINT` or `CMD` (in exec form) is usually PID 1 in that namespace.

**Exited children that nobody `wait()`ed for.** When a process creates a child, the child eventually exits. The kernel does not remove it from the process table immediately: it leaves a small record with the exit status. That state is a **zombie** (the process is dead, but its slot still exists). The parent is supposed to call `wait()` (or `waitpid()`) to read the status; then the kernel drops the zombie. If the parent never waits, the zombie stays until the parent exits or is reaped by someone else. Zombies use little memory, but each one holds a PID, and a container has a PID limit.

**PID 1 must reap them.** If a parent exits while a child is still running, the child becomes an **orphan**. Orphans are adopted by PID 1 in that namespace. PID 1 is then responsible for calling `wait()` when those children finish. Cleaning up dead children like that is **reaping**. On a normal Linux host, PID 1 is an init system (for example `systemd`) built to reap orphans. Inside a container, your application is often PID 1, and most apps are not init systems: they do not loop on `wait()` for random adopted children.

**Go binaries that don't fork are fine.** A typical Go server (taskq's `/api` and `/worker`) uses goroutines and does not spawn separate OS child processes for normal work. No children means no zombies from your app. Running the binary directly as PID 1 (exec-form `ENTRYPOINT ["/api"]`) is safe for that reason.

**Shell-script entrypoints that spawn children need `tini` or `--init`.** Many images use `#!/bin/sh` entrypoints that export variables and then `exec` the real binary, or run stacks that fork often (Node, Python, some web servers). A bare shell is a poor PID 1: children orphaned under it may never get reaped, zombies accumulate, and you can hit the PID limit or see odd behavior under load. **tini** is a minimal init meant to be PID 1: it forwards signals (for example `SIGTERM` to your app) and reaps zombies. `docker run --init` injects Docker's bundled tini the same way. Kubernetes has no direct equivalent of `--init`; use an image that already uses exec form, add `tini` as the entrypoint with your app as its child, or rely on a wrapper only when you actually fork children.

| Situation | Typical fix |
| --- | --- |
| Single compiled binary, no `fork`/`exec` | Exec-form `ENTRYPOINT`, no tini (taskq) |
| Shell wrapper or process that forks workers | `tini` as PID 1, or `docker run --init` locally |
| Zombie pile-up inside a running container | `ps aux` shows `<defunct>`; fix the entrypoint, not just restart |

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

If `docker run -p 8080:8080` fails with **port is already allocated**, something on your Mac already listens on that port: often **kind** (`taskq-control-plane` maps host `8080`), or **`make run-api`** (`:8080`) and **`make run-worker`** (`:8081` for health). Stop those processes or pick another **host** port. The container still listens on **8080 inside**; only the left side of `-p` changes:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN    # who owns the port?
docker rm -f api                    # remove a container left in Created state after a failed run
```

```bash
docker build -t taskq:dev .
HOST_PORT=18080                     # any free port from lsof
docker run -d --name api --network kind -p ${HOST_PORT}:8080 \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' taskq:dev
curl -s localhost:${HOST_PORT}/healthz

docker top api                 # PID as seen from the VM: a normal process
docker exec -it api sh         # fails: distroless has no shell (you'll use nsenter / kubectl debug instead)
time docker stop api           # returns in well under 10s because SIGTERM is handled
docker logs api | tail -3      # "shutting down"
docker inspect api --format '{{.State.ExitCode}}'
docker rm api
```

Now break it on purpose: write a two-line Dockerfile with `FROM alpine` and `ENTRYPOINT sleep 1000` (shell form, no handler). Run `time docker stop` on it. It takes 10 seconds and exits with 137. Explain why.

### Lab 1.3: See the namespaces
Use the same `HOST_PORT` as lab 1.2 if `8080` is taken.

```bash
docker run -d --name api --network kind -p ${HOST_PORT:-8080}:8080 \
  -e DATABASE_URL='postgres://taskq:taskq@taskq-pg:5432/taskq?sslmode=disable' taskq:dev
PID=$(docker inspect -f '{{.State.Pid}}' api)
echo "PID $PID is valid inside Docker Desktop's Linux VM, not on macOS"
```

**macOS has no `/proc`.** If `ls /proc/$PID/ns` fails with *No such file or directory*, you ran the lab in Terminal on the Mac. `docker inspect` returns the container's PID **in the VM**. Run the Linux commands through a container that shares the VM's PID namespace:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' api)

docker run --rm --privileged --pid=host alpine sh -c "
  ls -l /proc/$PID/ns
  cat /proc/$PID/cgroup | head -3
"

docker run --rm --privileged --pid=host alpine nsenter -t $PID -n ip addr
docker run --rm --privileged --pid=host alpine nsenter -t $PID -n ss -ltn   # *:8080
```

Compare with PID 1 (the VM init inside Docker Desktop): `docker run --rm --privileged --pid=host alpine ls -l /proc/1/ns`.

**Without `nsenter`**, share the container's network namespace instead:

```bash
docker run --rm --network container:api nicolaka/netshoot ip addr
docker run --rm --network container:api nicolaka/netshoot ss -ltn
```

`nsenter -t $PID -n` runs a command inside the container's **network** namespace only. `kubectl debug` (note 10) does the same thing for pods.

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
