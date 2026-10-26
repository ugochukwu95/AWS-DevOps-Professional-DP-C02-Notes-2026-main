# Advanced monitoring and exam feature selection

## Metric Streams
Continuously stream CloudWatch metrics to a destination without polling `GetMetricData`.

| Destination | Typical use |
| --- | --- |
| Amazon Data Firehose → S3 | Long-term metric archive, analytics |
| Third-party observability partner | Datadog, Splunk, New Relic, etc. via Firehose HTTP endpoint |
| Amazon OpenSearch | Search and analyze metric streams |

**Exam tip**: Use **Metric Streams** when the question asks to **continuously export all (or filtered) metrics** to S3 or a third-party tool. Use **PutMetricData** to publish individual custom metrics; use **GetMetricData** for ad hoc retrieval—not continuous export.

## CloudWatch Anomaly Detection vs Amazon Lookout for Metrics
| | CloudWatch Anomaly Detection | Amazon Lookout for Metrics |
| --- | --- | --- |
| Scope | Built into CloudWatch alarms on specific metrics | Separate ML service analyzing multiple related metrics |
| Setup | Enable on a metric when creating an alarm | Connect data sources (CloudWatch, AppFlow, S3, etc.) |
| Root cause | Metric-level band breach | Correlates anomalies across metrics/dimensions; suggests contributors |
| Best for | Single-metric dynamic baseline on known KPIs | Business/operational metrics with complex multi-factor anomalies |

**Exam tip**: **Anomaly detection alarm** = one metric, native CloudWatch. **Lookout for Metrics** = broader ML analysis across datasets with root-cause hints.

## Enhanced telemetry products
| Product | Monitors | Key detail |
| --- | --- | --- |
| **Container Insights** | ECS, EKS, Kubernetes, Fargate | Cluster/service/task CPU, memory, network, diagnostics |
| **Lambda Insights** | Lambda functions | Cold starts, duration, memory, init duration, throttles |
| **Application Insights** | Supported stacks (e.g., .NET, SQL Server, Java) | Auto-discovers components; detects anomalies and surfaces problems |
| **Application Signals** | Service-centric APM | Dependency map, golden metrics, SLOs, error budgets |
| **Contributor Insights** | Logs or metrics | Finds top-N contributors to latency, 4xx/5xx errors, or custom values |

Enable Container/Lambda Insights via console, CLI, or CloudFormation—often requires an agent or Lambda layer/extension.

## Choose the right CloudWatch feature
| Requirement | Feature |
| --- | --- |
| Publish a custom business KPI from application code | `PutMetricData` or **EMF** in logs |
| High-frequency pre-aggregated custom metrics in one API call | `PutMetricData` with **StatisticValues** (Sum, Min, Max, SampleCount) |
| EC2 memory, disk, or OS logs | **CloudWatch agent** |
| App already emits StatsD or collectd | **CloudWatch agent** listener (ports 8125 / 25826) |
| Search logs interactively | **Logs Insights** |
| Alert when log pattern appears | **Metric filter** → metric → **alarm** |
| Stream logs in real time to Lambda/Kinesis/S3 | **Subscription filter** → Lambda, Kinesis, or **Firehose** |
| One-time or periodic bulk log export to S3 | **Export task** (not real-time) |
| Find which URI or IP causes most 500 errors | **Contributor Insights** on logs |
| Continuous metric export to S3 or partner | **Metric Streams** |
| Reduce pager noise from related alarms | **Composite alarm** |
| Dynamic baseline without setting a fixed threshold | **Anomaly detection alarm** |
| Alarm on fleet-wide SQL query across resources | **Metrics Insights alarm** |
| Proactive endpoint/API/workflow testing | **Synthetics canary** |
| Central monitoring account for org workloads | **Cross-account observability** |
| Audit who changed an IAM policy | **CloudTrail** (not CloudWatch) |
| Route alarm state change to Step Functions | **EventBridge** rule on CloudWatch alarm event |

## Log export vs subscription filter
| | Export task | Subscription filter |
| --- | --- | --- |
| Delivery | Batch export of a time range | Near real-time streaming |
| Destination | S3 only | Lambda, Kinesis Data Streams, Firehose (→ S3, OpenSearch, etc.) |
| Use case | Historical archive, compliance snapshot | Live processing, analytics pipeline, continuous archive |

## Integration patterns (exam crossovers)
| Source | CloudWatch integration |
| --- | --- |
| **CodeBuild** | Built-in project metrics (`AWS/CodeBuild`); build logs to CloudWatch Logs |
| **AWS WAF** | Logging to CloudWatch Logs; log group name must start with `aws-waf-logs-` |
| **ECS/Fargate** | FireLens or Fluent Bit sidecar → CloudWatch Logs |
| **Lambda** | Automatic `/aws/lambda/<function>` log group; optional Lambda Insights |
| **API Gateway** | Access/execution logs to CloudWatch Logs; metrics in `AWS/ApiGateway` |
| **Trusted Advisor** | `ServiceLimitUsage` metric (Business/Enterprise support) → alarm before hitting quota |
| **CloudTrail** | Management events to CloudWatch Logs (optional); not a substitute for CloudTrail S3 audit trail |

## EventBridge and alarms
- CloudWatch alarm actions fire on **state transitions** (OK → ALARM, ALARM → OK).
- For multi-step remediation (disable keys, open ticket, run Step Functions), route **CloudWatch Alarm State Change** events through **EventBridge** to Lambda, SNS, or Step Functions.
- Scheduled tasks (run Inspector weekly) → **EventBridge schedule rule**, not a CloudWatch alarm.
