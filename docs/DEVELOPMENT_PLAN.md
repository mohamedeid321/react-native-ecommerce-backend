# Development plan
1. Audit existing backend and mobile auth contract; establish baseline tests.
2. Authentication: cookies, Redis sessions, rotation, CSRF, rate limiting, phone login, Google OIDC, logout, me, admin MFA.
3. Users and delivery roles.
4. Products, categories, visibility, cost estimates.
5. Guest cart merge, checkout, pricing, COD and transactions.
6. Order scheduling, status/date filters, overdue orders.
7. Delivery assignment, route sequence, delivery report and admin approval, cash reconciliation.
8. Daily purchase requirements, actual purchases and variance.
9. Inventory and financial reports.
10. Settings, banners, delivery areas, notifications.
11. OpenAPI, automated integration tests, load testing, staging and migration.
No production deployment or main merge until review. Separate test MongoDB and Redis credentials required. Google OAuth client configuration required for end-to-end Google login.
