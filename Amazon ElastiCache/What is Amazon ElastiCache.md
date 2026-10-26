# What is Amazon ElastiCache?
Amazon ElastiCache is a web service that makes it easy to set up, manage, and scale a distributed in-memory data store or cache environment in the cloud.

You can operate Amazon ElastiCache in two formats. You can get started with a serverless cache or create a node-based cluster.
- **Serverless caching**: 
  ElastiCache Serverless enables you to create a highly available cache in under a minute, and eliminates the need to provision instances or configure nodes or clusters. ElastiCache manages hardware provisioning, monitoring, node replacements, and software patching automatically and transparently, so that you can focus on application development, rather than operating the cache.
- **Creating a node-based cluster**: 
  If you need fine-grained control over your ElastiCache cluster, you can choose to create a node-based Valkey, Memcached, or Redis OSS cluster. ElastiCache enables you to create a node-based cluster by choosing the node-type, number of nodes, and node placement across AWS Availability Zones for your cluster. Since ElastiCache is a fully-managed service, it automatically manages hardware provisioning, monitoring, node replacements, and software patching for your cluster.
  
  For Valkey or Redis OSS, you can use cluster mode enabled to partition data across shards for horizontal scaling, or cluster mode disabled for one writable primary with optional read replicas. Memcached does not use the Valkey/Redis cluster-mode setting; it partitions data across nodes and scales horizontally by adding or removing nodes. When creating a node-based cluster, you are responsible for selecting sufficient node and replica capacity.

  For node-based Valkey 9.0 or later clusters, you can enable durability to persist data in a distributed Multi-AZ transactional log. Synchronous writes provide zero acknowledged-write loss with single-digit millisecond write latency. Asynchronous writes preserve microsecond latency but can lose up to 10 seconds of writes during failure. Durability is selected when the cluster is created; an enabled cluster can switch between synchronous and asynchronous modes.

## Related services
- You should consider ElastiCache for caching workloads where you want to accelerate data access with your existing primary database or data store (microsecond read and write performance). 
- ElastiCache can also help you save database costs by storing frequently accessed data in a cache.
- With durability enabled, node-based ElastiCache for Valkey 9.0+ can also serve as a durable datastore with microsecond read latency and either synchronous or asynchronous write behavior.
- MemoryDB is a durable, in-memory database for workloads that require an ultra-fast, primary database. It is compatible with Valkey and Redis OSS. You should consider using MemoryDB if your workload requires multi-Region active-active replication with conflict-free data types (CRDTs). For single-Region durable workloads, consider using ElastiCache with durability enabled.

### Comparing serverless caching and node-based clusters
- Scaling: 
  - Serverless caching: 
    automatically scales engines both vertically and horizontally without any capacity management.
  - Node-based clusters:
    - Valkey/Redis cluster mode enabled: scale writes and memory horizontally with shards; scale reads with replicas.
    - Valkey/Redis cluster mode disabled: scale vertically and add replicas for reads, but there is only one writable primary.
    - Memcached: scale horizontally by adding/removing nodes; vertical scaling requires creating a cluster with a different node type and repopulating it.
    - Valkey/Redis Auto Scaling can use scheduled or target-tracking policies for supported shard/replica configurations.

- Client connection:
  - Serverless caching: 
    Clients connect to a single endpoint. This enables the underlying cache node topology (scaling, replacements, and upgrades) to change without disconnecting the client.
  - Node-based clusters:
    - Valkey/Redis cluster mode enabled: use the configuration endpoint with a cluster-aware client.
    - Cluster mode disabled replication group: use the primary endpoint for writes and reader endpoint for load-balanced reads.
    - Memcached: use the configuration endpoint with an Auto Discovery-compatible client; otherwise manage node endpoints manually.

See:
- `Engines, architecture, scaling, and endpoints.md`
- `Security, resilience, monitoring, and caching patterns.md`