# What is Amazon CloudWatch?
Amazon CloudWatch monitors your Amazon Web Services (AWS) resources and the applications you run on AWS in real time, and offers many tools to give you system-wide observability of your application performance, operational health, and resource utilization.

## Core capabilities
| Capability | Purpose |
| --- | --- |
| Metrics | Time-series measurements such as CPU utilization, latency, and custom business KPIs |
| Alarms | Evaluate metrics and invoke actions when thresholds are crossed |
| Logs | Centralize, search, analyze, transform, and route log events |
| Dashboards | Visualize metrics, logs, alarms, and operational data |
| Traces | Follow requests across distributed services |
| Synthetics | Run canaries that test endpoints and user journeys |
| RUM | Measure actual browser sessions and client-side performance |
| Application Signals | Discover services and monitor latency, faults, dependencies, and SLOs |

## Operational visibility with metrics, alarms, and dashboards
- **Metrics** collect and track key performance data. AWS service metrics commonly use one- or five-minute periods; custom high-resolution metrics can use one-second storage resolution.
- **Dashboards** offer a unified view of your resources and applications with visualizations of your metrics and logs in a single location. 
- You can set up **alarms** that continuously monitor CloudWatch metrics against user-defined thresholds.
- **Metric math** combines or transforms metrics without creating another stored metric.
- **Anomaly detection** creates an expected-value band from historical behavior and alarms when a metric moves outside it.

## Application performance monitoring (APM)
- **CloudWatch Synthetics** complements this by enabling you to proactively monitor your endpoints and APIs through configurable scripts called **canaries** that simulate user behavior and alert you to availability issues or performance degradation before they impact real users. You can also use **CloudWatch RUM** to gather performance data from real user sessions.
- Use **Service Level Objectives (SLOs)** in CloudWatch to define, track, and alert on specific reliability targets for your applications, helping you maintain service quality commitments by setting error budgets and monitoring SLO compliance over time.
- **Application Signals** uses metrics and traces to discover services, dependencies, and common application health indicators. For example: Application Signals can discover that the Orders API depends on the Payments Service, and that the Payments Service is experiencing high latency. That means instead of manually looking through dozens of CloudWatch metrics, logs, and X-Ray traces, Application Signals gives you a service-centric view. The metrics then summarize the health of those components. So AWS might show something conceptually like:
```
OrdersService
Availability: 99.7%
Latency: 850 ms   ← unhealthy
Error rate: 0.3%

Dependency:
PaymentsService
Latency: 790 ms   ← likely source

```
- **CloudWatch Application Insights** detects and helps diagnose problems in supported applications and their underlying resources.
- **Container Insights** and **Lambda Insights** provide enhanced telemetry for containers and Lambda functions.

## Collect, store, and query logs
Logs ingested from AWS services and custom applications are stored in **log groups and streams** for easy organization. 
Use **CloudWatch Logs Insights** to perform interactive, fast queries on your log data, with a choice of three query languages including SQL and PPL. 
Use **log anomaly detection** to find unusual patterns in log events in a log group, which can indicate issues. 
Create **metric filters** to extract numerical values from logs and generate CloudWatch metrics, which you can use for alerting and dashboards. 
Set up **subscription filters** to stream matching events to Lambda, Kinesis Data Streams, or Amazon Data Firehose. Use Firehose when the final destination is Amazon S3.

## Collecting host and custom telemetry
- Basic EC2 metrics do **not** include memory, disk-space utilization, swap, or application logs.
- Install the **CloudWatch unified agent** on EC2 or on-premises servers to collect OS metrics, custom metrics, and logs.
- Store agent configuration in **Systems Manager Parameter Store** and deploy at scale with **Systems Manager** (State Manager, Run Command).

### CloudWatch agent protocols
Apps that already emit open-source metrics can send them to the agent without rewriting to `PutMetricData`:

| Protocol | Default port | Typical source |
| --- | --- | --- |
| **StatsD** | 8125 (UDP) | App counters, gauges, timers (Node, Python, Java, etc.) |
| **collectd** | 25826 (UDP) | Linux plugins for MySQL, Apache, disk I/O, etc. |

The agent aggregates locally, then publishes to CloudWatch via `PutMetricData`. Enable listeners in the agent JSON config under `metrics_collected`.

## Cross-account monitoring
CloudWatch cross-account observability lets you set up a central monitoring account to monitor and troubleshoot applications that span multiple accounts. From the central account, you can view metrics, logs, and traces from source accounts across your organization.

## OpenTelemetry support
Amazon CloudWatch provides native OTLP endpoints for ingesting metrics, logs, and traces using the OpenTelemetry standard. You can collect telemetry using any OpenTelemetry-compatible SDK or collector and send it directly to CloudWatch without proprietary agents or format conversion. CloudWatch also supports PromQL for querying OpenTelemetry metrics.

## Related services—exam distinctions
| Requirement | Service |
| --- | --- |
| Operational metrics, alarms, dashboards, and application logs | **CloudWatch** |
| Record who called an AWS API, from where, and when | **CloudTrail** |
| Route events and schedule automated actions | **Amazon EventBridge** |
| Track resource configuration history and compliance | **AWS Config** |
| Distributed request tracing | **AWS X-Ray / CloudWatch traces** |

**Exam tip**: CloudWatch observes operational behavior; CloudTrail audits API activity. A CloudWatch alarm can invoke actions, while EventBridge performs broader event routing and orchestration.
