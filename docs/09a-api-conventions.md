# 09a — API: Conventions, Error Catalogue, Auth, Student Endpoints

**Purpose.** Define the HTTP contract that the Next.js frontend and the FastAPI backend build against: global conventions (versioning, auth, errors, pagination, idempotency, rate limits), the complete error-code catalogue for the whole API (partner, payment and admin codes included so there is one list), shared response schemas, and every endpoint for authentication, /me, /config/public, /requests, notifications and push subscriptions.

**Depends on:** 01-brain.md (roles, statuses, tiers, conventions).
**Companion files:** 09b (partner, uploads, payments, webhooks), 09c (admin), 10-realtime.md (SSE events that mirror these responses), 11-payments.md (what happens behind payment objects).
**Business rules referenced here:** (cancellation refund matrix, dispute window, strikes) are owned by 04 business rules; the status machine by 05 state machine.

## Key assumptions
- All paths below are relative to `/api/v1`. Caddy serves the API and Next.js on one origin (`https://app.<domain>`), so there is no CORS in production; dev enables CORS for `http://localhost:3000` only.
- The access token travels in `Authorization: Bearer`, the refresh token in an `httpOnly` cookie. The access token lives only in JS memory (never localStorage).
- Endpoints marked (additive) are not in the shared contract list; they only add to it and nothing existing depends on them.
- Money is always integer paise in fields suffixed `_paise`. Timestamps are UTC ISO-8601 with `Z`. Calendar dates with no time (`clean_date`) are `YYYY-MM-DD` in Asia/Kolkata. IDs are UUID v7 strings.

---

## 1. Conventions

### 1.1 Versioning
- URL major version `/api/v1`. Additive changes (new optional request fields, new response fields, new endpoints, new enum values for responses the client must tolerate) never bump the version. Clients MUST ignore unknown response fields and treat unknown enum strings as "other".
- Breaking changes go to `/api/v2`; v1 keeps running at least 90 days with `Deprecation: true` and `Sunset: <http-date>` headers.
- Every response carries `X-API-Version: 1` and `X-Request-ID: <uuid>` (echoes an inbound X-Request-ID if it is a valid UUID, else generated). Support/debugging always starts from the request id.

### 1.2 Transport
- Requests and responses are `application/json; charset=utf-8`, except webhooks (provider formats, see 09b) and CSV exports (09c). Uploads go directly to object storage via signed URLs (09b).
- Response compression: gzip/zstd by Caddy for everything except `text/event-stream`.
- Request body limit 64 KB for JSON endpoints (`PAYLOAD_TOO_LARGE`). Unknown JSON fields in requests are rejected (`VALIDATION_ERROR`, extra_forbidden) so typos never silently pass.
- Success statuses: 200 read/update, 201 create (with Location header), 202 accepted-for-async-work, 204 no content.

### 1.3 Authentication
| Token | Format | Lifetime | Where |
|---|---|---|---|
| Access | JWT HS256 (or EdDSA), claims sub (user id), role (student\|partner\|admin), kind (user\|admin), amr (["otp"] or ["pwd","totp"]), sid (refresh-family id), iat, exp | 15 min | `Authorization: Bearer <jwt>`; returned in JSON bodies of verify/refresh/totp |
| Refresh | 256-bit random, stored hashed in refresh_tokens (one row per token, family_id, replaced_by) | 30 days (students/partners); admin sessions are capped by admin_session_hours (default 12) | `httpOnly` cookie `cl_rt`, Secure, SameSite=Lax, Path=/api/v1/auth |

- `role` in the JWT is a hint for routing only. Authorisation is re-checked against the DB for anything partner-specific (`partner_status`, `is_online`) because those change faster than 15 minutes.
- Refresh rotation: every `POST /auth/refresh` issues a new refresh token and marks the old one `replaced_by`. Presenting an already-rotated token: within a 10 s grace window (two tabs racing) the server returns a fresh access token and does not set a new cookie; after the grace window the whole family is revoked and the caller gets `REFRESH_TOKEN_REUSED`.
- CSRF: the only cookie-authenticated endpoints are `/auth/refresh` and `/auth/logout`. They require the header `X-CL-CSRF: 1` (a custom header cannot be sent cross-site without CORS preflight, which we never allow) in addition to `SameSite=Lax`.
- Student/partner tokens have `kind=user`; admin tokens have `kind=admin` and must carry amr containing totp. A `kind=user` token on `/admin/*` is `FORBIDDEN`; a partner-only endpoint called by a plain student is `PARTNER_NOT_APPROVED`.
- Auth column legend: public (none), user (any logged-in student/partner), student (same as user; partners are students too), partner (approved partner; extra checks listed per endpoint), admin.

### 1.4 Error format
Always, for every non-2xx (including 401/403/404/405/413/429/5xx):
```json
{
  "error": {
    "code": "REQUEST_ALREADY_TAKEN",
    "message": "Another partner accepted this request a moment ago.",
    "details": {}
  }
}
```
- `code` is UPPER_SNAKE and is the only thing clients branch on.
- `message` is English, safe to show to end users, never contains internals.
- `details` is `{}` or code-specific data (documented in the catalogue).
- Validation errors (`422 VALIDATION_ERROR`) use `details.fields`:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": {
      "fields": [
        {"path": "items[0].quantity", "rule": "greater_than_equal", "message": "Must be at least 1."},
        {"path": "room", "rule": "missing", "message": "Field required."}
      ]
    }
  }
}
```
- `path` uses dotted/bracket JSON path into the request body (or query.limit, path.id). Rules are Pydantic v2 error types, snake_case.
- 5xx never leak stack traces; the body is `INTERNAL_ERROR` and the request id header is the lookup key in logs.

### 1.5 Pagination
- GET collections accept `limit` (default 20, min 1, max 100) and `cursor` (opaque base64url string; clients never parse it).
- Response: `{ "items": [...], "next_cursor": "<opaque>|null" }`.
- Keyset pagination over `(sort_key, id)`; because ids are UUID v7 the default ordering is newest-first by id. Invalid/expired cursor: `422 VALIDATION_ERROR` with path: `query.cursor`. Collections never return a total count (use dashboard endpoints for counts); where a UI badge needs one it is a separate field (e.g. `unread_count`).

### 1.6 Idempotency
- Header `Idempotency-Key: <opaque string, 8-64 chars [A-Za-z0-9_-]>`; clients use a UUID v4 generated when the user opens the form.
- Required (`IDEMPOTENCY_KEY_REQUIRED` 400 if missing) on:
  - `POST /requests`
  - `POST /requests/{id}/payment/retry`
  - `POST /partner/payouts`
  - `POST /admin/requests/{id}/refund`
  - `POST /admin/payouts/{id}/mark-paid`
- Accepted on all other money-affecting POSTs:
  - `/requests/{id}/cancel`
  - `/admin/requests/{id}/cancel`
  - `/admin/requests/{id}/override`
  - `/admin/disputes/{id}/resolve`
  - `/partner/requests/{id}/complete`
  - Ignored elsewhere.
- Scope: `(user_id, method, path, key)`. Stored in Redis for 24 h as `{request_hash, status_code, response_body}` (plus Postgres unique constraint where duplicate costs money).
- Same key + same body hash: replay stored response with header `Idempotent-Replayed: true` (replays 4xx too; 5xx not stored).
- Same key + different body: `422 IDEMPOTENCY_KEY_REUSED`.
- Same key while running: `409 IDEMPOTENCY_IN_PROGRESS` (Retry-After: 1).

### 1.7 Rate limits
Redis sliding-window counters (Lua script, key `rl:{bucket}:{subject}`).
429 responses carry `Retry-After` (seconds) and `error.details.retry_after_seconds`. Allowed responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on marked `*`.

| Bucket | Limit | Subject |
|---|---|---|
| otp_request* | 5 / hour plus 60 s resend cooldown | normalised email |
| otp_request_ip | 20 / hour | client IP |
| otp_verify | 10 / 15 min | IP; plus 5 wrong attempts per OTP |
| refresh | 30 / min | IP |
| admin_login | 5 / 15 min; account locks after 10 failures in 30 min (ADMIN_ACCOUNT_LOCKED, 30 min) | IP+email |
| request_create* | 10 / hour | user |
| accept* | 30 / minute | partner |
| upload_sign | 40 / hour | user |
| export | 6 / hour | admin |
| default_auth | 300 / minute | user (excludes /events/stream) |
| default_public | 60 / minute | IP (/config/public, /auth/*) |

Client IP from `X-Forwarded-For` set by Caddy. When Redis is down: fail open for reads, fail closed for OTP and login.

### 1.8 Privacy rules baked into responses
- Another user's email/phone is never returned except:
  - student sees assigned partner's `first_name` and `phone` while request is `ACCEPTED`/`PICKED_UP`;
  - partner sees student's `first_name`, `phone`, `room` and `note` only after accepting (pool shows block only).
- Handoff code values returned only to owning student, never to partners or in lists, notifications or SSE payloads.
- Media URLs are short-lived signed GET URLs (10 min).

---

## 2. Error-code catalogue (whole API)

### 2.1 Generic
- `BAD_REQUEST` (400): Malformed JSON or wrong content type body.
- `VALIDATION_ERROR` (422): Schema or business-field validation failed. `details.fields[]`.
- `UNAUTHENTICATED` (401): No/invalid credentials on a protected endpoint.
- `TOKEN_EXPIRED` (401): Access token expired. Client calls `/auth/refresh` once, then retries.
- `TOKEN_INVALID` (401): Bad signature/claims or revoked session (sid). Client must re-login.
- `FORBIDDEN` (403): Authenticated but not allowed (wrong role/owner).
- `NOT_FOUND` (404): Resource missing or not visible to caller.
- `METHOD_NOT_ALLOWED` (405).
- `CONFLICT` (409): Generic state conflict.
- `IDEMPOTENCY_KEY_REQUIRED` (400): Required header missing.
- `IDEMPOTENCY_KEY_REUSED` (422): Same key, different body.
- `IDEMPOTENCY_IN_PROGRESS` (409): First call still executing.
- `PAYLOAD_TOO_LARGE` (413): JSON body over 64 KB.
- `UNSUPPORTED_MEDIA_TYPE` (415): Non-JSON body on a JSON endpoint.
- `RATE_LIMITED` (429): `retry_after_seconds`, `bucket`.
- `INTERNAL_ERROR` (500): Unexpected.
- `SERVICE_UNAVAILABLE` (503): DB/Redis dependency down. `Retry-After` set.
- `MAINTENANCE_MODE` (503): Admin set `maintenance_message`.

### 2.2 Auth and account
- `EMAIL_DOMAIN_NOT_ALLOWED` (422): Email domain not in `allowed_email_domains`. `allowed_domains[]`.
- `OTP_RESEND_COOLDOWN` (429): Requested again within 60 s. `retry_after_seconds`.
- `OTP_RATE_LIMITED` (429): Hourly cap (5/email or 20/IP) hit. `retry_after_seconds`.
- `OTP_INVALID` (400): Wrong code. `attempts_left`.
- `OTP_EXPIRED` (400): No live OTP (expired after 10 min, or consumed).
- `OTP_ATTEMPTS_EXCEEDED` (429): 5 wrong tries; OTP burned; request a new one.
- `REFRESH_TOKEN_INVALID` (401): Missing/unknown/expired refresh cookie.
- `REFRESH_TOKEN_REUSED` (401): Rotated token replayed after grace; family revoked; re-login.
- `ACCOUNT_DISABLED` (403): `users.is_active=false`.
- `ADMIN_INVALID_CREDENTIALS` (401): Wrong admin email/password.
- `ADMIN_ACCOUNT_LOCKED` (423): Too many failures. `retry_after_seconds`.
- `MFA_TOKEN_INVALID` (401): `mfa_token` unknown/expired (5 min).
- `TOTP_INVALID` (401): Wrong or replayed TOTP code.
- `ADMIN_MFA_REQUIRED` (403): Admin token lacks totp in amr.
- `PROFILE_INCOMPLETE` (422): Needs name, phone, registration number, hostel block, room before creating request. `missing[]`.

### 2.3 Requests (student side)
- `SERVICE_PAUSED` (503): `service_enabled=false`.
- `LAUNDRY_CLOSED` (409): Chosen laundry location is closed. `next_opens_at`, `opens_local`, `closes_local`.
- `OPEN_REQUEST_LIMIT_REACHED` (409): Student already has 3 open/active requests (`PAYMENT_PENDING`, `OPEN`, `ACCEPTED`, `PICKED_UP`). `limit`.
- `TIER_UNAVAILABLE` (422): Tier code unknown or `is_active=false`.
- `HOSTEL_BLOCK_INACTIVE` (422): Block unknown or deactivated.
- `LAUNDRY_LOCATION_INACTIVE` (422): Location unknown or deactivated.
- `CLOTHES_TOTAL_MISMATCH` (422): `total_count` is not the sum of `items[].quantity`, or exceeds `max_clothes_per_bag`.
- `CLEAN_DATE_INVALID` (422): Date in past, beyond `clean_date_max_days_ahead` (14), or not DROP.
- `MEDIA_NOT_FOUND` (422): Media id unknown, not owned, or already attached.
- `MEDIA_NOT_READY` (422): Upload not completed or still processing.
- `MEDIA_KIND_MISMATCH` (422): Wrong kind for the slot.
- `REQUEST_INVALID_STATE` (409): Action not valid in current status. `status`, `allowed_statuses[]`.
- `CANCEL_NOT_ALLOWED` (409): Cancellation rule forbids it now.
- `ALREADY_CONFIRMED` (409): Student already confirmed receipt.
- `DISPUTE_WINDOW_CLOSED` (409): Past `dispute_window_hours` (24) after completion.
- `DISPUTE_ALREADY_OPEN` (409): One dispute per request.
- `RATING_NOT_ALLOWED` (409): Request not `COMPLETED`.
- `ALREADY_RATED` (409): One rating per request.
- `PAYMENT_NOT_RETRYABLE` (409): Request not `PAYMENT_PENDING` or attempt still live.
- `PAYMENT_WINDOW_EXPIRED` (409): 15-minute payment window over; request `CANCELLED`.

### 2.4 Partner and handoff
- `PARTNER_ALREADY_APPLIED` (409): `partner_status` is `PENDING` or `APPROVED`.
- `PARTNER_NOT_APPROVED` (403): Caller `partner_status` is not `APPROVED`.
- `PARTNER_SUSPENDED` (403): Status `SUSPENDED`.
- `PARTNER_OFFLINE` (403): Pool/accept requires `is_online=true`.
- `INVALID_UPI_ID` (422): Fails UPI regex.
- `PARTNER_ID_PHOTO_REQUIRED` (422): `id_photo_media_id` missing or wrong kind.
- `PARTNER_TERMS_NOT_ACCEPTED` (422): `accepted_terms` must be true.
- `REQUEST_ALREADY_TAKEN` (409): Atomic accept lost the race.
- `REQUEST_NOT_OPEN` (409): Accept on request not `OPEN`.
- `CANNOT_ACCEPT_OWN_REQUEST` (403): Partner is requester.
- `PARTNER_JOB_LIMIT_REACHED` (409): 3 active jobs held.
- `PARTNER_NOT_ASSIGNED` (403): Job belongs to different partner.
- `CODE_INVALID` (422): Wrong 4-digit code. `attempts_left`.
- `CODE_LOCKED` (423): 5 wrong attempts; admin unlock required.
- `PROOF_REQUIRED` (422): Proof photo mandatory.
- `RACK_NUMBER_REQUIRED` (422): Partner must enter rack number on DROP completion.
- `WITHDRAW_NOT_ALLOWED` (409): Only ACCEPTED jobs can be withdrawn.

### 2.5 Uploads, payments, refunds, payouts
- `MEDIA_TYPE_UNSUPPORTED` (415): Not JPEG/PNG/WebP.
- `MEDIA_TOO_LARGE` (413): Over 10 MB.
- `MEDIA_KIND_NOT_ALLOWED` (403): Role/state forbidden to upload kind.
- `UPLOAD_INCOMPLETE` (422): Object not found in storage on complete.
- `UPLOAD_EXPIRED` (410): Signed URL expired.
- `PAYMENT_PROVIDER_ERROR` (502): Gateway error. `request_id`, `provider_code`.
- `PAYMENT_PROVIDER_UNAVAILABLE` (503): Circuit breaker open.
- `WEBHOOK_SIGNATURE_INVALID` (401): Webhook auth failed.
- `WEBHOOK_PAYLOAD_INVALID` (400): Webhook JSON unparsable.
- `REFUND_NOT_ALLOWED` (409): Payment not SUCCESS or state forbids.
- `REFUND_AMOUNT_EXCEEDS` (422): More than refundable remainder.
- `REFUND_PROVIDER_FAILED` (502): Gateway refund failed.
- `PAYOUT_BELOW_MINIMUM` (422): Under `min_payout_paise` (10000 = Rs 100).
- `PAYOUT_INSUFFICIENT_BALANCE` (409): More than `available_paise`.
- `PAYOUT_PENDING_EXISTS` (409): One open payout per partner.
- `PAYOUT_NOT_PENDING` (409): Admin acting on processed payout.
- `UTR_INVALID` (422): UTR must be 12 digits.
- `PAYOUT_UPI_MISSING` (422): Partner profile has no payout UPI.

### 2.6 Admin
- `PARTNER_STATUS_INVALID` (409): Transition not allowed.
- `DISPUTE_NOT_OPEN` (409): Resolving resolved dispute.
- `OVERRIDE_NOT_ALLOWED` (409): Target status not permitted.
- `SETTING_UNKNOWN` (422): Unknown settings key.
- `SETTING_INVALID` (422): Value fails schema.
- `SETTINGS_VERSION_CONFLICT` (409): If-Match etag stale.
- `TIER_PRICE_INVALID` (422): Payout >= price or out of bounds.
- `HOSTEL_BLOCK_IN_USE` (409): Delete blocked by references.
- `LAUNDRY_LOCATION_IN_USE` (409): Location referenced.
- `EXPORT_RANGE_TOO_LARGE` (422): >366 days or >200k rows.
- `DUPLICATE_NAME` (409): Duplicate block/location name.

---

## 3. Shared Schemas

### 3.1 User (`/me`, verify, refresh)
- `id`: UUID v7
- `email`: string (immutable)
- `name`: string | null (2-60 chars)
- `phone`: string | null (+91...)
- `phone_verified`: bool (false in v1)
- `registration_number`: string | null (4-20 chars)
- `hostel_block`: `{id, name}` | null
- `room`: string | null (1-12 chars)
- `role`: `"student" | "partner" | "admin"`
- `partner_status`: `"NONE" | "PENDING" | "APPROVED" | "SUSPENDED"`
- `partner`: object | null (present when partner_status != NONE: `{is_online, upi_id, rejection_reason, suspended_reason, applied_at, approved_at}`)
- `profile_complete`: bool (name, phone, registration_number, hostel_block, room all set)
- `unread_notifications`: int
- `created_at`: timestamp

### 3.2 RequestSummary (List item)
`id, ref, type, status, tier_code, price_paise, hostel_block {id,name}, room, rack_number|null, total_count|null, created_at, opened_at|null, due_by|null, completed_at|null, can_pay_until|null`

### 3.3 RequestDetail
Everything in summary plus:
- `tier`: `{code, label, window_label}`
- `laundry_location`: `{id, name, landmark}`
- `items`: `[{category, quantity}]` (DROP only)
- `note`: string | null
- `clean_date`: date | null
- `media`: `[MediaRef]` (`{id, kind, content_type, url, url_expires_at}`)
- `payment`: `PaymentIntent | null` (`{id, status, provider, amount_paise, redirect_url, expires_at, attempt_no}`)
- `handoff_code`: `{purpose: "ORIGIN"|"DESTINATION", value: "4821", attempts_left: 5, locked: false} | null`
- `partner`: `{first_name, phone} | null` (only ACCEPTED, PICKED_UP)
- `timeline`: `[{status, at, label}]`
- `accept_by`: ts | null
- `accepted_at, picked_up_at, cancelled_at, expired_at`: ts | null
- `cancel_reason`: string | null
- `confirmed_received_at`: ts | null
- `rating`: `{stars, comment} | null`
- `dispute`: `{id, status, reason_code, opened_at, resolution} | null`
- `refund`: `{status, amount_paise, requested_at} | null`
- `allowed_actions`: `string[]` (`pay`, `cancel`, `confirm_received`, `dispute`, `rate`, `set_clean_date`)
- `updated_at`: ts

### 3.4 Notification
`{ id, type, title, body, data: {request_id, ref, deeplink}, read_at: null|ts, created_at }`

---

## 4. Endpoints (Auth, /me, /config/public, /requests, Notifications, Push)

See full documentation in spec.
- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /admin/auth/login`
- `POST /admin/auth/totp`
- `GET, PATCH /me`
- `POST /me/partner/apply`
- `GET /config/public`
- `POST, GET /requests`
- `GET /requests/{id}`
- `POST /requests/{id}/cancel`
- `POST /requests/{id}/confirm-received`
- `POST /requests/{id}/dispute`
- `POST /requests/{id}/rate`
- `PATCH /requests/{id}/clean-date`
- `POST /requests/{id}/payment/retry`
- `GET /me/notifications`
- `POST /me/notifications/{id}/read`
- `POST /me/notifications/read-all`
- `POST, DELETE, GET /me/push-subscriptions`
