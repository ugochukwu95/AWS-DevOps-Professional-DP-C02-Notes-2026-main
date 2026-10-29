# Redis, the stream, and rollout

## Hot state in Redis

ElastiCache (Valkey or Redis) holds only what the live product reads. It is not the ledger.

| Key | Type | TTL | Written by |
| --- | --- | --- | --- |
| `driver:{id}` | Hash | 30–60 s, refreshed on each fix | Ingest |
| `cell:{h3}` | Set of driver ids | none; membership updated on cell change | Ingest |
| `offer:{driverId}` | String | 10–20 s | Matcher |
| `trip:{id}` | Hash | life of the trip | Trip API |

If you stay on Redis geo instead of H3, the city geo key replaces `cell:{h3}`. See [Geospatial indexing and matching](Geospatial%20indexing%20and%20matching.md).

Ingest rules:

- Compare the new timestamp with the hash. Drop the write if it is older than what is stored (reordered QoS 1 duplicates, slow retries).
- Refresh `EXPIRE` on every accepted fix.
- Update the cell set only when `h3` changes.
- Publish to the trip topic only if `tripId` is set on the hash.

Network, as in the [ElastiCache notes](../Amazon%20ElastiCache/Security,%20resilience,%20monitoring,%20and%20caching%20patterns.md): private subnets, TLS, security group open only to the gateway and the matcher, AUTH/RBAC or IAM auth, Multi-AZ with automatic failover. A location cache without failover is a city-wide blank map during a node failure.

Eviction policy should not silently drop driver hashes under memory pressure. Size the cluster for the key set and alert on memory. `noeviction` (writes fail) is louder and safer than losing available drivers at random. The cell sets must stay consistent with the hashes; a dropped hash without an `SREM` leaves a ghost id, so the matcher already filters on TTL freshness.

## The log

Redis can lose the last few seconds in a failover and has no history. The stream is the copy you can replay.

```text
Gateway
  ├─ Redis SET          synchronous, must succeed for the pin to move
  └─ produce(location)  async, batched, does not block the socket read loop
           │
           ▼
     Kinesis or Kafka
           ├─ consumer: trip fan-out / geofence (if not done in the gateway)
           ├─ consumer: fraud and earnings (aggregate, do not run per raw tick against a SQL DB)
           └─ Firehose or Kafka Connect → S3  (partition by date/hour/city)
```

| Need | AWS choice |
| --- | --- |
| One team, moderate volume, least to operate | **Kinesis Data Streams**, partition key = `driverId`, then **Firehose** to S3 |
| Several consumers, Kafka Connect, or you may leave AWS later | **MSK Serverless** (IAM auth) or a small MSK cluster |
| Searchable archive | S3 + Athena. Glue catalog on the Firehose prefix. |

Ordering is **per driver**, not global. The partition or shard key is `driverId`. Consumers treat the message as idempotent on `(driverId, ts)`.

Retention on the raw topic is hours, not weeks. Raw GPS at a few-second interval is a large bill if you keep it in Kafka. Compacted downsamples (one point per driver per 30 s, or one point per H3 cell change) can live longer if a consumer needs "last known" replay. Full history belongs in S3, preferably the downsampled stream plus a sample of raw.

Produce failures: if the broker is down, **keep updating Redis** and buffer or drop log records. A gap in the warehouse is acceptable. A frozen map is not. Record the drop count.

Do not consume the raw topic with Lambda at one invocation per point once you are past a prototype. A small ECS consumer that batches writes is easier to reason about and cheaper.

## S3 layout

```text
s3://company-locations/
  raw/city=lagos/dt=2026-10-28/hr=09/   ...
  rollup/city=lagos/dt=2026-10-28/      one row per driver per minute, or per cell
```

Lifecycle: expire `raw/` after 30–90 days unless legal/fraud needs longer. Keep rollups. Earnings jobs should read rollups or trip summaries, not scan every GPS fix.

## Rollout

Build in this order. Each step is useful before the next exists.

1. **Trip API** on ordinary HTTPS (create trip, accept, complete). Positions are still fake or polled slowly. This is the product.
2. **Redis latest position** written by a single ingest process. Matcher reads `GEOSEARCH` or one H3 ring. Riders poll `GET /trips/{id}` every few seconds. Enough for a closed beta.
3. **MQTT (or WebSocket) from the driver app** into IoT Core or one ECS service. Ingest updates Redis. LWT marks offline. Turn the poll down; the rider can still poll.
4. **Push to the rider** on `trips/{id}/location` for the active trip only.
5. **Kinesis or MSK**, Firehose, S3. Replay a day into Athena and check that Redis and the log agree on last position per driver.
6. **H3 cell sets** when geo-key hotness or zone analytics show up. Keep writing the geo index until the cell path matches it in shadow mode.
7. **Replace the managed broker** with your own gateway only after connection count or IoT cost says so. Same topics, same Redis keys.

Load-test step 3 with a simulator (many MQTT clients, a realistic mix of idle and on-trip intervals) before a public launch. Watch: accepted messages/s, Redis p99, consumer lag, file descriptors, reconnects after you kill one task.

## What to alarm on

| Signal | Why |
| --- | --- |
| Connected drivers vs drivers with `ts` fresher than 30 s | Apps think they are online; ingest is not landing |
| Age of the newest fix, per city | The map is stuck |
| Broker authorization denies | Bad app release or expired tokens |
| Produce error / consumer lag | Warehouse falling behind; hot path should still be fine |
| Redis CPU, memory, replication lag, evictions | Matching latency and ghost drivers |
| NLB healthy targets and connection count per task | Scale-out and deploy health |
| Offer-lock failures and match-empty rate | Not enough drivers, or the ring is too small |

## Failure cheat sheet

| Failure | User impact | Designed behavior |
| --- | --- | --- |
| One gateway task dies | Those sockets drop | Clients reconnect with jitter to other tasks. Redis still has the last fix until TTL. |
| Redis failover | Brief read errors | Matcher retries. Positions from the last second may be missing. Log is unchanged. |
| Kafka/Kinesis down | None on the map | Gateway keeps Redis updates, counts dropped log records, backfills if you buffered. |
| Driver in a tunnel | Pin freezes, then jumps | Expected. QoS 0 and no replay. Status stays online until keepalive/LWT. |
| Bad GPS jump | Car teleports | Server rejects the point. Previous fix remains until a plausible one arrives. |

## Exam overlap

DOP-C02 will not ask you to design H3. It can ask where streaming ingest, a low-latency cache, and durable delivery to S3 show up. Those answers stay **Kinesis Data Streams**, **Firehose to S3**, and **ElastiCache**. This folder is the product reason those services exist next to each other, and the point at which a custom gateway replaces API Gateway.
