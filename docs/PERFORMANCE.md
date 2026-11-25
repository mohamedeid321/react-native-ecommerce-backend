# Performance benchmark

Run GitHub Actions "Backend performance benchmark" on develop/lotta-web-backend. It uses disposable runner-local MongoDB replica set and Redis, full Express application, and 300 synthetic products plus 250 synthetic customers. No production data or external notifications. Test credentials and session tokens are generated locally and removed; do not upload fixtures.

1. Ten simultaneous password logins (below the per-IP rate limit; not a sustained login throughput test).
2. Sixty unique customers compete for 30 units, each submitting two requests with the same idempotency key. Database assertions require exactly 30 orders, 30 unique customers and numbers, zero remaining stock, and rejected carts preserved. HTTP 409 for insufficient stock is expected, not a server failure.
3. Mixed public catalog, search, categories, settings and authenticated cart reads at 10, 50, 100 and 250 virtual users for 15 seconds each, with a 0.5s think time. Stop escalation when a threshold fails. Record throughput, p95 latency and errors. Read target p95 <500ms, error rate <1%; checkout and login p95 <2s. These are initial smoke gates, not production SLAs.

The runner shares resources between k6, MongoDB, Redis and the API; its results cannot be used as Vercel/Atlas/Upstash capacity figures. The checkout counter and hot product row intentionally stress transaction conflicts. A failed gate requires diagnosis and retest, not raising the threshold.

For authorized staging: use separate test project/data, same-site HTTPS and provider plans, monitor p95, p99, CPU, memory, MongoDB connections/queries, Redis requests and serverless cold starts. Progress to 500/1000 VUs and a one-hour soak only after lower levels pass and quotas permit. Initial business target <0.1% unexpected errors requires longer runs and larger samples. Avoid load tests against production; never disable rate limits to simulate login. k6 VUs are active simulated sessions, not request-per-second counts.

Optimize from measured evidence: inspect query execution plans and index use, avoid repeated expensive counts or unbounded reads, evaluate cache of non-sensitive catalog metadata with expiry/invalidation, preserve fresh stock/prices at checkout, tune connection pool per deployment, and keep post-commit tasks reliable. Do not cache private customer/admin responses publicly.
