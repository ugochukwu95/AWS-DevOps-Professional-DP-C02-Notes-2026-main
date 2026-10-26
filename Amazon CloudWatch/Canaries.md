# CloudWatch Synthetics canaries

CloudWatch Synthetics runs **canaries**—configurable scripts on a schedule that simulate user behavior and test endpoints, APIs, and workflows. Canaries publish metrics (availability, duration, failures) and can trigger CloudWatch alarms.

## How canaries work
- Run on a schedule you define (for example, every 1, 5, or 60 minutes).
- Execute from AWS-managed locations (Regions) you select.
- Store artifacts in S3: HAR files, screenshots, logs, and run reports.
- Publish metrics to the `CloudWatchSynthetics` namespace (for example, `SuccessPercent`, `Duration`, `Failed`).
- Integrate with **CloudWatch alarms** → SNS, Lambda, or EventBridge for alerting.
- Optionally enable **X-Ray tracing** on canary runs for end-to-end request visibility.

## Canary blueprints
| Blueprint | Use case |
| --- | --- |
| Heartbeat monitoring | Load a URL on a schedule; capture screenshot and HAR; verify the endpoint responds |
| API canary | REST calls (GET/POST/PUT/DELETE); validate status codes, response body, and latency |
| Broken link checker | Crawl links on a page (up to a limit) and report broken URLs |
| Visual monitoring | Compare screenshots against a baseline; alert on layout or rendering changes |
| GUI Workflow Builder | Record/replay multi-step flows (login, checkout, form submit) without hand-writing Selenium |
| Multi Checks | Up to 10 HTTP/DNS/SSL/TCP checks in one canary via JSON—no headless browser; cost-effective for basic endpoint checks |

Custom canaries use **Puppeteer** (Node.js) or **Selenium WebDriver** (Python).

## Canaries vs Route 53 health checks vs RUM
| Requirement | Best choice |
| --- | --- |
| Simple endpoint up/down from DNS layer | **Route 53 health check** |
| Scripted user journey, API validation, visual regression, HAR/screenshots | **CloudWatch Synthetics canary** |
| Real end-user browser performance and client-side errors | **CloudWatch RUM** |
| Route traffic away from unhealthy targets (failover/latency routing) | **Route 53 health check** tied to routing policy |

**Exam tip**: Choose canaries when the question needs **proactive synthetic monitoring** of an application workflow or API—not just TCP/HTTP reachability.

## Alarms and operations
1. Create a canary with the right blueprint and schedule.
2. Monitor `SuccessPercent`, `Failed`, or `Duration` metrics.
3. Create a CloudWatch alarm (for example, `SuccessPercent < 100` for 2 of 3 periods).
4. Alarm action → SNS notification, Lambda remediation, or EventBridge rule for Step Functions.

## Common exam scenarios
- **Verify checkout flow works every 5 minutes** → GUI Workflow or custom canary on a schedule.
- **Detect broken API after deployment** → API canary checking status code and response content.
- **Catch visual regression on a marketing page** → Visual monitoring blueprint.
- **Monitor 8 simple HTTPS endpoints cost-effectively** → Multi Checks blueprint in one canary.
- **Need only DNS-level failover for an ELB** → Route 53 health check, not a canary.
