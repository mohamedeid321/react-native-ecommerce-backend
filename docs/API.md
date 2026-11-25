# Lotta Web API — development contract

Base path: /api. JSON unless multipart is specified. All dates for business days are YYYY-MM-DD in Africa/Cairo. Monetary amounts are EGP numbers. Read the deployed response contract before frontend release; this is a route reference, not a generated OpenAPI schema.

## Browser authentication
Use fetch credentials: "include" on requests. For mutations send X-Lotta-CSRF: 1 and an exact allowed Origin (the browser supplies Origin). Do not put JWTs in localStorage. Access cookie lasts 15 minutes; refresh is an opaque server-rotated cookie, absolute Redis session lifetime 7 days. Single-flight refresh across tabs is important: reusing a rotated refresh credential revokes its session. On 401 try refresh once then sign in; 403 is not a refresh loop. Never send admin credentials or enrollment tokens to logs.

| Method | Route | Input / behavior |
|---|---|---|
| POST | /auth/web/register | username, email, phone, password (12+ chars, <=72 bytes) |
| POST | /auth/web/login | identifier (email or Egyptian phone), password, code for admin |
| POST | /auth/web/google | credential (Google ID token) |
| POST | /auth/web/google/link | credential, password; signed-in customer |
| POST | /auth/web/complete-profile | phone; signed-in account without phone |
| GET | /auth/web/me | current user |
| POST | /auth/web/refresh | rotate cookies, no token in body |
| POST | /auth/web/logout | revoke session and clear cookies |
| POST | /auth/web/logout-all | revoke web sessions for account |
| POST | /auth/web/admin/mfa/enroll | email, password, enrollmentToken; returns otpauth URI |
| POST | /auth/web/admin/mfa/confirm | same + code |
| POST | /auth/register, /auth/login | legacy mobile customer bearer contract; migration deferred |

Phone is normalized but not verified. Admin requires MFA-verified web session. Courier uses web login. Legacy bearer tokens cannot access admin or courier permissions.

## Public catalog & settings
| Method | Route | Input |
|---|---|---|
| GET | /products | page, limit, category, sort=price_asc/price_desc |
| GET | /products/search | q |
| GET | /products/recommendations | public recommendations |
| GET | /products/category/:category | category slug |
| GET | /products/:id | public product |
| GET | /categories | active categories |
| GET | /settings | deliveryFee, freeDeliveryThreshold, firstOrderFree, cutoffHour, acceptingOrders, deliveryAreas; nextDeliveryDate |
| GET | /banners | active scheduled banners |
| GET | /health/live | process liveness |
| GET | /health/ready | Mongo/Redis readiness |

## Customer
| Method | Route | Input |
|---|---|---|
| GET | /cart | server-priced cart |
| POST | /cart | productId, quantity |
| PUT | /cart/:productId | quantity |
| DELETE | /cart/:productId | remove line |
| DELETE | /cart | clear cart |
| POST | /cart/merge | items [{productId, quantity}], returns cart and adjustments |
| GET | /wishlist | list |
| POST/DELETE | /wishlist/:productId | add/remove |
| GET | /delivery-info | saved address |
| PUT | /delivery-info | city, neighborhood, building, apartment, floor, street?, landmark?, phone1, phone2? |
| POST | /orders | empty JSON, Idempotency-Key header 16–128 alphanumeric/underscore/hyphen mandatory for web |
| GET | /orders/my | page, limit |
| GET | /orders/:id | own order or admin |
| PATCH | /orders/:id/cancel | cancel before dispatch |
| GET | /notifications | list |
| POST | /notifications/token | token, platform |
| POST | /notifications/token/remove | token |
| POST | /notifications/read-all | mark read |
| POST | /notifications/:id/read | mark one |

Cart stores product IDs and quantities; merge takes maximum quantity to make retries safe. Checkout reads server prices, stock and delivery policy, requires phone for web and serviceable address, uses COD and Mongo transaction. Same key replays existing order; use a new key only for a new checkout. Closing store does not prevent retrieval of a previously placed idempotent order. Orders contain historical price snapshots.

## Admin catalog, settings, banners
| Method | Route | Input |
|---|---|---|
| GET | /products/admin | page, limit, category, visibility; includes purchasePrice |
| POST | /products | multipart name, description, category, price, discount?, purchasePrice?, stock?, unit?, image, detailImage? |
| PUT | /products/:id | multipart metadata / images |
| PATCH | /products/:id/visibility | isActive boolean |
| PATCH | /products/:id/featured | toggle featured |
| DELETE | /products/:id | soft hide |
| GET | /categories/admin | includes hidden |
| PUT | /categories/:slug | name, isActive, sortOrder |
| PATCH | /settings | partial deliveryFee, freeDeliveryThreshold, firstOrderFree, cutoffHour, acceptingOrders, deliveryAreas [{city, neighborhoods:[number]}] |
| GET | /banners/admin | page |
| POST | /banners | multipart title, alt, image, subtitle?, targetType?, targetValue?, sortOrder?, isActive?, startsAt?, endsAt? |
| PATCH | /banners/:id | partial metadata JSON |
| PUT | /banners/:id/image | multipart image |
| DELETE | /banners/:id | archive |

Banner targetType = none/product/category/offers; targetValue required for product/category, empty otherwise. Scheduled dates use ISO timestamps with offsets. Image limit 2 MB. Category hiding hides the category listing; individual products must be hidden separately.

## Admin orders and courier
| Method | Route | Input |
|---|---|---|
| GET | /orders | scope=current/finished/all, status, date, overdue=true, courierId, page, limit |
| PATCH | /orders/:id/status | status preparing/out_for_delivery/cancelled per valid transitions |
| GET | /orders/couriers | couriers |
| POST | /orders/couriers | username, email, phone (+20 format), password |
| PATCH | /orders/couriers/:id/disabled | disabled boolean |
| PATCH | /orders/:id/assign | courierId, routeSequence? |
| GET | /orders/courier/my | courier only; date, overdue, status, page |
| PATCH | /orders/:id/report-delivered | courier only, collectedAmount equal to order total |
| PATCH | /orders/:id/approve-delivery | admin; finalize delivered/paid |

Courier cannot approve. Admin cannot bypass report with generic status. Route sequence is manual. Partial COD collection not supported.

## Admin operations and reporting
| Method | Route | Input |
|---|---|---|
| GET | /admin/dashboard | date |
| GET | /admin/customers | q, disabled, page, limit |
| GET | /admin/customers/:id | page, limit |
| GET | /stats | legacy range=7/30 |
| GET | /purchases | date |
| PUT | /purchases/:date/:productId | quantity, unitCost, supplier?, notes? |
| GET | /inventory | date (cumulative ledger) |
| GET | /inventory/movements | date, product?, page |
| POST | /inventory/movements | Idempotency-Key; date?, product, type, quantity, unitCost?, reason |
| GET | /finance | range=day/week/month/custom, from, to |
| POST | /finance/orders/:id/freeze-cost | freeze estimated order COGS |
| GET | /finance/expenses | range, from, to, page |
| POST | /finance/expenses | date?, category, amount, description |
| PATCH | /finance/expenses/:id/void | void audited expense |

Inventory types: opening, adjustment_in, adjustment_out, waste. Product.stock is available-to-order, separate from ledger physical balance. Physical balance includes in-transit not yet reported. Purchase totals are one editable row per product/day. Cost freeze is manual and estimates same scheduled-day purchase cost; missing COGS or waste valuation returns null profit. No FIFO/weighted-average accounting, no certified accounting report. Expense categories transport/packaging/labor/rent/utilities/marketing/other.

## Error handling
400 invalid input; 401 unauthenticated/expired; 403 authorization/CSRF; 404 not found; 409 conflict/insufficient stock; 413 too-large JSON; 429 rate limit; 503 service unavailable. Most responses use success/message, some legacy routes have different shapes. Do not expose server internals or private purchase costs in client UI.
