# CloudWatch metrics, alarms, and logs

## Metrics

A metric is a time-ordered set of data points identified by:

- **Namespace**: Container such as `AWS/EC2` or a custom namespace
- **Metric name**: For example, `CPUUtilization`
- **Dimensions**: Name/value identifiers such as `InstanceId=i-123`
- **Timestamp and value**
- **Unit**: Optional metadata such as Count, Bytes, or Seconds

Metrics are Region-scoped. Each unique combination of namespace, metric name, and dimensions is a separate metric.

### Resolution and monitoring


| Type                          | Resolution / common period                                             |
| ----------------------------- | ---------------------------------------------------------------------- |
| Basic EC2 monitoring          | Five-minute metrics                                                    |
| Detailed EC2 monitoring       | One-minute metrics (additional charge)                                 |
| Standard custom metric        | One-minute storage resolution                                          |
| High-resolution custom metric | One-second storage resolution; alarms can evaluate at 10 or 30 seconds |


Use `PutMetricData` for custom metrics or the CloudWatch agent for host/application telemetry.

### Custom metrics and PutMetricData

- `--value`: Publish one raw data point per call.
- `--statistic-values`: Publish a pre-aggregated set in one call—`Sum`, `Minimum`, `Maximum`, `SampleCount`. CloudWatch derives `Average` as Sum ÷ SampleCount. Use this for high-frequency measurements to reduce API calls and throttling.
- You cannot use `--value` and `--statistic-values` in the same call.



### Embedded Metric Format (EMF)

Structured JSON log entries that CloudWatch automatically extracts into metrics without calling `PutMetricData`.


| Approach         | When to use                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `PutMetricData`  | Direct metric publishing from application code                           |
| EMF              | Lambda/containers already writing JSON logs; metrics extracted at ingest |
| CloudWatch agent | OS metrics, logs, StatsD/collectd on EC2 or on-premises                  |


EMF metrics appear in CloudWatch like any custom metric and can drive alarms and dashboards.

### Statistics

- `Average`, `Minimum`, `Maximum`, `Sum`, and `SampleCount`
- Percentiles such as `p90`, `p95`, and `p99` are useful for latency because averages hide slow outliers.
- Metric math can calculate rates, percentages, ratios, fills, and aggregates.



## Alarms

Alarm states:

- **OK**: Metric is within threshold
- **ALARM**: Threshold was breached
- **INSUFFICIENT_DATA**: Not enough data to decide



### Evaluation

An alarm evaluates **M out of N** data points. For example, 3 of the last 5 periods must breach before entering `ALARM`, which reduces noise from a single spike.

Configure missing data as:

- `breaching`
- `notBreaching`
- `ignore`
- `missing` (default)

Choose based on semantics: missing heartbeat data may be breaching; missing error data may be not breaching.

### Alarm types


| Type                   | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| Static threshold       | Compare one metric or expression with a fixed value        |
| Anomaly detection      | Compare against a model-generated expected range           |
| Composite alarm        | Combine other alarm states to reduce alert noise           |
| Metrics Insights alarm | Alarm on a SQL-style query across changing resource fleets |




### Alarm actions

- Publish to **Amazon SNS**
- Invoke **Lambda**
- Perform EC2 actions such as stop, terminate, reboot, or recover
- Run Systems Manager **OpsItem** or **Incident Manager** actions where supported
- Trigger Auto Scaling policies

Alarm actions occur on **state transitions**, not continuously for every evaluation period. Use EventBridge when you need richer routing or workflow automation from alarm state changes.

## CloudWatch Logs


| Concept    | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| Log group  | Collection sharing retention, permissions, and configuration         |
| Log stream | Sequence of events from one source, such as an instance or container |
| Log event  | Timestamp plus message                                               |




### Retention and protection

- Retention is indefinite by default; configure a retention period to control cost.
- Encrypt with the default CloudWatch Logs encryption or a customer-managed KMS key.
- Use data protection policies to detect and mask sensitive data.
- Export historical data to S3 with an export task; this is not a continuous real-time export.



### Processing options


| Requirement                              | Feature                     |
| ---------------------------------------- | --------------------------- |
| Ad hoc interactive analysis              | Logs Insights               |
| Turn matching log events into metrics    | Metric filter               |
| Stream events continuously               | Subscription filter         |
| Detect unusual log patterns              | Log anomaly detection       |
| Query multiple linked accounts centrally | Cross-account observability |


Subscription filters can stream to Lambda, Kinesis Data Streams, or Data Firehose. A log group supports a limited number of subscription filters, so use a stream or Firehose fan-out design when several consumers need the same events.

### Export task vs subscription filter


|             | Export task                             | Subscription filter                      |
| ----------- | --------------------------------------- | ---------------------------------------- |
| Timing      | Batch job over a defined time range     | Near real-time                           |
| Destination | S3                                      | Lambda, Kinesis, Firehose                |
| Best for    | One-off or scheduled historical archive | Continuous streaming and live processing |




### Contributor Insights

Creates rules that analyze log or metric data to surface **top contributors** to a condition—for example, which API path, client IP, or user agent accounts for the most 5xx errors or highest latency. Use when the question asks to identify **noisy neighbors** or **dominant sources** of errors/traffic, not just whether a threshold was breached.

## Common exam scenarios

- **EC2 memory/disk metrics missing** → install and configure the CloudWatch agent.
- **Alert when** `ERROR` **appears repeatedly** → metric filter → custom metric → alarm → SNS/Lambda.
- **Analyze logs interactively** → Logs Insights.
- **Archive logs continuously in S3** → subscription filter → Data Firehose → S3.
- **Prevent duplicate incident pages** → composite alarm.
- **Detect a dynamic latency baseline breach** → anomaly detection alarm.
- **Scale an Auto Scaling group from queue depth** → metric alarm targeting a scaling policy.
- **Audit an IAM/API change** → CloudTrail, optionally routed through EventBridge—not CloudWatch metrics alone.
- **Publish 50 latency samples per minute efficiently** → `PutMetricData` with `--statistic-values`.
- **Find which endpoint causes most 502 errors** → Contributor Insights on access logs.
- **Stream all account metrics to S3 continuously** → Metric Streams → Firehose → S3.
- **One-time log archive for compliance** → CloudWatch Logs export task to S3.
- **Alarm state change triggers Step Functions remediation** → EventBridge rule on CloudWatch Alarm State Change.

