# Performance benchmark

Run GitHub Actions "Backend performance benchmark" on develop/lotta-web-backend. It uses disposable runner-local MongoDB replica set and Redis, full Express application, and 300 synthetic products plus 1000 synthetic customers. No production data or external notifications. Test credentials and session tokens are generated locally and removed; do not upload fixtures.

1. Ten simultaneous password logins (below the per-IP rate limit; not a sustained login throughput test).
2. Sixty unique customers compete for 30 units, each submitting two requests with the same idempotency key. Database assertions require exactly 30 orders, 30 unique customers and numbers, zero remaining stock, and rejected carts preserved. HTTP 409 for insufficient stock is expected, not a server failure.
3. Mixed public catalog, search, categories, settings and authenticated cart reads at 10, 50, 100, 250, 500 and 1000 distinct virtual users for 15 seconds each, with a 0.5s think time. Stop escalation when a threshold fails. Record throughput, p95 latency and errors. Read target p95 <500ms overall and per endpoint, error rate <1%; checkout and login p95 <2s. These are initial smoke gates, not production SLAs.

The runner shares resources between k6, MongoDB, Redis and the API; its results cannot be used as Vercel/Atlas/Upstash capacity figures. The checkout counter and hot product row intentionally stress transaction conflicts. A failed gate requires diagnosis and retest, not raising the threshold.

For authorized staging: use separate test project/data, same-site HTTPS and provider plans, monitor p95, p99, CPU, memory, MongoDB connections/queries, Redis requests and serverless cold starts. Repeat successful CI levels on staging gradually, and run a one-hour soak only after lower levels pass and quotas permit. Initial business target <0.1% unexpected errors requires longer runs and larger samples. Avoid load tests against production; never disable rate limits to simulate login. k6 VUs are active simulated sessions, not request-per-second counts.

Optimize from measured evidence: inspect query execution plans and index use, avoid repeated expensive counts or unbounded reads, evaluate cache of non-sensitive catalog metadata with expiry/invalidation, preserve fresh stock/prices at checkout, tune connection pool per deployment, and keep post-commit tasks reliable. Do not cache private customer/admin responses publicly.

## Recorded baseline
Run 45631717249: checkout p95 3940 ms, 29.28 HTTP requests/s, invariants passed. Run 45632105589 after local transaction admission gate: checkout p95 758.47 ms, 154.17 HTTP requests/s, all invariants passed. Read benchmark at 250 VUs: 486.95 HTTP requests/s, p95 22.46 ms, 0/7500 unexpected errors. This is a short runner-local benchmark, not a capacity guarantee. The gate is per instance; distributed load remains to be verified.

## Read throughput investigation
Run 45632570697: at 500 VUs, 14,582 requests, 940.8 requests/s, overall p95 90.60 ms and no errors; at 1000 VUs, 17,472 requests, 1106.84 requests/s, overall p95 978.79 ms and cart p95 1040 ms, no errors, latency thresholds failed. Run 45633409007 after parallel cart/auth reads: at 500 VUs, overall p95 417.09 ms, cart p95 508.09 ms, 11,476 requests, no errors; escalation stopped. Runner variability means the first successful 500-VU result is not a stable capacity guarantee.

The subsequent cart GET uses one indexed aggregation to join the caller's cart to current active products, previous-order eligibility and pricing settings, without caching prices, stock or personal data. Mutations keep optimistic concurrency, checkout still validates authoritative data in the transaction. Hidden items are filtered on reads and may be removed on subsequent cart mutations. Retest against the identical workload before changing thresholds. For a longer soak, start with 5–10 minutes below the measured capacity; pre-seeded access cookies expire after 15 minutes, so a one-hour authenticated test requires a realistic refresh plan and should not bypass production rate limits.
