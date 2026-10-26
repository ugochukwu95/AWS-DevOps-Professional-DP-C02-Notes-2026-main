# Aurora Serverless v2

On-demand, auto-scaling Aurora configuration. Capacity is defined in **ACUs** (Aurora Capacity Units): ~2 GiB memory + proportional CPU/networking per ACU. Min/max ACU range is set at **cluster** level; each instance scales within that range. Pay per ACU-second consumed.

## Auto-pause (scale to zero)

Enable by setting **minimum capacity to 0 ACUs** on the cluster. Instance pauses after idle period with **no user-initiated connections**; compute billing stops (`ServerlessV2Usage` = 0). Storage still billed.

| Setting | Value |
| --- | --- |
| Idle timeout | 300 s (5 min) default; max 86,400 s (24 h) |
| Config | `ServerlessV2ScalingConfiguration`: `MinCapacity=0`, `SecondsUntilAutoPause` |
| Disable | Set `MinCapacity` ≥ 0.5 |

**Engine versions:** Aurora PostgreSQL 13.15+, 14.12+, 15.7+, 16.3+; Aurora MySQL 3.08+.

**Reader failover tiers:** Writer + readers in tiers **0–1** pause/resume together. Readers in tiers **2–15** can pause independently (cost optimization for read scaling).

## Auto-pause blockers

Instance will **not** auto-pause when:

- `MinCapacity` > 0 (0.5 ACU minimum = always-on, no auto-pause)
- Any **open user connections** (admin health-check connections don't count)
- **RDS Proxy** attached — proxy keeps open connections to every instance
- **Logical replication** (PostgreSQL) or **binlog replication** (MySQL) on writer / tier 0–1 readers
- **Aurora Global Database** primary writer (and tier 0–1 readers); secondary clusters also don't pause
- **Zero-ETL integration** to Redshift (writer + tier 0–1 readers)
- **Babelfish** T-SQL port activity (PostgreSQL)
- Cluster contains **provisioned instances** — serverless writer stays awake while any reader is active
- Patching, upgrades, or maintenance in progress
- Non-default parameters that increase shared memory (`max_connections`, `max_locks_per_transaction`, `track_activity_query_size`, etc.)
- Background work: autovacuum, `pg_cron`, MySQL event scheduler (scheduled jobs are **skipped** while paused)

## Cold-start behaviour

| Scenario | Resume time |
| --- | --- |
| Normal resume (first connection after pause) | ~**15 seconds** |
| Paused > 24 hours (deeper sleep) | ~**30+ seconds** (similar to reboot) |

- Resume triggered by connection attempt (even invalid credentials), RDS Data API request, parameter change, backtrack, clone, or cluster modification.
- Post-resume capacity may be **lower** than before pause.
- After maintenance wake-up, Aurora waits **≥ 20 minutes** before pausing again.
- **Application design:** set client `connectTimeout` / JDBC `sslResponseTimeout` > 15 s (30 s if idle > 1 day). Implement **retry logic** (e.g. 3 attempts). Connection storms during resume may fail some sessions.
- **pg_cron / event scheduler:** manually connect before scheduled job time; jobs during pause are skipped.

## Capacity limits

| Limit | Detail |
| --- | --- |
| Minimum (always-on) | 0.5 ACU |
| Minimum (auto-pause) | 0 ACU |
| Maximum | **256 ACU** (~512 GiB); requires PG 13.13+/14.10+/15.5+/16.1+ or MySQL 3.06+ |
| Previous max | 128 ACU (older engine versions) |

**Minimum ACU recommendations for features:**

| Feature | Min ACU |
| --- | --- |
| Performance Insights | 2 |
| Aurora global database (writer) | 8 |
| High-connection PostgreSQL workload | ≥ 1 (min 0/0.5 caps `max_connections` at 2,000) |

**`max_connections`:** derived from **maximum** ACU (not current). Value is **static** — reboot after changing max ACU. Use formula-based values, not arbitrary constants, to avoid blocking scale-down.

**Scaling:** rate depends on current capacity (higher ACU = faster scale-up). Background cluster-management overhead on large volumes can prevent reaching configured minimum.

## Connection pooling

- **`max_connections`** is fixed at max-ACU memory; connections aren't dropped on scale-down.
- **RDS Proxy:** multiplexes many app connections onto fewer DB connections. Recommended for **Lambda** and high-connection workloads. **Prevents auto-pause** (persistent connections).
- **PgBouncer / app-side pooling:** reduces memory overhead on the DB, lowers ACU usage, helps stay within `max_connections`.
- Proxy pool sizing: `MaxConnectionsPercent` (% of DB `max_connections`).
- Exam pattern: Serverless v2 + Lambda → RDS Proxy for connection management; trade-off is Proxy cost and no scale-to-zero.

## Backups

Same continuous backup model as provisioned Aurora — **not** traditional periodic snapshots.

- Continuous, incremental backup to S3; **PITR** to any second within retention window (1–35 days).
- Minimal performance impact (storage-layer log of I/O).
- Backup window triggers a daily system snapshot within the retention period.
- **While auto-paused:** backups continue at storage layer; instance compute not charged.
- On cluster delete: optional **final snapshot** and **retain automated backups** (PITR within original retention, no new backups).
- Cross-Region automated backup replication **not** supported for Aurora — copy manual snapshots instead.
- AWS Backup can also manage Aurora backups.

## Deletion protection

Cluster-level setting — same as provisioned Aurora.

- Blocks `delete-db-cluster` (console, CLI, API) while enabled.
- Can still delete individual DB instances; cluster volume remains.
- Enabled by default in console for production; **disabled by default** via CLI/API.
- Toggle without outage: `modify-db-cluster --deletion-protection` / `--no-deletion-protection`.
- Does **not** protect backups independently — disable protection first, then delete (optionally retaining backups/snapshot).

## pgvector installation

Pre-installed as a **trusted extension** on Aurora PostgreSQL — no binary install required.

```sql
-- Check availability
SELECT * FROM pg_available_extensions WHERE name = 'vector';

-- Enable (per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify version (0.5.0+ required for HNSW indexes)
SELECT extversion FROM pg_extension WHERE extname = 'vector';

-- Upgrade after engine upgrade
ALTER EXTENSION vector UPDATE;
```

- Supported on Aurora PostgreSQL 12.15+, 13.11+, 14.8+, 15.3+ (and later minors).
- PG 13+: `CREATE` privilege on database is sufficient; PG ≤12 needs `rds_superuser`.
- Works on Aurora Serverless v2 (including scale-to-zero on supported versions for dev/test vector workloads).
- Use with RDS Data API, Bedrock/SageMaker embeddings, HNSW/IVFFlat indexes for similarity search.

## Exam patterns

| Requirement | Answer |
| --- | --- |
| Dev/test DB, cost savings, tolerate ~15 s cold start | Serverless v2, min 0 ACU |
| Lambda → Aurora, connection limits | RDS Proxy (+ accept no auto-pause) |
| Variable workload, no cold-start tolerance | Serverless v2, min ≥ 0.5 ACU |
| Prevent accidental cluster delete | Deletion protection on cluster |
| Vector / RAG embeddings on Aurora PG | `CREATE EXTENSION vector` |
| Instance won't scale to 0 | Check Proxy, replication, global DB, connections, custom params |
