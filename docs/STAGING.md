# Release and staging checklist

## Isolation
- Deploy this development branch only to an independent staging project. Do not merge main or use production credentials/data. Configure a separate MongoDB database (replica set/Atlas required for checkout transactions), separate Redis instance, Cloudinary staging account or isolated cloud, and Google OAuth test configuration.
- Use Node 22. Set NODE_ENV=production for HTTPS staging, CLIENT_URL to exact frontend origin(s). Use a same-origin reverse proxy or same-site subdomains for SameSite=Lax cookies; unrelated frontend/backend domains can break cookies. Test with actual browser cookie behavior. Vercel integration should use the exported Express app at src/index.js; verify routing for /api/* and actual readiness before relying on it.
- Set variables from .env.example in deployment settings, never commit them. JWT_SECRET preserves legacy mobile customer sessions only when intentionally migrating; staging uses its own. JWT_ACCESS_SECRET must be distinct and >=32 bytes. REDIS_URL uses TLS in production. Keep MFA_ENCRYPTION_KEY stable for enrolled admins. Enrollment token is restricted to authorized operators.
- Run npm run check:env locally or with staging environment loaded. It checks values/format only, not credentials or connectivity.
- Set CLIENT_URL precisely; no wildcard. Validate proxy IP behavior for rate limiting on actual host; do not enable unrestricted trust proxy. Keep Redis generation/session data persistent and avoid eviction that can resurrect revoked sessions.
- Ensure MongoDB indexes are created before accepting traffic, particularly unique user email/username/phone/googleSub, order number and checkout key, and order cost/movement keys. Verify duplicate legacy records before index creation. Back up before migration.
- Confirm provider plan permits commercial usage and intended traffic. Check resource limits and configure monitoring.

## CI and staging acceptance
- Run npm ci and npm test with TEST_MONGO_URI and TEST_REDIS_URL pointing exclusively to disposable test databases. Tests create random isolated Mongo databases and drop them.
- Run npm audit --omit=dev --audit-level=high; review advisory details, do not auto-upgrade blindly.
- Verify /api/health/live and /api/health/ready return 200 on staging.
- Browser: register, sign in by email/phone, Google sign-in with real client ID, refresh/logout, guest cart merge, checkout with idempotency key, COD, cancellation, and delivery approval. Test cookies on actual deployed domains.
- Admin: enroll TOTP in staging using authorized operator token, verify login/replay rejection, create courier, assign order, report and approve; verify customer view. Verify product and banner upload/replacement in staging Cloudinary, and notifications with test devices.
- Verify dates near Cairo cutoff and daylight-saving changes. Review legacy mobile customer compatibility and intentional admin bearer restriction.
- Verify delivery area settings before launch. Pilot areas are not automatically narrowed from legacy city defaults.
- Reconcile opening physical inventory, purchases, spoilage, estimated COGS and expense records. Finance figures are provisional until true inventory costing is implemented. Freeze costs only after purchase data reviewed.
- Run STAGING_BASE_URL=https://your-staging-host.example CONFIRM_STAGING=yes npm run test:staging on an authorized staging endpoint at gradual rates, measure p95, errors, DB/Redis quotas and cold starts. Do not run destructive or load tests on production. The CI release smoke uses 120 local requests and 12 concurrent workers; it is not an Internet-scale capacity test.
- Record audit and test results; fix issues before approval. No automatic production deployment. Rollback plan: retain previous deployment and backups; rehearse compatibility of schema/index changes.

## Outstanding external acceptance
Real Google, Cloudinary, staging MongoDB/Upstash/hosting, browser cookies, proxy-aware rate limits, real network load and mobile end-to-end compatibility need an authorized environment. No production readiness claim until these are verified. No actual credentials belong in this file.
