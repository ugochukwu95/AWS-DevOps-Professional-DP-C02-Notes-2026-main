# Software architecture assessment guide

The timed Woven skill test is not this whole guide. It is two short scenarios: 15 minutes on a performance problem you cannot fully fix, and 35 minutes debugging a support report. Read `Andela/Woven-Skill-Test-Prep.md` before this file. Close any AI chat before you start the 48-hour window. Using AI on the scenarios is a code-of-conduct failure.

The rest of this file is for the later architect interview and for the mechanisms those scenarios borrow: event-loop stalls, pools, query plans, caches, and tenant scope. The fintech sections are interview material. Nothing here is an Andela or Woven paper, and nothing here is meant to be used while sitting the assessment.

The running example is **Harbour**, a fictional card-payment provider, and **Ledgerlane**, a fictional multi-tenant platform. Harbour’s rules are stated where they matter. Real providers differ. When a behaviour is specific to Node.js, PostgreSQL, or AWS, it is labelled. Principles such as idempotency and tenant isolation are not.

**Priority** means:

- **Must know** — likely to decide a code review, a debugging exercise, or a design discussion in the 90 minutes.
- **Secondary** — needed for the senior architect interview, especially the fintech brief. Still study it. Do not let it crowd out the first four topics on day one.

Checked against current docs on 19 October 2026:

- [Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) and [process events](https://nodejs.org/api/process.html) (docs site showing Node.js 26).
- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
- [Amazon SQS FIFO exactly-once processing](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) and the [outage-recovery page](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/designing-for-outage-recovery-scenarios.html).

Claims marked **verify** were not re-read from the vendor page in this session. Recheck them if a prompt depends on a quota or a version.

---

## How an architect’s answer is scored

A weak answer names a product: “use a queue”, “use Kafka”, “use microservices”, “Stripe is exactly once”. A strong answer names the **invariant**, the **failure** that breaks it, and the **boundary** that restores it.

Use this shape out loud and on paper:

1. Restate the requirement as an invariant. “A tenant can never move another tenant’s money.” “A client retry cannot create a second payment.”
2. Say which data is authoritative.
3. Walk one success path and one crash in the middle of it.
4. Say what is synchronous, what is retried, and what a human reconciles.
5. Name the trade-off you are accepting: latency, cost, operational complexity, or staleness.

Plausible answers fail when they stop at step 2.

Do not invent production stories in the interview. Use real incidents from your own systems. Use the exercises here as drills, and say they are drills if you mention them.

---

## 1. Node.js and TypeScript

**Priority: Must know**

### Plain English

Node.js runs your JavaScript on one main thread. Slow disk, network, and database calls can leave that thread free because the operating system does the waiting and libuv later queues the callback. Slow JavaScript does not. A tight loop, a large `JSON.parse`, or a synchronous crypto hash occupies the only thread that can accept sockets, run timers, and finish other requests.

The event loop is the scheduler for that thread. Official phases that application code actually cares about are timers (`setTimeout`, `setInterval`), pending callbacks, poll (incoming I/O), check (`setImmediate`), and close callbacks. `process.nextTick` and Promise reactions are not phases. After the current JavaScript stack finishes, Node drains the `nextTick` queue and then Promise microtasks before it continues the loop. From Node.js 20 / libuv 1.45, timers run after the poll phase on each later iteration; one timer pass still happens before the loop starts, so `setTimeout(0)` versus `setImmediate` order is a poor thing to memorise. The assessment cares that you do not block the thread, not that you can draw the diagram.

A Promise is a value that is pending, fulfilled, or rejected. `async`/`await` is syntax over that. An error inside an `async` function rejects the returned Promise. The caller only sees it if they `await`, `return` it, or attach `.catch`. A rejection with no handler, still unhandled after one turn of the loop, emits `unhandledRejection`. On current Node (the v26 process docs, and this has been the default since Node 15), if that event has **no listener**, Node raises it as an uncaught exception and the process exits. A listener that only logs **counts as handling it**, so the process stays up. That is the footgun.

### Concrete picture

```typescript
// CPU work blocks every other request on this process.
app.post("/hash", (req, res) => {
  const digest = crypto.pbkdf2Sync(req.body.password, salt, 200_000, 32, "sha256");
  res.json({ digest: digest.toString("hex") });
});
```

`pbkdf2Sync` never leaves the main thread. The async `crypto.pbkdf2` uses libuv’s thread pool (default size 4, `UV_THREADPOOL_SIZE`), so four hashes can run beside the event loop and the fifth waits. A huge `JSON.parse` uses neither the pool nor the kernel. It blocks the main thread until it returns. Move that work to `worker_threads`, a separate process, or a queue consumer scaled on its own.

```typescript
// Express 4 does not forward a rejected async handler to error middleware.
// Express 5 does. Verify the version in any repo you are shown.
app.post("/invoices", async (req, res) => {
  const invoice = await createInvoice(req.body); // rejection becomes unhandled
  res.status(201).json(invoice);
});
```

Wrap it, or use a router that catches rejections:

```typescript
function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    fn(req, res).catch(next);
  };
}
```

Bounded concurrency, when you must call a slow dependency for many items:

```typescript
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
```

Simplification: `cursor++` is safe because JavaScript on this thread runs one function at a time. The snippet does not cancel siblings when `fn` throws. `Promise.all` rejects on the first failure while other workers keep going until they finish or throw. Production code decides whether one failure fails the batch.

Backpressure means the producer slows down when the consumer is behind. Unbounded `Promise.all(rows.map(...))` or an in-memory array of every SQS message is the opposite. Bound the in-flight work, and let the source block: a database cursor, a p-limit style pool, or a queue consumer that stops receiving until a slot frees.

Timeouts and cancellation:

```typescript
const signal = AbortSignal.timeout(2_000);
const response = await fetch(harbourUrl, { method: "POST", body, signal });
```

`AbortSignal.timeout` is stable on Node 18 and later. A timeout means **your client stopped waiting**. It does not mean Harbour failed, and aborting a `fetch` does not roll back a database commit that already happened.

Pools and shutdown belong together. A pool borrows a physical connection. If request code throws before `release()`, or a transaction stays open, the pool shrinks until new requests wait and then time out. On `SIGTERM` (ECS, Kubernetes, and a load balancer draining the task):

```typescript
let draining = false;

async function shutdown(pool: { end(): Promise<void> }, server: Server): Promise<void> {
  if (draining) return;
  draining = true;
  server.close(); // stop accepting; existing requests continue
  await Promise.race([
    drainInFlight(),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  await pool.end();
  process.exitCode = 0; // prefer this over process.exit()
}

process.on("SIGTERM", () => {
  void shutdown(pool, server);
});
```

`process.exit()` ends the process even when stdout writes are unfinished. The Node docs call that out explicitly. `exit` listeners may only do synchronous work. `beforeExit` does not run on `process.exit()` or on an uncaught exception.

### Types do not validate requests

TypeScript checks the program you compiled. `tsc` erases types. At runtime, `req.body` is whatever the parser produced, usually `unknown` if you typed the boundary honestly, or `any` if you did not.

```typescript
type TransferRequest = {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  currency: "GBP" | "EUR";
};

// This compiles and does nothing to the bytes on the wire.
const body = req.body as TransferRequest;
```

`as` is an assertion. You are telling the compiler to trust you. A client can send `{ "amountMinor": "100", "currency": "USD" }` and the handler will run.

A discriminated union is the right model once the value is known:

```typescript
type Payment =
  | { status: "pending" }
  | { status: "unknown"; providerRef: string }
  | { status: "succeeded"; providerRef: string; journalId: string }
  | { status: "failed"; failureCode: string };

function assertNever(value: never): never {
  throw new Error(`unexpected status: ${JSON.stringify(value)}`);
}

function canRetry(payment: Payment): boolean {
  switch (payment.status) {
    case "pending":
    case "unknown":
      return false; // unknown is not safe to retry with a new provider key
    case "failed":
      return true;
    case "succeeded":
      return false;
    default:
      return assertNever(payment);
  }
}
```

The compiler only checks that switch if `payment` really is `Payment`. Getting there requires a runtime parse:

```typescript
function parseTransfer(input: unknown): TransferRequest {
  if (typeof input !== "object" || input === null) {
    throw new HttpError(400, "invalid_body");
  }
  const body = input as Record<string, unknown>;
  if (typeof body.fromAccountId !== "string" || body.fromAccountId === "") {
    throw new HttpError(400, "invalid_from_account");
  }
  if (
    typeof body.amountMinor !== "number" ||
    !Number.isInteger(body.amountMinor) ||
    body.amountMinor <= 0
  ) {
    throw new HttpError(400, "invalid_amount");
  }
  if (body.currency !== "GBP" && body.currency !== "EUR") {
    throw new HttpError(400, "invalid_currency");
  }
  // same checks for toAccountId, then:
  return {
    fromAccountId: body.fromAccountId,
    toAccountId: body.toAccountId as string,
    amountMinor: body.amountMinor,
    currency: body.currency,
  };
}
```

Simplification: the `Record<string, unknown>` assertion is sound only after the object check. Libraries such as Zod or Valibot generate the same kind of runtime check and a type from one schema. The library is optional. The runtime check is not. `null` and `undefined` need explicit handling because `typeof null === "object"` and a missing JSON field is `undefined`, not `null`.

Narrowing that actually works: `typeof`, equality on a literal discriminant, `in`, `Array.isArray`, and user-defined type predicates (`value is Payment`). Narrowing that does not survive a function call unless the compiler can follow it. A type predicate that returns `true` without checking is a lie the compiler will believe.

### Common mistakes

- Treating a timeout as a business failure and retrying with a new idempotency key.
- Adding an `unhandledRejection` logger and believing the process is now safe. The listener suppresses the default crash. The failed operation is still incomplete.
- `try/catch` around a function that starts work without being awaited. The `catch` never sees the later rejection.
- `Promise.all` when one failure should not cancel the meaning of the others, or `Promise.allSettled` when you then ignore the rejected entries and return success.
- Recursive `process.nextTick` or an ever-growing microtask chain. I/O callbacks never run.
- Assuming `server.close()` has drained the process. It only stops new connections. You still close the pool, the queue consumer, and background timers, or the process stays alive and the orchestrator sends `SIGKILL`.
- Sharing one mutable `let currentTenant` across requests. Concurrent requests on the same process interleave at every `await`.

### Practice question

You deploy an Express 4 service. Under load, a few clients receive no response, logs show `UnhandledPromiseRejection`, and after a Node upgrade the tasks restart. What is going on, and what do you change?

**Weak answer.** “Add a global unhandledRejection handler so Node stops crashing, and wrap everything in try/catch.”

**Why it fails.** It hides the crash without finding the request that never sent a response. It also treats all rejections as safe to ignore. Some mean the process has continued after a half-finished write.

**Strong answer.** Express 4 does not attach a rejection handler to async route functions, so a rejected `await` escapes. The client waits until their gateway times out. Before Node 15 this was often a warning; current Node turns an unhandled rejection into a fatal exception unless a listener handles the event. Find the route, `catch` into error middleware, and return a real status. Keep a process-level logger. For `uncaughtException`, log synchronously and exit: Node’s own docs say the process is then in an undefined state, and an external supervisor should restart it. Do not use the global handler as the request error path.

### Trade-offs

| Choice | What you gain | What you accept |
| --- | --- | --- |
| One Node process, async I/O | Simple model, high concurrency for waiting | Any CPU spike adds latency for every tenant on that process |
| Worker threads | CPU work leaves the request thread | Serialisation cost, harder cancellation, a crash in the worker is a separate failure |
| Crash on unhandled rejection | Bad deploys show up immediately | Brief downtime unless another task is healthy |
| Log and continue | One bad promise does not kill the task | Silent data loss if the promise was the write |

---

## 2. API design and security

**Priority: Must know**

### Plain English

An HTTP API is a contract about **who is calling**, **which tenant they may act for**, **which object they may touch**, and **what a retry means**. Status codes are part of that contract. Clients and gateways retry some of them.

Use the method for the semantics:

- `GET` reads. Safe to retry. No payment, no email, no ledger entry.
- `POST` creates an action. A retry can repeat the action unless you add an idempotency key.
- `PUT` replaces a resource at a known URL. Retrying the same body should leave the same state.
- `PATCH` is a partial update. Define whether it merges or applies a JSON Patch. Retrying a relative change (`balance += 10`) is not safe.
- `DELETE` removes. Retry after success should still look like success (`204` or a stable `404`, and pick one).

Status codes worth using precisely:

| Code | Use it when |
| --- | --- |
| 400 | The body or query is malformed |
| 401 | No valid credentials |
| 403 | Credentials are valid and they are not allowed |
| 404 | The object is not visible to this caller. Prefer this over 403 when revealing existence is itself a leak |
| 409 | The state conflicts: duplicate key, idempotency key reused with a different body, version mismatch |
| 422 | The syntax is valid and the business rule rejects it. Many teams use 400 for both. Pick one and stay there |
| 429 | Rate limited. Send `Retry-After` |
| 502 / 503 / 504 | You could not get a trustworthy answer from a dependency. These are retryable only when the operation is idempotent |

Pagination: offset pages drift when rows are inserted or deleted, and large offsets make the database walk rows it will throw away. A cursor (`WHERE (created_at, id) < ($cursorTime, $cursorId) ORDER BY created_at DESC, id DESC LIMIT $n`) stays stable. Always set a maximum page size.

Errors should be one shape on every endpoint: a stable `code`, a human `message` that does not echo SQL or a stack, and a `requestId`. Field errors can sit in an array. Do not return the raw driver error.

### Authentication, authorization, and the object

Authentication answers “which principal is this?” A JWT signature, a session, or mTLS. Authorization answers “may this principal do this action?” That splits again:

- Role: this principal may call `POST /payments` at all.
- Tenant: this principal is a member of tenant T, and the request is for tenant T.
- Object: account `acc_9` belongs to tenant T and this role may debit it.

A valid token is not object authorization. That bug is IDOR: the client changes an id and reads someone else’s invoice. The fix is a query that includes the tenant, plus a policy check, not a second lookup that trusts the body’s `tenantId`.

Where the tenant id may come from:

- A single-tenant token claim, verified by the authorization server, is a source you can trust after signature and expiry checks.
- A user who belongs to several tenants must send a tenant id, and you must load membership from your database. The header alone is not proof.
- A `tenantId` in the JSON body is attacker-controlled. Ignore it for authorization, or require it to equal the trusted context and reject mismatches.

### Idempotency, limits, validation, secrets

An idempotency key is a client-generated token for one logical operation. Scope it by **tenant, route, and key**. Store a hash of the canonical request. On a replay:

- same key, same hash, completed → return the stored response, including the original status code
- same key, same hash, still running → `409` or a short wait, and do not start a second charge
- same key, different hash → `409`, because the client is reusing a key for a different operation

The unique constraint is what makes this true under concurrency. A `SELECT` followed by `INSERT` in application code loses the race.

Rate limits protect neighbours and your database. Limit by tenant and by credential, not only by IP. Many customers share one NAT. Return `429` with `Retry-After`. Limits are not a substitute for authorization.

Validation happens at the edge, before any write: types, ranges, currency, string length, and allow-lists. Do it again inside the database with constraints. The application check gives a clean error. The constraint survives a second code path, a script, and a bug.

Logging: log `requestId`, `tenantId`, actor id, route, status, and latency. Do not log authorization headers, cookies, card numbers, full account numbers, CVV, or raw provider payloads. If you must log an identifier, log a tokenised reference. Secrets live in a secret manager or an injected environment, never in the repo, the image, or a debug response. Application code reads them once at startup and does not print `process.env`.

### Common mistakes

- `200` with `{ "error": "..." }` for failures. Clients and monitors will count that as success.
- `500` for “insufficient funds”. That is a known business outcome, and it will page you.
- Checking the role and then loading the account by id only.
- Idempotency stored in process memory. The second attempt hits another task and charges again.
- Rate-limit keys that omit the tenant, so one tenant’s burst blocks the platform, or so an attacker rotates tenants on one stolen key.
- Redacting logs in the application and leaving the API gateway access log on full request body.

### Practice question

`POST /transfers` requires header `Idempotency-Key`. The handler checks a `processed_keys` table, and if the key is absent it inserts the key and performs the transfer. What is wrong?

**Weak answer.** “Looks good. The key stops duplicates. I’d add an index.”

**Why it fails.** Two requests with the same key can both see “absent” before either inserts. Both transfer. A unique index would turn the second insert into an error, but only if the insert is attempted and the transfer is not done first. The check-then-act order is the bug. The answer also ignores a different body under the same key, and a crash after the transfer and before the key insert, which retries a completed transfer.

**Strong answer.** Make `(tenant_id, idempotency_key)` unique. Insert the key in the same transaction as the ledger entries, with the request hash, before returning. If the insert conflicts, load the stored row. Matching hash returns the stored response. Different hash returns `409`. If the first transaction rolls back, the key rolls back with it, and a retry may proceed. A key inserted in a separate transaction before the money movement can get stuck `in_progress` after a crash; you need a recovery rule for that state, not a second transfer.

### Trade-offs

- `404` versus `403` on an object in another tenant: `404` avoids confirming the id exists; `403` is easier to debug. For a multi-tenant fintech API, hiding existence is usually the better default.
- Strict idempotency storage grows forever unless you expire keys. Expire only after the client’s retry window and the provider’s retry window are both over. State the window. Do not guess that “24 hours” is universal; that figure is a specific provider’s policy.
- Central API-gateway auth is a good first gate and a bad only gate. The service that owns the row must still scope the query. Gateways get misconfigured, and internal jobs bypass them.

---

## 3. Databases and concurrency

**Priority: Must know**

### Plain English

The database is where the invariant has to remain true even if two requests pass your `if` at the same time. Application checks are useful. They are not isolated from each other.

PostgreSQL’s default isolation is **Read Committed**. Each statement sees rows committed before that statement started. A later statement in the same transaction can see a newer commit. **Read Uncommitted** in PostgreSQL behaves as Read Committed; dirty reads are not available. **Repeatable Read** uses one snapshot for the whole transaction, and PostgreSQL also prevents phantom reads at that level, which is stronger than the SQL standard requires. **Serializable** adds detection of serialization anomalies and will abort one transaction with `40001` / `serialization_failure`. The application must retry the whole transaction. There is no isolation level where you can skip thinking about retries once two writes touch the same business invariant.

A transaction is atomic only for work inside that database. It locks rows to preserve that promise. Two transactions that lock the same rows in opposite orders wait on each other forever: a deadlock. PostgreSQL aborts one with `40P01`. Retry it. Always lock accounts in a stable order, such as by primary key.

Optimistic concurrency means “I will not lock, I will check a version.” You read `version = 7`, then `UPDATE ... SET version = 8 WHERE id = $1 AND version = 7`. Zero rows means someone else wrote. Retry or return `409`. This is kind under low contention and painful on a hot balance row, where almost every second update conflicts.

### The overspend race

This is the bug to be able to see cold:

```typescript
const found = await pool.query(
  "SELECT balance_minor FROM accounts WHERE id = $1",
  [accountId],
);
if (found.rows[0].balance_minor < amountMinor) {
  throw new HttpError(422, "insufficient_funds");
}
await pool.query(
  "UPDATE accounts SET balance_minor = balance_minor - $1 WHERE id = $2",
  [amountMinor, accountId],
);
```

Two requests both read 100. Both see enough for 80. Both subtract. The balance is -60. Wrapping each statement in its own transaction does not help, because the statements are already individually atomic. The race is between the transactions. A single transaction around the `SELECT` and `UPDATE` also does not help at Read Committed unless you lock the row: the second transaction’s `SELECT` can still run before the first `UPDATE`.

The small fix:

```sql
BEGIN;

SELECT balance_minor
FROM accounts
WHERE tenant_id = $1 AND id = $2
FOR UPDATE;

-- application: if no row, 404; if balance_minor < amount, roll back and return 422

UPDATE accounts
SET balance_minor = balance_minor - $3
WHERE tenant_id = $1 AND id = $2;

COMMIT;
```

`FOR UPDATE` makes the second transaction wait, then read the balance the first one committed. Put the tenant predicate in both statements.

The single-statement form is also sound at Read Committed, because the `UPDATE` locks the row and rechecks `WHERE` against the latest committed version:

```sql
UPDATE accounts
SET balance_minor = balance_minor - $3
WHERE tenant_id = $1
  AND id = $2
  AND balance_minor >= $3
RETURNING balance_minor;
```

Zero rows is ambiguous: missing account, wrong tenant, or insufficient funds. If the caller needs to distinguish, lock with `SELECT ... FOR UPDATE` first inside the same transaction. Add `CHECK (balance_minor >= 0)` so a forgotten predicate cannot persist a negative balance. The check is the backstop. The `WHERE` is the clean error.

At Repeatable Read, a `FOR UPDATE` or `UPDATE` that collides with a committed change can raise “could not serialize access due to concurrent update” instead of waiting and continuing. Retry the transaction. Do not catch that error and report success.

A transfer locks both accounts. Lock the lower id first, on both code paths, or two opposite transfers deadlock.

### Schema, plans, and N+1

Constraints are the invariant you still have when a new endpoint forgets the check:

- `PRIMARY KEY` and `UNIQUE (tenant_id, idempotency_key)`
- `FOREIGN KEY` so a posting cannot point at a missing account
- `CHECK (amount_minor > 0)` and `CHECK (char_length(currency) = 3)`
- `NOT NULL` on tenant, currency, and amount

Indexes exist to serve a predicate and an order, not to decorate a table. The access path for “this tenant’s recent payments” is `(tenant_id, created_at DESC, id)`. A unique key on `idempotency_key` alone is wrong for multi-tenant data: two tenants may legally choose the same client key, and one global unique key couples them.

`EXPLAIN` shows the planned access path. `EXPLAIN ANALYZE` runs the query and shows actual rows and time. A sequential scan on a small table is fine. A sequential scan on `payments` for one tenant, with a filter applied afterwards, means the tenant predicate is not indexed or not selective in the way you think. Row estimates that are wildly wrong mean stale statistics (`ANALYZE`) or a predicate the planner cannot see.

N+1 is one query for the parent and one query per child:

```typescript
const tenants = await listTenants();
for (const tenant of tenants) {
  tenant.openPayments = await countOpenPayments(tenant.id); // N round trips
}
```

Join or aggregate in one query. The loop hides latency until production has 200 tenants and the pool is busy.

### Pool exhaustion

Each in-flight request that has borrowed a connection holds it until release. The pool’s `max` times the number of tasks must stay under the database’s `max_connections`, with room for migrations, admin, and failover. Lambda makes this sharp: a burst of concurrent invocations each holding a connection will exhaust RDS. A long-running Node service with a pool of 10 is easier to reason about. RDS Proxy, a smaller pool, or a cap on Lambda concurrency are the usual escapes. **Verify** current RDS Proxy and Lambda behaviour if the design depends on a connection-count quota.

Other ways to drain a pool:

- a code path that `query`s without releasing, often on an early `return` in a hand-rolled checkout
- a transaction left open while calling Harbour over HTTP
- `pool.query("BEGIN")` followed by more `pool.query` calls. Each `pool.query` may take a different connection, so those statements are not one transaction. The connection that ran `BEGIN` goes back to the pool still inside a transaction. Use one `pool.connect()` client, then `COMMIT` or `ROLLBACK`, then `release()`
- a forgotten `BEGIN` and no `idle_in_transaction_session_timeout`
- a statement with no `statement_timeout`, so one tenant’s report occupies a connection for minutes

Set both timeouts on the application role. They are server-side backstops when the Node process is wedged and cannot cancel its own query.

### Money

JavaScript `number` is an IEEE-754 float. `0.1 + 0.2` is not `0.3`. Currency math does not belong in `number`.

Store an integer in minor units when the currency’s exponent is fixed for that amount, or store `numeric` in PostgreSQL and never cast it through `number`. ISO 4217 exponents differ: GBP and USD have two, JPY has zero, KWD has three (**verify** any currency you do not use daily). A column called `amount` with no currency, or a float column, will be wrong the first time two currencies or a three-decimal currency appears.

`node-postgres` returns PostgreSQL `int8` as a string by default, because not every `bigint` fits in `Number.MAX_SAFE_INTEGER` (`2^53 - 1`). Calling `Number(row.balance_minor)` is a production bug that tests with small balances will not catch. Keep the value as a string or `bigint` until you format it.

Rounding is a policy. “Round half away from zero to two decimals” and “banker’s rounding” disagree on `1.005`-style boundaries. Decide where rounding happens: per line, or on the total. The sum of rounded lines is not the rounded sum. Store the rounded posted amount, and store enough inputs to explain it. Do not re-round on every read.

The snippets in this guide sometimes use `number` for minor units so they fit on a page. That assumes every value is a safe integer. Do not copy that assumption into a ledger.

### Common mistakes

- `BEGIN`, then `await fetch(harbour)`, then `COMMIT`. Locks are held for the whole HTTP call. The provider call is not part of the atomic unit anyway (section 6).
- Retrying a transaction that was not rolled back cleanly, so the retry runs on an aborted transaction and every statement fails until `ROLLBACK`.
- Catching a unique-violation on idempotency and still committing the money statement that ran before it.
- `SELECT *` on a hot table when the handler needed three columns, plus an index that does not match the `ORDER BY`, so the database sorts the whole tenant.
- Using Serializable for every read and then not handling `40001`, so normal contention becomes a 500.

### Practice question

Two transfers debit the same account at the same time. Isolation is Read Committed. The code selects the balance, checks it in Node, then updates. Both responses are 201 and the balance is negative. The author says “we used a transaction, so this cannot happen.”

**Weak answer.** “Raise the isolation to Serializable and the database will queue them safely with no code changes.”

**Why it fails.** Serializable would often abort one transaction, not silently queue a read-modify-write into a correct result. Without a retry, the client sees a 500 and may retry unsafely. The author’s existing transaction never locked the row, so Read Committed is allowed to run both reads first. The weak answer also skips the `CHECK` constraint, which would have turned the second write into an error even if the application check stayed racy.

**Strong answer.** The transaction boundary is around the wrong critical section: the decision uses a stale read. `SELECT ... FOR UPDATE` on the account, or a single conditional `UPDATE ... WHERE balance_minor >= $amount`, makes the debit atomic. Lock both accounts in id order for a transfer. Add `CHECK (balance_minor >= 0)`. Retry only deadlock and serialization failures, with a fresh read each attempt, and only when the whole transaction rolled back. Return `422` when the locked balance is insufficient.

### Trade-offs

| Approach | Good at | Poor at |
| --- | --- | --- |
| Conditional `UPDATE` | One-row debits, simple services | Multi-row transfers, returning a precise error without a follow-up read |
| `SELECT FOR UPDATE` | Transfers, clear errors | Throughput on one hot account; long transactions become a queue |
| Optimistic `version` | Profiles, invoices, low contention | Balances, where conflict rate approaches the request rate |
| Serializable + retry | Complex invariants that are hard to lock explicitly | Latency, and any code path that performs an external call inside the transaction |

---

## 4. Distributed systems

**Priority: Must know**

### Plain English

Once two processes both store state, a single database transaction cannot cover both. You choose a failure mode on purpose.

**Synchronous** means the caller waits for the result. The client gets a definite answer, and the caller fails when the callee is down. **Asynchronous** means you record the intention and a worker delivers it. The API stays available when the worker is briefly down, and the client must be shown “accepted, not finished.” Queues do not make the work exactly once. They move the work and change the timing.

Delivery guarantees, in plain terms:

- **At-most-once:** you may lose the message. You get this if you delete or acknowledge before you finish the effect.
- **At-least-once:** you may see the message twice. You get this if you acknowledge after the effect and a crash sits between the effect and the acknowledgement. The broker redelivers.
- **Exactly-once:** not a property you can assume of a network. It is an **effect** you define on a boundary: “this idempotency key produces one ledger journal,” enforced by a unique constraint committed with that journal.

Amazon SQS standard queues are at-least-once. FIFO queues, per AWS’s current docs, do not introduce a duplicate send inside a **5-minute** deduplication window, and AWS describes that as exactly-once processing. The same docs’ outage page says a consumer that does not delete the message before the visibility timeout lets another consumer process it. So “FIFO” removes a class of producer duplicates for five minutes. It does not remove duplicate processing after a slow consumer, a crash after the side effect, or a retry of `SendMessage` after five minutes. If your answer is “we use FIFO, so we are exactly once,” it is incomplete. The consumer still needs its own idempotency record.

Ordering is per message group on a FIFO queue, not global across groups. Standard queues do not promise order. If “capture” must be applied after “authorize” for one payment, partition by payment id and still tolerate a duplicate of either event.

### Retries

Retry when the failure might be transient and the operation is safe to repeat: a connect timeout, `429`, `503`, a deadlock, a serialization failure. Do not retry a `400` or an “insufficient funds” as if the network had blipped.

Exponential backoff means the wait grows (`100ms`, `200ms`, `400ms`, …) up to a cap, so a dead dependency is not hammered at the original rate. Jitter means a random spread around that wait, so a thousand clients do not retry on the same millisecond. A retry budget means “this client will only spend N retries per second on this dependency,” so retries cannot multiply load by the number of attempts. Without a budget, a brownout becomes a self-inflicted outage.

Stop after a maximum number of receives and send the message to a dead-letter queue. A DLQ is for diagnosis and controlled replay, not a bin you ignore. A poison message (one that will fail forever, often because the payload is invalid) must not block the partition. On a FIFO group, a poison message at the head blocks that group until it is diverted. That is another reason to keep groups small, usually one entity id.

### Outbox, inbox, and what they do not fix

The transactional outbox avoids the dual-write between “commit the business row” and “publish the event”:

```text
BEGIN
  insert payment(status = succeeded, ...)
  insert outbox(id, type, payload, published_at = null)
COMMIT

-- separate process
read unpublished outbox rows
send to broker
mark published_at   -- only after the broker accepts
```

If the relay crashes after the broker accepts and before `published_at` is set, it sends again. That is at-least-once. The consumer must ignore a duplicate. If you set `published_at` before the broker accepts, a crash loses the event. Mark published after acceptance, and make the consumer idempotent.

The inbox is the consumer’s pair. In the same database transaction, insert `processed_messages(message_id)` and apply the business update. The unique key on `message_id` makes the second delivery a no-op. If you apply the update and insert the id in two transactions, a crash between them re-applies the update.

Remaining failure modes, which you should say out loud so the answer is not “we use the outbox, so we’re done”:

- The relay can still publish twice. Exactly-once ended at the database transaction, not at the consumer.
- Outbox rows for different aggregates have no global order.
- A large backlog delays every tenant unless you partition the relay.
- The outbox table grows without a retention plan.
- A bug in the payload is now durable. You need a version field and a way to repair.
- The consumer’s unique key only helps if it is the same key the business invariant uses. Deduplicating `event_id` does nothing if two different event ids both mean “capture payment P” and both insert a journal.

### Sagas and compensating actions

A saga is a series of local transactions, each with a compensating action if a later step fails. It is not a distributed rollback. Compensations are new business operations. They can fail too.

For a payment that has already been captured, the compensation is a refund, not a deleted row. The refund can fail, can be partial, and can cost a fee. Model those as their own states. “We use a saga” without naming the compensation for each step is a weak answer.

### Circuit breakers, cache, invalidation

A circuit breaker counts recent failures to a dependency. When the threshold is crossed it fails fast for a cool-down, then lets a probe through. The point is to stop wasting threads and pool connections on a dead host, and to give it time to recover. It does not complete the payment. While the circuit is open, you must leave work in `unknown` or `pending`, not mark it `failed`, if a request might already have reached the provider.

Caching stores a read so the next caller skips the database. The hard part is freshness. A cache entry needs the tenant in the key (`tenant:t_1:account:acc_9`). TTL bounds how long a stale value can live. Explicit invalidation on write is sharper and easy to miss on the second code path that writes the row. Do not cache an authorization decision for long. A stampede happens when a popular key expires and every request recomputes it; single-flight (one recomputation, others wait) is the usual fix.

There is no general “cache invalidation strategy” that fits every read. Say what staleness is acceptable. A display name can be minutes late. A balance used to approve a debit cannot be a cache that lags the ledger. Read the ledger or the locked account row for the decision. Cache the response of a read API if the product allows it.

### Why “exactly once” needs a boundary

Say which of these you mean:

| Boundary | What “once” means | How it is enforced |
| --- | --- | --- |
| Broker accept | The queue stored one copy of this send | FIFO dedup window, or a producer idempotency token. Time-limited |
| Consumer effect | Applying this message inserts one journal | Unique `message_id` committed with the journal |
| Business operation | This client action takes money once | Unique `(tenant_id, idempotency_key)` committed with the journal |
| Provider | Harbour captured once | Harbour’s idempotency key, plus reconciliation when the response is lost |

These boundaries fail independently. You can have one queue message and two journals, or two webhooks and one journal, or one journal and two captures at Harbour because you retried with a new key. Specify the boundary before you pick the tool.

### Common mistakes

- Acknowledging the message, then writing the database.
- Treating “duplicate delivery” and “duplicate business operation” as the same key.
- Infinite retries on a 422.
- A circuit breaker that converts timeouts into `failed` payments.
- Caching `GET /accounts/:id` including another tenant’s data because the key was only the account id.
- Choosing a queue for a request the user is waiting on, then having no status resource for them to poll.

### Practice question

A worker reads a message “payment P succeeded,” inserts a ledger journal, then crashes before it deletes the SQS message. Another worker reads the same message. What do you want to happen, and which SQS setting does not save you?

**Weak answer.** “Switch the queue to FIFO. Exactly-once processing means the second worker will not get the message.”

**Why it fails.** The message was already delivered. Visibility timeout expiry is the documented path for a second receive, including on FIFO. Deduplication stops a second `SendMessage` with the same deduplication id inside five minutes. It does not undo a first message that was processed and not deleted.

**Strong answer.** The second worker must insert the same journal identity and hit a unique constraint, or find the inbox row, and then delete the message. The user-visible effect stays at one journal. Delete only after that commit. If the journal insert succeeded and the crash is before the inbox insert, you still double-post, so the inbox insert and the journal commit have to be one transaction. FIFO is still useful if this payment’s events must stay ordered. It is not the idempotency mechanism.

### Trade-offs

- Synchronous provider call: simpler client experience, and your API latency and availability become Harbour’s.
- Queue in front of Harbour: you can absorb bursts, and you must store `pending`, build status, and reconcile.
- Outbox relay versus “commit then publish”: the outbox adds a table, a worker, and lag. The dual-write is simpler and loses or duplicates events in a way you cannot reconstruct from one atomic commit.
- Short visibility timeout: faster retry after a crash, more duplicate deliveries if the handler is slow. Extend visibility while work is genuinely in progress, and cap the extensions so a stuck handler cannot pin the message.

---

## 5. Multi-tenant architecture

**Priority: Must know** for this role. Expect at least isolation questions in a general architecture exercise, even when the prompt is not about payments.

### Plain English

A tenant is a customer whose data must be invisible to other customers. Isolation is a property of every hop, not of the database alone. The API, the query, the cache key, the queue message, the job payload, the object-storage prefix, the log line, and the search index each have to carry a trusted tenant and enforce it.

Three physical shapes:

| Model | How it isolates | What hurts |
| --- | --- | --- |
| Shared tables, `tenant_id` on every row | One schema, one pool, cheapest operations, simplest cross-tenant reporting | One missed predicate leaks data. One tenant’s scan hurts the cluster. Compliance arguments are harder |
| Schema per tenant | Namespaces inside one database. `search_path` selects the tenant | Migrations run N times. A pooled connection that keeps the previous `search_path` leaks. Still one noisy cluster |
| Database per tenant | Separate backup, restore, failover, and sometimes a separate account or region | Connection counts, migration fleet, cost, and any feature that queries “all tenants” |

Most SaaS systems start on shared tables and move a specific tenant outward when a contract, a region, or a noisy workload forces it. “We always use a database per tenant” is not an architecture. It is a cost and operability commitment that needs a reason: data residency, a regulated neighbour, or blast-radius requirements you can name.

### Trusted context

Derive the tenant after authentication, then pass it as an explicit argument into every function that touches state. Do not read `req.body.tenantId` in the repository layer.

Node will interleave requests at every `await`. A module-level `currentTenant` variable is shared mutable state and will cross tenants under concurrency. AsyncLocalStorage can hold the context for one request chain if you enter it at the edge and every library call stays inside that chain. It fails open when a background job, a timer, or a reused promise was created outside the store and you assumed the store was there. Explicit arguments are easier to test. ALS is reasonable at the HTTP boundary. Pick one and test a concurrent cross-tenant case.

Uniqueness is tenant-scoped unless you have a real global id:

```sql
UNIQUE (tenant_id, client_reference)
```

A global unique `client_reference` means tenant A can squat a reference tenant B is allowed to use, and it creates a cross-tenant conflict channel.

### Row-level security

PostgreSQL row-level security adds a predicate the engine applies to the table. It is a backstop for a missing `WHERE`, not a replacement for application authorization (roles, object rules, and “may this user see this tenant?”).

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON accounts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- application role is not the owner, not a superuser, and does not have BYPASSRLS
GRANT SELECT, INSERT, UPDATE ON accounts TO app_role;
```

`current_setting(..., true)` returns NULL when the setting is absent, and the comparison fails, so no rows match. That is the safe direction. The third argument of `set_config` must be true so the setting dies with the transaction:

```sql
BEGIN;
SELECT set_config('app.tenant_id', $1, true);
-- queries
COMMIT;
```

`FORCE ROW LEVEL SECURITY` matters because the table owner bypasses RLS unless it is forced. Superusers and any role with `BYPASSRLS` still bypass, even with `FORCE`. If the application connects as a migration owner or a superuser, RLS is theatre.

Pooling is the subtle bug. `set_config(name, value, false)` or a session-level `SET` stays on the physical connection. The pool gives that connection to the next request. Tenant A’s setting answers tenant B’s query. `SET LOCAL` / `set_config(..., true)` avoids that only if every query runs inside the transaction that set it, including the “just a read” path. Reset on release, or `DISCARD ALL`, if any code path can set session state. `DISCARD ALL` also drops prepared statements. That is the trade-off.

Views can undermine the policy. A view that runs with the owner’s rights can return rows the calling role’s RLS would hide. PostgreSQL 15 added `security_invoker` so a view uses the caller’s privileges; the default remains owner rights. **Verify** this on the version you run before you rely on a view over an RLS table.

RLS does not filter a cache, an SQS message, or an S3 object. Those need their own enforcement.

### Noisy neighbours and tests

One tenant can hurt the others by holding connections, running an unbounded report, or filling a queue. Protect the rest with a page-size cap, `statement_timeout`, per-tenant rate limits, and a fair queue: separate queues or FIFO groups so one tenant’s backlog is not the only head-of-line. Batch jobs should have their own pool or their own role with a small connection cap, so a backfill cannot take every slot from the API.

Test isolation as a behaviour, not as a code review comment. Minimum set: with tenant A’s credentials, `GET` tenant B’s object id and expect `404`; run two requests concurrently and assert neither response contains the other tenant; read the cache key; consume a job and reject a payload whose tenant does not match the trusted job context; request an object-storage key outside the tenant prefix. Add a test that a session left mid-transaction cannot be checked out and still see the previous `app.tenant_id`.

### Common mistakes

- RLS enabled, application logged in as the table owner, `FORCE` omitted. Every row is visible. Tests pass because tests also use the owner.
- Policy written, `WITH CHECK` forgotten, and you believed inserts were covered. In PostgreSQL an omitted `WITH CHECK` falls back to `USING`, so this particular shortcut is often fine. Do not generalise that from memory to other engines. **MySQL has no equivalent RLS**; isolation there is a mandatory predicate, a separate schema, or a separate database, plus tests.
- Trusting a tenant id inside a queue message that any producer can publish. The worker must authenticate the producer (queue IAM) and still treat the payload tenant as data to check against the resource.
- `search_path` set to a tenant schema on a pooled connection and not reset. The next checkout runs unqualified `SELECT * FROM accounts` in the previous schema.
- Unique indexes that are not tenant-scoped, sold as a safety feature.

### Practice question

You enable RLS on shared tables. A penetration test still reads another tenant’s invoice through `GET /invoices/:id`. The policy looks correct in `psql` when you `SET` the tenant yourself. Where do you look?

**Weak answer.** “RLS is broken. Move each tenant to their own database.”

**Why it fails.** It jumps to the most expensive model before checking whether the application ever sets the tenant, which role it uses, and whether a view or a cache sits above the table. The `psql` check used a different role and a session setting the app may not set.

**Strong answer.** Confirm the app role is subject to the policy (not owner, not `BYPASSRLS`, and `FORCE` is on if the owner is used anywhere). Log `current_user` and `current_setting('app.tenant_id', true)` on the request that leaked. Then check bypasses that RLS cannot see: a view owned by a privileged role, a repository method that uses a second admin pool, a cache key of `invoice:${id}`, and a response assembled from a query that ran before the tenant was set. Fix the hop that ignored the policy. Keep RLS as the backstop. Add the failing request as a regression test.

### Trade-offs

Shared tables plus RLS plus tests is the right default for a product that is still changing, as long as the application role is unprivileged and every other hop is tenant-scoped. Separate databases are justified for residency, a customer who paid for isolation, or an incident history that says a shared cluster is unacceptable. Separate schemas sit in between and often inherit the worst pooling bugs of both. Say that. Do not recite the three models as equals.

---

## 6. Financial workflows

**Priority: Secondary** for a general 90-minute paper. **Must know** for the architect interview on this role. The mechanisms are the same idempotency, locking, and delivery rules as above, with stricter states.

### Plain English

Keep three states apart. Mixing them is the mistake that makes retries double-charge or makes a refund “disappear” from the books.

| State | Question it answers | Example |
| --- | --- | --- |
| Provider state | What does Harbour say? | `authorised`, `captured`, `declined`, or no answer |
| Internal payment state | What is our workflow allowed to do next? | `created`, `unknown`, `succeeded`, `failed`, `refund_pending` |
| Ledger state | What did we post to the books? | a journal that sums to zero, or nothing yet |

Harbour can say captured while your ledger insert is still failing. That payment is a discrepancy to repair, not a failure to retry. Your ledger can show a customer liability only after you have a reason to believe the economic event happened. A row in `payments` is not a journal.

A workable lifecycle for a customer charge:

1. **Create** the internal payment as `created`, with the tenant-scoped idempotency key and request hash, in a committed transaction. No external call yet.
2. **Submit** to Harbour with a provider idempotency key derived from your payment id, not from a fresh UUID per attempt.
3. **Definite decline** → internal `failed`. No journal. A new client attempt is a new idempotency key.
4. **Definite success** → internal `succeeded` and, in the same database transaction, the ledger journal (or an outbox row that posts the journal). These two must not diverge without a detector.
5. **Timeout or connection drop** → internal `unknown`. Do not submit a second Harbour call under a new key. Reconcile by querying Harbour with the original key, or wait for a signed webhook.
6. **Refund or reversal** is a new operation with its own idempotency key, linked to the original payment. It does not delete the original journal.

Pending means “Harbour has the request and the outcome is not final.” Unknown means “we do not know whether Harbour has the request.” Collapsing unknown into failed, then retrying, is how you capture twice.

### Why a database transaction cannot swallow Harbour

A database transaction can roll back its own inserts. Harbour has already decided. The two commits are not one atomic action.

If you hold a database transaction open across the HTTP call:

- row locks and a pool slot are held for seconds
- Harbour can capture, then your process dies, your transaction rolls back, and you have a capture with no local row
- or you insert a “succeeded” row, Harbour then declines, and you roll back a row that a concurrent reader never should have used as success either

Commit the local intention first. Call Harbour. Commit the outcome in a second transaction. Repair `unknown` with reconciliation. That is more moving parts than one transaction, and it is the design that matches the failure you actually have.

### Idempotency for money

```sql
CREATE TABLE payment_idempotency (
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  payment_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, idempotency_key)
);
```

Insert this row in the same transaction as the `created` payment. A concurrent duplicate blocks on the primary key and then loads the existing `payment_id`. If `request_hash` differs, return `409` and do not touch Harbour. The key is tenant-scoped so two customers can both use `key-001`.

The provider key should be stable for that payment id. A retry of an `unknown` payment reuses it. Whether Harbour honours that key, and for how long, is provider-specific. Read Harbour’s contract. Do not copy a number you remember from a different provider.

### Webhooks

Assume Harbour signs the raw body and sends `event_id`, `type`, `payment_id`, `occurred_at`.

- Verify the signature over the exact bytes received. Re-serialising JSON changes the signature.
- Reject timestamps outside a small window so a captured body cannot be replayed months later. Clock skew exists; do not make the window one second.
- Insert `event_id` in a unique inbox table in the same transaction as the state change.
- Acknowledge only after that commit. A `200` before the commit invites Harbour to believe you stored an event you lost. A `500` after you stored it causes a redelivery, which the inbox turns into a no-op.
- Out-of-order events are normal. `payment.failed` arriving after `payment.succeeded` must not move a succeeded payment backwards. Compare provider sequence or `occurred_at`, and ignore a stale transition. Log it. Do not “make the webhook win” because it is the newest HTTP call.

### Reconciliation and settlement

Reconciliation compares two records that were not written atomically. At least daily, and after any `unknown` older than your threshold:

- every internal `succeeded` payment has a matching Harbour transaction for the same amount and currency
- every Harbour capture has an internal payment and a journal
- amounts net of Harbour’s fees match the settlement report

Settlement is when funds actually arrive in the platform’s bank account, often in batch, often minus fees, often on a delay. Capture is not settlement. If you credit a customer’s available balance on capture, you are advancing funds against a settlement that might be reversed. That can be a valid product decision. It has to be explicit, with a reserve or a delay, not an accident of the status enum.

Discrepancies get a queue and an owner: missing internal row, missing provider row, amount mismatch, currency mismatch, succeeded internally but declined at Harbour. Automatic repair is safe only for the cases you have specified, such as “provider captured, local state is `unknown`, journal absent → post the journal once.” Everything else waits for a person. Blindly replaying the original API call is not repair.

### Double-entry, in one page

Every economic event is a journal of two or more lines. Debits and credits are equal, so the journal sums to zero. Lines are immutable. A mistake is corrected by a new reversing journal that points at the original, not by `UPDATE` or `DELETE` on posted lines.

A simplified customer top-up of 10.00 GBP through Harbour, in minor units, ignoring fees:

```text
journal j_100  payment p_9  currency GBP
  debit   harbour_clearing     1000   -- asset: Harbour owes the platform
  credit  customer_liability   1000   -- liability: the platform owes the customer
```

When Harbour settles and takes a 20 minor-unit fee, that is a **new** journal, not an edit:

```text
journal j_140
  debit   bank                     980
  debit   processing_fee_expense    20
  credit  harbour_clearing        1000
```

The customer liability is unchanged by settlement. People who keep one `balance` column and overwrite it cannot explain this, and they cannot reverse it without losing history.

Invariants you should be able to say:

- each posted journal sums to zero in one currency
- a posted line is never updated
- the customer’s available balance is the sum of their liability lines minus holds, not a separately trusted number, unless that cached balance is updated in the **same** transaction as the line and protected by a constraint
- a payment row in `succeeded` has exactly one capture journal, enforced by a unique `payment_id` on that journal type

Simplification: real charts of accounts split pending, available, fees, tax, and suspense. The mechanics do not change. Mixed currencies do not belong in one sum. Convert with a recorded rate and a rate timestamp, and post the conversion as its own journal. Do not multiply two floats.

### Reversals and refunds

A reversal undoes an internal posting that should not stand (duplicate journal, wrong account). A refund returns funds to the payer through Harbour and is a new provider operation plus a new journal. They are different tools. Using a refund to hide a double journal leaves the extra capture at Harbour in place until someone reconciles. Using a deleted row to “reverse” a payment destroys the audit trail you will be asked for.

Partial refunds are a second amount, with their own idempotency key, and a check that the sum of refunds cannot exceed the captured amount. That check needs the same locking story as a balance: lock the payment or use a conditional update, or two concurrent refunds of the full amount both succeed.

### Common mistakes

- One enum called `status` that means provider, workflow, and ledger at once.
- `catch (err) { markFailed(); }` on a timeout.
- Webhook handler updates status with no signature check and no unique `event_id`.
- Crediting the ledger from the webhook and also from the synchronous Harbour response, with two different idempotency keys.
- Storing money as `numeric` and then doing the arithmetic in JavaScript `number`.
- A refund implemented as `balance = balance + amount` with no link to the original journal.

### Practice question

Harbour’s response timed out. Your handler marks the payment `failed` and returns 502. The client retries with the same idempotency key. What do you do, and what do you wish you had done before returning?

**Weak answer.** “The idempotency key returns the stored 502 and failed status, so we are safe. The client can try again later with a new key.”

**Why it fails.** It preserves the wrong outcome. If Harbour captured the first call, the stored `failed` is a lie. A new key creates a second capture. Replaying the stored 502 is consistent with your database and inconsistent with the money.

**Strong answer.** Before returning, the payment should have been `unknown`, not `failed`, and the stored idempotent response should point at that payment. The retry loads the same payment and does not create another. A reconciler queries Harbour by the original provider idempotency key. On “captured,” move to `succeeded` and post one journal. On “not found” after Harbour’s own consistency window, move to `failed`. On still-pending, stay `unknown`. Tell the client the operation is in progress, not that it failed.

### Trade-offs

- Advancing customer balance on capture is better UX and is credit risk until settlement. Waiting for settlement is safer and slower.
- Posting the journal in the same transaction as `succeeded` is simpler and couples ledger availability to the payment transition. Posting via an outbox lets the transition commit if the ledger schema is in another service, and it creates a gap you must monitor.
- Synchronous “I will not respond until Harbour responds” versus `202 Accepted` plus a status URL. The sync API is easier to misuse when Harbour is slow, because your gateway will time out first (API Gateway’s integration timeout has historically been 29 seconds — **verify** the current quota) while Harbour may still complete.

---

## 7. Architecture judgment and operations

**Priority: Must know** as a way of answering. The AWS names are **secondary** until the requirements are stated. For this role they will be discussed, so have the trade-offs ready. Do not open with a service list.

### Plain English

An architecture review starts with constraints, not components. Before you choose Lambda or ECS, write down:

- what must be correct even during a failure (money, tenant isolation, audit)
- what may be delayed (email, analytics, search)
- rough traffic: requests per second, payload size, burstiness, and which tenant can be 100 times the median
- latency the user actually waits for
- who is on call, and how many services they can operate
- delivery constraint: what has to be true in six weeks versus what can evolve

If the prompt does not give these, ask. A design that cannot say “I assumed 50 requests/s and one region” cannot be evaluated.

### Modular monolith and microservices

A modular monolith is one deployable with hard module boundaries: payments, ledger, identity, and notifications do not read each other’s tables except through an interface. You still get one transaction when a payment and a journal must commit together. You still get one operational surface.

Microservices split deploy and scale. They also split the transaction. You pay for that with outboxes, sagas, versioned contracts, and distributed debugging. Split a service out when you have a measured reason: a different scaling profile, a different compliance boundary, or a team that must release on its own cadence. Splitting the ledger away from payment initiation on day one, because “fintech systems are microservices,” removes the tool you need for the invariant and adds a saga you now have to operate.

The weak answer is “start with microservices so we can scale.” The missing piece is which bottleneck, which team constraint, and which consistency boundary.

### AWS, only where it changes the design

These are trade-offs, not a recommendation to use all of them.

- **Lambda** fits short, bursty, stateless work: webhook intake that verifies a signature and writes one row, then returns. It is awkward for a large in-process connection pool, for CPU-heavy work unless you accept the memory cost, and for any call longer than the function limit. A concurrency spike becomes a database connection spike.
- **ECS or another long-running service** fits a Node or Go API that holds a small pool, drains on `SIGTERM`, and stays warm. You operate scaling, deploys, and health checks yourself. That is often what you want for the payment API.
- **API Gateway** gives you a front door, throttling, and request authentication. It also has a short upstream timeout and payload limits (**verify** current numbers). A slow synchronous Harbour call will hit that timeout while the charge may still succeed. Design for that, or call Harbour from a worker.
- **RDS (PostgreSQL or MySQL)** is the system of record when you need constraints, transactions, and locks. Multi-AZ is for availability, not for making a bad transaction model correct. Connection count is a capacity you design for.
- **SQS** is a buffer with at-least-once delivery, a visibility timeout, and a DLQ. Use it when the producer should not wait for the consumer. Do not use it as your only idempotency store.
- **EventBridge** routes events to several consumers with filtering. Delivery is at-least-once, ordering is not the product, and it is a poor place to put the only copy of “please capture this payment” unless a database already holds that intention.

A sound sketch for this role’s platform: ECS service for the API, RDS PostgreSQL as the system of record, SQS for webhook processing and webhooks you send onward, EventBridge only for fan-out that is allowed to be eventual (analytics, email). Lambda is optional at the edges. The sketch is not the point. The point is that the payment row is committed before any of those hops, and each hop can be replayed.

### Observability and incidents

Log with `requestId` and `tenantId`. Metrics need a tenant dimension on the few series that tell you about a noisy neighbour: request rate, error rate, p95 latency, pool wait time, and payment outcomes (`succeeded`, `failed`, `unknown`). Do not put unbounded ids (payment id, account id) on metric labels. Traces connect the API span to the database span and the Harbour span. Without the trace, “Harbour was slow” and “we held a database lock” look the same in an average.

SLOs belong on user journeys and on correctness, not only on CPU. Example: 99.9% of `POST /payments` return a definite `succeeded` or `failed` within 30 seconds, and 100% of `unknown` payments older than 15 minutes are either resolved or paged. An availability SLO that is green while journals are unbalanced is a bad SLO.

Incident diagnosis, in order: what changed (deploy, migration, provider status, traffic), which tenants, whether money or isolation is involved, how to stop the bleeding (disable a route, stop a worker, shed a tenant’s load), how to recover state, then a postmortem. Rolling back a deploy does not roll back a captured charge or a destructive migration. Say that before you say “we’ll just roll back.”

Recovery for `unknown` payments is a reconciler, not a redeploy.

### Migrations and compatibility

During a deploy, old and new code run together. Every migration has to be safe for both.

Expand, then contract:

1. Add a nullable column or a new table. Old code ignores it.
2. Backfill in batches. A single `UPDATE` of a 100-million-row table holds locks and bloats the log.
3. New code writes both shapes.
4. Backfill the tail. Add `NOT NULL` or the new constraint only when every row is valid and old code no longer writes nulls.
5. Later, drop the old column, after no running version reads it.

In PostgreSQL, `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. A normal `CREATE INDEX` locks writes for the duration. Adding a column with a constant default no longer rewrites the table on modern PostgreSQL (this changed in PostgreSQL 11 — **verify** if you are on something older). Adding a `NOT NULL` constraint still needs a validation plan. MySQL’s locking behaviour for the same DDL is different; do not describe one engine’s `ALGORITHM=INPLACE` story as if it were the other.

Application compatibility is the same idea: a worker must accept the previous message version and the new one. Add fields. Do not rename a field the old worker still publishes until that worker is gone.

### Common mistakes

- Drawing twelve services and no consistency boundary.
- “We’ll use Kafka” (or Kinesis, or EventBridge) with no consumer idempotency and no retention story.
- An SLO dashboard with no `unknown` payment age and no reconciliation lag.
- A migration that backfills and adds `NOT NULL` in one deployment while old tasks are still writing the old shape.
- Rollback documented as “redeploy the previous container” for a change that already dropped a column.

### Practice question

You have six weeks, one team, and a new multi-tenant payments API on PostgreSQL. The first design proposes seven services: gateway, payments, ledger, ledger-writer, webhooks, notifications, and billing. What do you cut, and what do you keep?

**Weak answer.** “Microservices are better for a senior platform. I’d add Kubernetes and Kafka so each team can scale.”

**Why it fails.** There is one team. The proposal splits the one place that needs a transaction (payment outcome and journal) into two services and a writer. The answer adds orchestrators before it names an invariant or a traffic number.

**Strong answer.** One modular service owns payments and the ledger so the success transition and the journal commit together. A separate worker process, same codebase, pulls an outbox or an SQS queue for Harbour webhooks and for email, so a mail outage does not sit inside the request. RDS PostgreSQL is the record. Idempotency and `unknown` reconciliation are in scope for the six weeks. Notifications can lag. Splitting the ledger out is a later decision if a second product must post journals and the module boundary is already clean. I would ask for expected RPS, the Harbour timeout, and whether any tenant requires a separate database on day one. I am assuming no, until a residency requirement appears.

### Trade-offs

| Keep together | Split |
| --- | --- |
| Payment status and ledger journal | Email, analytics, search |
| Tenant resolution and the query that uses it | A report workload that needs different connection limits |
| Request path and its idempotency store | Webhook intake, if you want a tiny verifier that only does signature plus insert |

The cost of splitting is a new failure mode between the pieces. Pay it when the cost of staying together is a measured blast radius, a scaling conflict, or a team boundary. Not before.

---

## Code review practice

Do these three before you read the answer section. Each sample compiles only in the sense that the problems are logical; imports and framework types are omitted on purpose. Assume PostgreSQL, Express 4, a shared-table multi-tenant database, and Harbour as the provider. `number` amounts are part of the flaws, not an example to copy.

### Exercise A — transfer endpoint

```typescript
app.post("/transfers", async (req, res) => {
  const { fromAccountId, toAccountId, amount, tenantId } = req.body;
  const key = req.header("Idempotency-Key");

  const seen = await pool.query(
    "SELECT 1 FROM idempotency_keys WHERE key = $1",
    [key],
  );
  if (seen.rowCount > 0) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  const from = await pool.query(
    "SELECT balance FROM accounts WHERE id = $1",
    [fromAccountId],
  );
  if (from.rows[0].balance < amount) {
    res.status(500).json({ error: "insufficient funds" });
    return;
  }

  await pool.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [
    amount,
    fromAccountId,
  ]);
  await pool.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [
    amount,
    toAccountId,
  ]);
  await pool.query("INSERT INTO idempotency_keys(key) VALUES ($1)", [key]);

  res.json({ ok: true });
});
```

### Exercise B — Harbour webhook

```typescript
app.post("/webhooks/harbour", async (req, res) => {
  const event = req.body;
  console.log("harbour webhook", JSON.stringify(event));

  const payment = await pool.query("SELECT * FROM payments WHERE id = $1", [
    event.payment_id,
  ]);

  if (event.type === "payment.failed") {
    await pool.query("UPDATE payments SET status = 'failed' WHERE id = $1", [
      event.payment_id,
    ]);
  } else if (event.type === "payment.succeeded") {
    await pool.query("UPDATE payments SET status = 'succeeded' WHERE id = $1", [
      event.payment_id,
    ]);
    await pool.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
      [event.amount, payment.rows[0].account_id],
    );
  }

  res.status(200).json({ received: true });
});
```

### Exercise C — tenant-scoped invoice fetch

```typescript
let currentTenant = "";

app.use((req, _res, next) => {
  currentTenant = String(req.header("x-tenant-id") ?? "");
  next();
});

export async function getInvoice(invoiceId: string): Promise<any> {
  const client = await pool.connect();
  await client.query(`SET app.tenant_id = '${currentTenant}'`);
  const result = await client.query(
    `SELECT * FROM invoices WHERE id = '${invoiceId}'`,
  );
  client.release();
  return result.rows[0];
}

app.get("/invoices/:id", async (req, res) => {
  getInvoice(req.params.id).then((invoice) => {
    res.json(invoice);
  });
  res.status(200);
});
```

There is a row-level security policy on `invoices` that compares `tenant_id` to `current_setting('app.tenant_id')`. The application connects as `app_owner`, the role that owns the tables. `FORCE ROW LEVEL SECURITY` is not set.

---

## Code review answers

### Exercise A

The handler can move money twice, move it for the wrong tenant, and leave the books half-updated.

- **Authorization.** `tenantId` comes from the body. There is no authenticated tenant and no check that either account belongs to it. Any caller who can hit the route can debit any account id.
- **Idempotency race.** The `SELECT` and the later `INSERT` are not one atomic decision. Two requests with the same key both observe no row. The key is also global, so tenants collide, and a second request with the same key and a different amount is treated as success without comparing a request hash. The stored response is discarded; the replay returns a generic `{ duplicate: true }` and status 200, which may not match the first response.
- **Order.** The key is inserted after the updates. A crash between them retries the money movement. If the insert fails, the transfer has still happened.
- **Balance race.** Read-then-write with no transaction and no `FOR UPDATE`. Two debits both pass the check. The comparison is also type-sensitive. `node-postgres` returns `numeric` and `int8` as strings. If `amount` is a number, `"9" < 80` becomes numeric and the check can work by accident. If both sides are strings (`"9" < "80"`), JavaScript compares lexicographically, `"9" > "8"`, and the insufficient-funds branch does not run. `Number(balance)` is not the repair: values above `2^53 - 1` are not safe integers.
- **Partial failure.** The debit can commit and the credit can throw. Money leaves the source and never arrives. There is no journal, so there is nothing immutable to reverse, only a mutated column.
- **Status code.** Insufficient funds is a business result, not a 500. A 500 will be retried by clients and will page an on-call engineer.
- **Errors.** A thrown driver error never reaches `catch`. On Express 4 the rejection is unhandled. The idempotency header can be absent, and the code inserts `NULL` or the string `"undefined"` depending on the driver.
- **Money type.** `amount` is unconstrained: float, negative, or a string. A negative amount reverses the transfer.

A sound replacement starts a transaction, resolves the tenant from the credential, locks both accounts in id order with the tenant predicate, rejects a non-integer minor-unit amount, inserts the idempotency row with a request hash in that same transaction, writes two ledger lines that sum to zero (or two conditional balance updates plus an audit row), and commits once. The duplicate key path returns the stored response.

### Exercise B

This endpoint trusts the public internet to do bookkeeping.

- **No signature check.** Anyone who can reach the URL can mark a payment succeeded and credit an account. Verification has to use the raw body and Harbour’s current signing scheme, and it has to happen before any state change.
- **The log line is a data leak.** Provider payloads contain account identifiers and sometimes full card metadata. Log the event id, type, and payment id after you know the signature is valid.
- **No tenant and no inbox.** `event_id` is never stored. Harbour retries webhooks. Each retry credits the account again. There is no unique constraint in sight.
- **Out of order.** `payment.failed` always overwrites status. A failure event that was queued earlier and delivered later undoes a success. The credit is not undone, so status and balance disagree.
- **Two statements, no transaction.** Status can be `succeeded` while the balance update fails, or the reverse if you reorder later. A retry then credits again because nothing records that this event was applied.
- **Amount from the webhook.** The credited amount should be the amount you already stored on the payment, checked against the event. An attacker who passes the signature (or a bug that signs the wrong field) should not be able to name their own amount. This also treats the webhook as authority for the ledger with no link to a journal.
- **`SELECT *` then trust `rows[0]`.** An unknown `payment_id` throws when reading `account_id`, the function rejects, and Harbour retries. That part is survivable. Combined with no inbox, a payment id that exists is credited on every retry.
- **Always 200 at the end is fine only after a durable inbox insert.** Here 200 is returned even when the payment is missing and the function throws before `res.status`, or when work partially completed. Decide: persist the inbox row then 200; on a transient database error, 500 so Harbour retries.

The handler should verify the signature, reject stale timestamps, insert `event_id` uniquely, load the payment, ignore illegal transitions, and post a journal idempotently on the transition into `succeeded`. Status update and journal commit together.

### Exercise C

This is a cross-tenant leak with a second, independent response bug.

- **The tenant source is the client header.** No authentication. Any caller sets `x-tenant-id`.
- **`currentTenant` is process-global.** Request A sets it, awaits the pool, request B overwrites it, request A’s query runs with B’s tenant. AsyncLocalStorage or an explicit argument fixes the variable. The explicit argument is the one you can see in the function signature.
- **String interpolation.** `currentTenant` and `invoiceId` are SQL injection. Use `set_config('app.tenant_id', $1, true)` inside a transaction and `$1` for the id.
- **`SET` is session-scoped.** The pooled connection keeps `app.tenant_id` after `release()`. The next borrower inherits it. `set_config(..., true)` inside `BEGIN`/`COMMIT`, plus a reset on release if any session `SET` remains, is the fix.
- **The role bypasses RLS.** `app_owner` owns the table and `FORCE ROW LEVEL SECURITY` is off, so the policy is not applied to this connection. The query is by id only. With this role, any caller who knows an invoice id can read it on every request, not only under concurrency. The global variable and the session `SET` become the leak the day the service switches to an unprivileged role. Use a non-owner role without `BYPASSRLS`, and turn `FORCE` on.
- **The handler does not wait for the query.** `res.status(200)` only stores a status code. It does not write a body or end the response. On the success path, the later `res.json` is what actually sends. On the failure path, `getInvoice(...).then(...)` has no `.catch`, the rejection is unhandled, and nothing writes an error response, so the client waits until a gateway timeout. `await` the query, send one response, and return `404` when there is no row.
- **`Promise<any>` throws away the type.** That does not cause this bug, and it removes the compiler’s help on the next one. The row can be `undefined`. Missing invoices should be `404`, not a JSON `null` with status 200.

Even after the SQL is parameterised, a test that only runs one request at a time will miss the global variable and the pool leak. The regression test needs concurrency and two checkouts.

---

## Debugging scenarios

Try each one before the solution under it.

### Scenario 1 — the wrong tenant’s invoice

**Report.** Intermittent. A user at tenant North sees an invoice that belongs to tenant South. Refreshing often shows the right invoice. It happens more when the API is busy. It started after a change that added Postgres row-level security and “tenant context” in the repository.

**Code.** Two data paths. The timed-out request used `withTenant`. The GET that leaked used `getInvoice`.

```typescript
export async function withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function getInvoice(id: string) {
  // Author assumed middleware had already set the tenant on the pool.
  return pool.query(
    "SELECT id, total, tenant_id FROM invoices WHERE id = $1",
    [id],
  );
}
```

Policy:

```sql
CREATE POLICY invoices_tenant ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- ENABLE ROW LEVEL SECURITY is set. FORCE is not.
-- The app role is invoices_app, not the owner, and has no BYPASSRLS.
```

**Logs from one host, same process.**

```text
10:01:01.100 req=a1 tenant=north GET /invoices/inv_south  -> 404
10:01:01.140 req=b2 tenant=south GET /invoices/inv_south  -> 200
10:01:01.141 req=b2 ERROR canceling statement due to statement timeout
10:01:02.900 req=a2 tenant=north GET /invoices/inv_100    -> 200  body.tenant_id=south
```

**A query you run on a checked-out connection after b2’s error.**

```text
SHOW app.tenant_id;   -- south
```

**Solution.**

`set_config`’s third argument is `false`, so the setting is session-level. It survives `release()`. Request `b2` sets `south` on that physical connection and then times out. `finally` still releases the client. Nothing resets the setting.

`getInvoice` does not call `set_config` at all. It takes whatever connection the pool hands it. After `b2`, that connection still has `app.tenant_id = south`, so request `a2` (North’s token, logged correctly) runs under South’s policy and can read South’s invoice. A call that goes through `withTenant` would overwrite the setting before querying and would not show this bug. That is why a test of `withTenant` alone stays green.

The 404 on `a1` shows the policy works when the setting is actually North. This is not “RLS does not work.” The leak is session state reused by a path that never sets it.

`FORCE` and the role are not the bug in this log, because `a1` was denied. They are still worth fixing so a future owner connection cannot bypass the policy. They do not explain a leak that depends on load.

Fix: `set_config('app.tenant_id', $1, true)` inside an explicit transaction that wraps `fn`, and `RESET app.tenant_id` or `DISCARD ALL` before every `release()` so a future session-level `SET` cannot leak. Add a test that checks out a connection, sets South, releases it, checks it out again, and asserts the setting is gone. While you are there, find any query that uses `pool.query` directly and therefore never sets a tenant; under a fail-closed `current_setting(..., true)` those return no rows, which is the behaviour you want.

### Scenario 2 — negative balance under retry

**Report.** During a Harbour incident, some accounts went negative and a few customers were captured twice. No deploys that hour. Harbour’s status page reported elevated timeouts. Your API was returning a mix of 201 and 502.

**Handler, shortened.** One checked-out client, so the `BEGIN` and `COMMIT` really are one transaction. A version written as separate `pool.query("BEGIN")` calls would be a third bug: those calls do not share a connection.

```typescript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const existing = await client.query(
    "SELECT id FROM payments WHERE idempotency_key = $1",
    [key],
  );
  if (existing.rowCount === 0) {
    await client.query(
      "INSERT INTO payments (id, idempotency_key, account_id, amount_minor, status) VALUES ($1,$2,$3,$4,'processing')",
      [paymentId, key, accountId, amountMinor],
    );
    const harbour = await fetch(harbourUrl, {
      method: "POST",
      body: JSON.stringify({ amount: amountMinor / 100, reference: paymentId }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!harbour.ok) throw new Error("harbour failed");
    await client.query(
      "UPDATE accounts SET balance_minor = balance_minor - $1 WHERE id = $2",
      [amountMinor, accountId],
    );
    await client.query("UPDATE payments SET status = 'succeeded' WHERE id = $1", [paymentId]);
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

**Constraints.** `payments.id` is the primary key. There is no unique constraint on `idempotency_key`. There is no `CHECK` on `balance_minor`. Isolation is the PostgreSQL default.

**Logs for one idempotency key `k_88`, account balance was 5_000 minor units, amount 5_000.**

```text
10:14:06.000 start key=k_88 payment=p1
10:14:09.010 AbortError The operation was aborted key=k_88 payment=p1
10:14:09.011 rollback key=k_88 payment=p1
10:14:09.200 start key=k_88 payment=p2
10:14:10.100 harbour 201 key=k_88 payment=p2
10:14:10.130 committed key=k_88 payment=p2 balance_minor=0
```

**Harbour’s dashboard, same minute.** Two captured charges, references `p1` and `p2`, both 50.00 GBP, both succeeded. Your database has only `p2`.

**A second account, no Harbour timeout, two overlapping requests, same key.** Both inserted, both committed, balance went from 5_000 to -5_000. `SELECT idempotency_key, count(*) FROM payments GROUP BY 1 HAVING count(*) > 1` returns that key.

**Solution.**

Two different bugs. Do not merge them into “Harbour was down.”

The overlapping pair is the idempotency race from section 3, made worse by the external call inside the transaction. Both transactions run `SELECT` and see no row, because Read Committed does not block that read. There is no unique key to make the second insert fail. Both later subtract. The balance goes negative because nothing in the database forbids it. Each request’s `BEGIN`/`COMMIT` makes that request’s own statements atomic. It does not serialize the check against the other request.

The timeout case is the boundary problem. `AbortSignal.timeout` aborts your wait. The code treats that as `throw`, rolls back `p1`, and the client’s retry allocates `p2` with a new Harbour reference (`paymentId` is a new UUID, and the JSON body uses `amount` in major units with no Harbour idempotency key). Harbour had accepted `p1` and captured it. Your rollback deleted the only local trace. Reconciliation that only looks at local `succeeded` rows will never see `p1`. The second capture is a second real charge. Dividing by 100 also sends a float to Harbour; that is a latent rounding bug even on the happy path.

Fix, in this order:

1. Unique `(tenant_id, idempotency_key)` and a stable payment id committed **before** calling Harbour, status `unknown` if you are about to call and `processing` only after Harbour accepts the request. A timeout updates that same row to `unknown`. It does not delete it and does not mint `p2`.
2. Call Harbour outside any open transaction, with a provider idempotency key tied to `p1`.
3. On a definite capture, debit with `WHERE balance_minor >= $amount` or `SELECT FOR UPDATE`, and post a journal, in one short transaction. Add `CHECK (balance_minor >= 0)` if a negative balance is never legal for this product. Some products allow it; then the check is the wrong backstop and an overdraft limit belongs in the locked read instead. Say which product rule you are implementing.
4. A reconciler lists Harbour captures and compares them to local payments. `p1` would show up as “captured at provider, missing locally” even if the bug escapes again.

The 502 response can stay for the client, with a body that says the outcome is unknown and the same idempotency key should be retried. Returning 502 is not what marks the payment failed.

---

## System design exercises

### Exercise 1 — general, assessment-shaped

**Prompt.** Design the job API for a multi-tenant document product. A tenant uploads a file and asks for a derived artifact (a rendered PDF). The user waits on their own request only for acceptance, not for the render. Jobs must survive a process crash. Running the same job twice must not double-count the tenant’s monthly quota. One large tenant must not keep a small tenant’s jobs queued behind a multi-hour backlog. You are not required to use any particular AWS service. State assumptions.

**Clarifying questions worth asking.**

- How large are files, and what is the upload volume per tenant?
- Is the quota “accepted jobs” or “successful renders”?
- What is a duplicate: the same client retry, or two users asking to render the same file?
- How fresh must job status be?
- Is there a residency rule that forbids shared storage?
- What is the team’s operational limit: one service or several?

**Assumptions if the interviewer says “you decide.”** Files are up to 50 MB. A few hundred accepts per minute at peak. Quota counts successful renders. Clients retry accepts with an idempotency key. Status can be a few seconds stale. One region, shared storage, one team.

**Reference approach.**

Accept path, synchronous and short: authenticate, resolve tenant, validate type and size, store `(tenant_id, idempotency_key) → job id` and a `jobs` row in `accepted` in one transaction, write the file to object storage under a tenant prefix, enqueue `{jobId, tenantId}` , return `202` with the job URL. If the enqueue is a dual-write, use an outbox so a crash after commit still produces a message.

Worker path: pull with a bounded concurrency per worker, and isolate tenants. On SQS that can be a per-tenant message group only if you accept head-of-line blocking inside a tenant; fairness across tenants means you do not give one tenant an unbounded number of in-flight messages. A simple version is a per-tenant cap in the worker and a global cap. Lock the job row (`accepted → running`) with a conditional update so two workers cannot both run it. On success, in one transaction: insert the quota consumption keyed by `job_id` uniquely, mark `succeeded`, store the artifact key. A redelivery hits the unique quota key and does not consume twice. On failure, increment an attempt counter and retry with backoff; after N attempts mark `failed` and do not consume quota. The definition “quota counts successes” is why the unique insert sits with the success transition, not with accept.

Crash window: worker dies after rendering and before commit. The artifact write to object storage may have happened. The job is still `running` until a visibility timeout or a stale-lock sweeper returns it to `accepted`. The second run overwrites the same artifact key and inserts the quota once. Say that storage writes are replace-by-key, so a repeated render is tolerable. If the renderer had a side effect that is not replaceable, such as sending a letter, that side effect needs its own idempotency key.

Status: `GET /jobs/:id` reads the row scoped by tenant. Do not push status only through a websocket with no durable row.

What you refuse: rendering inside the accept request, a queue with no job row, a quota implemented as `quota = quota + 1` outside a unique key, and a single FIFO group for the whole platform.

**Trade-off to mention.** A database table polled by workers is easier to keep consistent with the quota transaction and worse at fan-out. A queue is better at buffering and easier to double-run. Either is acceptable if the conditional update and the unique quota key are present.

### Exercise 2 — fintech, interview-shaped

**Prompt.** Design payment initiation for Ledgerlane. Tenants charge their own customers through Harbour. The client needs a clear result when Harbour gives one, and a safe result when Harbour times out. Webhooks arrive at least once, sometimes out of order. Finance reconciles daily against Harbour’s settlement file. Captured funds are credited to the tenant’s ledger as available immediately; you may challenge that product rule.

**Clarifying questions.**

- Is the client a tenant’s backend, with an idempotency key, or a browser that will not retry cleanly?
- Do we need authorization and capture as two steps, or a single capture?
- On timeout, can the synchronous API return “unknown”, or must it block until definite?
- Who eats the loss if we credit the tenant before Harbour settles and the capture is later reversed?
- Are partial refunds required in this iteration?
- What is the expected capture rate and the timeout rate?

**Assumptions.** Server-side client, idempotency key required, single-step capture, API may return `202` with `unknown`, available balance is credited on capture (product has accepted settlement risk), full refunds only in v1, one region, PostgreSQL is the record.

**Reference approach.**

Records: `payments` (internal state, tenant, amount in minor units, currency, request hash, provider key, provider reference), `payment_idempotency`, `journals` and `journal_lines`, `webhook_inbox`, `reconciliation_items`.

Accept: insert idempotency and payment `created` in one transaction. Call Harbour outside the transaction with a stable provider key. Map Harbour’s definite decline to `failed` with no journal. Map definite capture to one transaction that sets `succeeded` and inserts the journal (debit Harbour clearing, credit tenant liability). Map timeout to `unknown` and return `202` plus `GET /payments/:id`. A retry with the same key returns that payment and, if still `created` because the process died before the call, submits once. It never creates a second payment.

Webhook: verify signature on the raw body, enforce a timestamp window, insert `event_id`, apply the transition only if it moves forward, post the journal only if the synchronous path did not already post it. Unique `payment_id` on the capture journal makes the two paths safe.

Reconciliation: import the settlement file into a staging table. Match on provider reference, amount, and currency. Classify unmatched rows. Automatic close is allowed only for “local `unknown`, Harbour captured, journal missing,” which posts the journal. A reversal in the settlement file creates a reversing journal and a case if the tenant has already withdrawn the available funds. That last case is the cost of crediting on capture. Offer the alternative: credit a pending balance, and move it to available on settlement. Ask which risk product wants. Do not hide the choice inside the schema.

Operability: metric for `unknown` age, alert when the oldest exceeds the reconciler interval, tenant-scoped rate limit on initiation, pool timeouts, and an audit log of journal ids rather than a mutable balance history.

**Weak version to avoid.** “The webhook updates the balance, and the API also updates the balance, and FIFO makes the events ordered, so the user is fine.” Two writers, no journal identity, and FIFO does not bind Harbour’s webhook to your API response.

---

## Mock assessment (90 minutes)

This is an original drill. It is not an Andela form. Sit it once, on paper or in an editor, without looking at the answer key. If you only read the key, you will recognise the bugs and still miss them in a fresh prompt.

**Scenario.** You join a team that runs a multi-tenant invoicing API in Node.js and TypeScript on PostgreSQL. Tenants create invoices. A tenant’s backend can call `POST /invoices/:id/mark-paid` when their customer pays the tenant outside your system. The call is supposed to be safe to retry. Last week a tenant reported another tenant’s invoice total in a `GET` response, once, under load. This week finance reported two invoices marked paid twice, with two ledger credits, after the caller timed out and retried.

You do not need to write a full service. You need to review, diagnose, design the fix, and answer two short questions.

### Time box

| Minutes | Task | Output |
| --- | --- | --- |
| 0–8 | Read and list assumptions and clarifying questions | Half a page. Do not start coding |
| 8–28 | Code review the handler below | Bugs, in severity order, each with the failure it causes |
| 28–48 | Explain the cross-tenant report using the evidence below | The mechanism, the fix, and the test |
| 48–78 | Design the reliable `mark-paid` path | States, transaction boundaries, retries, what you will not do |
| 78–90 | Two short answers | Event-loop question and TypeScript question |

### Code for the review (minutes 8–28)

```typescript
export async function markPaid(req: Request, res: Response): Promise<void> {
  const tenantId = req.body.tenantId as string;
  const invoiceId = req.params.id;
  const key = req.header("idempotency-key");

  const invoice = await pool.query("SELECT total FROM invoices WHERE id = $1", [invoiceId]);
  if (invoice.rows[0].status === "paid") {
    res.json(invoice.rows[0]);
    return;
  }

  await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [invoiceId]);
  await pool.query(
    "INSERT INTO credits (invoice_id, amount) VALUES ($1, $2)",
    [invoiceId, invoice.rows[0].total],
  );
  await pool.query("INSERT INTO idem (key) VALUES ($1)", [key]);
  res.status(200).json({ status: "paid" });
}
```

`invoices.status` exists. The `SELECT` does not retrieve it. `credits.invoice_id` is not unique. `idem.key` is not unique. The route has no authentication middleware in this file.

### Evidence for the incident (minutes 28–48)

One repository method:

```typescript
await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantFromToken]);
const rows = await client.query("SELECT id, total, tenant_id FROM invoices WHERE id = $1", [id]);
client.release();
```

`GET /invoices/:id` does not use that method. It uses `pool.query` with the id and no `set_config`. The token’s tenant is correct in application logs for the request that leaked. RLS is enabled and compares `tenant_id` to `current_setting('app.tenant_id')` with the missing-ok flag off. The role does not bypass RLS. A script that sets `app.tenant_id` in one `psql` session cannot see the other tenant. The leak is intermittent, only on the API, and more common under load. The pool size is 20. `markPaid` also uses `pool.query`.

### Short questions (minutes 78–90)

1. The PDF renderer runs on the API process with `fs.readFileSync` and a synchronous PDF library. Why do unrelated invoice reads slow down during renders, and what is the smallest architectural move?
2. The team says `req.body as { total: number }` validates the client payload because the project is TypeScript and `strict` is on. What do you tell them?

### Scoring

| Area | Excellent | Passing | Failing |
| --- | --- | --- | --- |
| Review | Orders findings by harm. Names the race, the missing status column in the read, the tenant source, partial writes, and idempotency order | Finds the race and the missing auth, misses one of the subtle bugs | Style comments, or “add a transaction” with no lock and no unique key |
| Incident | Explains session-scoped `set_config(false)` plus a second access path that never sets the tenant. Mentions why the script passes | Says “RLS is misconfigured” and proposes a second database immediately | Blames the JWT or proposes caching |
| Design | Commits intention and credit once, tenant-scoped unique idempotency key, states for retry, no external call inside a transaction. Mentions old and new code during release if they migrate | Has a unique key and a tenant predicate, hand-waves crash after credit | Relies on an in-memory set or “the client promised not to retry” |
| Short answers | Main thread blocked by sync CPU and sync disk; types are erased; shows a runtime check | Identifies both issues without the mechanism | Suggests a faster PDF library only, or says `strict` checks JSON |

Passing is 3 of 4 areas at passing or better, including the review. Excellent design with a failed review is not a pass. The review is where this assessment is decided.

---

## Mock answer key

Do not read this until you have written your own answers.

### Assumptions you should have listed

- `mark-paid` records a payment the tenant already collected. It is not a Harbour charge. There is still a double-credit bug, because the ledger entry is yours.
- The authenticated tenant must come from the token. The body field is untrusted.
- Retries use the same idempotency key for the same invoice and amount.
- Two different invoices may not share a key; the key is for one operation.
- A crash can happen on any line. Old code and new code may overlap during deploy.

Clarifying questions: Is a partial payment in scope? Should a repeated mark-paid of an already-paid invoice return the original credit id? Is `total` minor units? Who may mark paid, the tenant admin or a machine credential?

### Review, in severity order

1. **Any tenant, any invoice.** `tenantId` is taken from the body and then ignored. The updates use only `invoiceId`. Combined with no auth in this file, this is a direct object reference. Even with auth, the query needs `WHERE id = $1 AND tenant_id = $2`.
2. **Double credit under retry and under concurrency.** Status is checked with a column the `SELECT` did not fetch, so `invoice.rows[0].status` is `undefined`, the comparison is false, and the early return never runs. Even if the column were selected, two transactions can both see `unpaid` and both insert a credit. `idem.key` is inserted last, with no unique constraint, so it neither prevents the race nor survives a crash in the right order.
3. **Partial write.** The status update and the credit are separate autocommit statements. A crash leaves `paid` with no credit, or, if reordered by a later editor, a credit with status still `unpaid`. There is no transaction.
4. **Wrong success behaviour.** The early-return path, once the status bug is fixed, returns the invoice with no proof it is the same operation. A different amount under the same key would still look like success. There is no request hash.
5. **The SELECT can return zero rows.** `rows[0].total` throws. Express 4 then has an unhandled rejection if nothing catches this async function. The client hangs or the process exits, depending on Node’s unhandled-rejection mode and whether a listener exists.
6. **Response code.** First success and replay both want a stable code. `200` for a create-like action is acceptable if documented; `201` on first success and `200` on replay is also fine. The bug is that they are not distinguished and a failure to credit still returns nothing useful.

`SELECT` missing `status` is the kind of bug that looks like a typo and defeats the author’s idempotency plan entirely. Mention it. Reviewers who only talk about architecture miss it.

### Incident

`set_config(..., false)` stores the tenant for the whole session. `release()` puts that connection back in the pool still carrying the previous tenant. That matches “intermittent” and “under load”: it only happens when the next checkout is a physical connection a prior request already configured. A `psql` script uses one session and always sets the value itself, so it never observes pool reuse.

`GET /invoices/:id` uses `pool.query` and never sets the tenant. On a fresh connection, `current_setting('app.tenant_id')` throws, because the missing-ok flag is off. On a reused connection it does not throw. It silently applies the previous tenant’s policy, which is how North’s request returns South’s total while the log line shows North’s token. The repository method would have overwritten the setting before reading, so a test that only calls that method stays green.

`markPaid` has the same raw `pool.query` path, so it can update a row the previous tenant’s policy can see. An unset connection errors rather than returning every row. Say that distinction. An owner or `BYPASSRLS` pool would ignore the policy entirely; the evidence says this role does not, so mention it as a check and do not make it the finding.

Fix: one data-access path, `set_config(..., true)` inside a transaction, and `RESET` or `DISCARD ALL` before release so a later session-level `SET` cannot survive. Regression test: set South, release, check the connection out, run the GET query, expect an error or zero rows rather than South’s invoice.

### Design

Invariant: for one tenant, one idempotency key results in at most one credit for one invoice, and the invoice ends `paid` if and only if that credit exists.

- Authenticate. Load membership. Ignore `req.body.tenantId`.
- Parse the body at runtime. Reject a missing key with `400`.
- In one transaction: lock the invoice `WHERE id = $1 AND tenant_id = $2 FOR UPDATE`. Insert into `idem (tenant_id, key, request_hash, response)` with a unique primary key. On conflict, compare the hash and return the stored response.
- If the invoice is already `paid` and the key is new, return `409` rather than inserting a second credit. If it is the same key, return the stored response.
- Insert the credit with `UNIQUE (invoice_id)` where this product allows one payment per invoice, set status to `paid`, store the response JSON, commit.
- No Harbour call on this path. If a later version adds one, it does not go inside this transaction.
- Migration: add the unique constraints in an expand step. Clean existing duplicate credits before adding the unique index, or the migration fails. Old code that still inserts without the tenant column cannot run once `tenant_id` is `NOT NULL`. Sequence the deploy: new code writes the new shape, then add the constraint.

State the crash: if you crash before commit, the lock releases and the key insert rolls back, so a retry starts clean. If you crash after commit, the retry hits the unique key and returns the stored response. That is the boundary.

### Short answers

1. `readFileSync` and a synchronous PDF library run on the main thread. The event loop cannot service invoice queries on that process until the render returns. A faster library that is still synchronous only shrinks the stall. The smallest real move is to stop rendering in the API process: a queue plus a worker, or `worker_threads` if you must stay in-process and you accept the memory cost. The API only enqueues and reads status.
2. `as` asserts a type the compiler cannot check. `strict` does not inspect HTTP bodies. At runtime the payload is ordinary JSON. Validate with a runtime parser, then use the returned typed value. A discriminant or a `total` field that is a string will otherwise reach SQL and coerce in surprising ways.

### What a “pretty good” paper still loses marks for

- “Wrap the three queries in a transaction” without a unique key or a lock. The double credit remains.
- “Turn on RLS” as the incident fix when RLS is already on and the GET path can still inherit session state.
- Designing a new microservice for credits before repairing the single-statement invariant.

---

## Two-day schedule

You already know Node, TypeScript, AWS, and multi-tenant shapes. The hours below bias toward the failure modes you asked to deepen, without pretending the assessment is a fintech exam.

### Day 1 — assessment core

| Block | Hours | What to do |
| --- | --- | --- |
| 1 | 1.5 | Sections 1 and 2. Close the guide and explain, out loud, why a timeout is not a failure, why an `unhandledRejection` listener changes process lifetime, and why `as` does not validate JSON |
| 2 | 2.0 | Section 3. On paper, write the overspend race, then the `FOR UPDATE` transfer with lock ordering. Write the conditional `UPDATE`. Say what Read Committed allows |
| 3 | 1.5 | Section 4. Draw outbox plus inbox for “invoice paid → send email.” Mark the arrow that can still duplicate. Do not draw a second bus |
| 4 | 1.5 | Code review exercises A, B, and C, timed at 15 minutes each, before the answers. Score yourself against the answer section |
| 5 | 1.0 | Scenario 2 only. Write the fix without looking. Then read the solution and note what you skipped |

Stop after this if you are tired. A clean day-1 recall is worth more than a rushed fintech pass.

### Day 2 — tenancy, money, and a full sitting

| Block | Hours | What to do |
| --- | --- | --- |
| 1 | 1.5 | Section 5. Explain shared tables, the `set_config` leak, owner bypass, and MySQL’s lack of RLS. Do scenario 1 |
| 2 | 2.0 | Section 6. Draw the three states for a timeout. Post the two journals (capture and settlement) by hand in minor units. Say why the refund is a new journal |
| 3 | 1.0 | Section 7. Answer the seven-service question in ten minutes, then compare |
| 4 | 1.5 | Mock assessment, timed, unseen answers. Mark with the rubric |
| 5 | 1.0 | Revision sheet. Re-do only the mock items you failed, from memory |

If the invitation arrives and you have one evening: do code reviews A and C, the overspend question in section 3, scenario 1, and the revision sheet. Add section 6 only if the interview, not the paper, is the next session.

---

## Final revision sheet

**Node.** One main thread. Async I/O waits in the kernel; `JSON.parse`, `readFileSync`, and `pbkdf2Sync` do not. `nextTick` and Promise microtasks run before the loop continues. Express 4 does not catch async rejections. Current Node crashes on an unhandled rejection only if nobody listens. `process.exit()` drops pending I/O. Drain on `SIGTERM`, then `pool.end()`.

**Types.** Erased at runtime. `as` is not validation. Parse `unknown`. Discriminated unions need a runtime discriminant. `typeof null === "object"`.

**HTTP.** Authn is the principal. Authz is the action, the tenant, and the object. Tenant comes from the verified credential or a membership lookup. Idempotency is unique on `(tenant, key)`, stores a request hash, and is written in the same transaction as the effect. `429` is a limit. `409` is a conflict. `422` or `400` is a business rule. `500` means you failed.

**PostgreSQL.** Default is Read Committed. Read Uncommitted does not give dirty reads here. Repeatable Read is stronger than the standard’s minimum. Serializable aborts with `40001`; deadlocks abort with `40P01`; retry the whole transaction. `SELECT` then `UPDATE` without a lock double-spends. `FOR UPDATE` in id order, or one conditional `UPDATE`. `int8` comes back as a string. Money is minor units or `numeric`, never float. Pool slots times tasks must fit under `max_connections`. Do not hold a transaction across HTTP.

**Delivery.** At-least-once is the default assumption. SQS FIFO dedup is 5 minutes and does not stop a second receive after visibility timeout. Outbox: business row and event row commit together; the publisher can still send twice; the consumer inbox must be unique and commit with the effect. A saga compensation is a new operation. A circuit breaker does not know whether Harbour captured.

**Tenancy.** Shared tables need a predicate on every path, plus RLS as a backstop, plus tests. `set_config(name, value, true)` inside a transaction. Session `SET` leaks through the pool. Owner and `BYPASSRLS` skip policies unless you have removed that access; `FORCE` catches the owner and not `BYPASSRLS`. Cache keys, jobs, and object prefixes need the tenant too. MySQL will not save you with RLS.

**Payments.** Provider state, internal state, and ledger state are different. Timeout means `unknown`, same provider key, no second payment. Webhooks: raw-body signature, timestamp window, unique `event_id`, no backward transition, credit once via a unique journal. Settlement is not capture. Journals sum to zero and are immutable. Reversals are new journals. A database transaction cannot include Harbour’s commit.

**Design.** Invariants, then failure in the middle, then the tool. One modular service while one team needs a transaction across payment and ledger. Split email and rendering first. Expand/contract migrations. Rollback does not uncapture a charge or restore a dropped column. SLO the age of `unknown`, not only CPU.

**While you are in the room.** State the boundary. Name the race. Say what you would retry, what you would reconcile, and what you would refuse to build in the first release.
