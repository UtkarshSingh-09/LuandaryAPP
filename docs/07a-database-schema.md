# 07a — Database Schema (PostgreSQL 16 DDL)

**Purpose:** The complete, runnable DDL for CampusLaundry: extensions, helper functions, all tables from 01-brain.md section 8, three additive support tables, triggers, an ER diagram, and notes on non-obvious columns.

```sql
-- 0001_extensions_and_functions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- admin search on name / email / ref (ILIKE '%x%')

-- UUID v7 (48-bit unix ms timestamp + random).
CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$;

-- Maintains updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Append-only guard: any UPDATE / DELETE / TRUNCATE raises.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

-- Human reference: CL-D-10001 / CL-P-10002.
CREATE SEQUENCE IF NOT EXISTS request_ref_seq START 10001;

CREATE OR REPLACE FUNCTION generate_request_ref(p_type text) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'CL-' || CASE p_type WHEN 'DROP' THEN 'D' WHEN 'PICKUP' THEN 'P' END || '-' || nextval('request_ref_seq')::text
$$;

-- 0002_core_tables ---------------------------------------------------------
CREATE TABLE hostel_blocks (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  code text NOT NULL,
  name text NOT NULL,
  delivery_hint text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hostel_blocks_code UNIQUE (code)
);

CREATE TABLE laundry_locations (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  name text NOT NULL,
  landmark text,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_laundry_locations_hours_object CHECK (jsonb_typeof(opening_hours) = 'object')
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  email text NOT NULL,
  email_verified_at timestamptz,
  name text,
  phone text,
  registration_number text,
  hostel_block_id uuid REFERENCES hostel_blocks(id) ON DELETE SET NULL,
  room text,
  role text NOT NULL DEFAULT 'student',
  partner_status text NOT NULL DEFAULT 'NONE',
  password_hash text,
  totp_secret_enc text,
  totp_enabled_at timestamptz,
  failed_login_count smallint NOT NULL DEFAULT 0,
  locked_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  onboarded_at timestamptz,
  last_login_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_users_email_lower CHECK (email = lower(email)),
  CONSTRAINT ck_users_role CHECK (role IN ('student','partner','admin')),
  CONSTRAINT ck_users_partner_status CHECK (partner_status IN ('NONE','PENDING','APPROVED','SUSPENDED')),
  CONSTRAINT ck_users_role_status CHECK (
    (role = 'student' AND partner_status IN ('NONE','PENDING')) OR
    (role = 'partner' AND partner_status IN ('APPROVED','SUSPENDED')) OR
    (role = 'admin' AND partner_status = 'NONE')),
  CONSTRAINT ck_users_admin_credentials CHECK (role <> 'admin' OR password_hash IS NOT NULL),
  CONSTRAINT ck_users_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,13}$')
);

CREATE TABLE service_tiers (
  code text PRIMARY KEY,
  label text NOT NULL,
  price_paise bigint NOT NULL,
  partner_payout_paise bigint NOT NULL,
  window_min_minutes integer NOT NULL DEFAULT 0,
  window_max_minutes integer NOT NULL,
  acceptance_timeout_minutes integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_service_tiers_code CHECK (code IN ('STANDARD','FAST','EXPRESS')),
  CONSTRAINT ck_service_tiers_price CHECK (price_paise > 0),
  CONSTRAINT ck_service_tiers_payout CHECK (partner_payout_paise > 0 AND partner_payout_paise < price_paise),
  CONSTRAINT ck_service_tiers_window CHECK (window_min_minutes >= 0 AND window_max_minutes >= window_min_minutes AND window_max_minutes > 0),
  CONSTRAINT ck_service_tiers_timeout CHECK (acceptance_timeout_minutes IS NULL OR acceptance_timeout_minutes BETWEEN 1 AND 240)
);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_app_settings_key CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$')
);

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  ref text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'PAYMENT_PENDING',
  student_id uuid NOT NULL REFERENCES users(id),
  partner_id uuid REFERENCES users(id),
  tier_code text NOT NULL REFERENCES service_tiers(code),
  hostel_block_id uuid NOT NULL REFERENCES hostel_blocks(id),
  room text NOT NULL,
  laundry_location_id uuid NOT NULL REFERENCES laundry_locations(id),
  price_paise bigint NOT NULL,
  partner_payout_paise bigint NOT NULL,
  gateway_fee_paise bigint,
  window_max_minutes integer NOT NULL,
  total_item_count integer,
  note text,
  rack_number text,
  clean_date date,
  clean_date_set_at timestamptz,
  clean_date_reminded_at timestamptz,
  origin_code_hash text,
  origin_code_enc text,
  destination_code_hash text,
  destination_code_enc text,
  code_attempts smallint NOT NULL DEFAULT 0,
  code_locked_at timestamptz,
  opened_at timestamptz,
  expires_at timestamptz,
  due_by timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancelled_by_role text,
  cancel_reason text,
  earnings_release_at timestamptz,
  earnings_released_at timestamptz,
  received_confirmed_at timestamptz,
  rating smallint,
  rating_comment text,
  rated_at timestamptz,
  partner_reminded_at timestamptz,
  stuck_alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_requests_ref UNIQUE (ref),
  CONSTRAINT ck_requests_type CHECK (type IN ('DROP','PICKUP')),
  CONSTRAINT ck_requests_status CHECK (status IN ('PAYMENT_PENDING','OPEN','ACCEPTED','PICKED_UP','COMPLETED','CANCELLED','EXPIRED','DISPUTED')),
  CONSTRAINT ck_requests_money CHECK (price_paise > 0 AND partner_payout_paise > 0 AND partner_payout_paise < price_paise AND (gateway_fee_paise IS NULL OR gateway_fee_paise >= 0)),
  CONSTRAINT ck_requests_not_self CHECK (partner_id IS NULL OR partner_id <> student_id),
  CONSTRAINT ck_requests_cancelled_by_role CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('student','partner','admin','system')),
  CONSTRAINT ck_requests_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT ck_requests_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT ck_requests_drop_shape CHECK (type <> 'DROP' OR (
    total_item_count IS NOT NULL AND total_item_count BETWEEN 1 AND 200 AND
    destination_code_hash IS NULL AND destination_code_enc IS NULL)),
  CONSTRAINT ck_requests_pickup_shape CHECK (type <> 'PICKUP' OR (
    rack_number IS NOT NULL AND char_length(btrim(rack_number)) BETWEEN 1 AND 32 AND
    total_item_count IS NULL AND
    origin_code_hash IS NULL AND origin_code_enc IS NULL)),
  CONSTRAINT ck_requests_partner_presence CHECK (
    (status IN ('PAYMENT_PENDING','OPEN','EXPIRED') AND partner_id IS NULL) OR
    (status IN ('ACCEPTED','PICKED_UP','COMPLETED','DISPUTED') AND partner_id IS NOT NULL) OR
    (status = 'CANCELLED')),
  CONSTRAINT ck_requests_opened_fields CHECK (
    status IN ('PAYMENT_PENDING','CANCELLED','EXPIRED') OR
    (opened_at IS NOT NULL AND expires_at IS NOT NULL AND due_by IS NOT NULL AND
     (origin_code_hash IS NOT NULL OR destination_code_hash IS NOT NULL))),
  CONSTRAINT ck_requests_accepted_at CHECK (status NOT IN ('ACCEPTED','PICKED_UP','COMPLETED') OR accepted_at IS NOT NULL),
  CONSTRAINT ck_requests_picked_up_at CHECK (status NOT IN ('PICKED_UP','COMPLETED') OR picked_up_at IS NOT NULL),
  CONSTRAINT ck_requests_completed_at CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
  CONSTRAINT ck_requests_cancelled_at CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CONSTRAINT ck_requests_expired_at CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL),
  CONSTRAINT ck_requests_drop_rack_on_complete CHECK (NOT (type = 'DROP' AND status = 'COMPLETED') OR rack_number IS NOT NULL),
  CONSTRAINT ck_requests_released_after_complete CHECK (earnings_released_at IS NULL OR completed_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION requests_fill_ref() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ref IS NULL OR NEW.ref = '' THEN
    NEW.ref := generate_request_ref(NEW.type);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_requests_fill_ref BEFORE INSERT ON requests FOR EACH ROW EXECUTE FUNCTION requests_fill_ref();

CREATE TABLE request_items (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  category text NOT NULL,
  quantity smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_request_items_category UNIQUE (request_id, category),
  CONSTRAINT ck_request_items_category CHECK (category ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  CONSTRAINT ck_request_items_qty CHECK (quantity BETWEEN 1 AND 100)
);

CREATE TABLE request_events (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  request_id uuid NOT NULL REFERENCES requests(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid REFERENCES users(id),
  actor_role text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_request_events_seq UNIQUE (seq),
  CONSTRAINT ck_request_events_actor_role CHECK (actor_role IN ('student','partner','admin','system')),
  CONSTRAINT ck_request_events_status_from CHECK (from_status IS NULL OR from_status IN ('PAYMENT_PENDING','OPEN','ACCEPTED','PICKED_UP','COMPLETED','CANCELLED','EXPIRED','DISPUTED')),
  CONSTRAINT ck_request_events_status_to CHECK (to_status IS NULL OR to_status IN ('PAYMENT_PENDING','OPEN','ACCEPTED','PICKED_UP','COMPLETED','CANCELLED','EXPIRED','DISPUTED')),
  CONSTRAINT ck_request_events_status_change CHECK (event_type <> 'STATUS_CHANGE' OR to_status IS NOT NULL)
);

CREATE TABLE request_media (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  request_id uuid REFERENCES requests(id),
  uploader_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  object_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer,
  sha256 text,
  width integer,
  height integer,
  rejected_reason text,
  uploaded_at timestamptz,
  purge_after timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_request_media_object_key UNIQUE (object_key),
  CONSTRAINT ck_request_media_kind CHECK (kind IN ('BAG_PHOTO','READY_SCREENSHOT','LAUNDRY_RECEIPT','BAG_TAG_PHOTO','COLLEGE_ID','DISPUTE_EVIDENCE')),
  CONSTRAINT ck_request_media_status CHECK (status IN ('PENDING','READY','REJECTED','PURGED')),
  CONSTRAINT ck_request_media_type CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT ck_request_media_size CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT ck_request_media_ready CHECK (status <> 'READY' OR (uploaded_at IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL)),
  CONSTRAINT ck_request_media_college_id CHECK (kind <> 'COLLEGE_ID' OR request_id IS NULL)
);

CREATE TABLE partner_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  college_id_media_id uuid REFERENCES request_media(id),
  upi_id text,
  is_online boolean NOT NULL DEFAULT false,
  online_since timestamptz,
  last_seen_at timestamptz,
  active_jobs_count integer NOT NULL DEFAULT 0,
  completed_jobs_count integer NOT NULL DEFAULT 0,
  cancelled_jobs_count integer NOT NULL DEFAULT 0,
  withdrawn_jobs_count integer NOT NULL DEFAULT 0,
  rating_sum integer NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  rating_avg numeric(3,2) GENERATED ALWAYS AS (CASE WHEN rating_count = 0 THEN NULL ELSE round(rating_sum::numeric / rating_count, 2) END) STORED,
  strikes smallint NOT NULL DEFAULT 0,
  pending_balance_paise bigint NOT NULL DEFAULT 0,
  available_balance_paise bigint NOT NULL DEFAULT 0,
  lifetime_earned_paise bigint NOT NULL DEFAULT 0,
  lifetime_paid_out_paise bigint NOT NULL DEFAULT 0,
  terms_accepted_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  rejection_reason text,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_partner_profiles_upi CHECK (upi_id IS NULL OR upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9]{2,32}$'),
  CONSTRAINT ck_partner_profiles_counters CHECK (
    active_jobs_count >= 0 AND active_jobs_count <= 10 AND
    completed_jobs_count >= 0 AND cancelled_jobs_count >= 0 AND withdrawn_jobs_count >= 0 AND
    rating_sum >= 0 AND rating_count >= 0 AND strikes >= 0),
  CONSTRAINT ck_partner_profiles_pending CHECK (pending_balance_paise >= 0),
  CONSTRAINT ck_partner_profiles_online_ts CHECK (NOT is_online OR online_since IS NOT NULL)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  request_id uuid NOT NULL REFERENCES requests(id),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  attempt_no smallint NOT NULL DEFAULT 1,
  merchant_order_id text NOT NULL,
  gateway_txn_id text,
  status text NOT NULL DEFAULT 'CREATED',
  amount_paise bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'INR',
  utr text,
  payer_vpa_masked text,
  gateway_fee_paise bigint,
  checkout_ref text,
  expires_at timestamptz,
  paid_at timestamptz,
  failure_code text,
  failure_message text,
  last_reconciled_at timestamptz,
  reconcile_attempts smallint NOT NULL DEFAULT 0,
  raw_last_response jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payments_order UNIQUE (provider, merchant_order_id),
  CONSTRAINT uq_payments_attempt UNIQUE (request_id, attempt_no),
  CONSTRAINT ck_payments_provider CHECK (provider IN ('PHONEPE','PAYTM')),
  CONSTRAINT ck_payments_status CHECK (status IN ('CREATED','PENDING','SUCCESS','FAILED','EXPIRED','CANCELLED')),
  CONSTRAINT ck_payments_amount CHECK (amount_paise > 0),
  CONSTRAINT ck_payments_currency CHECK (currency = 'INR'),
  CONSTRAINT ck_payments_fee CHECK (gateway_fee_paise IS NULL OR gateway_fee_paise >= 0),
  CONSTRAINT ck_payments_success_fields CHECK (status <> 'SUCCESS' OR paid_at IS NOT NULL)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  request_id uuid NOT NULL REFERENCES requests(id),
  amount_paise bigint NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  merchant_refund_id text NOT NULL,
  gateway_refund_id text,
  initiated_by uuid REFERENCES users(id),
  admin_note text,
  failure_message text,
  processed_at timestamptz,
  last_polled_at timestamptz,
  poll_attempts smallint NOT NULL DEFAULT 0,
  raw_last_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_refunds_merchant_refund_id UNIQUE (merchant_refund_id),
  CONSTRAINT ck_refunds_amount CHECK (amount_paise > 0),
  CONSTRAINT ck_refunds_reason CHECK (reason IN ('EXPIRED','CANCELLED_BY_STUDENT','CANCELLED_BY_ADMIN','DISPUTE','PAYMENT_DUPLICATE','OTHER')),
  CONSTRAINT ck_refunds_status CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED')),
  CONSTRAINT ck_refunds_done CHECK (status <> 'SUCCESS' OR processed_at IS NOT NULL)
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  partner_id uuid NOT NULL REFERENCES users(id),
  entry_type text NOT NULL,
  pending_delta_paise bigint NOT NULL DEFAULT 0,
  available_delta_paise bigint NOT NULL DEFAULT 0,
  request_id uuid REFERENCES requests(id),
  payout_request_id uuid,
  dispute_id uuid,
  reason text,
  actor_id uuid REFERENCES users(id),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_seq UNIQUE (seq),
  CONSTRAINT uq_ledger_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_ledger_type CHECK (entry_type IN ('EARN_HOLD','EARN_RELEASE','HOLD_CANCEL','PAYOUT_RESERVE','PAYOUT_PAID','PAYOUT_REVERSAL','ADJUSTMENT')),
  CONSTRAINT ck_ledger_shape CHECK (
    (entry_type = 'EARN_HOLD' AND pending_delta_paise > 0 AND available_delta_paise = 0 AND request_id IS NOT NULL) OR
    (entry_type = 'EARN_RELEASE' AND pending_delta_paise < 0 AND available_delta_paise = -pending_delta_paise AND request_id IS NOT NULL) OR
    (entry_type = 'HOLD_CANCEL' AND pending_delta_paise < 0 AND available_delta_paise = 0 AND request_id IS NOT NULL) OR
    (entry_type = 'PAYOUT_RESERVE' AND pending_delta_paise = 0 AND available_delta_paise < 0 AND payout_request_id IS NOT NULL) OR
    (entry_type = 'PAYOUT_PAID' AND pending_delta_paise = 0 AND available_delta_paise = 0 AND payout_request_id IS NOT NULL) OR
    (entry_type = 'PAYOUT_REVERSAL' AND pending_delta_paise = 0 AND available_delta_paise > 0 AND payout_request_id IS NOT NULL) OR
    (entry_type = 'ADJUSTMENT' AND (pending_delta_paise <> 0 OR available_delta_paise <> 0) AND reason IS NOT NULL AND actor_id IS NOT NULL)),
  CONSTRAINT ck_ledger_hold_actor CHECK (entry_type <> 'ADJUSTMENT' OR char_length(btrim(reason)) >= 5)
);

CREATE TABLE payout_requests (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  partner_id uuid NOT NULL REFERENCES users(id),
  amount_paise bigint NOT NULL,
  upi_id text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED',
  partner_note text,
  utr text,
  admin_note text,
  reject_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_by uuid REFERENCES users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_payout_requests_amount CHECK (amount_paise > 0),
  CONSTRAINT ck_payout_requests_status CHECK (status IN ('REQUESTED','PAID','REJECTED','CANCELLED')),
  CONSTRAINT ck_payout_requests_paid CHECK (status <> 'PAID' OR (utr IS NOT NULL AND processed_by IS NOT NULL AND processed_at IS NOT NULL)),
  CONSTRAINT ck_payout_requests_rejected CHECK (status <> 'REJECTED' OR (reject_reason IS NOT NULL AND processed_by IS NOT NULL AND processed_at IS NOT NULL))
);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_payout FOREIGN KEY (payout_request_id) REFERENCES payout_requests(id);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  request_id uuid NOT NULL REFERENCES requests(id),
  raised_by uuid NOT NULL REFERENCES users(id),
  raised_by_role text NOT NULL,
  reason_code text NOT NULL,
  description text NOT NULL,
  previous_status text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  resolution text,
  resolution_status text,
  refund_amount_paise bigint,
  partner_penalty_paise bigint,
  resolution_note text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_disputes_role CHECK (raised_by_role IN ('student','partner')),
  CONSTRAINT ck_disputes_reason CHECK (reason_code IN ('BAG_NOT_RECEIVED','ITEMS_MISSING','ITEMS_DAMAGED','WRONG_BAG','PARTNER_NO_SHOW','CODE_PROBLEM','PAYMENT_ISSUE','OTHER')),
  CONSTRAINT ck_disputes_prev_status CHECK (previous_status IN ('PICKED_UP','COMPLETED')),
  CONSTRAINT ck_disputes_status CHECK (status IN ('OPEN','RESOLVED')),
  CONSTRAINT ck_disputes_resolution CHECK (resolution IS NULL OR resolution IN ('FAVOUR_STUDENT','FAVOUR_PARTNER','PARTIAL')),
  CONSTRAINT ck_disputes_resolution_status CHECK (resolution_status IS NULL OR resolution_status IN ('COMPLETED','CANCELLED')),
  CONSTRAINT ck_disputes_amounts CHECK ((refund_amount_paise IS NULL OR refund_amount_paise >= 0) AND (partner_penalty_paise IS NULL OR partner_penalty_paise >= 0)),
  CONSTRAINT ck_disputes_resolved_fields CHECK (status <> 'RESOLVED' OR (resolution IS NOT NULL AND resolution_status IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT ck_disputes_desc_len CHECK (char_length(description) BETWEEN 5 AND 2000)
);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_dispute FOREIGN KEY (dispute_id) REFERENCES disputes(id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_notifications_title_len CHECK (char_length(title) <= 120 AND char_length(body) <= 500)
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id uuid NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  expires_at timestamptz,
  failure_count smallint NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint)
);

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  email text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'LOGIN',
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  request_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_otp_codes_email CHECK (email = lower(email)),
  CONSTRAINT ck_otp_codes_purpose CHECK (purpose IN ('LOGIN')),
  CONSTRAINT ck_otp_codes_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id uuid NOT NULL REFERENCES users(id),
  family_id uuid NOT NULL,
  token_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id),
  revoked_at timestamptz,
  revoked_reason text,
  user_agent text,
  ip inet,
  CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  actor_id uuid REFERENCES users(id),
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_audit_logs_seq UNIQUE (seq),
  CONSTRAINT ck_audit_logs_actor_role CHECK (actor_role IN ('student','partner','admin','system'))
);

-- Support tables
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  topic text NOT NULL,
  user_id uuid REFERENCES users(id),
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_outbox_seq UNIQUE (seq)
);

CREATE OR REPLACE FUNCTION outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('outbox_new', '');
  RETURN NULL;
END $$;

CREATE TRIGGER trg_outbox_notify AFTER INSERT ON outbox_events FOR EACH STATEMENT EXECUTE FUNCTION outbox_notify();

CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES users(id),
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  response_status smallint,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (user_id, scope, key),
  CONSTRAINT ck_idempotency_status CHECK (status IN ('IN_PROGRESS','DONE')),
  CONSTRAINT ck_idempotency_key_len CHECK (char_length(key) BETWEEN 8 AND 128)
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  provider text NOT NULL,
  dedupe_key text NOT NULL,
  signature_ok boolean NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  process_error text,
  CONSTRAINT uq_webhook_events_dedupe UNIQUE (provider, dedupe_key),
  CONSTRAINT ck_webhook_events_provider CHECK (provider IN ('PHONEPE','PAYTM'))
);

-- Triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hostel_blocks','laundry_locations','users','service_tiers','app_settings','requests',
    'request_media','partner_profiles','payments','refunds','payout_requests','disputes'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_request_events_append_only BEFORE UPDATE OR DELETE ON request_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_request_events_no_truncate BEFORE TRUNCATE ON request_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
```
