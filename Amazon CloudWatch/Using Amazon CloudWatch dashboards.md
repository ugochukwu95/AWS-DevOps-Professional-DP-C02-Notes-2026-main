# Using Amazon CloudWatch dashboards

A CloudWatch dashboard is a customizable home page for monitoring resources in one or more Regions and accounts. Dashboards are global resources, although each widget can display data from a selected Region.

## Widget types
- **Metric widgets**: Line, stacked area, number, gauge, bar, and pie visualizations
- **Log widgets**: Results from CloudWatch Logs Insights queries
- **Alarm widgets**: Alarm status and alarm graphs
- **Text widgets**: Markdown instructions, runbooks, and links
- **Explorer widgets**: Tag-based resource views
- **Custom widgets**: Lambda-backed widgets that return HTML

## Key capabilities
- Display several metrics on one graph and use **metric math** expressions.
- Compare metrics from multiple AWS Regions.
- With cross-account observability, display telemetry from linked source accounts in a central monitoring account.
- Use **dashboard variables** to switch account, Region, resource, or property values without duplicating dashboards.
- Create dashboards in the console, with `PutDashboard`, or as IaC using `AWS::CloudWatch::Dashboard`.
- Share a dashboard publicly or with selected users. Treat sharing links and displayed operational data as sensitive.

## Example dashboard structure
1. **Service health**: Availability, request count, p50/p90/p99 latency, and errors
2. **Infrastructure**: CPU, memory (agent required for EC2), disk, network, and throttles
3. **Dependencies**: Database latency/connections, queue depth, and downstream errors
4. **Deployments**: Version annotations and canary/blue-green health
5. **Operations**: Active alarms and Logs Insights widgets for recent failures

## Dashboard JSON example
```json
{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "region": "us-east-1",
        "title": "EC2 CPU",
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "i-1234567890abcdef0"]
        ],
        "period": 300,
        "stat": "Average"
      }
    }
  ]
}
```

## Best practices
- Build dashboards around **services and user outcomes**, not only individual resources.
- Include latency percentiles, traffic, errors, and saturation—the four golden signals.
- Keep widget periods and statistics consistent when comparing data.
- Prefer reusable IaC dashboards and dashboard variables over manual copies.
- Add links to runbooks and Logs Insights queries for rapid incident response.

**Exam tip**: Dashboards visualize data but do not trigger remediation. Use CloudWatch alarms and their actions, or send events to EventBridge for automation.
