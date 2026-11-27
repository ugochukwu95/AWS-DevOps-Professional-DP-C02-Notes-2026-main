# CloudFront and Global Accelerator

Both services put traffic onto the **AWS global network at an edge location close to the user**, but they solve different problems. **Amazon CloudFront** is a **CDN**—it caches and processes **HTTP/HTTPS** content at the edge. **AWS Global Accelerator** gives you **two static anycast IPs** and routes **TCP/UDP** traffic over the AWS backbone to the closest healthy Regional endpoint—it **does not cache**.

**SAP-C03 mapping**: Skill 1.1.11 (edge architectures with CloudFront Functions and Lambda@Edge), Skill 1.4.5 (global traffic routing with Route 53 and Global Accelerator), and Skill 3.2.1 in Domain 3 (Cost-Optimized Architecture Design)—content delivery, **origin selection**, **caching strategy**, **Origin Shield**, and **failover** as levers on data transfer cost.

WAF and Shield integration for both services is covered in the `AWS WAF, AWS Firewall Manager, AWS Shield Advanced, and AWS Shield network security director` folder.

## CloudFront origins
| Origin | Notes |
| --- | --- |
| **S3 bucket (REST endpoint)** | Lock down with **Origin Access Control (OAC)**; bucket stays private |
| **S3 static website endpoint** | Treated as a custom origin; HTTP only to origin; no OAC |
| **ALB / NLB / EC2 / any HTTP server** | **Custom origin**; public, or private via **CloudFront VPC origins** |
| **MediaPackage / media origins** | Video streaming; AWS has announced end of support for **MediaStore**, so prefer S3 or MediaPackage |
| **API Gateway, Lambda function URLs** | Custom origin for APIs |

**OAC vs OAI**: **OAC** is the current mechanism and replaces the legacy **Origin Access Identity (OAI)**. OAC supports **SSE-KMS** encrypted objects, all Regions, and `PUT`/`DELETE` to S3. Bucket policy grants `cloudfront.amazonaws.com` with an `AWS:SourceArn` condition for the distribution.

**Exam tip**: "Users must not bypass CloudFront to read S3 objects" → **OAC** + bucket policy, block public access on. If objects use **SSE-KMS**, OAI cannot work—choose OAC and allow the distribution in the key policy.

### Origin selection and cost
- **One distribution, many origins**: path-pattern behaviors send `/static/*` to S3 and `/api/*` to an ALB or API Gateway, so static and dynamic content share one domain, one TLS certificate, and one WAF web ACL.
- **Data transfer from AWS origins to CloudFront is not charged**; you pay CloudFront's own (lower, tiered) data transfer out to viewers. Serving through CloudFront is usually cheaper than serving the same bytes directly from S3 or EC2 to the internet.
- Every cache hit avoids an origin request, origin compute, and origin egress—**cache hit ratio is the main cost lever**.
- Put dynamic, uncacheable APIs behind CloudFront anyway for TLS termination at the edge, persistent connections to the origin, and the AWS backbone.
- **Dynamic origin selection** (for example per country or per header) → Lambda@Edge on origin request; static per-path routing needs no code.

## Cache behaviors and policies
- A distribution has a **default behavior** plus ordered **path-pattern behaviors** (for example `/api/*` → ALB, `/static/*` → S3).
- Each behavior sets origin, viewer protocol policy, allowed methods, policies, and edge functions.

| Policy | Controls |
| --- | --- |
| **Cache policy** | The **cache key** (which headers, cookies, query strings vary the cache) and **TTLs** |
| **Origin request policy** | What is **forwarded to the origin** *without* being added to the cache key |
| **Response headers policy** | Headers CloudFront adds to responses (CORS, HSTS, security headers) |

**Exam tip**: Low cache hit ratio → too many values in the **cache key** (all headers/cookies/query strings). Move values the origin needs but that do not change the response into the **origin request policy**.

## TTLs, invalidations, and versioning
- Default TTL **24 hours**, minimum 0, maximum **1 year**; origin `Cache-Control`/`Expires` headers apply within the min/max bounds.
- **Invalidation** removes objects from edge caches. The first **1,000 paths per month** are free; a wildcard (`/images/*`) counts as one path.
- **Versioned file names** (`app.v42.js`, hashed filenames) are preferred for frequent deploys—immediate, no invalidation cost, and browser caches also update.

## Origin failover and Origin Shield
- **Origin group** = primary + secondary origin. CloudFront fails over on connection errors/timeouts or on status codes you choose (for example 500, 502, 503, 504, 403, 404).
- Failover only applies to **GET, HEAD, and OPTIONS** requests—not `POST`/`PUT` writes.
- **Origin Shield** is an extra centralized caching layer in a chosen Region in front of the origin. Use it to **reduce origin load** and improve hit ratio for global audiences or multi-CDN setups. Extra cost (charged per request into Origin Shield), so it pays off when origin load or origin egress is the problem—not for a single-Region audience that already hits one regional edge cache.
- Choose the Origin Shield Region **closest to the origin** (lowest latency between Origin Shield and origin).
- Origin group failover handles **reads within one distribution**. For whole-Region failover of read/write traffic, combine with **Route 53 failover** or **Global Accelerator** (see *Global traffic routing* below).

```text
Viewer → Edge location → Regional edge cache → Origin Shield → Origin group (primary | secondary)
```

## Restricting access to content
| Mechanism | Scope | Use when |
| --- | --- | --- |
| **CloudFront signed URL** | One object per URL | Individual file downloads; clients that do not support cookies |
| **CloudFront signed cookies** | Many objects | Premium area of a site, HLS/DASH segments, do not want to change URLs |
| **S3 presigned URL** | One S3 object, direct to S3 | Temporary upload/download without CloudFront; signed with IAM credentials |

- CloudFront signing uses **trusted key groups** (recommended) holding your public keys; root-account CloudFront key pairs are legacy.
- An S3 presigned URL is only valid while the signing credentials are; with temporary role credentials it expires when the session does.
- **Field-level encryption**: CloudFront encrypts specific POST form fields (up to **10 fields**) with your public key at the edge, so only a backend holding the private key can decrypt them (card numbers, PII).
- **Geo restriction**: country-level allowlist or blocklist on the distribution. For finer logic (per path, combined with other conditions), use **WAF geo match** rules.
- **Custom error pages**: map origin 4xx/5xx to a friendly page (often from S3) and set an **error caching minimum TTL** (default 10 seconds).

## CloudFront Functions vs Lambda@Edge
| | CloudFront Functions | Lambda@Edge |
| --- | --- | --- |
| Runtime | JavaScript (CloudFront runtime) | Node.js, Python |
| Triggers | **Viewer request, viewer response** only | Viewer request/response **and origin request/response** |
| Max duration | Sub-millisecond | 5 s (viewer), 30 s (origin) |
| Network/file access | **No** | **Yes** (call APIs, DynamoDB, etc.) |
| Request body access | No | Yes |
| Scale and cost | Millions req/s; roughly 1/6 the price | Thousands req/s per Region; higher cost |
| Where deployed | All edge locations | Authored in **us-east-1**, replicated to regional edge caches |
| Use cases | Header rewrites, URL redirects/rewrites, cache key normalization, simple JWT validation, A/B cookie | Auth calling an IdP, dynamic origin selection, image resizing, body inspection |

**Exam tip**: "Lightweight, high-volume header or URL manipulation at lowest cost" → **CloudFront Functions**. Anything needing **network calls, origin triggers, or longer runtime** → **Lambda@Edge**.

## Protecting a custom origin
- **Managed prefix list** `com.amazonaws.global.cloudfront.origin-facing` in the ALB security group allows only CloudFront IP ranges.
- That alone still admits *other* customers' distributions—also add a **secret custom header** set by CloudFront and checked by an **ALB listener rule** (return 403 otherwise). Rotate the value with Secrets Manager.
- **CloudFront VPC origins** let the ALB/NLB/EC2 stay in **private subnets** with no internet-facing endpoint at all—simplest when it fits.

## Other features to recognise
- **Price classes**: All edge locations, Price Class 200, Price Class 100 (cheapest Regions only). Lower class = lower cost, higher latency for excluded geographies.
- **Logging**: standard access logs (delivered within minutes) vs **real-time logs** to **Kinesis Data Streams** (within seconds) for live monitoring.
- **ACM certificates for CloudFront must be in us-east-1**, whatever the origin Region. ALB certificates stay in the ALB's Region.
- **SNI** custom SSL is standard and free; dedicated-IP custom SSL is only for legacy clients and is expensive.

## AWS Global Accelerator
- **Two static anycast IPv4 addresses** (BYOIP supported; dual-stack adds IPv6) as a fixed entry point—no DNS changes when backends move.
- **Endpoint groups**: one per Region, containing ALB, NLB, EC2 instance, or Elastic IP endpoints.
- **Traffic dial** (0–100%) per endpoint group: shift traffic between Regions for blue/green or Regional maintenance.
- **Endpoint weights** (0–255) split traffic between endpoints inside one group.
- **Health checks**: unhealthy endpoints or Regions are bypassed quickly, with **no DNS TTL or client caching delay**.
- **Client IP preservation** for ALB and EC2 endpoints, so the backend sees the real client IP.
- **Custom routing accelerators** map users to specific EC2 instances/ports (game sessions, VoIP).
- Use for **non-HTTP** (UDP gaming, MQTT, VoIP), **IP allowlisting** by partners, and **fast multi-Region failover**.

## CloudFront vs Global Accelerator
| | CloudFront | Global Accelerator |
| --- | --- | --- |
| Protocols | HTTP/HTTPS, WebSocket | **TCP, UDP** (any app protocol) |
| Caching | **Yes** | **No** |
| Entry point | DNS name; IPs change | **2 static anycast IPs** |
| Edge compute | CloudFront Functions, Lambda@Edge | None |
| Failover | Origin groups (GET/HEAD/OPTIONS) | Endpoint health, near-instant, all traffic |
| Best for | Static/dynamic web content, APIs, video | Gaming, IoT, VoIP, fixed IPs, multi-Region active-active/active-passive |

**Exam tip**: "Static IP addresses" or "UDP" in the question rules out CloudFront. "Cache" or "edge compute" rules out Global Accelerator. Route 53 latency routing is the cheaper distractor, but it depends on DNS TTLs and client caching for failover.

## Global traffic routing for multi-Region applications
| Mechanism | Steers by | Failover speed | Pick when |
| --- | --- | --- | --- |
| **Route 53** latency / geolocation / geoproximity / weighted | DNS answer per resolver | DNS TTL + client caching | Lowest cost; compliance by geography; gradual shifts |
| **Route 53 failover** + health checks (or **ARC** routing controls) | Health / operator switch | DNS TTL | Active-passive DR with controlled failover |
| **Global Accelerator** | Anycast to nearest healthy endpoint group; **traffic dials**, endpoint weights | Seconds, no DNS dependency | Static IPs, TCP/UDP, fastest failover, active-active |
| **CloudFront** origin groups / multiple origins | Per request at the edge | Per request (reads only) | Web/API content that also benefits from caching |

**Exam tip**: Route 53 routing policies and Global Accelerator are both named in Skill 1.4.5. Pick **Global Accelerator** when the question stresses **fast, deterministic failover** or **fixed IPs**; pick **Route 53** when it stresses **lowest cost**, **geographic compliance**, or **weighted rollout**. Database replication (Aurora Global Database, DynamoDB global tables) must match the routing model—active-active routing needs multi-writer data.

## Choose the right approach
| Requirement | Answer |
| --- | --- |
| Private S3 bucket served only via CDN | CloudFront + **OAC** + bucket policy |
| Deploy new JS/CSS many times a day without stale caches | **Versioned file names**, not invalidations |
| Paid subscribers stream many video segments | **Signed cookies** |
| One-off temporary download link from an app | **Signed URL** (CloudFront) or **S3 presigned URL** (no CDN) |
| Rewrite URLs/headers at every request, lowest cost | **CloudFront Functions** |
| Resize images or call an auth service at the edge | **Lambda@Edge** (origin request/response) |
| Origin overloaded by cache misses from many edges | **Origin Shield** (Region closest to origin) |
| Cut S3/EC2 internet egress for popular content | Serve via **CloudFront** (origin-to-CloudFront transfer free) and raise cache hit ratio |
| Static and API content under one domain | One distribution, **path-pattern behaviors** to S3 and ALB |
| Serve from backup origin when primary S3 bucket fails | **Origin group** (reads only) |
| ALB must accept traffic only from your distribution | Prefix list + **custom header** rule, or **VPC origin** |
| Protect card number fields end to end | **Field-level encryption** |
| Partners allowlist two fixed IPs for a multi-Region API | **Global Accelerator** |
| UDP game servers in several Regions, fastest failover | **Global Accelerator** with endpoint groups per Region |
| Shift 10% of global traffic to a new Region | GA **traffic dial** or Route 53 **weighted** records |
| Users must be served only from their legal jurisdiction | Route 53 **geolocation** routing |
