# 03a — Student Flows

**Purpose:** Screen-by-screen journeys for the student (and a partner acting as a customer): login, creating DROP and PICKUP requests, paying, waiting, handoff codes, tracking, cancelling, reminders, confirming, rating, disputing and re-posting.

## 0. Conventions

### 0.1 Student-facing status wording
| API status | DROP wording | PICKUP wording | Primary action on screen |
|---|---|---|---|
| PAYMENT_PENDING | Waiting for payment | Waiting for payment | Pay now / Cancel |
| OPEN | Finding a partner | Finding a partner | Cancel |
| ACCEPTED | Partner assigned, on the way | Partner assigned, heading to laundry | Show code, Call partner, Cancel |
| PICKED_UP | Bag is on its way to laundry | Bag collected, on its way to you | Show code (PICKUP), Report problem |
| COMPLETED | Bag is at laundry, rack N | Delivered | Confirm received, Rate, Clean date (DROP) |
| CANCELLED | Cancelled (refund status shown) | same | Post again |
| EXPIRED | No partner found, refunded | same | Post again |
| DISPUTED | Under review by admin | same | View updates |

### 0.2 Persistent Chrome
- Bottom tab bar: Home (`/app`), Requests (`/app/requests`), Alerts (`/app/notifications`), Profile (`/app/profile`).
- Floating "New request" button: "Drop my bag at laundry" (`/app/new/drop`) or "Bring my cleaned bag" (`/app/new/pickup`).
- Partner switch in Profile for approved partners.

### 0.3 Flows
- **F-S-01 Login and onboarding**: OTP via college email, profile completion (name, phone, roll no, block, room), web push prompt.
- **F-S-02 Create DROP request**: clothes checklist, optional bag photo, tier selection, payment initiation.
- **F-S-03 Create PICKUP request**: rack number, ready screenshot, tier selection, payment.
- **F-S-04 Tracking & Handoff**: 4-digit handoff code presentation, partner contact info after accept.
- **F-S-05 Completion, Clean Date & Confirmation**: student marks received, adds clean date.
- **F-S-06 Disputes & Rating**: dispute within 24h, rating within 7 days.
