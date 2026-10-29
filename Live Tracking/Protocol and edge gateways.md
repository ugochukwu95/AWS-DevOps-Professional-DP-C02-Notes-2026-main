# Protocol and edge gateways

The edge is the process that holds the phone's TCP connection. Everything else in the system sees already-authenticated location events.

## MQTT

MQTT is a pub/sub protocol for small messages on unreliable networks. A client connects once, then publishes and subscribes. The header can be a few bytes. That is why driver apps prefer it over HTTP.

Use **MQTT over WebSocket on port 443** for mobile apps. Cellular networks and office proxies often block raw MQTT (1883/8883) and allow HTTPS. Keep 8883 for devices you control (trackers, a driver tablet on a private APN).

### QoS and sessions

| Setting | Use for |
| --- | --- |
| **QoS 0** (at most once) | Position ticks. A lost fix is replaced by the next one. Queuing old points wastes battery and shows the car jumping through the past. |
| **QoS 1** (at least once) | Trip commands: assigned, arrived, started, completed, cancelled. |
| **QoS 2** | Skip on mobile. The extra handshake is not worth it for location. |
| **Clean start** | Location connections. Do not replay a backlog after a tunnel. |
| **Persistent session** | The command channel, so an assignment made in a tunnel is waiting when the radio returns. |
| **Last Will (LWT)** | Broker publishes `offline` if the socket dies without a clean disconnect. Dispatch treats that driver as gone. |
| **Retained message** | Optional last status on the status topic. Do not retain the location topic or new subscribers receive a stale pin. |

Split the connection in your head even if it is one socket: **telemetry is disposable, commands are durable**.

### Topic and ACL design

Identity comes from the connection (certificate or token), not from the JSON body.

```text
drivers/{driverId}/location     driver publishes, QoS 0
drivers/{driverId}/status       online / offline, LWT, QoS 1
trips/{tripId}/location         server republishes to the rider on that trip
trips/{tripId}/commands         both sides, QoS 1 (arrive, start, cancel)
```

Authorize in the broker:

- A driver can **publish** only `drivers/{theirId}/#`.
- A driver can **subscribe** only to their open trip.
- A rider can **subscribe** only to `trips/{theirTripId}/#`.
- No client can subscribe to `drivers/#`. Nearby cars are a **server query** to Redis, not a client wildcard subscription.

### Payload

Keep the phone payload small. The server fills derived fields.

```json
{
  "ts": 1710000000123,
  "lat": 6.5244,
  "lng": 3.3792,
  "heading": 182,
  "speedMps": 8.2,
  "accuracyM": 12
}
```

Reject points with impossible jumps (for example a implied speed over ~200 km/h between the last accepted fix and this one), timestamps far in the future, or accuracy worse than a threshold you choose (often 50–100 m in a city). Store **server receive time** next to client `ts`. Matching uses server time so a phone with a bad clock cannot pin itself in the past.

## WebSockets

A raw WebSocket is a byte pipe. You invent the frames, heartbeats, and acks that MQTT already has. Use it when the product is mostly a browser, or when you want one Go service and full control of the framing (often protobuf).

If you do:

- Authenticate on connect (short-lived JWT on the upgrade request).
- Ping at least every 20 s. An ALB idle timeout defaults to 60 s (max 4000 s). Silent sockets get cut.
- Send a close frame with "please reconnect" before a deploy.
- Clients reconnect with **full jitter** (random delay up to the backoff cap). A deploy that drops 50k sockets at once will otherwise stampede the fleet.

MQTT-over-WebSocket gives you the mobile behavior without inventing that protocol.

## Managed gateway: AWS IoT Core

IoT Core is a managed MQTT broker with TLS, per-client policies, and a rules engine. It is the right first gateway until message volume or custom fan-out makes the per-message price the product's problem.

Set up, in order:

1. **Thing policy** (or a fleet policy) that allows `iot:Connect` only as that client's id, `iot:Publish` only to that driver's topics, `iot:Subscribe` / `iot:Receive` only to that driver's trip topics.
2. **Auth.** Production mobile apps usually use a **custom authorizer** (Lambda) that checks a short-lived JWT from your login API, or fleet provisioning that issues an X.509 cert per install. A single shared cert in the app binary is not an identity.
3. **Domain on 443.** Configure the AWS IoT device endpoint and connect with MQTT over WSS so the app looks like HTTPS.
4. **Rule** on `drivers/+/location`. Action: write onward. Prefer a rule that lands on **Kinesis** or a VPC destination your workers read. Do not put Lambda on every tick unless the city is still small.
5. **Last-will** wired by the app to the status topic. A rule or the gateway marks the Redis record offline.
6. **Logging** to CloudWatch for connect failures and authorization denies. Those two logs are how you debug "driver app says online, dispatch says not".

IoT Core bills by message (metered in 5 KB chunks) and by connection time. Ten thousand drivers at one message a second is a large invoice. The update policy in the overview note is the cost control.

**Device Shadow** is a last-known JSON document with a desired/reported model. It is useful for config ("share location: on"). It is a poor live-location store: update limits and price are wrong for multi-hertz GPS. Shadow for settings, Redis for the pin.

**Basic Ingest** (`$aws/rules/...`) skips the pub/sub path and is cheaper when **no client** needs the message. Driver telemetry that only your servers consume can use it. Trip updates that a rider subscribes to cannot.

## Custom edge gateway

Build this when IoT Core cost, latency, or fan-out (pushing viewport updates to many riders from the same process) forces you off the managed broker. The language choice is about **idle connections per machine**:

| Runtime | Why teams pick it | Ops note |
| --- | --- | --- |
| **Go** | goroutines, simple deploys, one static binary | A large instance can hold on the order of 100k idle sockets if file descriptors and memory are tuned |
| **Netty (Java)** | Mature non-blocking I/O, back-pressure primitives | Heavier image; same connection-oriented ops as Go |
| **Erlang / Elixir** | Lightweight BEAM processes; WhatsApp and Discord sit on this model | Phoenix Channels is a practical WebSocket gateway. Rolling ECS deploys, not hot code upgrade |

### What has to be true on the box

Idle connections use little CPU and a lot of **file descriptors and RAM** (often tens of KB per socket in Go, less on the BEAM).

- Raise `nofile` for the process (systemd unit or ECS `ulimits`). 100k sockets means well over 100k file descriptors.
- Set the listen backlog (`somaxconn`) so a reconnect wave is queued instead of reset.
- Health check on a **separate port**. Do not health-check the MQTT port in a way that opens and closes a real client session.
- One task holds state only for sockets connected **to it**. The latest location lives in Redis, so killing a task loses connections, not positions.
- On SIGTERM: stop accepting, tell clients to reconnect, wait out the deregistration delay, then exit. NLB/ALB **deregistration delay** must be longer than that drain.

### Load balancer

| Listener | Balancer | Why |
| --- | --- | --- |
| Raw MQTT/TLS **8883** | **NLB** (TCP or TLS) | Does not speak HTTP. Preserves long connections. |
| MQTT-over-WebSocket or plain WebSocket **443** | **NLB** or **ALB** | ALB understands the HTTP upgrade and can attach WAF. NLB is the usual choice once connection counts are the bottleneck. |

ALB idle timeout and stickiness matter if you terminate WebSockets there. NLB does not need stickiness: the TCP connection itself pins the client to one target until it reconnects.

Run gateways in **private subnets**. The load balancer is the public surface. Security group: balancer → gateway on the listener port only.

Scale on a **custom connection-count metric**, not CPU. These processes sit near-idle while "full".

### Deploy without a self-inflicted outage

Rolling deploys disconnect everyone on the task you replace. Clients must reconnect with jittered exponential backoff (cap at 30–60 s, random spread). Publish the connection count and reconnect rate. A healthy deploy looks like a dip on one task and a smooth ramp on the others, not a retry storm and a broker CPU pegged at 100%.

## Auth and abuse

- Bind `driverId` from the cert or JWT. Ignore any id inside the payload.
- Per-connection rate limit (for example drop location frames faster than 1 per second sustained).
- Per-account connection cap so one leaked token cannot open tens of thousands of sockets.
- Rotate signing keys. Keep access tokens short (minutes) and use a refresh token over HTTPS, not over the telemetry socket.
- WAF fits an ALB WebSocket edge. It does not inspect raw MQTT. For MQTT, identity and broker ACLs are the control.
