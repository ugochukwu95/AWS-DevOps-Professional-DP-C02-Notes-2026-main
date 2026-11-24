const path = require("path");
const PptxGenJS = require("pptxgenjs");
const { BRAND, C, W, H, M, CW, icon, createHelpers } = require("./theme");
const QUESTIONS = require("./questions");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = BRAND.name;
pptx.title = "Amazon CloudWatch for the AWS DevOps Engineer Professional (DOP-C02)";

const h = createHelpers(pptx);
const { slide, text, rect, round, arrow, pill, header, card, flow, tip } = h;

let qNum = 0;
const askQuestion = () => {
  const q = QUESTIONS[qNum++];
  h.question(q, qNum, QUESTIONS.length);
  h.answer(q, qNum);
};

// ---------------------------------------------------------------- 1. Title
{
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addNotes(
    `Welcome. I'm ${BRAND.name}, and I recently passed the AWS DevOps Engineer Professional exam with a score of ${BRAND.score}. In this video we cover everything you need to know about Amazon CloudWatch for DOP-C02, and along the way I'll give you 8 exam-style questions. Pause the video on each one and try to answer before I reveal it.`
  );
  h.photoBackdrop(s, "title-servers", 18);
  rect(s, { x: 0, y: 0, w: 7.6, h: H, fill: { color: C.bg, transparency: 15 } });
  rect(s, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.orange } });
  s.addImage({ path: icon("cloudwatch"), x: 0.9, y: 0.9, w: 1.1, h: 1.1 });
  text(s, "AWS DEVOPS ENGINEER PROFESSIONAL  |  DOP-C02", { x: 0.9, y: 2.2, w: 6.6, h: 0.4, fontSize: 13, bold: true, color: C.orange, charSpacing: 3 });
  text(s, "Amazon\nCloudWatch", { x: 0.9, y: 2.6, w: 6.6, h: 1.75, fontSize: 54, bold: true, color: C.white, lineSpacingMultiple: 0.9 });
  text(s, "Everything you need to answer the exam questions", { x: 0.9, y: 4.4, w: 6.4, h: 0.45, fontSize: 19, color: C.text });
  pill(s, "8 EXAM QUESTIONS INSIDE", 0.9, 5.05, { w: 3.2, h: 0.45, fontSize: 13 });
  round(s, { x: 0.9, y: 5.8, w: 5.6, h: 0.95, fill: { color: C.panel2 }, line: { color: C.orange, width: 1 } });
  text(s, [
    { text: `${BRAND.name}  `, options: { bold: true, color: C.white, fontSize: 20 } },
    { text: BRAND.handle, options: { color: C.orange, fontSize: 16, breakLine: true } },
    { text: `Passed DOP-C02 with ${BRAND.score} / 1000`, options: { color: C.text, fontSize: 14 } },
  ], { x: 1.15, y: 5.87, w: 5.2, h: 0.82, valign: "middle" });
}

// ---------------------------------------------------------------- 2. Agenda
{
  const s = slide("Here's the plan. Six blocks: metrics, alarms, logs, advanced monitoring, dashboards and Synthetics canaries. Each block ends with exam-style questions, so keep your pause button ready.");
  header(s, "Agenda", "What we'll cover");
  const items = [
    ["01", "Metrics", "Namespaces, resolution, agent, EMF, PutMetricData"],
    ["02", "Alarms", "States, M of N, missing data, composite, actions"],
    ["03", "Logs", "Insights, metric filters, subscriptions, export"],
    ["04", "Advanced", "Metric Streams, Contributor Insights, the Insights family"],
    ["05", "Dashboards", "Widgets, cross-account views, IaC"],
    ["06", "Synthetics", "Canaries vs Route 53 health checks vs RUM"],
  ];
  const tw = (CW - 0.6) / 3;
  items.forEach(([n, t, d], i) => {
    const x = M + (i % 3) * (tw + 0.3);
    const y = 1.95 + Math.floor(i / 3) * 2.05;
    round(s, { x, y, w: tw, h: 1.8, fill: { color: C.panel } });
    text(s, n, { x: x + 0.3, y: y + 0.2, w: 1.2, h: 0.75, fontSize: 40, bold: true, color: C.orange });
    text(s, t, { x: x + 1.45, y: y + 0.3, w: tw - 1.6, h: 0.55, fontSize: 22, bold: true, color: C.white, valign: "middle" });
    text(s, d, { x: x + 0.3, y: y + 1.0, w: tw - 0.6, h: 0.7, fontSize: 13.5, color: C.text });
  });
  tip(s, "PLUS", "8 scenario questions. Pause, answer, then check the explanation.");
}

// ---------------------------------------------------------------- 3. Where it shows up
{
  const s = slide(
    "CloudWatch is not one domain, it's everywhere on this exam. Monitoring and Logging is its home, but you'll also meet it in incident response, in resilient designs through Auto Scaling, and in CI/CD, for example CodeDeploy rolling back when an alarm fires. Domain weights are from the official exam guide."
  );
  header(s, "Why it matters", "CloudWatch shows up across the exam");
  const domains = [
    ["Monitoring and Logging", "15%", "Agent, metrics, Logs Insights, metric and subscription filters, dashboards", C.orange],
    ["Incident and Event Response", "14%", "Alarms, composite alarms, alarm state change events to EventBridge", C.red],
    ["Resilient Cloud Solutions", "15%", "Alarms driving Auto Scaling policies, canaries, anomaly detection", C.blue],
    ["SDLC Automation", "22%", "CodeBuild metrics and logs, alarm-based deployment rollback, canaries after deploys", C.purple],
  ];
  const dw = (CW - 0.9) / 4;
  domains.forEach(([t, pct, d, col], i) => {
    const x = M + i * (dw + 0.3);
    round(s, { x, y: 1.95, w: dw, h: 3.9, fill: { color: C.panel } });
    rect(s, { x, y: 1.95, w: dw, h: 0.1, fill: { color: col } });
    text(s, pct, { x: x + 0.3, y: 2.25, w: dw - 0.6, h: 0.9, fontSize: 44, bold: true, color: col });
    text(s, "of the exam", { x: x + 0.3, y: 3.1, w: dw - 0.6, h: 0.3, fontSize: 12, color: C.muted });
    text(s, t, { x: x + 0.3, y: 3.5, w: dw - 0.6, h: 0.8, fontSize: 18, bold: true, color: C.white });
    text(s, d, { x: x + 0.3, y: 4.35, w: dw - 0.6, h: 1.4, fontSize: 13, color: C.text });
  });
  tip(s, "EXAM MINDSET", "CloudWatch observes behavior. The question is usually WHICH CloudWatch feature fits.");
}

// ---------------------------------------------------------------- 4. CloudWatch or not?
{
  const s = slide(
    "Before we dive in, the most common trap: picking CloudWatch when the question is really about something else. CloudWatch answers 'how is it performing'. CloudTrail answers 'who called which API'. EventBridge routes events and runs schedules. Config tracks configuration and compliance. X-Ray traces requests. If the question says 'who changed the security group', CloudWatch metrics alone are the wrong answer."
  );
  header(s, "The first trap", "Is the answer even CloudWatch?");
  const svc = [
    ["cloudwatch", "CloudWatch", "How is it performing?", "Metrics, logs, alarms, dashboards", C.orange, true],
    ["cloudtrail", "CloudTrail", "Who called which API?", "Audit trail of API activity", C.muted],
    ["eventbridge", "EventBridge", "Route this event", "Event routing and schedules", C.muted],
    ["config", "AWS Config", "Is it compliant?", "Configuration history and rules", C.muted],
    ["xray", "X-Ray", "Where is the request slow?", "Distributed tracing", C.muted],
  ];
  const sw = (CW - 4 * 0.25) / 5;
  svc.forEach(([ic, name, q, d, col, hi], i) => {
    const x = M + i * (sw + 0.25);
    round(s, { x, y: 1.95, w: sw, h: 3.9, fill: { color: hi ? "2A2312" : C.panel }, line: { color: hi ? C.orange : C.rule, width: hi ? 2 : 1 } });
    s.addImage({ path: icon(ic), x: x + sw / 2 - 0.45, y: 2.25, w: 0.9, h: 0.9 });
    text(s, name, { x: x + 0.15, y: 3.3, w: sw - 0.3, h: 0.45, fontSize: 19, bold: true, color: C.white, align: "center" });
    text(s, `"${q}"`, { x: x + 0.15, y: 3.85, w: sw - 0.3, h: 0.9, fontSize: 15, italic: true, color: hi ? C.orange : C.text, align: "center", valign: "middle" });
    text(s, d, { x: x + 0.15, y: 4.85, w: sw - 0.3, h: 0.8, fontSize: 12.5, color: C.muted, align: "center" });
  });
  tip(s, "TRAP", "\"Audit who changed an IAM policy\" is CloudTrail, not CloudWatch, even if the logs end up in CloudWatch Logs.");
}

// ---------------------------------------------------------------- Section 1: Metrics
h.section(1, "Metrics", "The time-series data everything else is built on", "metrics-dashboard",
  "Section one: metrics. Everything in CloudWatch, alarms, dashboards, scaling, starts with a metric.");

{
  const s = slide(
    "A metric is identified by a namespace, a metric name and dimensions. Change any one of them and it's a different metric. Metrics are Region-scoped. For statistics, remember that averages hide slow outliers. For latency, the exam wants percentiles like p90, p95 or p99."
  );
  header(s, "Metrics", "Anatomy of a metric");
  const parts = [
    ["NAMESPACE", "AWS/EC2", C.orange],
    ["METRIC NAME", "CPUUtilization", C.blue],
    ["DIMENSIONS", "InstanceId=i-123", C.purple],
    ["UNIT", "Percent", C.teal],
  ];
  const pw = (CW - 0.9) / 4;
  parts.forEach(([k, v, col], i) => {
    const x = M + i * (pw + 0.3);
    round(s, { x, y: 1.95, w: pw, h: 1.55, fill: { color: C.panel }, line: { color: col, width: 2 } });
    text(s, k, { x: x + 0.25, y: 2.1, w: pw - 0.5, h: 0.35, fontSize: 12, bold: true, color: col, charSpacing: 2 });
    text(s, v, { x: x + 0.2, y: 2.5, w: pw - 0.4, h: 0.8, fontSize: 16, bold: true, color: C.white, fontFace: "Menlo", valign: "middle" });
    if (i < 3) text(s, "+", { x: x + pw, y: 2.35, w: 0.3, h: 0.6, fontSize: 26, bold: true, color: C.muted, align: "center" });
  });
  text(s, "Each unique namespace + name + dimensions combination is a separate metric. Metrics are Region-scoped.", { x: M, y: 3.7, w: CW, h: 0.4, fontSize: 15, color: C.text });

  text(s, "STATISTICS", { x: M, y: 4.35, w: 4, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 3 });
  const stats = ["Average", "Minimum", "Maximum", "Sum", "SampleCount", "p90", "p95", "p99"];
  let px = M;
  stats.forEach((st, i) => {
    const w = 0.15 * st.length + 0.6;
    pill(s, st, px, 4.8, { w, h: 0.48, fill: i >= 5 ? C.orange : C.panel2, color: i >= 5 ? C.bg : C.white, fontSize: 13 });
    px += w + 0.15;
  });
  tip(s, "EXAM TIP", "Latency question? Use percentiles (p99). Averages hide the slow outliers your users feel.", 5.85);
}

{
  const s = slide(
    "Resolution. Basic EC2 monitoring is every five minutes. Detailed monitoring is every minute, at extra cost. Standard custom metrics are one-minute resolution. High-resolution custom metrics go down to one second, and alarms on them can evaluate every 10 or 30 seconds."
  );
  header(s, "Metrics", "How often? The resolution ladder");
  const steps = [
    ["5 min", "Basic EC2 monitoring", "Default, free", C.muted],
    ["1 min", "Detailed EC2 monitoring", "Extra charge", C.blue],
    ["1 min", "Standard custom metric", "PutMetricData default", C.purple],
    ["1 sec", "High-resolution custom metric", "Alarms at 10s or 30s", C.orange],
  ];
  const sw = (CW - 0.9) / 4;
  steps.forEach(([big, t, d, col], i) => {
    const x = M + i * (sw + 0.3);
    const hgt = 2.15 + i * 0.55;
    const y = 6.0 - hgt;
    round(s, { x, y, w: sw, h: hgt, fill: { color: C.panel }, line: { color: col, width: 2 } });
    text(s, big, { x: x + 0.25, y: y + 0.15, w: sw - 0.5, h: 0.75, fontSize: 36, bold: true, color: col });
    text(s, t, { x: x + 0.25, y: y + 0.9, w: sw - 0.5, h: 0.7, fontSize: 15, bold: true, color: C.white });
    text(s, d, { x: x + 0.25, y: y + 1.65, w: sw - 0.5, h: 0.35, fontSize: 12.5, color: C.text });
  });
  text(s, "FASTER", { x: W - M - 2, y: 1.6, w: 2, h: 0.3, fontSize: 12, bold: true, color: C.orange, align: "right", charSpacing: 3 });
  arrow(s, M + 0.2, 1.75, CW - 1.9, 0, C.rule);
  tip(s, "TRAP", "Detailed monitoring changes frequency only. It does NOT add memory or disk metrics.", 6.2);
}

{
  const s = slide(
    "Three ways to get custom data in. PutMetricData from your code: use --value for single points, or --statistic-values to send Sum, Min, Max and SampleCount in one call, which is how you avoid throttling. You can't mix the two in one call. Embedded Metric Format: write structured JSON logs and CloudWatch extracts metrics at ingest, perfect for Lambda and containers. And the CloudWatch agent for OS metrics and logs, including StatsD on port 8125 and collectd on port 25826. Store the agent config in Parameter Store and deploy it with Systems Manager."
  );
  header(s, "Metrics", "Getting data into CloudWatch");
  const cw3 = (CW - 0.6) / 3;
  card(s, {
    x: M, y: 1.95, w: cw3, h: 3.95, icon: "cloudwatch", iconLeft: true, title: "PutMetricData", titleH: 0.6,
    body: ["From application code", "--value: one raw data point per call", "--statistic-values: Sum, Min, Max, SampleCount in one call", "Never both in the same call"],
  });
  card(s, {
    x: M + cw3 + 0.3, y: 1.95, w: cw3, h: 3.95, icon: "lambda", iconLeft: true, title: "Embedded Metric Format", titleH: 0.6, accent: C.blue,
    body: ["Structured JSON log lines", "Metrics extracted at ingest", "No PutMetricData calls", "Best for Lambda and containers"],
  });
  card(s, {
    x: M + 2 * (cw3 + 0.3), y: 1.95, w: cw3, h: 3.95, icon: "ec2", iconLeft: true, title: "CloudWatch agent", titleH: 0.6, accent: C.purple,
    body: ["Memory, disk, swap, OS logs", "EC2 and on-premises", "StatsD :8125 / collectd :25826 (UDP)", "Config in Parameter Store, rolled out by SSM"],
  });
  tip(s, "EXAM TIP", "App already emits StatsD or collectd? Point it at the agent. No code rewrite.");
}

askQuestion();

// ---------------------------------------------------------------- Section 2: Alarms
h.section(2, "Alarms", "Turning metrics into action", "alarms-circuit",
  "Section two: alarms. This is where metrics become actions.");

{
  const s = slide(
    "Alarms have three states: OK, ALARM and INSUFFICIENT_DATA. They evaluate M out of N data points, for example 3 of the last 5 periods must breach, which filters out a single spike. And you choose how missing data is treated: missing, the default, breaching, notBreaching, or ignore. Choose by meaning: a missing heartbeat is bad, so breaching. Missing error data usually means no errors, so notBreaching."
  );
  header(s, "Alarms", "States, M of N, and missing data");
  const states = [["OK", C.green], ["ALARM", C.red], ["INSUFFICIENT_DATA", C.muted]];
  let sx = M;
  states.forEach(([st, col]) => {
    const w = 0.17 * st.length + 0.8;
    pill(s, st, sx, 1.95, { w, h: 0.5, fill: col, color: col === C.muted ? C.bg : C.white, fontSize: 14 });
    sx += w + 0.25;
  });

  text(s, "M OUT OF N: 3 of the last 5 periods breach, so the alarm fires", { x: M, y: 2.8, w: CW, h: 0.4, fontSize: 15, bold: true, color: C.white });
  const breach = [true, false, true, false, true];
  breach.forEach((b, i) => {
    const x = M + i * 1.2;
    round(s, { x, y: 3.35, w: 1.0, h: 1.0, fill: { color: b ? C.red : C.panel2 } });
    text(s, b ? "BREACH" : "ok", { x, y: 3.35, w: 1.0, h: 1.0, align: "center", valign: "middle", fontSize: 12, bold: true, color: C.white });
  });
  arrow(s, M + 6.05, 3.85, 0.9);
  pill(s, "ALARM", M + 7.1, 3.6, { w: 1.6, h: 0.5, fill: C.red, color: C.white, fontSize: 14 });
  text(s, "One spike alone will not page anyone.", { x: M + 8.95, y: 3.55, w: 3.2, h: 0.6, fontSize: 14, color: C.text, valign: "middle" });

  text(s, "TREAT MISSING DATA AS", { x: M, y: 4.7, w: CW, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 3 });
  const md = [["missing (default)", C.panel2], ["breaching", C.panel2], ["notBreaching", C.panel2], ["ignore", C.panel2]];
  let mx = M;
  md.forEach(([m]) => {
    const w = 0.14 * m.length + 0.7;
    pill(s, m, mx, 5.1, { w, h: 0.45, fill: C.panel2, color: C.white, fontSize: 13 });
    mx += w + 0.2;
  });
  tip(s, "RULE", "Missing heartbeat = breaching.  Missing error count = notBreaching.", 6.0, { h: 0.6 });
}

{
  const s = slide(
    "Four alarm types. Static threshold. Anomaly detection, which builds an expected band from history. Composite alarms, which combine other alarms with AND, OR and NOT to cut noise. And Metrics Insights alarms, which alarm on a SQL-style query across a changing fleet. Actions: SNS, Lambda, EC2 stop, terminate, reboot or recover, Auto Scaling policies, and Systems Manager OpsItems or Incident Manager. Critically, actions fire on state transitions only. If you need a workflow, send the alarm state change event through EventBridge."
  );
  header(s, "Alarms", "Alarm types and alarm actions");
  const types = [
    ["Static threshold", "Fixed value, e.g. CPU > 80%", C.orange],
    ["Anomaly detection", "Band learned from history; no fixed number", C.blue],
    ["Composite", "AND / OR / NOT of other alarms; cuts noise", C.purple],
    ["Metrics Insights", "SQL-style query across a changing fleet", C.teal],
  ];
  types.forEach(([t, d, col], i) => {
    const y = 1.95 + i * 1.0;
    round(s, { x: M, y, w: 6.4, h: 0.85, fill: { color: C.panel } });
    rect(s, { x: M, y: y + 0.15, w: 0.06, h: 0.55, fill: { color: col } });
    text(s, t, { x: M + 0.3, y, w: 2.5, h: 0.85, fontSize: 16, bold: true, color: C.white, valign: "middle" });
    text(s, d, { x: M + 2.8, y, w: 3.5, h: 0.85, fontSize: 13, color: C.text, valign: "middle" });
  });
  const ax = M + 6.8;
  const aw = CW - 6.8;
  round(s, { x: ax, y: 1.95, w: aw, h: 3.85, fill: { color: C.panel2 } });
  text(s, "ALARM ACTIONS", { x: ax + 0.3, y: 2.1, w: aw - 0.6, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 3 });
  const acts = [["sns", "Notify via SNS"], ["lambda", "Invoke Lambda"], ["ec2", "EC2 stop / terminate / reboot / recover"], ["autoscaling", "Auto Scaling policy"], ["ssm", "SSM OpsItem / Incident Manager"]];
  acts.forEach(([ic, t], i) => {
    const y = 2.55 + i * 0.63;
    s.addImage({ path: icon(ic), x: ax + 0.3, y, w: 0.48, h: 0.48 });
    text(s, t, { x: ax + 0.95, y, w: aw - 1.2, h: 0.48, fontSize: 14, color: C.white, valign: "middle" });
  });
  tip(s, "KEY", "Actions fire on STATE TRANSITIONS. Multi-step workflow? Alarm state change event, then EventBridge.");
}

askQuestion();

// ---------------------------------------------------------------- Section 3: Logs
h.section(3, "Logs", "Collect, query, alert on, and route log data", "logs-code",
  "Section three: CloudWatch Logs. Probably the most tested part of CloudWatch on this exam.");

{
  const s = slide(
    "Logs are organized in log groups, which hold retention, permissions and encryption settings. Inside are log streams, one per source like an instance or container, and log events: a timestamp plus a message. Four facts to remember: retention is indefinite by default, so set it to control cost. Encryption is on by default, or use a customer-managed KMS key. Data protection policies detect and mask sensitive data. And Logs Insights gives you fast interactive queries, including SQL and PPL."
  );
  header(s, "Logs", "How CloudWatch Logs is organized");
  const levels = [
    ["Log group", "/aws/lambda/orders-api", "Retention, permissions, KMS key", C.orange],
    ["Log stream", "2026/11/13/[$LATEST]a1b2", "One source: instance, container, function", C.blue],
    ["Log event", "12:00:01  ERROR timeout", "Timestamp + message", C.purple],
  ];
  levels.forEach(([t, ex, d, col], i) => {
    const x = M + i * 0.45;
    const y = 1.95 + i * 1.3;
    round(s, { x, y, w: 6.2 - i * 0.45, h: 1.1, fill: { color: C.panel }, line: { color: col, width: 2 } });
    text(s, t, { x: x + 0.25, y: y + 0.1, w: 2.5, h: 0.4, fontSize: 17, bold: true, color: col });
    text(s, ex, { x: x + 0.25, y: y + 0.55, w: 5.5 - i * 0.45, h: 0.4, fontSize: 13, color: C.white, fontFace: "Menlo" });
    text(s, d, { x: x + 2.7, y: y + 0.1, w: 3.3 - i * 0.45, h: 0.4, fontSize: 12, color: C.muted, align: "right" });
  });
  const facts = [
    ["Retention", "Never expires by default. Set it to control cost."],
    ["Encryption", "On by default, or use a customer-managed KMS key."],
    ["Data protection", "Policies detect and mask sensitive data (PII)."],
    ["Logs Insights", "Interactive queries, including SQL and PPL."],
  ];
  facts.forEach(([t, d], i) => {
    const y = 1.95 + i * 0.95;
    round(s, { x: M + 6.6, y, w: CW - 6.6, h: 0.8, fill: { color: C.panel2 } });
    text(s, [
      { text: `${t}  `, options: { bold: true, color: C.orange } },
      { text: d, options: { color: C.white } },
    ], { x: M + 6.85, y, w: CW - 7.1, h: 0.8, fontSize: 14, valign: "middle" });
  });
  tip(s, "TRAP", "Log costs exploding? Nobody set a retention period. The default keeps logs forever.", 6.0, { h: 0.6 });
}

{
  const s = slide(
    "This is the decision you'll make on the exam over and over. What do you want to do with the logs? Ask ad hoc questions right now: Logs Insights. Turn a pattern into a number you can alarm on: a metric filter. Send events somewhere else in near real time: a subscription filter to Lambda, Kinesis Data Streams or Firehose. Find unusual patterns without writing rules: log anomaly detection. And find the top contributors, like which IP causes most errors: Contributor Insights."
  );
  header(s, "Logs", "What do you want to do with the logs?");
  round(s, { x: M, y: 2.9, w: 2.4, h: 1.6, fill: { color: C.panel2 }, line: { color: C.orange, width: 2 } });
  s.addImage({ path: icon("cloudwatch"), x: M + 0.9, y: 3.05, w: 0.6, h: 0.6 });
  text(s, "Log group", { x: M, y: 3.75, w: 2.4, h: 0.5, fontSize: 18, bold: true, color: C.white, align: "center" });
  const opts = [
    ["Ask questions right now", "Logs Insights", C.blue],
    ["Alert on a pattern", "Metric filter, then alarm", C.orange],
    ["Stream in near real time", "Subscription filter: Lambda / Kinesis / Firehose", C.purple],
    ["Spot unusual patterns", "Log anomaly detection", C.teal],
    ["Find the top offenders", "Contributor Insights", C.red],
  ];
  opts.forEach(([need, feat, col], i) => {
    const y = 1.85 + i * 0.85;
    arrow(s, M + 2.5, 3.7, 1.0, y + 0.35 - 3.7, C.rule);
    round(s, { x: M + 3.6, y, w: CW - 3.6, h: 0.7, fill: { color: C.panel } });
    rect(s, { x: M + 3.6, y: y + 0.12, w: 0.06, h: 0.46, fill: { color: col } });
    text(s, need, { x: M + 3.9, y, w: 3.4, h: 0.7, fontSize: 15, color: C.text, valign: "middle" });
    text(s, feat, { x: M + 7.3, y, w: CW - 7.5, h: 0.7, fontSize: 16, bold: true, color: C.white, valign: "middle" });
  });
  tip(s, "TIP", "Several consumers need the same logs? Subscription filters are limited per log group. Fan out through Kinesis or Firehose.");
}

{
  const s = slide(
    "Export task versus subscription filter. Export task: a batch job over a time range, S3 only, not real time. Use it for a one-off or periodic compliance archive. Subscription filter: near real time, to Lambda, Kinesis Data Streams or Firehose. Use it for live processing or a continuous archive. When the destination is S3 and the requirement is continuous, the answer is subscription filter to Firehose to S3."
  );
  header(s, "Logs", "Export task vs subscription filter");
  const colW = (CW - 0.4) / 2;
  const cols = [
    ["Export task", C.muted, [["Timing", "Batch job over a time range"], ["Destination", "Amazon S3 only"], ["Real time?", "No"], ["Best for", "One-off or periodic compliance archive"]]],
    ["Subscription filter", C.orange, [["Timing", "Near real time, continuous"], ["Destination", "Lambda, Kinesis Data Streams, Firehose"], ["Real time?", "Yes"], ["Best for", "Live processing, continuous archive"]]],
  ];
  cols.forEach(([t, col, rows], i) => {
    const x = M + i * (colW + 0.4);
    round(s, { x, y: 1.95, w: colW, h: 2.85, fill: { color: C.panel }, line: { color: col, width: 2 } });
    text(s, t, { x: x + 0.3, y: 2.05, w: colW - 0.6, h: 0.55, fontSize: 21, bold: true, color: col, valign: "middle" });
    rows.forEach(([k, v], r) => {
      const y = 2.7 + r * 0.5;
      text(s, k, { x: x + 0.3, y, w: 1.7, h: 0.45, fontSize: 13, color: C.muted, valign: "middle" });
      text(s, v, { x: x + 2.0, y, w: colW - 2.3, h: 0.45, fontSize: 14.5, color: C.white, valign: "middle" });
    });
  });
  text(s, "CONTINUOUS ARCHIVE TO S3, NO CODE", { x: M, y: 5.0, w: CW, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 3 });
  flow(s, [
    { label: "Log group", icon: "cloudwatch" },
    { label: "Subscription filter", fill: C.panel2 },
    { label: "Data Firehose", icon: "firehose" },
    { label: "Amazon S3", icon: "s3" },
  ], { x: M, y: 5.4, w: CW, h: 1.4, gap: 0.6, fontSize: 13 });
}

askQuestion();
askQuestion();

// ---------------------------------------------------------------- Section 4: Advanced
h.section(4, "Advanced monitoring", "Streams, top contributors, ML, and the Insights family", "advanced-earth",
  "Section four: the advanced features. These are the ones that separate a professional-level answer from an associate-level one.");

{
  const s = slide(
    "Metric Streams continuously export metrics through Firehose to S3, to partners like Datadog, Splunk or New Relic, or to OpenSearch. Don't confuse it with GetMetricData, which is ad hoc retrieval. Contributor Insights ranks the top contributors. Anomaly detection is a band on one metric, native to CloudWatch alarms, while Lookout for Metrics is a separate ML service that correlates many metrics and suggests root causes. Cross-account observability gives you one central monitoring account for metrics, logs and traces."
  );
  header(s, "Advanced", "Know which advanced feature to pick");
  const cw2 = (CW - 0.3) / 2;
  card(s, {
    x: M, y: 1.95, w: cw2, h: 1.9, icon: "firehose", iconLeft: true, title: "Metric Streams", iconSize: 0.55,
    body: "Continuous metric export through Firehose to S3, OpenSearch, or partners (Datadog, Splunk, New Relic). Not GetMetricData polling.", bodySize: 13,
  });
  card(s, {
    x: M + cw2 + 0.3, y: 1.95, w: cw2, h: 1.9, icon: "cloudwatch", iconLeft: true, title: "Contributor Insights", accent: C.red, iconSize: 0.55,
    body: "Top-N contributors to a condition from logs or metrics: which path, IP or user agent drives the 5xx errors.", bodySize: 13,
  });
  card(s, {
    x: M, y: 4.05, w: cw2, h: 1.9, icon: "cloudwatch", iconLeft: true, title: "Anomaly detection vs Lookout", accent: C.blue, iconSize: 0.55,
    body: "Anomaly detection: band on ONE metric, inside alarms. Lookout for Metrics: separate ML service across many metrics with root-cause hints.", bodySize: 13,
  });
  card(s, {
    x: M + cw2 + 0.3, y: 4.05, w: cw2, h: 1.9, icon: "cloudwatch", iconLeft: true, title: "Cross-account observability", accent: C.purple, iconSize: 0.55,
    body: "One central monitoring account sees metrics, logs and traces from source accounts across the organization. Native OTLP ingest too.", bodySize: 13,
  });
  tip(s, "TRAP", "\"Continuously export ALL metrics to S3\" is Metric Streams, not a Lambda calling GetMetricData.");
}

{
  const s = slide(
    "The Insights family. Container Insights for ECS, EKS, Kubernetes and Fargate. Lambda Insights for cold starts, memory and init duration, usually enabled with a layer or extension. Application Insights auto-discovers components of supported stacks like .NET and SQL Server. Application Signals is service-centric APM: a dependency map, golden metrics, and SLOs with error budgets. For example, it shows the Orders service is slow and points at Payments as the likely source."
  );
  header(s, "Advanced", "The Insights family");
  const fam = [
    ["Container Insights", "ECS, EKS, Kubernetes, Fargate: cluster, service, task CPU, memory, network", C.orange],
    ["Lambda Insights", "Cold starts, duration, memory, init time. Enabled with a layer or extension", C.blue],
    ["Application Insights", "Auto-discovers .NET, SQL Server, Java stacks and surfaces problems", C.purple],
    ["Application Signals", "Service map, golden metrics, SLOs and error budgets", C.teal],
  ];
  fam.forEach(([t, d, col], i) => {
    const y = 1.95 + i * 1.0;
    round(s, { x: M, y, w: 6.9, h: 0.85, fill: { color: C.panel } });
    rect(s, { x: M, y: y + 0.15, w: 0.06, h: 0.55, fill: { color: col } });
    text(s, t, { x: M + 0.3, y, w: 2.5, h: 0.85, fontSize: 16, bold: true, color: C.white, valign: "middle" });
    text(s, d, { x: M + 2.8, y, w: 3.95, h: 0.85, fontSize: 12.5, color: C.text, valign: "middle" });
  });
  const bx = M + 7.3;
  const bw = CW - 7.3;
  round(s, { x: bx, y: 1.95, w: bw, h: 3.85, fill: { color: "0A1322" }, line: { color: C.teal, width: 1.5 } });
  text(s, "APPLICATION SIGNALS VIEW", { x: bx + 0.3, y: 2.1, w: bw - 0.6, h: 0.35, fontSize: 11, bold: true, color: C.teal, charSpacing: 2 });
  const svcBox = (y, name, lat, bad) => {
    round(s, { x: bx + 0.3, y, w: bw - 0.6, h: 1.3, fill: { color: C.panel } });
    text(s, name, { x: bx + 0.5, y: y + 0.1, w: bw - 1, h: 0.4, fontSize: 15, bold: true, color: C.white, fontFace: "Menlo" });
    text(s, [
      { text: "Latency  ", options: { color: C.muted } },
      { text: lat, options: { color: bad ? C.red : C.white, bold: true } },
      { text: bad ? "   likely source" : "   unhealthy", options: { color: bad ? C.red : C.orange } },
    ], { x: bx + 0.5, y: y + 0.6, w: bw - 1, h: 0.5, fontSize: 14, fontFace: "Menlo" });
  };
  svcBox(2.5, "OrdersService", "850 ms", false);
  arrow(s, bx + bw / 2, 3.85, 0, 0.4);
  svcBox(4.3, "PaymentsService", "790 ms", true);
  tip(s, "TIP", "Need SLOs and error budgets for a service? Application Signals.");
}

askQuestion();

// ---------------------------------------------------------------- Section 5: Dashboards
h.section(5, "Dashboards", "One screen that tells the operational story", "dashboards-screens",
  "Section five: dashboards. Short section, but one exam tip here catches a lot of people.");

{
  const s = slide(
    "Dashboards are global resources, but each widget can show data from any Region, and with cross-account observability from linked accounts. Widget types: metric graphs, Logs Insights results, alarm status, Markdown text for runbooks, tag-based explorer widgets, and custom widgets backed by Lambda. Use dashboard variables instead of copying dashboards, and define them as code with AWS::CloudWatch::Dashboard or PutDashboard. Most important: dashboards visualize, they never remediate."
  );
  header(s, "Dashboards", "Widgets and capabilities");
  const widgets = [["Metric", "Line, area, number, gauge, bar, pie"], ["Logs", "Logs Insights query results"], ["Alarm", "Alarm status and graphs"], ["Text", "Markdown runbooks and links"], ["Explorer", "Tag-based resource views"], ["Custom", "Lambda-backed HTML"]];
  const ww = (6.6 - 0.3) / 2;
  widgets.forEach(([t, d], i) => {
    const x = M + (i % 2) * (ww + 0.3);
    const y = 1.95 + Math.floor(i / 2) * 1.05;
    round(s, { x, y, w: ww, h: 0.9, fill: { color: C.panel } });
    text(s, t, { x: x + 0.25, y: y + 0.08, w: ww - 0.5, h: 0.4, fontSize: 16, bold: true, color: C.orange });
    text(s, d, { x: x + 0.25, y: y + 0.47, w: ww - 0.5, h: 0.35, fontSize: 12.5, color: C.text });
  });
  card(s, {
    x: M + 7.0, y: 1.95, w: CW - 7.0, h: 3.0, title: "Capabilities", accent: C.blue,
    body: ["Global resource; widgets pick their Region", "Cross-account views via observability", "Variables: switch account, Region, resource", "IaC: AWS::CloudWatch::Dashboard", "Sharing links are sensitive"],
    bodySize: 13.5,
  });
  round(s, { x: M, y: 5.25, w: CW, h: 1.5, fill: { color: "3A1418" }, line: { color: C.red, width: 2 } });
  text(s, "Dashboards VISUALIZE.  They never REMEDIATE.", { x: M + 0.4, y: 5.35, w: CW - 0.8, h: 0.7, fontSize: 28, bold: true, color: C.white, valign: "middle" });
  text(s, "Automation comes from alarms and their actions, or from alarm state change events through EventBridge.", { x: M + 0.4, y: 6.0, w: CW - 0.8, h: 0.6, fontSize: 15, color: C.text, valign: "middle" });
}

{
  const s = slide(
    "Build dashboards around services and user outcomes, not individual resources. A good layout from top to bottom: service health with availability, traffic, p50, p90, p99 latency and errors. Then infrastructure: CPU, memory, which needs the agent on EC2, disk, network and throttles. Then dependencies like the database and queue depth. Then deployments with version annotations and canary health. And finally operations: active alarms and Logs Insights widgets for recent failures. Cover the four golden signals: latency, traffic, errors and saturation."
  );
  header(s, "Dashboards", "A dashboard that tells a story");
  const rows = [
    ["1", "Service health", "Availability, requests, p50 / p90 / p99 latency, errors", C.orange],
    ["2", "Infrastructure", "CPU, memory (agent!), disk, network, throttles", C.blue],
    ["3", "Dependencies", "DB latency and connections, queue depth, downstream errors", C.purple],
    ["4", "Deployments", "Version annotations, canary and blue/green health", C.teal],
    ["5", "Operations", "Active alarms, Logs Insights widgets for recent failures", C.red],
  ];
  rows.forEach(([n, t, d, col], i) => {
    const y = 1.95 + i * 0.82;
    round(s, { x: M, y, w: 8.2, h: 0.7, fill: { color: C.panel } });
    rect(s, { x: M, y, w: 0.7, h: 0.7, fill: { color: col } });
    text(s, n, { x: M, y, w: 0.7, h: 0.7, align: "center", valign: "middle", fontSize: 20, bold: true, color: C.bg });
    text(s, t, { x: M + 0.9, y, w: 2.2, h: 0.7, fontSize: 16, bold: true, color: C.white, valign: "middle" });
    text(s, d, { x: M + 3.1, y, w: 5.0, h: 0.7, fontSize: 13, color: C.text, valign: "middle" });
  });
  const gx = M + 8.6;
  const gw = CW - 8.6;
  round(s, { x: gx, y: 1.95, w: gw, h: 4.0, fill: { color: C.panel2 } });
  text(s, "FOUR GOLDEN SIGNALS", { x: gx + 0.25, y: 2.1, w: gw - 0.5, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 2 });
  ["Latency", "Traffic", "Errors", "Saturation"].forEach((g, i) => {
    pill(s, g, gx + 0.3, 2.65 + i * 0.78, { w: gw - 0.6, h: 0.55, fill: C.panel, color: C.white, fontSize: 16 });
  });
  tip(s, "EXAM TIP", "Prefer reusable IaC dashboards with variables over manually copied dashboards.", 6.2);
}

// ---------------------------------------------------------------- Section 6: Synthetics
h.section(6, "Synthetics canaries", "Find the outage before your users do", "synthetics-board",
  "Section six: CloudWatch Synthetics. Proactive monitoring with canaries.");

{
  const s = slide(
    "A canary is a script that runs on a schedule, every minute, every five minutes, every hour, from the Regions you choose. It's written with Puppeteer in Node.js or Selenium in Python, or generated by blueprints. Artifacts like screenshots, HAR files and logs go to S3. Metrics like SuccessPercent, Duration and Failed go to the CloudWatchSynthetics namespace, and from there into alarms. You can also enable X-Ray tracing."
  );
  header(s, "Synthetics", "How a canary works");
  flow(s, [
    { label: "Schedule\nevery 1 / 5 / 60 min", fill: C.panel2 },
    { label: "Canary script\nPuppeteer / Selenium", icon: "cloudwatch" },
    { label: "Artifacts to S3\nscreenshots, HAR, logs", icon: "s3" },
    { label: "Alarm on\nSuccessPercent", icon: "sns" },
  ], { x: M, y: 1.95, w: CW, h: 1.75, gap: 0.6, fontSize: 13 });
  const bps = [
    ["Heartbeat", "Load a URL, screenshot + HAR"],
    ["API canary", "REST calls, check status, body, latency"],
    ["Broken link checker", "Crawl a page, report broken links"],
    ["Visual monitoring", "Compare screenshots to a baseline"],
    ["GUI workflow builder", "Record login, cart, checkout flows"],
    ["Multi Checks", "Up to 10 HTTP/DNS/SSL/TCP checks, no browser"],
  ];
  text(s, "BLUEPRINTS", { x: M, y: 3.95, w: CW, h: 0.35, fontSize: 12, bold: true, color: C.orange, charSpacing: 3 });
  const bw = (CW - 0.6) / 3;
  bps.forEach(([t, d], i) => {
    const x = M + (i % 3) * (bw + 0.3);
    const y = 4.4 + Math.floor(i / 3) * 1.25;
    round(s, { x, y, w: bw, h: 1.1, fill: { color: C.panel } });
    text(s, t, { x: x + 0.25, y: y + 0.1, w: bw - 0.5, h: 0.42, fontSize: 16, bold: true, color: C.white });
    text(s, d, { x: x + 0.25, y: y + 0.55, w: bw - 0.5, h: 0.45, fontSize: 13, color: C.text });
  });
}

{
  const s = slide(
    "The three-way choice the exam loves. Route 53 health checks: simple DNS-level up or down, and they drive failover routing. Synthetics canaries: scripted journeys, API validation, visual regression, screenshots. RUM: real users' browser performance and client-side errors. If the question says 'route traffic away from an unhealthy endpoint', that's Route 53, not a canary."
  );
  header(s, "Synthetics", "Canary vs Route 53 health check vs RUM");
  const opts = [
    ["route53", "Route 53 health check", "Is the endpoint up?", ["DNS-level up / down", "Drives failover and latency routing", "No scripts, no screenshots"], C.blue],
    ["cloudwatch", "Synthetics canary", "Does the journey work?", ["Scripted multi-step flows and APIs", "Screenshots, HAR, visual diffs", "Works with zero real traffic"], C.orange],
    ["cloudwatch", "CloudWatch RUM", "What do real users feel?", ["Real browser sessions", "Page load and client-side errors", "Passive: needs real traffic"], C.purple],
  ];
  const ow = (CW - 0.6) / 3;
  opts.forEach(([ic, t, q, b, col], i) => {
    const x = M + i * (ow + 0.3);
    round(s, { x, y: 1.95, w: ow, h: 3.95, fill: { color: C.panel }, line: { color: col, width: 2 } });
    s.addImage({ path: icon(ic), x: x + 0.3, y: 2.2, w: 0.7, h: 0.7 });
    text(s, t, { x: x + 1.2, y: 2.2, w: ow - 1.4, h: 0.7, fontSize: 18, bold: true, color: C.white, valign: "middle" });
    text(s, `"${q}"`, { x: x + 0.3, y: 3.1, w: ow - 0.6, h: 0.5, fontSize: 17, italic: true, color: col });
    text(s, b.map((t2) => ({ text: t2, options: { bullet: { indent: 14 }, breakLine: true } })), { x: x + 0.3, y: 3.75, w: ow - 0.6, h: 2.0, fontSize: 14, color: C.text, paraSpaceAfter: 6 });
  });
  tip(s, "TRAP", "\"Route traffic away from an unhealthy endpoint\" is a Route 53 health check, not a canary.");
}

askQuestion();
askQuestion();
askQuestion();

// ---------------------------------------------------------------- Cheat sheet
{
  const s = slide(
    "Screenshot this slide. Ten mappings that answer most CloudWatch questions on DOP-C02. Read the requirement on the left, pick the feature on the right."
  );
  header(s, "Cheat sheet", "If the question says... pick...");
  const rows = [
    ["EC2 memory / disk metrics missing", "CloudWatch agent (+ SSM)"],
    ["Alert when a log pattern repeats", "Metric filter, then alarm"],
    ["Search logs interactively", "Logs Insights"],
    ["Stream logs continuously to S3", "Subscription filter, then Firehose"],
    ["One-off log archive to S3", "Export task"],
    ["Which path / IP causes most errors", "Contributor Insights"],
    ["Continuously export all metrics", "Metric Streams"],
    ["Too many related pages", "Composite alarm"],
    ["No fixed threshold, dynamic baseline", "Anomaly detection alarm"],
    ["Alarm must run a multi-step fix", "EventBridge, then Step Functions"],
  ];
  const rw = (CW - 0.3) / 2;
  rows.forEach(([q, a], i) => {
    const col = Math.floor(i / 5);
    const x = M + col * (rw + 0.3);
    const y = 1.85 + (i % 5) * 0.82;
    round(s, { x, y, w: rw, h: 0.7, fill: { color: i % 2 ? C.panel : C.panel2 } });
    text(s, q, { x: x + 0.25, y, w: rw * 0.5 - 0.3, h: 0.7, fontSize: 13, color: C.text, valign: "middle" });
    text(s, a, { x: x + rw * 0.52, y, w: rw * 0.48 - 0.2, h: 0.7, fontSize: 14, bold: true, color: C.orange, valign: "middle" });
  });
  tip(s, "AND", "Who changed it? CloudTrail. Schedule it? EventBridge. Dashboards never remediate.", 6.2, { h: 0.55 });
}

// ---------------------------------------------------------------- Outro
{
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addNotes(
    `That's CloudWatch for DOP-C02. How many of the 8 questions did you get right? Tell me in the comments. If this helped, like the video and subscribe to ${BRAND.handle} for more DevOps Professional exam content.`
  );
  h.photoBackdrop(s, "title-servers", 12);
  rect(s, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.orange } });
  s.addImage({ path: icon("cloudwatch"), x: W / 2 - 0.55, y: 0.9, w: 1.1, h: 1.1 });
  text(s, "How many did you get right?", { x: 0, y: 2.25, w: W, h: 0.9, fontSize: 44, bold: true, color: C.white, align: "center" });
  text(s, "Drop your score out of 8 in the comments", { x: 0, y: 3.15, w: W, h: 0.6, fontSize: 22, color: C.text, align: "center" });
  const bw = 2.6;
  const bx = W / 2 - (bw * 2 + 0.3) / 2;
  pill(s, "LIKE", bx, 4.2, { w: bw, h: 0.7, fill: C.panel2, color: C.white, fontSize: 18 });
  pill(s, "SUBSCRIBE", bx + bw + 0.3, 4.2, { w: bw, h: 0.7, fill: C.red, color: C.white, fontSize: 18 });
  text(s, [
    { text: `${BRAND.name}  `, options: { bold: true, color: C.white } },
    { text: BRAND.handle, options: { color: C.orange } },
  ], { x: 0, y: 5.3, w: W, h: 0.6, fontSize: 24, align: "center" });
  text(s, `Passed DOP-C02 with ${BRAND.score}. Let's get you there too.`, { x: 0, y: 5.95, w: W, h: 0.5, fontSize: 16, color: C.text, align: "center" });
}

const out = path.join(__dirname, "CloudWatch-DOP-C02.pptx");
pptx.writeFile({ fileName: out }).then(() => console.log(`Wrote ${out}`));
