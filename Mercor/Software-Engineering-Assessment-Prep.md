# Mercor software engineering assessment prep

Study notes for Mercor’s software engineering loop, reconstructed from public candidate reports dated roughly October 2025 through November 2026. Mercor does not publish this loop. Nothing here is a Mercor paper, and nothing here is the question you will be asked. Themes repeat. Wording does not.

Do not take this file into a round. Reports say the coding round is often recorded, often has no tests, and often bans LLMs for at least the first parts. A generated solution you cannot explain is a failed round even when the tool was allowed. Confirm the rule for that day with the coordinator. Reports also describe the rule changing between the email and the room.

Payments, transactions, and delivery are not re-taught here. The four-minute script is below. The long version is sections 3, 4, and 6 of [Andela/Software-Architecture-Assessment-Guide.md](../Andela/Software-Architecture-Assessment-Guide.md). The job-API exercise in that file is the single-service version of the scheduler design in this file.

**Priority** means:

- **Must know** — decides the spoken screen or the onsite design.
- **Secondary** — the coding follow-up and the LLM build. Still do it. Do not let it crowd out the spoken screen on day one.

---

## How the loop is scored

Reports describe four stages. Timing is what candidates reported, not a guarantee.

1. A short recruiter or hiring-manager call. One recent project. How you use AI tools. Be specific about a diff you kept and a diff you threw away.
2. A spoken technical screen, about 30 minutes, sometimes 40. No editor. About four questions, sometimes five. Candidates who answered three and went deep report failing. Cover the question, name the failure mode, stop.
3. An onsite, often in San Francisco and several hours. A coding block you do alone and then defend. A verbal algorithm. A system design, often a job scheduler. Some loops add a build where an LLM is allowed and the last minutes are a design review of what you wrote.
4. A hiring-manager or executive conversation. Same day to two days in the reports that give a timeline.

A weak spoken answer names a tool: “use a hash map”, “use Postgres”, “Stripe is idempotent”. A strong answer names the **invariant**, the **failure**, and the **bound**:

1. Say what must stay true.
2. Give the complexity or the consistency you need, in one sentence.
3. Name the input that breaks the naive version.
4. Stop. Wait for the follow-up.

Plausible answers fail when they are still on step 2 and the interviewer has two questions left.

---

## 1. Verbal screen

**Priority: Must know**

Say these out loud. Ninety seconds is the whole answer unless they ask you to continue. The follow-ups are what they ask if you finish cleanly.

### Sorting

**Ninety seconds.** A comparison sort is Ω(n log n) in the worst case. Mergesort is O(n log n) time, O(n) extra memory, stable, and that bound holds on every input. Heapsort is O(n log n) time and O(1) extra memory, and it is not stable. Quicksort is O(n log n) average and O(n²) when the pivot is always the extreme element; pick the pivot at random, or fall back to heapsort past a depth limit. Counting sort and radix sort beat n log n only because they are not comparison sorts. They need integer keys in a bounded range.

There is no slowest deterministic sort. Any correct sort stays correct if you insert a finite amount of wasted work. The answer to give is the permutation scan: generate permutations in lexicographic order and return the first one that is nondecreasing. It is deterministic, it terminates, and it is Θ(n · n!) because there are n! permutations and each sortedness check reads n elements. Random bogosort is not deterministic. Stooge sort is deterministic and worse than quadratic, and it is still nowhere near n!.

**Follow-up.** Stability: mergesort keeps equal keys in input order, heapsort does not. Why it matters: sort by timestamp, then by user id, and an unstable second sort scrambles the timestamps. In-place: heapsort’s extra memory is O(1); mergesort’s usual top-down form is O(n). Duplicate keys do not change the comparison lower bound.

### Probability

**The drill.** A fair six-sided die is rolled until it shows a 6. What is the expected number of rolls?

**Ninety seconds.** This is a geometric distribution. Each roll is independent and succeeds with p = 1/6. Let E be the expected rolls from the start. With probability 1/6 you stop after one roll. With probability 5/6 you have used one roll and you are back at the start, so you still expect E more. E = (1/6)·1 + (5/6)·(1 + E). Solve: E/6 = 1, so E = 6. In general the expected trials until the first success is 1/p. The memoryless step is the whole proof. Do not enumerate an infinite series unless they ask.

**Follow-up.** Expected rolls to see every face at least once. That is the coupon collector. After you have k distinct faces, the chance the next roll is new is (6 − k) / 6, so the wait is 6 / (6 − k). Total expectation is 6 · (1/6 + 1/5 + 1/4 + 1/3 + 1/2 + 1/1) = 14.7. For n faces it is n · Hₙ, about n ln n.

### Duplicate usernames

**Ninety seconds.** Define equality first: case folding and Unicode normalization, or exact bytes. Then:

Enough RAM for the whole set. A hash set. Insert each name. If the insert finds the name already present, it is a duplicate. Expected O(n) time and O(n) memory. A balanced tree is O(n log n) and uses less constant memory. Sorting the array and scanning adjacent equals is also O(n log n) and answers “list the duplicates” in one pass. The hash set is the one to lead with when the set fits.

RAM is smaller than the file, disk is large. Do not load the file. External sort: read runs that fit in memory, sort each run, merge them k-way, then scan the sorted stream and emit a name when it equals the previous one. I/O dominates. Comparisons are O(n log n) with the run size fixed by RAM. The other correct approach is hash partitioning. Write each name to bucket `hash(name) % B`, choosing B so one bucket fits in RAM. Equal names land in the same bucket. Hash-set each bucket. A duplicate cannot hide in two buckets.

**Follow-up.** What fails. A hash set that spills to disk without a partition still dies when the unique set exceeds RAM. External sort must spill the runs, not only the input. An in-memory sort of memory-mapped pages is still an in-memory sort. Empty names and names that differ only by a trailing space are duplicates only if your equality says so. Say which.

### Exchange rates

**Ninety seconds.** Currencies are nodes. A directed edge A → B labelled r means one unit of A buys r units of B. A conversion is a path. The rate is the product of the edge labels. BFS or DFS finds one path in O(V + E) if you mark visited. You must mark visited or a cycle does not terminate.

That product is the rate along that path, not the best rate. Two paths can disagree. Visited also hides a better path that would have revisited a node. If they only asked “can I convert, and what is one rate”, BFS is enough and you say the product is path-dependent. If they asked for the best rate, stop using BFS.

**Follow-up.** Best rate means the maximum product. Sums of log(r) turn products into sums. Edge weight −log(r) turns the maximum product into a shortest path. −log(r) is negative whenever r > 1, so Dijkstra is the wrong algorithm. Bellman-Ford is O(VE) and accepts those weights. A negative cycle in that graph is a cycle whose rate product is greater than 1. You can walk it forever and the “best” rate is unbounded. That is the arbitrage check. Report the cycle instead of a number.

### Payments

**Priority: Must know.** Four minutes, then stop. The mechanism is sections 3, 4, and 6 of the Andela architecture guide. Do not retell those chapters in the screen.

**The script.**

The invariant: one client operation creates at most one charge, including when your process dies or the HTTP call times out.

A timeout means your client stopped waiting. It does not mean the provider declined, and it does not mean the provider never charged. Retrying with a new charge id is how you double-charge.

Before the call, insert a payment row in `pending` and store an idempotency key, unique, in the same database transaction. Commit. Then call the provider with that same key. On a definite decline, mark `failed` and do not charge again. On a definite success, store the provider reference and mark `succeeded` once. On a timeout, mark `unknown` and return that. The retry sends the same key. If the row is still `pending` because you died before the call, you submit once. You never insert a second payment.

The unique key has to survive a crash, so it lives in a database that can reject the second insert. PostgreSQL or MySQL is the short answer: one transaction, one unique constraint, read-your-write. A cache loses the key when the node dies. Say that trade-off if they push scale: you are buying a single-row atomic insert, and you are giving up the availability story of a store that will accept both writes.

What you refuse. The provider call inside the open database transaction. Treating timeout as failure and charging again. Two writers, the HTTP handler and the webhook, both inserting a charge with no unique provider reference. A queue “exactly once” claim in place of the unique key.

If they ask what you store: your payment id, tenant, amount in minor units, currency, status, idempotency key, request hash, provider reference, timestamps. The request hash is how the same key with a different amount returns a conflict instead of the old success.

---

## 2. Code review

**Priority: Must know**

Ten minutes each. Write the findings in severity order before you read the answers. Style comments do not count. Each finding needs the failure it causes.

The shapes match what candidates report: a cache shared by threads, a CSV built in a loop, a payment call. The payment review is the script above plus the Andela mock, not a third snippet here.

### Review A — shared cache

```python
import threading

cache = {}
lock = threading.Lock()

def cache_retrieve(key, compute):
    if key in cache:
        return cache[key]
    value = compute()
    with lock:
        cache[key] = value
    return value
```

`compute` is slow. Sometimes it writes to a database. Callers share this function across threads.

### Review B — CSV

```python
def to_csv(rows):
    out = ""
    for row in rows:
        for cell in row:
            out += cell
        out += "\n"
    return out
```

`rows` is a list of lists. Cells come from users. The caller will open the string in a spreadsheet.

### Review C — async cache

```typescript
const cache = new Map<string, string>();

async function cacheRetrieve(
  key: string,
  compute: () => Promise<string>,
): Promise<string> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cache.set(key, value);
  return value;
}
```

One Node.js process. Two requests for the same missing key arrive close together. `compute` calls a paid API.

### Code review answers

Do not read this until you have written the three reviews.

#### A

1. **The check and the fill are not one critical section.** Two threads both see a miss, both call `compute`, both store. If `compute` inserts a row or charges a customer, it happens twice. The lock only covers the assignment, which is the part that was already safe.
2. **The result is not even a single-flight cache.** The second thread does not wait for the first. It starts its own `compute`. That is a stampede, not only a race on the dict.
3. **“The GIL makes the dict safe” is the wrong conclusion.** CPython will not corrupt the dict’s buckets for this code. It will still run both `compute` calls, because the GIL is released across I/O and the two checks happen before either assignment. Logical races survive the GIL.
4. **Holding this same lock around `compute` is the bad fix.** It removes the double call and serializes every key behind every slow call. If `compute` calls `cache_retrieve` on another key, this non-reentrant lock deadlocks. The fix is a per-key lock or an in-progress placeholder for that key only, then the global dict lock only for the map write.
5. **The map never shrinks.** A new key on every request is an unbounded process. Say eviction or a max size. Also say that a caller who mutates a stored list changes the cached object for everyone else.

Passing is findings 1 and 2 with a per-key fix. Failing is “add a lock” without saying the existing lock does not cover the bug.

#### B

1. **The output is not CSV.** Cells are concatenated with no separator. `["ab", "c"]` becomes `abc`. A spreadsheet cannot recover the columns.
2. **Commas, quotes, and newlines in a cell split the row.** A name like `Doe, Jane` becomes an extra column. A quote or a newline does the same. The usual rule: if the cell contains a comma, a quote, or a line break, wrap it in quotes and double any quote inside.
3. **Repeated `+=` on a string is the wrong way to build the buffer.** In a lot of languages it copies the whole prefix each time and is quadratic. CPython often makes a local `+=` amortized linear. Do not spend the review on that peephole. Build a list of fields, join a row with commas, join rows with newlines, or use the `csv` module, which already quotes.
4. **A non-string cell throws.** `+=` on an int raises `TypeError` halfway through the file. Convert deliberately. `None` should be an empty field or a rejected row, not the word `"None"`, unless the format says so.

Passing is 1 and 2. Mentioning only performance, and missing the missing commas, is a fail. The reported screen pushed people who stopped at “use a list and join”.

#### C

1. **The event loop still stampedes.** JavaScript runs one function at a time, and `await` gives the loop back. Both requests can pass the `get`, both can call `compute`, and both can `set`. You do not need threads. The paid API is called twice and the second `set` overwrites the first.
2. **Store the Promise, not the string.** The first caller puts the in-flight Promise in the map before the first await that another caller can observe. The second caller returns that same Promise. One `compute` serves both.
3. **A rejection must leave the map.** If you cache the rejected Promise, every later caller fails without retrying. Delete the key in a `catch`, then rethrow. Decide separately whether a successful value lives forever.
4. **A `Map` across `await` is fine on this thread and not fine as a general rule.** Nothing else mutates it mid-statement. In Java or Go the same shape needs a concurrent map or a lock, and the stampede fix is still “one in-flight computation per key”, not a bigger lock.

```typescript
const inflight = new Map<string, Promise<string>>();

function cacheRetrieve(key: string, compute: () => Promise<string>): Promise<string> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const settled = compute().then(
    (value) => value,
    (err: unknown) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, settled);
  return settled;
}
```

The `set` runs before either caller awaits `settled`. That is the whole fix. The `delete` runs only on rejection, so a later caller may retry. A success stays in the map.

---

## 3. Coding round

**Priority: Secondary** for day one, **Must know** before an onsite.

### How to spend the hour

Reports describe about an hour alone, then a live review. Some tasks have three parts and get harder. Tests are often not provided.

| Minutes | Do this |
| --- | --- |
| 0–8 | Restate the input, the output, and what a cycle or a retry does. Write three examples, including the empty one and the cycle. |
| 8–15 | Write those examples as tests. A function you cannot run is a guess you will defend badly. |
| 15–45 | Part one, then part two. A working part one with tests beats a sketched part three. |
| 45–60 | Read every line you would be unwilling to explain. Delete it. Name the complexity. |

Pick a language you can write without a search. If the round allows an LLM later, the earlier parts still have to be yours. In the review, trace one cycle and one retry on the code that is on the screen, not on the code you meant to write.

### Drill 1 — introductions

Original. Not a reconstruction of a reported prompt.

A person can introduce a person. `edges` is a list of pairs `[from, to]`. Follow the edges from a start. The graph may contain cycles, including A → B → A. It may be disconnected.

**Part A.** `reachable(start, edges)` returns every person `start` can reach, not including `start`, each person once. Order does not matter. A cycle must terminate.

**Part B.** `audience(people, edges)` returns, for each person, how many distinct people can reach them, not including themselves. People in a cycle can reach each other. The count still has to terminate.

Write tests for: no edges, a line A → B → C, a two-node cycle, a diamond (two paths to the same person), and a node nobody points at.

**Answer sketch.** Build an adjacency list from `from` to a list of `to`. Part A is DFS or BFS with a visited set. Add a node to visited when you first see it, not when you finish it, or a cycle still blows the stack. Collect visited, then drop `start`. Time O(V + E) for one start.

Part B on the same graph is “who points at me, and who points at them”. Reverse the edges, then run Part A from each person and take the size. That is O(n · (n + m)). It is the right thing to code in the hour. It is correct with cycles because visited still stops the walk.

The faster version, if they ask and part B already passes: strongly connected components, contract each component to one node, then the ancestor count is a dynamic program on that DAG. Nodes in one component all reach each other, so they contribute the component size to each other’s audience before you add ancestors from outside. Do not start this until the tests for the simple version are green.

What fails a review. Recursion with no visited set. Counting paths instead of distinct people, so a diamond double-counts. Including `start` in part A after the prompt said not to.

### Drill 2 — a small worker

Original.

A job is `{ id, deps }` where `deps` names other job ids. `status[id]` is `pending`, `running`, `succeeded`, or `failed`.

**Part A.** `order(jobs)` returns one linear order where every job comes after its deps. If the deps contain a cycle, return an error. Do not loop.

**Part B.** `ready(jobs, status)` returns the ids that are `pending`, whose deps are all `succeeded`, and that have no `failed` dep. A `succeeded` job is not ready. A `running` job is not ready.

Tests: a chain, a diamond, a cycle, a job whose dep failed, a job already succeeded, two jobs with no deps.

**Answer sketch.** Part A is Kahn’s algorithm. Count incoming deps. Put every id with count zero in a queue. Pop it, append it to the order, decrement each dependent. If the order is shorter than the job list, the remainder is a cycle. Time O(n + m).

Part B is a scan, not a second topological sort. For each pending job, look at deps. Any `failed` excludes it. Any status other than `succeeded` excludes it. Empty deps means ready. Do not start dependents of a failure in this version. Say that out loud so they can tell you if they wanted retries instead.

The link to the design round: the count in Kahn’s algorithm is the same counter a worker decrements when a parent succeeds. Claiming a ready job is a conditional update from `pending` to `running`. A second worker who loses the compare does not run it. A job already `succeeded` is skipped even if a message arrives again.

---

## 4. System design — a distributed job scheduler

**Priority: Must know** before the onsite.

[Andela system-design exercise 1](../Andela/Software-Architecture-Assessment-Guide.md) is a job API in one service: accept, outbox, conditional status change, quota consumed once. Read that for the single-database version. This section adds what that exercise does not drill: more than one worker, a dead worker, a schedule, and a dependency count.

**Prompt.** Design a scheduler for many tenants. A job runs at a due time, or as soon as its parent jobs have succeeded. Workers crash. The same job may be handed out twice. A side effect that must not happen twice (a charge, an email, a quota increment) happens once. One tenant with a million due jobs does not keep another tenant’s job waiting behind them. One region, one team, PostgreSQL available. You may add a queue. You do not have to.

**Clarifying questions.**

- Is the schedule “run at time T once”, or a cron that inserts the next run?
- What is the side effect, and can it be retried with the same key?
- After how long may a second worker take over a job the first worker might still be running?
- Do failed jobs retry, and does a failed parent block the child?
- Is fairness “no tenant waits more than N minutes” or “each tenant has a cap on parallel jobs”?

**Assumptions if they say you decide.** Run-once jobs plus an optional parent list. Cron is a separate inserter that writes a new row per occurrence. Side effects take an idempotency key and are safe to retry with that same key. A lease lasts 30 seconds and extends while the worker is alive. Failures retry with backoff up to five attempts, then `failed`, and children do not run. Fairness is a per-tenant cap on leased jobs.

### Invariants

- A due job is executed at least once, as long as workers exist.
- A side effect that succeeded is not applied twice.
- A job whose lease holder died becomes claimable again.
- A child does not run until every parent has `succeeded`.
- A tenant’s backlog does not grant that tenant every worker slot.

### Reference approach

The job row is authoritative. A queue message is only a wake-up.

Columns that matter: `id`, `tenant_id`, `status` (`pending`, `leased`, `succeeded`, `failed`), `not_before`, `attempt`, `lease_owner`, `lease_until`, `idempotency_key`, `deps_remaining`. `idempotency_key` is the job id, and it does not change when `attempt` increments. The provider sees one key for the life of the job. A new key per attempt is how a timeout becomes a double charge.

**Claim.** One statement, so two workers cannot both win:

```sql
UPDATE jobs
SET status = 'leased',
    lease_owner = $worker,
    lease_until = now() + interval '30 seconds',
    attempt = attempt + 1
WHERE id = (
  SELECT id
  FROM jobs
  WHERE status = 'pending'
    AND not_before <= now()
    AND deps_remaining = 0
    AND tenant_id IN (
      SELECT tenant_id FROM tenants WHERE leased_count < leased_cap
    )
  ORDER BY not_before
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

`SKIP LOCKED` is the concurrency control. You do not need a process whose job is to hand out work. The `tenant_id IN (...)` sketch is the fairness rule, not a query to copy. The real check has to be correct under concurrency: a count of rows in `leased` for that tenant, taken in the same transaction as the claim, or a counter you increment in that transaction. A stale cap is how one tenant still takes every slot.

**Death.** A worker that stops extending `lease_until` loses the job. A sweep sets `leased` back to `pending` where `lease_until < now()`. Any worker can run the sweep. If you would rather have one sweeper, take a lease on a single scheduler row, or a Postgres advisory lock, and let everyone else skip. That lock is for the sweep and for inserting the next cron occurrence. It is not a reason to put all job execution on one machine. If the leader dies, the lock expires and someone else inserts the next occurrence. Work already in `pending` is still claimed by everyone.

**At least once, side effect once.** The lease expiring while the first worker is still in the provider call is normal. Both workers call the provider. Both send `idempotency_key = job id`. The provider’s unique key, and your unique key on the effect row, collapse the two calls. When you mark `succeeded`, do it with a conditional update from `leased` or `pending`, and store the provider reference in that same transaction. The worker who loses the conditional update does not write a second success.

Do not hold the database transaction open across the provider call. Claim, commit, call, then a second short transaction to finish. The Andela guide’s rule is the same.

**Dependencies.** `deps_remaining` starts at the number of parents. When a parent moves to `succeeded`, decrement each child in that same transaction. A child is claimable only at zero. A parent that ends `failed` does not decrement. Children stay put. Decrement with a conditional update so two deliveries of the same parent success do not subtract twice. Unique `(parent_id, child_id)` on a completion row is the usual way.

**Queue or not.** Polling `pending` with `SKIP LOCKED` keeps the claim, the lease, and the dependency counter in one place. It costs empty reads when the system is idle. A queue is better at absorbing a burst and worse at being the source of truth. If you add one, publish after the row commits (or from an outbox). The consumer still runs the conditional claim. A duplicate message is a no-op when the row is already `leased` or `succeeded`. SQS FIFO deduplication does not replace the lease: a message that becomes visible again after the visibility timeout is a second delivery, and the dedup window will not save you. That limit is the one in the Andela revision sheet.

**What you refuse.** An in-memory queue on one box. A cron daemon with no lease. “The queue is exactly once” as the reason you have no idempotency key. One global FIFO that orders every tenant together. Starting the child from a process that is not the same transaction as the parent’s success, with no counter.

**Trade-off to say.** Database claims are easier to keep consistent with dependencies and with the tenant cap. A queue is easier to scale out and easier to run twice. Either is acceptable if the conditional claim and the stable idempotency key are present. A single leader that runs jobs is not acceptable once they have asked for workers that crash.

---

## 5. LLM build

**Priority: Secondary**

Some onsites include a block where an LLM is allowed, then a short review. Reports of a search-and-rank exercise sit in this bucket. This section is how to work, plus one original drill. It is not a design of Mercor’s product.

### How to drive the tool

Write the invariant and three tests before you ask for code. Ask for one slice. Read the diff. If you cannot explain a line, delete it or rewrite it before you move on. Run the tests yourself. A green suite you did not read is not a defense.

In the last 15 minutes stop adding features. Be ready to say: what is stored, what happens on a retry, where the tenant boundary is, what you measured, and what you left out.

### Drill — search and rank

**Prompt.** A tenant has documents. A user types a query and gets ten documents from that tenant only. You have about an hour with an LLM, then 15 minutes to explain the design. Documents are short text. One region. You may pick keyword search or embeddings.

**What to be able to say.**

- Ingest writes the document under `tenant_id` and updates the index for that tenant. A crash between the row and the index is repaired by rebuilding from the row, so the row is authoritative.
- The query applies the tenant predicate before ranking, or the index is physically partitioned by tenant. A shared vector index with a filter you forgot is how one tenant sees another’s text. Test that with two tenants and a query that matches both.
- Keyword: inverted index, score by term frequency in the document and rarity in the tenant’s corpus. Embeddings: store a vector per document, nearest neighbor inside the tenant, and say that the model can rank a synonym higher and can also rank a confident miss. You do not need both in the hour.
- Top 10 does not require sorting the whole tenant if the index can return a bounded candidate list. Say the bound.
- What you would measure and did not have time for: a handful of labeled queries, and whether document 11 was better than document 1. No metric, no claim that the ranking is good.

What you refuse. A global index with no tenant field. Ranking in the request by scanning every document with a model call per document. An LLM-written ranker you cannot describe.

---

## Mocks

Sit these without scrolling back to the answer sketch or the review answers. The verbal mock uses the section 1 material. If you only reread the script, you will recognize it and still stall on a fresh wording.

### Verbal — 30 minutes

Set a timer. About six minutes each, including a follow-up you invent by asking “what breaks?”. Out loud. No editor.

| Minutes | Question |
| --- | --- |
| 0–6 | Sort a million integers. Give a faster-than-quadratic algorithm and its worst case. Then the most expensive deterministic algorithm you can defend, and its complexity. |
| 6–12 | A fair coin is flipped until heads. Expected flips? Derive it the same way as the die. |
| 12–18 | Find duplicate account ids in a 200 GB file on a machine with 8 GB of RAM. |
| 18–24 | Exchange rate from USD to JPY when you are given a list of pairs and rates. They add: “there is a cycle”. |
| 24–30 | The provider timed out and your code retries the charge. What breaks, what do you store, which database, and why not the other one? |

Passing is four answers that name a bound or a failure mode. An elegant sort that consumes the whole half hour is a fail.

**Coin, if you need the confirmation after you have said it.** E = (1/2)·1 + (1/2)·(1 + E), so E = 2. Same memoryless argument. Do not look this up before you try.

The other four are in section 1. Grade the duplicate-file answer on whether the data stays on disk. Grade the cycle on whether you separated “one path” from “best rate is unbounded”. Grade the payment on whether the key is committed before the call.

### Coding — 60 minutes

Drill 1, parts A and B, with the tests listed there. Then, only if those tests pass, the ready-set function from drill 2. Grade from the answer sketches. A cycle that stack-overflows is not partial credit for “I would have added a set”.

### Design — 45 minutes

Close this file. On paper, design the scheduler from the prompt in section 4. Then mark:

| Check | Pass |
| --- | --- |
| Claim | Two workers cannot both leave with the same row. You named the conditional update or `SKIP LOCKED`. |
| Death | A lease or a visibility timeout returns the job. You did not need the dead process to clean up after itself. |
| Side effect | The idempotency key is stable across attempts. |
| Children | A counter or a join, decremented once, in the same transaction as the parent’s success. |
| Fairness | A per-tenant cap, not one global queue. |
| Refusal | You said what you would not build first. |

Four of six, including claim and side effect, is a pass.

---

## Two-day schedule

You already have the Andela guide for transactions and payments. The hours below are the Mercor gaps.

### Day 1 — the spoken screen

| Block | Hours | What to do |
| --- | --- | --- |
| 1 | 1.5 | Section 1, sorting and probability. Close the file and give both ninety-second answers. |
| 2 | 1.0 | Usernames and exchange rates, out loud, including the follow-up on each. |
| 3 | 1.0 | Payment script, four minutes. Then one pass through Andela sections 3 and 6 only for whatever you could not say. |
| 4 | 1.5 | Code reviews A, B, and C, ten minutes each, before the answers. |
| 5 | 0.5 | Verbal mock. Mark it. |

### Day 2 — onsite

| Block | Hours | What to do |
| --- | --- | --- |
| 1 | 2.0 | Coding drill 1, timed, tests first. Read the sketch only after. |
| 2 | 1.0 | Coding drill 2. Say the connection to the lease out loud. |
| 3 | 1.5 | Section 4 on paper, then the 45-minute mock if you have not just copied it. |
| 4 | 1.0 | LLM drill: tenant predicate, what is authoritative, what you refuse. No need to build it unless you want a dry run with the tool. |
| 5 | 0.5 | Revision sheet. Re-do only the mock items you failed, from memory. |

One evening, if the screen is tomorrow: sorting, usernames, the payment script, review A, and the revision sheet. Add the scheduler only if the onsite is the next session.

---

## Final revision sheet

**Screen.** Four short answers beat one deep one. Invariant, bound, the input that breaks the naive version, stop.

**Sort.** Mergesort is O(n log n) worst case. Quicksort is O(n²) on a bad pivot. Comparison sorts are Ω(n log n). There is no slowest deterministic sort. Lexicographic permutation scan is Θ(n · n!).

**Probability.** Expected trials until first success is 1/p. Derive it with one memoryless equation. Coupon collector is n · Hₙ when they ask for every face.

**Duplicates.** Hash set if it fits. If it does not, external sort then a linear scan, or hash buckets that fit, then a hash set per bucket. Equal keys share a bucket.

**Rates.** Path product, BFS or DFS, visited or you loop. That is one rate, not the best. Best rate is Bellman-Ford on −log(rate). A negative cycle means the product is unbounded.

**Payments.** Timeout is `unknown`. Commit the unique key, then call. Same key on the retry. PostgreSQL or MySQL for that insert. No provider call inside the transaction. The long version is Andela sections 3, 4, and 6.

**Cache.** A lock that does not cover the compute does not cover the bug. Per-key single flight. On one thread, `await` still lets two callers miss. Store the Promise. Do not cache the rejection.

**CSV.** Separators, then quoting, then the buffer. The `csv` module does the first two.

**Graphs.** Visited when you first see the node. Count people, not paths. Kahn’s algorithm: if you emitted fewer than n, there is a cycle.

**Scheduler.** The row is the truth. `SKIP LOCKED` or a conditional claim. Lease expiry returns the job. Idempotency key is the job id for every attempt. Dependency counter decrements in the parent’s success transaction. Cap in-flight jobs per tenant. A leader lock is for the tick and the sweep, not for running the work.

**LLM round.** Tests and the tenant boundary before the tool. Explain every line you keep. The document row outlives the index.
