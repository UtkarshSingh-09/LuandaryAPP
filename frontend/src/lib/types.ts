export type RequestStatus =
  | "PAYMENT_PENDING"
  | "OPEN"
  | "ACCEPTED"
  | "PICKED_UP"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

export type RequestType = "DROP" | "PICKUP";

export interface HostelBlockRef {
  id: string;
  name: string;
}

export interface PartnerInfo {
  is_online: boolean;
  upi_id?: string | null;
  rejection_reason?: string | null;
  suspended_reason?: string | null;
  applied_at?: string | null;
  approved_at?: string | null;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  phone_verified: boolean;
  registration_number?: string | null;
  hostel_block?: HostelBlockRef | null;
  room?: string | null;
  role: "student" | "partner" | "admin";
  partner_status: "NONE" | "PENDING" | "APPROVED" | "SUSPENDED";
  partner?: PartnerInfo | null;
  profile_complete: boolean;
  unread_notifications: number;
  created_at: string;
}

export interface ServiceTier {
  code: "STANDARD" | "FAST" | "EXPRESS";
  label: string;
  price_paise: number;
  window_label: string;
  window_max_minutes: number;
  acceptance_timeout_minutes: number;
}

export interface LaundryLocation {
  id: string;
  name: string;
  landmark?: string | null;
  hours: Record<string, string[][]>;
  is_open_now: boolean;
}

export interface ClothingCategory {
  code: string;
  label: string;
}

export interface PublicConfig {
  server_time: string;
  service_enabled: boolean;
  maintenance_message?: string | null;
  allowed_email_domains: string[];
  tiers: ServiceTier[];
  hostel_blocks: HostelBlockRef[];
  laundry_locations: LaundryLocation[];
  clothes_categories: ClothingCategory[];
  limits: {
    max_open_requests_per_student: number;
    max_active_jobs_per_partner: number;
    max_clothes_per_bag: number;
    max_upload_bytes: number;
    clean_date_max_days_ahead: number;
    min_payout_paise: number;
    payment_window_minutes: number;
    dispute_window_hours: number;
  };
  payments: {
    provider: string;
    method: string;
  };
  partner_terms_version: string;
  push: {
    vapid_public_key: string;
  };
}

export interface RequestItem {
  category: string;
  quantity: number;
}

export interface PaymentIntent {
  id: string;
  status: string;
  provider: string;
  amount_paise: number;
  redirect_url?: string | null;
  expires_at?: string | null;
  attempt_no: number;
}

export interface HandoffCode {
  purpose: "ORIGIN" | "DESTINATION";
  value: string;
  attempts_left: number;
  locked: boolean;
}

export interface PartnerContact {
  first_name: string;
  phone: string;
}

export interface TimelineEvent {
  status: string;
  at: string;
  label: string;
}

export interface RequestSummary {
  id: string;
  ref: string;
  type: RequestType;
  status: RequestStatus;
  tier_code: string;
  price_paise: number;
  hostel_block: HostelBlockRef;
  room: string;
  rack_number?: string | null;
  total_count?: number | null;
  created_at: string;
  opened_at?: string | null;
  due_by?: string | null;
  completed_at?: string | null;
  can_pay_until?: string | null;
}

export interface RequestDetail extends RequestSummary {
  tier: {
    code: string;
    label: string;
    window_label: string;
  };
  laundry_location: {
    id: string;
    name: string;
    landmark?: string | null;
  };
  items: RequestItem[];
  note?: string | null;
  clean_date?: string | null;
  media: Array<{
    id: string;
    kind: string;
    content_type: string;
    url: string;
    url_expires_at: string;
  }>;
  payment?: PaymentIntent | null;
  handoff_code?: HandoffCode | null;
  partner?: PartnerContact | null;
  timeline: TimelineEvent[];
  accept_by?: string | null;
  accepted_at?: string | null;
  picked_up_at?: string | null;
  cancelled_at?: string | null;
  expired_at?: string | null;
  cancel_reason?: string | null;
  confirmed_received_at?: string | null;
  rating?: {
    stars: number;
    comment?: string | null;
  } | null;
  dispute?: {
    id: string;
    status: string;
    reason_code: string;
    opened_at: string;
    resolution?: string | null;
  } | null;
  refund?: {
    status: string;
    amount_paise: number;
    requested_at: string;
  } | null;
  allowed_actions: string[];
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  read_at?: string | null;
  created_at: string;
}

export interface PoolItem {
  id: string;
  ref: string;
  type: RequestType;
  tier_code: string;
  price_paise: number;
  payout_paise: number;
  hostel_block: HostelBlockRef;
  laundry_location: {
    id: string;
    name: string;
    landmark?: string | null;
  };
  total_count?: number | null;
  rack_number?: string | null;
  opened_at?: string | null;
  due_by?: string | null;
  accept_by?: string | null;
  created_at: string;
}

export interface PartnerJobDetail {
  id: string;
  ref: string;
  type: RequestType;
  status: RequestStatus;
  tier_code: string;
  payout_paise: number;
  hostel_block: HostelBlockRef;
  room: string;
  laundry_location: {
    id: string;
    name: string;
    landmark?: string | null;
  };
  student: {
    first_name: string;
    phone: string;
  };
  note?: string | null;
  total_count?: number | null;
  rack_number?: string | null;
  clean_date?: string | null;
  media?: Array<{
    id: string;
    kind: string;
    content_type: string;
    url: string;
    url_expires_at: string;
  }>;
  timeline: TimelineEvent[];
  due_by?: string | null;
  accepted_at?: string | null;
  picked_up_at?: string | null;
  completed_at?: string | null;
  allowed_actions: string[];
}

export interface LedgerEntryItem {
  id: string;
  entry_type: string;
  pending_delta_paise: number;
  available_delta_paise: number;
  request_id?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface PartnerEarnings {
  pending_balance_paise: number;
  available_balance_paise: number;
  lifetime_earned_paise: number;
  lifetime_paid_out_paise: number;
  active_jobs_count: number;
  completed_jobs_count: number;
  withdrawn_jobs_count: number;
  strikes: number;
  rating_avg?: number | null;
  rating_count: number;
  upi_id?: string | null;
  is_online?: boolean;
  recent_entries: LedgerEntryItem[];
}

export interface PayoutItem {
  id: string;
  amount_paise: number;
  upi_id: string;
  status: string;
  utr?: string | null;
  requested_at: string;
  processed_at?: string | null;
}

