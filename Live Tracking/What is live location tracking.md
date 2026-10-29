# What is live location tracking?

Live tracking is the system that keeps a **current position** for many moving clients (drivers) and shows it to other clients (riders) within about a second. Ride-hailing, delivery, field service, and asset tracking all share this shape.

This folder is **practical architecture**, not DOP-C02 material. The exam already covers the managed pieces you will reuse: [Kinesis](../AWS%20kinesis/What%20is%20Amazon%20Kinesis.md), [ElastiCache](../Amazon%20ElastiCache/What%20is%20Amazon%20ElastiCache.md), [API Gateway WebSocket](../API%20Gateway/What%20is%20Amazon%20API%20Gateway.md), ECS, and load balancers. Uber-scale systems replace the front door. Startups should not copy that front door on day one.

## Why a normal API does not fit

A location tick is a tiny, frequent, loss-tolerant message. HTTP is the wrong default:

| Approach | What goes wrong |
| --- | --- |
| REST `POST /location` through API Gateway + Lambda | New request overhead every tick, Lambda concurrency, per-request price. Fine for a demo at 1 update / 15 s. Falls over as the product becomes "live". |
| Aurora or MongoDB as the live store | A database write per tick (thousands per second) burns IOPS and still is not fast enough for "cars near me". |
| SNS or EventBridge per tick | Built for fan-out of business events, not a 2-byte-class telemetry stream held open on a phone. |
| API Gateway WebSocket + Lambda per message | Holds the socket, but every message is still an integration call. Idle limits, account connection quotas, and latency make it a poor driver pipe. |

Use a short-lived HTTP API for **trips, payments, and auth**. Use a long-lived stream for **positions**.

## Four layers

```text
Phone (driver or rider)
   │  MQTT or WebSocket, TLS, port 443
   ▼
Edge gateway          holds the TCP connection, authenticates, rate-limits
   │
   ├──► Redis         latest position only (the read path for matching and the map)
   │
   └──► Kafka/Kinesis append-only log (analytics, pay, fraud) → S3 later
```

| Layer | Job | Startup default | Scale-out default |
| --- | --- | --- | --- |
| **Protocol** | Survive bad mobile networks with tiny messages | MQTT over WebSocket (TLS/443) | Same protocol, own broker or gateway |
| **Gateway** | Hold 10k–100k idle sockets per machine | AWS IoT Core, or one Go/Elixir service behind an NLB | Go, Netty, or Elixir, many instances |
| **Geospatial index** | "Who is near this pickup?" as a key lookup | Redis `GEOSEARCH`, or H3 cell sets in Redis | H3 (Uber) or S2 at the cell resolution you match on |
| **Pipeline** | Do not block the hot path on disk or warehouses | ElastiCache + Kinesis Data Streams + Firehose → S3 | ElastiCache + Kafka (MSK) → S3 |

## Two speeds of data

| | Hot path | Cold path |
| --- | --- | --- |
| Question | Where is this driver **right now**? | Where were they all day? |
| Store | Redis, TTL measured in seconds | Kafka/Kinesis, then S3 |
| Latency budget | Sub-millisecond read, sub-second end-to-end | Seconds to hours |
| If it fails | Map goes stale; riders notice immediately | Payroll and fraud jobs lag; riders do not |

The gateway **writes Redis first** and produces to the log **asynchronously**. Matching must not wait for Kafka.

## What "real-time" should mean

Send positions on a timer **and** when the device has moved. Typical startup policy:

| State | Interval |
| --- | --- |
| Available, not moving | 15–30 s, or only when the user opens the app |
| Available, moving | 4–5 s |
| On a trip | 2–4 s |
| Rider watching a trip | Push from the server; the rider does not poll the driver |

One update per second per driver looks good in a demo and dominates battery, mobile data, and broker cost. Raise the rate only for the active trip.

## Startup shape vs Uber shape

**Startup (first city, hundreds to a few thousand concurrent drivers)**

- Managed MQTT ([AWS IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/what-is-aws-iot.html)) or a single MQTT/WebSocket service on ECS.
- ElastiCache Redis for latest location and nearby search.
- Kinesis Data Streams (or MSK Serverless) plus Firehose to S3.
- Riders on a trip subscribe to one trip topic. The "cars on the map" view can poll Redis every few seconds for the viewport. That poll is a normal API.

**Large fleet (dense city, 10k+ concurrent sockets per region)**

- Custom edge gateways (Go or Netty, sometimes Erlang/Elixir) behind a Network Load Balancer.
- H3 cell ids as the nearby-search key.
- Kafka as the system log, Redis still the live map.
- WebSocket push for viewport subscriptions, not polling.

Build the startup shape so the **message, Redis keys, and topic names** stay the same when you replace IoT Core with your own gateway. The swap is then a connection problem, not a data-model rewrite.

## Related notes

- [Protocol and edge gateways](Protocol%20and%20edge%20gateways.md)
- [Geospatial indexing and matching](Geospatial%20indexing%20and%20matching.md)
- [Redis, the stream, and rollout](Redis,%20the%20stream,%20and%20rollout.md)
