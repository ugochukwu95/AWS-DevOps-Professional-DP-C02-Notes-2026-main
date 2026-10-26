# ElastiCache security, resilience, monitoring, and caching patterns

## Network security
- ElastiCache runs inside a VPC and is not designed for direct public internet access.
- A **cache subnet group** selects subnets/AZs where node-based cache resources can run.
- Security groups control client connectivity to the engine port.
- Permit inbound traffic only from application security groups, not broad CIDR ranges.
- Use private connectivity such as VPC peering, Transit Gateway, VPN, or Direct Connect for authorized clients outside the VPC.

Applications should use TLS, short connection timeouts, exponential backoff, jitter, and connection pooling.

## Encryption and authentication

### Valkey/Redis
- **Encryption in transit** protects client and replication traffic with TLS.
- **Encryption at rest** protects snapshots and storage with KMS.
- Redis AUTH tokens provide password-style authentication.
- Role-based access control uses users, user groups, and command/key permissions.
- IAM authentication is available for supported Valkey/Redis versions and deployments, avoiding long-lived cache passwords.

Prefer RBAC or IAM authentication with TLS. Rotate secrets and restrict dangerous commands.

### Memcached
Use TLS where supported and rely strongly on VPC isolation and security groups. Memcached has fewer native authorization controls than Valkey/Redis, reinforcing that it should remain private and disposable.

## Parameter groups
A parameter group contains engine configuration such as:
- Eviction policy
- Maximum memory behavior
- Command controls
- Cluster settings
- Connection and timeout behavior

Some changes apply immediately; others require reboot/replacement or are engine/version dependent. Use a custom parameter group instead of modifying defaults, test changes, and monitor after deployment.

## TTL and eviction
Every cache design should define expiry and memory-pressure behavior.

Common Valkey/Redis eviction policies:
- `noeviction`: Reject writes when memory is full.
- `allkeys-lru` / `allkeys-lfu`: Evict least recently/frequently used keys from all keys.
- `volatile-lru` / `volatile-lfu`: Evict only keys with TTLs.
- Random and TTL-based variants are also available.

Choose based on workload:
- Pure cache → `allkeys-lru` or LFU is common.
- Mixed durable/non-expiring keys → volatile policies require careful capacity management.
- Never lose keys → `noeviction`, alert before memory exhaustion.

Use TTL jitter so millions of keys do not expire simultaneously.
TTL jitter in software and system design is the practice of adding a small amount of random time variation to a Time-To-Live (TTL) expiration value. Instead of letting thousands of cached keys expire at the exact same second, jitter staggers their expiration times to protect backend databases from sudden traffic spikes.

## Caching patterns

### Cache-aside (lazy loading)
```text
Read cache
 ├── hit → return value
 └── miss → read database → write cache with TTL → return
```

Advantages:
- Only requested data is cached.
- Cache failure can fall back to the database.

Risks:
- First request is slower.
- Stale data after database updates.
- Cache stampede on popular expired keys. This occurs when a highly popular piece of data expires, causing a massive spike in database load that can crash your infrastructure.

On database writes, update the database first and then invalidate or update the cache. Design retries so a cache failure does not corrupt the system of record.

### Write-through
Application writes to the cache and database together or through a caching layer.
- Cache stays warm and more current.
- Adds write latency and can cache data never read.
- Requires careful failure/transaction handling.

### Write-behind
Cache accepts writes and asynchronously persists them.
- Low write latency and batching.
- Higher consistency and data-loss risk.
- Use only when the architecture explicitly tolerates delayed persistence.

### Other use cases
- Session store
- API response/object cache
- Counters and rate limiting
- Leaderboards and sorted sets
- Pub/sub and streams
- Distributed coordination with carefully designed locks

## Cache failure patterns

### Cache stampede
Many clients miss the same hot key and overload the database.

Mitigations:
- Request coalescing/single-flight locking
- TTL jitter
- Refresh-ahead
- Stale-while-revalidate
- Database throttling and circuit breakers

### Hot keys
One key receives disproportionate traffic and overloads one shard.

Mitigations:
- Replicas for read-heavy hot keys
- Split/replicate the logical key
- Local in-process caching
- Redesign partition keys

Adding shards does not automatically split one indivisible hot key.

### Stale data
Mitigations:
- Shorter TTLs
- Event-driven invalidation
- Versioned cache keys
- Update/invalidate after successful database commit

## High availability and failover
For node-based Valkey/Redis:
- Create replicas across Availability Zones.
- Enable Multi-AZ automatic failover.
- Applications use logical primary/reader/configuration endpoints rather than fixed node endpoints.
- Replication is normally asynchronous; recent writes can be lost during failover unless using suitable Valkey durability.

Memcached has no replication or automatic failover. A failed node loses its partition until the application repopulates it.

## Backups and restore
Valkey/Redis supports:
- Automatic snapshots with retention
- Manual snapshots
- Final snapshot when deleting, if selected
- Copying snapshots and restoring into a new cluster

Restoring creates a new cache rather than overwriting the existing cluster. Test restoration and endpoint cutover.

Memcached does not support snapshots because it is an ephemeral distributed cache.

For conventional Valkey/Redis clusters, snapshot creation can consume node resources; schedule backups during lower traffic or use replicas where supported. Valkey durability supports off-box snapshotting without primary-node workload impact.

## Maintenance and service updates
- Configure a preferred maintenance window.
- Review ElastiCache service updates and recommended apply-by dates.
- Test engine-version and parameter changes in non-production.
- Use automatic minor-version upgrades only when compatible with organizational change policy.
- Client topology discovery and retry behavior should tolerate node replacement.

A maintenance window defines when eligible maintenance may occur; it does not guarantee all work consumes the entire window.

## CloudWatch monitoring
Important node-based metrics include:
- `EngineCPUUtilization`: Engine-processing CPU, especially important for Valkey/Redis.
- `CPUUtilization`: Overall host CPU.
- `DatabaseMemoryUsagePercentage` and `FreeableMemory`: Memory pressure.
- `Evictions`: Keys removed under memory pressure.
- `CacheHits` and `CacheMisses`: Cache effectiveness.
- `CurrConnections` and new connections: Connection pressure/churn.
- `ReplicationLag`: Replica freshness.
- `NetworkBytesIn` / `NetworkBytesOut`: Network saturation.
- `SwapUsage`: Should generally remain low.
- `CurrItems`: Stored-item count.

Serverless provides usage, storage, connection, latency, and processing metrics appropriate to its capacity model.

Create alarms for:
- Sustained high engine CPU or memory
- Unexpected evictions
- Low cache-hit ratio
- Replication lag
- Connection exhaustion
- Failover and service-update events

Use ElastiCache events with SNS/EventBridge for node replacement, failover, maintenance, and scaling notifications.

## Metric interpretation
- Low hit rate + healthy cache → TTL/key strategy may be ineffective.
- Rising evictions + high memory → add capacity, shard, shorten values, or review eviction policy.
- High CPU but low memory → optimize commands, pipeline requests, or add shards.
- High connections → use connection pooling; adding nodes alone might not fix connection churn.
- Replica lag → reduce write pressure, increase node capacity, or investigate network/CPU limits.

Avoid expensive commands that scan or return very large datasets in production. Use cursor-based iteration instead of blocking full-keyspace operations.

## Related service selection
| Requirement | Service |
| --- | --- |
| General-purpose managed in-memory cache | ElastiCache |
| Durable primary in-memory database | MemoryDB |
| DynamoDB-compatible read cache | DynamoDB Accelerator (DAX) |
| Relational read scaling with SQL consistency model | RDS/Aurora read replica |
| CDN/edge content caching | CloudFront |

DAX is API-compatible specifically with DynamoDB. ElastiCache requires application-managed cache keys and logic but supports broader engines and patterns.

## Exam scenarios
- Survive node/AZ failure → Valkey/Redis replicas + Multi-AZ automatic failover.
- Recover cache data from a point in time → Valkey/Redis snapshot restore.
- Cache can be completely rebuilt and needs simple scale-out → Memcached.
- Reduce database load from repeated reads → cache-aside ElastiCache.
- Cache DynamoDB without rewriting to Redis APIs → DAX.
- Need cross-Region read replica and DR → Global Datastore.
- See evictions → investigate memory, TTL, value size, and eviction policy.
- Cluster is unreachable from EC2 → check subnet routing, security groups, TLS/authentication, DNS, and endpoint type.
- Need to patch running application servers → Systems Manager, not ElastiCache maintenance.
