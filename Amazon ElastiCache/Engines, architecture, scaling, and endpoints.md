# ElastiCache engines, architecture, scaling, and endpoints

## Engine selection
| Capability | Valkey / Redis OSS | Memcached |
| --- | --- | --- |
| Data structures | Strings, hashes, lists, sets, sorted sets, streams, and more | Simple key/value objects |
| Threads | Primarily command processing model associated with Valkey/Redis | Multithreaded |
| Replication and automatic failover | Yes | No |
| Cluster partitioning | Shards with hash slots in cluster mode | Client-side consistent hashing across nodes |
| Backups and restore | Yes | No |
| Transactions, Lua, pub/sub | Yes | No |
| Persistence/durability options | Snapshots; Valkey 9.0+ transactional-log durability | No |
| Typical use | Feature-rich cache, sessions, leaderboards, queues, streams | Simple high-throughput ephemeral object cache |

Prefer **Valkey** for new compatible workloads unless application/vendor requirements specifically require Redis OSS. Choose Memcached when a simple, disposable, multithreaded cache and easy node-based partitioning are sufficient.

## Valkey/Redis architecture

### Cluster mode disabled
```text
Primary (all writes)
   ├── Replica in AZ-B
   └── Replica in AZ-C
```

- One shard and one writable primary.
- Replicas provide read scaling and high availability.
- Multi-AZ with automatic failover promotes a replica if the primary fails.
- Scale reads by adding replicas.
- Scale memory/compute vertically by changing node type.
- Write throughput remains limited by the single primary.

### Cluster mode enabled
```text
Shard 1: Primary + replicas   hash slots 0–5460
Shard 2: Primary + replicas   hash slots 5461–10922
Shard 3: Primary + replicas   hash slots 10923–16383
```

- Data is partitioned over multiple shards using hash slots.
- Each shard has a primary and can have replicas.
- Add/remove shards using online resharding to scale memory and write throughput.
- Add replicas to scale reads and improve availability.
- The client must support Valkey/Redis Cluster redirection and topology discovery.
- Multi-key operations generally require keys to be in the same hash slot; use hash tags such as `{customer:42}:profile` where appropriate.

## Memcached architecture
```text
Application client
   ├── Node A (partition A)
   ├── Node B (partition B)
   └── Node C (partition C)
```

- Data is partitioned across independent nodes using client-side hashing.
- There are no replicas, persistence, backups, or automatic failover.
- Add/remove nodes to scale horizontally.
- Changing the node set changes key placement and causes temporary cache misses while the cache repopulates.
- Use consistent hashing to reduce remapping.
- Use Auto Discovery so clients learn topology changes automatically.

## Endpoints
| Deployment | Endpoint |
| --- | --- |
| Serverless | One endpoint whose underlying topology is managed by AWS |
| Valkey/Redis cluster mode enabled | Configuration endpoint |
| Cluster mode disabled primary | Primary endpoint for writes and strongly current reads |
| Cluster mode disabled replicas | Reader endpoint to distribute read connections |
| Memcached with Auto Discovery | Configuration endpoint |
| Individual node debugging | Node endpoint |

The reader endpoint performs DNS-based connection distribution; it is not a proxy and does not guarantee perfectly even request distribution. Applications should use connection pooling, retries, timeouts, and topology-aware clients.

## Scaling

### Valkey/Redis node-based
- **Vertical**: Change node type to gain CPU, network, or memory.
- **Horizontal—shards**: Cluster mode enabled adds/removes shards through online resharding.
- **Horizontal—replicas**: Add/remove replicas for read scaling and availability.
- **Auto Scaling**: Target-tracking or scheduled scaling for supported shard and replica configurations.

Monitor memory and CPU before scaling:
- High `DatabaseMemoryUsagePercentage` or evictions → add memory/shards or adjust TTL/eviction.
- High primary CPU → shard write workload or optimize expensive commands.
- High replica CPU → add/read-balance replicas.

### Memcached node-based
- Add/remove nodes for horizontal scaling.
- To change node type vertically, create a new cluster and allow the application to repopulate it.
- Expect cold-cache impact and changed key distribution.

## Serverless
ElastiCache Serverless:
- Automatically provisions and scales compute and storage.
- Provides a single stable endpoint.
- Spreads cache infrastructure across Availability Zones.
- Handles patching, failover, and capacity management.
- Charges primarily for stored data and processing usage rather than provisioned nodes.

Use Serverless for unpredictable traffic, rapid setup, and minimal operations. Use node-based clusters when you require precise node types, topology, maintenance controls, reserved-node economics, or features/settings not available in Serverless.

## Data tiering
Supported Valkey/Redis node families with local SSD can place less frequently accessed data on SSD while keeping hot data in memory.

Use data tiering when:
- The working set exceeds affordable memory capacity.
- Most requests access a smaller hot subset.
- Slightly higher latency for cold items is acceptable.

Do not use it for uniformly hot, latency-critical datasets.

## Global Datastore
Global Datastore for Valkey/Redis provides cross-Region asynchronous replication:
```text
Primary Region (writes)
       ↓ asynchronous replication
Secondary Region(s) (local reads / DR)
```

- Applications write to the primary Region.
- Secondary Regions provide low-latency local reads.
- Promote a secondary during regional disaster recovery.
- Replication is asynchronous, so recovery point objective is not zero.
- It is not the same as active-active multi-Region writes.

For active-active durable multi-Region Valkey-compatible database requirements, evaluate MemoryDB multi-Region rather than ElastiCache Global Datastore.

## Durability for Valkey 9.0+
Node-based Valkey can persist writes to a Multi-AZ transactional log:
- **Synchronous**: Acknowledges after persistence; zero loss of acknowledged writes, with single-digit millisecond writes.
- **Asynchronous**: Acknowledges first; microsecond writes with up to 10 seconds at risk.

Durability protects data even if all cache nodes fail and allows off-box snapshots. It automatically uses encryption at rest. This is different from ordinary replica-based high availability, where replication can still lose recently acknowledged writes.

## Exam scenarios
- Scale write throughput beyond one primary → enable cluster mode and add shards.
- Scale reads without partitioning → add replicas and use the reader endpoint.
- Simple horizontally partitioned disposable cache → Memcached.
- Avoid managing nodes for spiky traffic → Serverless.
- Cross-Region reads and DR → Global Datastore.
- Keep a large cold dataset economically → data tiering.
- Require zero acknowledged-write loss in one Region → Valkey durability with synchronous writes.
