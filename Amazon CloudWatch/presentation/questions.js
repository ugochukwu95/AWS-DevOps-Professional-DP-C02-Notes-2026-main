// Original DOP-C02-style scenarios written from the notes in this folder. Not real exam questions.
// `traps` is indexed like `options`; the entry at `correct` is unused.
// Authored with the right answer second; ANSWER_SLOTS moves it so viewers can't guess "always B".

const ANSWER_SLOTS = [1, 2, 0, 3, 1, 0, 3, 2];

const moveAnswer = (q, slot) => {
  const order = [0, 1, 2, 3].filter((k) => k !== q.correct);
  order.splice(slot, 0, q.correct);
  return {
    ...q,
    options: order.map((k) => q.options[k]),
    traps: order.map((k) => q.traps[k]),
    correct: slot,
    notesA: q.notesA.replace(/answer is B/, `answer is ${"ABCD"[slot]}`),
  };
};

const QUESTIONS = [
  {
    topic: "Metrics",
    scenario:
      "A company runs 200 Amazon EC2 Linux instances. The operations team wants alarms on memory utilization and free disk space, but these metrics do not appear in CloudWatch. The solution must be centrally managed and scale to new instances. What should a DevOps engineer do?",
    options: [
      "Enable detailed monitoring on every instance",
      "Install the CloudWatch agent with Systems Manager, storing the agent config in Parameter Store",
      "Add a cron script on each instance that calls PutMetricData",
      "Enable AWS Config and use a managed rule to collect OS metrics",
    ],
    correct: 1,
    icons: ["ssm", "cloudwatch"],
    why: "Memory and disk are OS-level metrics the hypervisor cannot see. The agent collects them; Parameter Store holds one shared config; State Manager or Run Command rolls it out to every instance, including new ones.",
    traps: [
      "Detailed monitoring only makes the same hypervisor metrics arrive every 1 minute. Still no memory or disk.",
      null,
      "It works, but it is custom code on 200 hosts with no central management. That is toil, not a DevOps answer.",
      "Config records resource configuration and compliance. It never collects OS performance metrics.",
    ],
    notesQ: "Question 1. Pause the video and pick an answer. Hint: think about what the hypervisor can and cannot see.",
    notesA:
      "The answer is B. Basic EC2 metrics come from the hypervisor, so memory, disk space, swap and application logs are missing. The unified CloudWatch agent fixes that. The exam loves the combination: agent config in SSM Parameter Store, deployed at scale with State Manager or Run Command. Detailed monitoring is a classic trap: it only changes the frequency from 5 minutes to 1 minute.",
  },
  {
    topic: "Alarms",
    scenario:
      "Whenever the database slows down, the on-call engineer receives 15 separate pages because CPU, latency and error-rate alarms fire for every microservice. The team wants ONE page, and only when API latency AND API error rate are both in ALARM. Which solution needs the least effort?",
    options: [
      "Increase the evaluation periods on every alarm",
      "Create a composite alarm (latency AND errors) and send only the composite alarm to SNS",
      "Subscribe a Lambda function to SNS that deduplicates pages",
      "Replace every alarm with an anomaly detection alarm",
    ],
    correct: 1,
    icons: ["sns", "cloudwatch"],
    why: "Composite alarms combine other alarm states with AND / OR / NOT. Keep the child alarms without actions and page only on the composite: native, no code, one page.",
    traps: [
      "Slower detection, and when they do fire you still get 15 pages.",
      null,
      "Custom code to maintain for a problem CloudWatch already solves natively.",
      "Changes how each threshold is calculated, not how many pages are sent.",
    ],
    notesQ: "Question 2. Key words: reduce noise, combine conditions, least effort.",
    notesA:
      "The answer is B, a composite alarm. Whenever you read 'reduce alert noise', 'only page when A and B', or 'prevent duplicate incident pages', think composite alarm. Remove the actions from the child alarms and put the SNS action on the composite.",
  },
  {
    topic: "Logs",
    scenario:
      "A security team requires that all application logs in CloudWatch Logs are delivered to an Amazon S3 bucket continuously, within minutes of being written, for long-term retention. Which solution has the LEAST operational overhead?",
    options: [
      "A daily EventBridge schedule that runs CreateExportTask to S3",
      "A subscription filter on the log group that sends to Amazon Data Firehose, delivering to S3",
      "A subscription filter that invokes a Lambda function which writes each event to S3",
      "A metric filter on the log group plus a CloudWatch Metric Stream to S3",
    ],
    correct: 1,
    icons: ["s3", "firehose", "cloudwatch"],
    why: "Subscription filters stream log events in near real time. Firehose is fully managed, buffers and batches, and lands the data in S3 with no code.",
    traps: [
      "Export tasks are batch jobs over a time range. Daily is not 'continuously, within minutes'.",
      null,
      "Works, but you own the code, scaling, retries and S3 object sizing. More overhead than Firehose.",
      "Metric filters produce numbers, not log events. Metric Streams export metrics, not logs.",
    ],
    notesQ: "Question 3. Two key words: continuously, and least operational overhead.",
    notesA:
      "The answer is B. Export task versus subscription filter is one of the most tested CloudWatch Logs distinctions. Export task: batch, S3 only, one-off or scheduled archive. Subscription filter: near real-time, to Lambda, Kinesis Data Streams or Firehose. When the final destination is S3, pick Firehose.",
  },
  {
    topic: "Logs",
    scenario:
      "A Java application on EC2 sends its logs to CloudWatch Logs. The team wants to be notified when the string \"OutOfMemoryError\" appears more than 5 times within 5 minutes.",
    options: [
      "Run a CloudWatch Logs Insights query every hour and email the results",
      "Create a metric filter for the pattern, alarm when Sum > 5 over 5 minutes, and notify through SNS",
      "Stream the logs to Kinesis Data Streams and build a consumer that counts matches",
      "Create a CloudTrail trail with a data event selector on the log group",
    ],
    correct: 1,
    icons: ["sns", "cloudwatch"],
    why: "Metric filters turn matching log lines into a custom metric. A standard alarm on that metric then notifies through SNS. This is the textbook log-pattern alerting pipeline.",
    traps: [
      "Logs Insights is for interactive analysis, not alerting. Hourly is far too slow.",
      null,
      "Massive overkill: you build and run a stream consumer just to count a string.",
      "CloudTrail records API calls. It does not read the contents of your application logs.",
    ],
    notesQ: "Question 4. You want an alert from a pattern in the logs. Which feature turns log lines into something you can alarm on?",
    notesA:
      "The answer is B: metric filter, then custom metric, then alarm, then SNS or Lambda. Memorize this chain; it shows up in many forms, for example 'alert when ERROR appears repeatedly' or 'count failed logins'.",
  },
  {
    topic: "Advanced monitoring",
    scenario:
      "An API running on EC2 writes JSON access logs to CloudWatch Logs. 5xx errors have spiked. Operations needs to see which URL paths and client IPs contribute the MOST errors, and keep tracking that ranking over time.",
    options: [
      "An anomaly detection alarm on the 5xx error count metric",
      "A CloudWatch Contributor Insights rule on the access log group",
      "A dashboard widget showing total 5xx errors per minute",
      "An AWS X-Ray service map for the API",
    ],
    correct: 1,
    icons: ["cloudwatch"],
    why: "Contributor Insights evaluates log or metric data and ranks the top-N contributors (path, IP, user agent) to a condition, continuously over time.",
    traps: [
      "Tells you THAT errors are abnormal, not WHO is causing them.",
      null,
      "Shows the total, not which paths or clients dominate.",
      "Shows service dependencies and latency, not a top-N ranking of paths and IPs. Also needs instrumentation.",
    ],
    notesQ: "Question 5. Look for the words 'which', 'top', or 'most'.",
    notesA:
      "The answer is B, Contributor Insights. Whenever the question asks about noisy neighbors, top talkers, or which path or IP dominates errors or traffic, think Contributor Insights. Thresholds and anomaly detection tell you something is wrong; Contributor Insights tells you who.",
  },
  {
    topic: "Synthetics",
    scenario:
      "After every deployment, an e-commerce company wants to verify every 5 minutes that a user can log in, add an item to the cart, and reach checkout, with screenshots captured when a step fails, even when there is no real traffic.",
    options: [
      "A Route 53 health check on the /checkout URL",
      "A CloudWatch Synthetics canary (GUI workflow or Puppeteer script) with an alarm on SuccessPercent",
      "CloudWatch RUM on the website",
      "ALB target group health checks with a deeper health check path",
    ],
    correct: 1,
    icons: ["cloudwatch"],
    why: "Canaries run scripted, multi-step user journeys on a schedule and store screenshots, HAR files and logs in S3. Their metrics drive CloudWatch alarms.",
    traps: [
      "Checks that one endpoint is reachable. It cannot log in, click, or take screenshots.",
      null,
      "RUM measures real users. With no traffic there is nothing to measure, and it is not a scripted test.",
      "Only decides whether a target receives traffic. No user journey, no screenshots.",
    ],
    notesQ: "Question 6. Scripted journey, schedule, screenshots, no real traffic. Which feature does all of that?",
    notesA:
      "The answer is B, a Synthetics canary. Remember the three-way split: Route 53 health check for DNS-level up or down and failover routing, Synthetics canary for proactive scripted journeys and APIs, and RUM for real user browser performance.",
  },
  {
    topic: "Alarms + automation",
    scenario:
      "When a CloudWatch alarm on an RDS database enters ALARM, the team must open a ticket, take a DB snapshot, and notify on-call, with retries and visibility into each step. What is the MOST operationally efficient design?",
    options: [
      "Set the alarm action to invoke one Lambda function that does every step",
      "An EventBridge rule on \"CloudWatch Alarm State Change\" that starts a Step Functions state machine",
      "Set the alarm action to SNS and email the runbook to on-call",
      "Add a text widget with the runbook link to the CloudWatch dashboard",
    ],
    correct: 1,
    icons: ["stepfunctions", "eventbridge", "cloudwatch"],
    why: "Alarm state changes are emitted as events. EventBridge routes them; Step Functions gives you per-step retries, error handling and a visual execution history.",
    traps: [
      "One monolithic function: no per-step visibility, and retries are hand-rolled.",
      null,
      "That is a notification, not automation. A human still does every step.",
      "Dashboards visualize. They never remediate anything.",
    ],
    notesQ: "Question 7. Multi-step, retries, visibility into each step. Which services fit together?",
    notesA:
      "The answer is B. Alarm actions are limited to SNS, Lambda, EC2 actions, Auto Scaling and Systems Manager. When the scenario needs a multi-step workflow, route the CloudWatch Alarm State Change event through EventBridge to Step Functions. And remember: dashboards never remediate.",
  },
  {
    topic: "Custom metrics",
    scenario:
      "An application records hundreds of latency samples per minute on each host and publishes every sample with PutMetricData --value. Calls are being throttled and costs are rising. The team must keep accurate Min, Max and Average with the FEWEST API calls.",
    options: [
      "Switch the metric to high resolution (1-second storage)",
      "Aggregate locally and publish once per period with --statistic-values (Sum, Min, Max, SampleCount)",
      "Request a PutMetricData quota increase and keep the current code",
      "Publish only the per-minute average with --value",
    ],
    correct: 1,
    icons: ["cloudwatch"],
    why: "A statistic set carries Sum, Minimum, Maximum and SampleCount in one call. CloudWatch derives Average as Sum divided by SampleCount, so nothing is lost.",
    traps: [
      "Higher resolution means more data points, not fewer calls.",
      null,
      "Treats the symptom. The cost and the inefficient design stay.",
      "Fewer calls, but Min and Max are lost.",
    ],
    notesQ: "Question 8, the last one. Think about how to send many samples in a single call.",
    notesA:
      "The answer is B. PutMetricData has two modes: --value for one raw data point, and --statistic-values for a pre-aggregated set. You cannot mix them in one call. For high-frequency data, aggregate locally and send statistic sets.",
  },
];

module.exports = QUESTIONS.map((q, i) => moveAnswer(q, ANSWER_SLOTS[i]));
