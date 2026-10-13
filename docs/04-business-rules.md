# 04 — Business Rules

**Purpose.** Every numeric and policy rule the product enforces: price and payout math, acceptance timeout, cancellation and refund amounts, partner withdrawal and strikes, laundry opening hours, per-user limits, clothes-list rules, the earnings ledger, disputes, ratings, and the full `app_settings` key list. Backend, state machine, and notifications implement and cite these rules; they must not invent their own numbers.

## 1. Money conventions
- **Unit**: Integer paise (`BIGINT`). Never floats. Rupee display only in UI and notification copy.
- **Percentage maths**: `floor(amount_paise * percent / 100)`, computed in integer arithmetic.
- **Rounding remainder**: Any paise lost to flooring stays with the platform.
- **Conservation law**: For every request: `price_paise = student_refund_total + partner_credit_total + platform_retained` and `platform_retained >= 0`.
- **Snapshot**: `requests.price_paise` and `requests.partner_payout_paise` are copied from `service_tiers` at creation and never recomputed.
- **Currency**: INR only.

## 2. Service tiers and price maths

### 2.1 Seed values (`service_tiers`)
| Tier | Price (paise) | Partner payout (paise) | Platform gross | Promised window (text) | window_min_minutes | window_max_minutes (due_by) | Acceptance timeout (minutes) |
|---|---|---|---|---|---|---|---|
| STANDARD | 3000 | 1300 | 1700 | 2 to 3 hours | 120 | 180 | 30 |
| FAST | 4000 | 1800 | 2200 | 1.5 to 2 hours | 90 | 120 | 20 |
| EXPRESS | 5000 | 2300 | 2700 | under 1 hour | 30 | 60 | 12 |

### 2.2 Formulas
- `platform_gross_paise = price_paise - partner_payout_paise`
- `platform_net_paise = price_paise - partner_payout_paise - gateway_fee_paise - platform_refund_cost_paise`
- `due_by = opened_at + window_max_minutes`
- `accept_deadline_at = opened_at + min(tier.acceptance_timeout_minutes, acceptance_timeout_minutes_global)` [first listing]
- `accept_deadline_at = now + min(tier.acceptance_timeout_minutes, reopen_acceptance_minutes)` [after withdrawal/unassign]

## 3. Request creation rules
- **DROP**: declared clothes list (1-15 lines, sum 1-40 items), optional `bag_photo_media_id`, optional `clean_date`.
- **PICKUP**: `rack_number` required (1-20 chars), `ready_screenshot_media_id` required. No clothes list. No link to previous DROP.
- **Laundry hours**: Cutoff rule: request accepted/created only if `now <= interval_end - closing_buffer_minutes` (30 min).

## 4. Acceptance and timeout rules
- Partner must be APPROVED, online, active jobs < 3, active express < 1, not requester, payout UPI present.
- Sweeper expires unaccepted requests at `accept_deadline_at` with reason `NO_PARTNER` and initiates full 100% refund.
- Re-opening after withdrawal allowed up to `max_reopen_count = 2`.

## 5. Cancellation and refund rules
- `student_free_cancel_seconds`: 120 (free cancel after accept).
- `student_cancel_fee_percent`: 20% (after grace).
- `noshow_fee_percent`: 40%.
- `cancel_fee_partner_share_percent`: 50% (credited as `CANCEL_COMP`).
- Open/Payment_Pending cancel: 100% refund.

## 6. Partner withdrawal, stall, strikes, suspension
- Withdraw reason: `CHANGED_MIND/BUSY` (strike if > 5 min), `LAUNDRY_NOT_READY` (0), `LAUNDRY_CLOSED` (0), `EMERGENCY` (1), `STUDENT_UNREACHABLE` (starts 10 min timer).
- Stall deadline: `accepted_at + min(stall_timeout_minutes, floor((due_by - accepted_at) / 2))`.
- Strikes: 3 active strikes trigger temporary suspension ladder: 24h, 7 days, indefinite.

## 7. Handoff codes
- 4-digit code. Max wrong attempts: 5, then `CODE_LOCKED` (423).
- Soft cooldown after 3 wrong tries: 30s.
- Stored hashed via HMAC-SHA256 with pepper; encrypted copy stored for student display.

## 8. Earnings ledger
- Append-only `ledger_entries`. Deltas for `held` and `available`.
- `EARN_HOLD` (+payout) on COMPLETED.
- Auto-release (`HOLD_RELEASE`) at earlier of student `confirm-received` or `completed_at + earnings_hold_minutes` (120 min).
- Minimum payout: Rs 100 (`min_payout_paise = 10000`).

## 9. Disputes & Ratings
- Dispute window: 24h from completed.
- Ratings: 1-5 stars, within 7 days, admin-visible in v1.

## 10. app_settings table
Full key list documented in spec (acceptance timeouts, cancel percentages, limits, hours, etc.).
