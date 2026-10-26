# Woven skill test

Two timed scenarios inside a 48-hour window. The scenario clocks are 15 minutes and 35 minutes. Breaks between them are expected. Set a separate alarm for 47 hours so the last hour is not a surprise.

This note is preparation. Once you open the scenarios, do the work yourself. Woven’s code of conduct allows documentation and other research if you cite it, and it treats an AI-written solution as a disqualification. Do not take the scenario text or your write-up out of the platform.

Their public rubric note for the architecture scenario, from 14 March 2022: quality of ideas beats quantity. “Maybe the internet is down” is the example of a weak idea. A strong idea uses the split in the evidence. Their example is that only the beta service is affected, so the cause is something beta has and the healthy service does not, such as throttling from a dependency only beta calls. Source: [Architecture Debugging - Brainstorm](https://help.woventeams.com/article/9by3m1rlyd-architecture-debugging-brainstorm).

Spend 10 minutes in Qualified before you start, using the Qualified guide linked from the prep page. Confirm you can type, save, and see the timer.

---

## What a point looks like

A scored idea has four parts:

1. The evidence it uses, including what is still healthy.
2. The layer and the mechanism: slow, blocked, or wrong.
3. The observation that would confirm it.
4. The observation that would make you drop it.

A fix comes after that, and only as a conditional. “If the new endpoint’s time is inside one query, add the missing index and check the lock it takes.” You were told you will not have enough information to fix the problem. Picking one remedy and stopping is a miss. Listing every layer with no tie to the ticket is the other miss.

---

## Scenario 1 — 15 minutes

You are brainstorming performance problems in a multi-tier system. Walk the layers the prep guide names: frontend, web application server, database, key-value or document store, infrastructure, and the network path (DNS, load balancer, proxies).

### Clock

| Minutes | Do this |
| --- | --- |
| 0–3 | Restate the symptom. Write what is healthy. Write what changed. Write what you were not given. |
| 3–12 | Keep only the layers the healthy path does not eliminate. Two ideas per remaining layer is enough. |
| 12–15 | Rank three. Name the first check. Name what you are parking, and which fact parked it. |

### How a fact eliminates a layer

Use the contrast before you use the checklist.

- One route got slow after a deploy, and other routes on the same service did not. Start in the code and queries that deploy added. A regional network outage would have hit the other routes.
- The browser’s wait is inside one API call, and that API’s server time matches it. The frontend is not the first place to look. A heavy bundle can still be a second problem. Say that in one line and move on.
- API time is fast in server logs and slow on the user’s screen. Then look at the client: waterfall calls, a large payload, main-thread work.
- Database CPU is flat, application CPU is flat, and threads or the event loop are busy waiting. The time is in a downstream call or in a pool waiting for a connection, not in your JavaScript and not in query execution.
- Application CPU is pegged and the event loop lag is high. On Node, suspect synchronous work: `JSON.parse` on a large body, `readFileSync`, `pbkdf2Sync`, or a tight loop. Async I/O does not pin the event loop. The libuv thread pool (default 4) is a different queue, used by some crypto and filesystem APIs.
- The database pool is at its maximum and requests wait before a query starts. That is blockage. The slow query is whatever is holding the connections. A missing index, a lock, and an N+1 loop are three different holders. You tell them apart with query count per request and `EXPLAIN`, which you may not have. Say which one you need.
- Redis CPU or latency moved, and the database did not. Look at hit rate, evictions, a hot key, a huge value, and connection count. A stable hit rate with a slow app often means the cache is not on the slow path.
- Only one region, cluster, or beta fleet is sick, and it does not share a dependency with the healthy fleet. Look at infrastructure that exists only there: an autoscaling limit, a smaller instance, a security group, a cold cache, a regional third party. This is the shape of Woven’s published example.
- Errors did not rise. Prefer a saturation or a slow successful path over a total outage. Timeouts can still be errors if the client gives up and the server log calls the request a 200 that simply finished late. Read the metric definition before you lean on “errors are flat.”

### Node-shaped mechanisms worth having ready

These are mechanisms, not a list to paste.

- Event-loop stall: every request on that process waits, including health checks. Other instances stay fast. A load balancer then looks inconsistent.
- Database pool exhaustion: latency climbs, database CPU may stay moderate if the queries are waiting on locks or if the app is waiting for a free client. `pool.query("BEGIN")` on `node-postgres` is not one transaction. Each call can take a different connection, and a connection released after `BEGIN` goes back to the pool still in a transaction.
- N+1: the route does one query for a list and one per row. Database time is many small round trips. The page that does a join stays fast.
- Cache stampede: a popular key expires and every request rebuilds it. The database gets a sudden spike. A single-flight lock or a stale-while-revalidate policy is the conditional fix.
- Replica lag: writes look fine, reads look stale or slow. Only if this service reads from a replica. If you were not told that, ask.
- Load balancer and idle timeouts: a few requests die at a fixed deadline (often 60s or the proxy’s idle timeout) while shorter ones succeed. That pattern is a cutoff, not a gradual CPU curve.
- DNS and TLS: they add cost on new connections. They do not explain an 8-second JSON endpoint that reuses a warm connection, unless the pool is opening new connections every time.

### Conditional remedies

State the remedy next to the evidence that would justify it, plus the cost.

- Missing index: confirm with a sequential scan of a large table in the plan. Adding an index on a busy table can lock writes unless you use the engine’s concurrent form. PostgreSQL’s `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
- Pool too small: only after the queries themselves are cheap and the wait is for a free connection. Raising the pool without a `max_connections` budget exhausts the database.
- Cache: only if the read can be stale for a defined time. Do not cache a balance or an authorization decision to win a performance drill.
- More instances: helps when every instance is busy doing useful CPU. It does not help when each instance is blocked on one shared database or one shared lock.
- Client pagination or fewer round trips: the right fix when the waterfall is in the browser. Useless when one server span is the whole wait.

### Original drill

Time this at 15 minutes before you read the sample. The numbers are invented.

> Tuesday 14:10 UTC, tenants say the Insights page feels stuck. The invoice list on the same host is fine. `GET /insights` p95 moved from 250 ms to 6 s. `GET /invoices` p95 is unchanged. Error rate is flat. App CPU went from 25% to 40%. Database CPU went from 20% to 85%. The service’s database pool (max 20) sits at 20. Redis hit rate is unchanged at about 90%. Monday 18:00 a deploy added a per-tenant daily rollup to the Insights API only. No scaling events. You do not have the SQL or a trace.

### Sample for the drill

Healthy: invoice list, error rate, Redis hit rate, no capacity event. Changed: one route, one deploy, database CPU, pool saturation, a smaller rise in app CPU.

Parked, with a reason:

- Frontend. The server-side p95 of this route moved. A client waterfall would not pin database CPU.
- Redis. Hit rate did not move, and the sick route is the one that gained a database rollup.
- DNS, TLS, and a general load-balancer failure. They would not single out one route on one service after a code deploy.
- “The internet is down.” Invoices on the same host are fine.

Ranked:

1. The rollup query is expensive, holds connections, and has saturated the pool. Database CPU at 85% and a full pool fit a slow successful query better than an application crash. Confirm with time-in-database per `/insights` request, the query text, and `EXPLAIN`. Drop this if Insights time is spent before the query is sent.
2. The rollup is an N+1: one query per day or per row, so twenty connections stay busy with round trips. App CPU rose only a little, which fits waiting on the database. Confirm with queries per request. Drop this if one statement accounts for the time. The remedy differs: a single grouped query, not an index on twenty tiny ones.
3. The new query waits on a lock (a migration, a report, or `FOR UPDATE` on a hot tenant). Database CPU can be lower in a pure lock pile-up than in a CPU-heavy scan, so this ranks under the scan. Confirm with blocking-lock views. Drop this if the active queries are running, not waiting.

First check: one Insights request’s query count and the plan of the new statement. I would not resize the pool or the fleet until that plan is in hand. A bigger pool would let more of the same bad query onto a database that is already at 85% CPU.

What I still need: whether Insights and invoices share this database, whether the rollup reads a replica, and the tenant’s data volume. A single huge tenant would make me look for a missing tenant-and-date index before I look for a global sequential scan.

---

## Scenario 2 — 35 minutes

A customer-support bug report, plus incomplete code or logs. They are scoring how you investigate, how you research, how you leave a trail, and how you write to two audiences.

### Clock

| Minutes | Do this |
| --- | --- |
| 0–5 | Split the ticket into observed facts and the customer’s theory. List what the materials cannot tell you. |
| 5–20 | Follow the code. Keep a short lab note: looked at, expected, found. If you open docs, paste the title and URL. |
| 20–30 | Write the engineering note and the support reply as separate pieces. |
| 30–35 | Delete anything you do not have evidence for. Make sure the support reply does not sound more certain than the note. |

### Lab note

Write it so a teammate can continue without you.

```text
Fact: the ticket says the invoice date looks like yesterday for this customer.
Fact: the handler sets the date with Date.toISOString().slice(0, 10).
Not shown: the customer's timezone, the stored timestamp, or whether US invoices were actually checked.
Checked: MDN, Date.prototype.toISOString — the result is always UTC.
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
Expectation if this is a UTC-versus-local bug: local hours after midnight and before the UTC offset still show the previous UTC date.
Found: the code never applies a timezone. The ticket matches that window. It does not prove the amount is wrong.
```

That note is the “document your learning” part. A private conclusion with no trail is weaker.

### Engineering note

Include: how to reproduce, the line that decides the behavior, why the language does that, who else can hit it, what would disprove it, and the smallest test. Do not open with a library recommendation.

A good test names an instant, not a vibe. “At 2026-10-20 00:30 in Asia/Tokyo, which is 2026-10-19 15:30 UTC, the invoice date equals the Tokyo calendar date.”

### Support reply

The reader is a support agent and, through them, a customer. Use their words first.

- Say what they experienced.
- Say whether their money or their record looks wrong, and say “I cannot tell yet” when that is true.
- Say what happens next, and when you will update them if you do not know the fix.
- Leave out class names, isolation levels, and a list of hypotheses. One plain cause is enough if you have it. If you do not, say what you checked and what you still need (a screenshot, the account id, the time on their clock).

Avoid “this is expected behavior” unless the product really defined it. “The date is the UTC day, and that is why it reads as yesterday in Japan before 9:00” is a cause. It is not a decision that the customer should accept it.

### Original drill

Time this at 35 minutes. Invented ticket and code.

> Support: “A customer in Tokyo created an invoice just after midnight and the PDF shows yesterday’s date. They think we billed the wrong day. Customers in the US have not reported this. It started mattering when we enabled dated invoices. No deploy that week.”
>
> ```typescript
> function invoiceDay(now: Date = new Date()): string {
>   return now.toISOString().slice(0, 10);
> }
> ```
>
> The PDF prints `invoiceDay()` and nothing else about dates. Amounts come from another function you are not shown.

### Sample for the drill

Facts: one Tokyo customer, just after local midnight, saw the previous calendar date. US customers have not reported it. The date string is the first 10 characters of `toISOString()`. Amount code was not provided.

Customer’s theory, not yet a fact: the billed day is wrong. “US is fine” is an absence of tickets, not a check.

Research: MDN documents `toISOString()` as a UTC string. Tokyo is 9 hours ahead of UTC. From 00:00 to 08:59 in Tokyo, the UTC date is still the previous day. A US customer can hit the mirror image around their local midnight, which may be why nobody in the US has written in. I would not call the US path correct.

Engineering note. Reproduce with a fixed clock: `invoiceDay(new Date("2026-10-19T15:30:00.000Z"))` is `2026-10-19`, and that instant is 2026-10-20 00:30 in Asia/Tokyo. The PDF is doing what the function says. The function is the wrong business rule if “invoice day” means the customer’s calendar day. The amount path is untouched, so I cannot tell support the charge is right. Disprove this explanation with a stored `created_at` that is already on the Tokyo date they expected, or with a date formatter elsewhere in the PDF. Smallest fix, after product confirms the rule: format the instant in the tenant’s timezone (or in a zone stored on the invoice), with a test at 00:30 local. Do not use `toLocaleDateString()` without an explicit `timeZone`, because the server’s zone would then decide.

Support reply. The date on the PDF is coming out as the previous day for this customer because the system is using the UTC date, and just after midnight in Tokyo it is still the day before in UTC. I do not yet have their invoice amount in front of me, so I am not calling the charge correct or incorrect. I am also not treating US customers as unaffected. The same rule can show a surprising date near midnight there too. Next step is to confirm with finance which calendar day an invoice should use, and to correct the PDF once that rule is explicit. Please send the invoice id and a photo of the date they see. We do not need them to create another invoice.

---

## Tonight

One sitting of each drill, on a timer, in a blank document. Then compare with the samples and mark only whether you used the healthy path, whether each idea can be killed, and whether the support reply is more certain than the evidence.

The long architecture guide is the source for pools, event-loop stalls, indexes, and N+1 if those mechanisms are rusty. The fintech and system-design sections are for the interview after this test, not for these two clocks.
