import { PublicConfig, User, RequestSummary, RequestDetail, NotificationItem, PaymentIntent } from "./types";

let memoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  code: string;
  details: Record<string, any>;
  status: number;

  constructor(code: string, message: string, status: number, details: Record<string, any> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Add default content type if body is present and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Add auth token if present
  if (memoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${memoryAccessToken}`);
  }

  // Add X-Request-ID
  if (!headers.has("X-Request-ID")) {
    headers.set("X-Request-ID", crypto.randomUUID());
  }

  // Add Idempotency-Key if provided
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  // Add X-CL-CSRF on cookie endpoints
  if (path.includes("/auth/refresh") || path.includes("/auth/logout")) {
    headers.set("X-CL-CSRF", "1");
  }

  const url = path.startsWith("http") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // for cl_rt cookie
  });

  if (response.status === 204) {
    return null as T;
  }

  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    if (data && data.error) {
      throw new ApiError(data.error.code, data.error.message, response.status, data.error.details);
    }
    throw new ApiError("HTTP_ERROR", response.statusText || "Request failed", response.status);
  }

  return data as T;
}

// API methods
export const api = {
  // Public
  getPublicConfig: () => apiFetch<PublicConfig>("/config/public"),

  // Auth
  requestOtp: (email: string) =>
    apiFetch<{ sent: boolean; resend_after_seconds: number; expires_in_seconds: number }>(
      "/auth/otp/request",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  verifyOtp: (email: string, otp: string, device_name?: string) =>
    apiFetch<{ access_token: string; expires_in: number; is_new_user: boolean; user: User }>(
      "/auth/otp/verify",
      { method: "POST", body: JSON.stringify({ email, otp, device_name }) }
    ),

  refreshSession: () =>
    apiFetch<{ access_token: string; expires_in: number; user: User }>("/auth/refresh", {
      method: "POST",
    }),

  logout: (all_devices = false) =>
    apiFetch<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ all_devices }),
    }),

  // User
  getMe: () => apiFetch<User>("/me"),

  updateMe: (payload: {
    name?: string;
    phone?: string;
    registration_number?: string;
    hostel_block_id?: string;
    room?: string;
    partner_upi_id?: string;
  }) =>
    apiFetch<User>("/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  applyPartner: (payload: {
    id_photo_media_id: string;
    upi_id: string;
    accepted_terms: boolean;
    terms_version: string;
  }) =>
    apiFetch<{ partner_status: string; applied_at: string }>("/me/partner/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Requests
  createRequest: (payload: any, idempotencyKey: string) =>
    apiFetch<RequestDetail>("/requests", {
      method: "POST",
      body: JSON.stringify(payload),
      idempotencyKey,
    }),

  listRequests: (params?: { scope?: "active" | "history"; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.scope) q.set("scope", params.scope);
    if (params?.limit) q.set("limit", params.limit.toString());
    return apiFetch<{ items: RequestSummary[]; next_cursor: string | null }>(
      `/requests?${q.toString()}`
    );
  },

  getRequest: (id: string) => apiFetch<RequestDetail>(`/requests/${id}`),

  cancelRequest: (id: string, reason_code: string, note?: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason_code, note }),
    }),

  confirmReceived: (id: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/confirm-received`, {
      method: "POST",
    }),

  disputeRequest: (id: string, reason_code: string, description: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/dispute`, {
      method: "POST",
      body: JSON.stringify({ reason_code, description, evidence_media_ids: [] }),
    }),

  rateRequest: (id: string, stars: number, comment?: string) =>
    apiFetch<{ stars: number; comment?: string }>(`/requests/${id}/rate`, {
      method: "POST",
      body: JSON.stringify({ stars, comment }),
    }),

  retryPayment: (id: string, idempotencyKey: string) =>
    apiFetch<{ payment: PaymentIntent }>(`/requests/${id}/payment/retry`, {
      method: "POST",
      idempotencyKey,
    }),

  mockCompletePayment: (id: string, status: "SUCCESS" | "FAILED" = "SUCCESS") =>
    apiFetch<RequestDetail>(`/requests/${id}/payment/mock-complete`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  mockAdvanceRequest: (id: string) =>
    apiFetch<RequestDetail>(`/requests/${id}/mock-advance`, {
      method: "POST",
    }),

  setCleanDate: (id: string, clean_date: string | null) =>
    apiFetch<RequestDetail>(`/requests/${id}/clean-date`, {
      method: "PATCH",
      body: JSON.stringify({ clean_date }),
    }),

  // Notifications
  listNotifications: () =>
    apiFetch<{ items: NotificationItem[]; unread_count: number }>("/me/notifications"),

  markNotificationRead: (id: string) =>
    apiFetch<{ id: string; unread_count: number }>(`/me/notifications/${id}/read`, {
      method: "POST",
    }),

  // Partner Endpoints
  togglePartnerOnline: (is_online: boolean) =>
    apiFetch<{ is_online: boolean; online_since: string | null }>("/partner/online", {
      method: "POST",
      body: JSON.stringify({ is_online }),
    }),

  getPartnerPool: () =>
    apiFetch<import("./types").PoolItem[]>("/partner/pool"),

  acceptJob: (id: string) =>
    apiFetch<import("./types").PartnerJobDetail>(`/partner/requests/${id}/accept`, {
      method: "POST",
    }),

  getPartnerJobs: (active = true) =>
    apiFetch<import("./types").PartnerJobDetail[]>(`/partner/jobs?active=${active}`),

  getPartnerJobDetail: (id: string) =>
    apiFetch<import("./types").PartnerJobDetail>(`/partner/jobs/${id}`),

  verifyOriginCode: (id: string, code: string, counted_items?: number) =>
    apiFetch<import("./types").PartnerJobDetail>(`/partner/requests/${id}/verify-origin`, {
      method: "POST",
      body: JSON.stringify({ code, counted_items }),
    }),

  completePartnerJob: (id: string, payload: { rack_number?: string; code?: string; receipt_media_id?: string }) =>
    apiFetch<import("./types").PartnerJobDetail>(`/partner/requests/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  withdrawJob: (id: string, reason: string, note?: string) =>
    apiFetch<{ status: string; withdrawn: boolean; strike_added: number }>(`/partner/requests/${id}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ reason, note }),
    }),

  getPartnerEarnings: () =>
    apiFetch<import("./types").PartnerEarnings>("/partner/earnings"),

  requestPayout: (amount_paise: number, idempotencyKey: string) =>
    apiFetch<import("./types").PayoutItem>("/partner/payouts", {
      method: "POST",
      body: JSON.stringify({ amount_paise }),
      idempotencyKey,
    }),
};

