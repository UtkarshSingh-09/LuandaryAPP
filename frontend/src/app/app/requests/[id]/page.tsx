"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, MessageSquare, Shield, Clock,
  MapPin, CheckCircle2, AlertTriangle, Star, Calendar,
  CreditCard, ChevronRight, X, RefreshCw, KeyRound, Sparkles
} from "lucide-react";
import { api } from "@/lib/api";
import { RequestDetail } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function RequestDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const requestId = resolvedParams.id;
  const router = useRouter();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal States
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("CHANGED_MIND");
  const [cancelNote, setCancelNote] = useState("");

  const [showCleanDateModal, setShowCleanDateModal] = useState(false);
  const [cleanDate, setCleanDate] = useState("");

  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("ITEMS_MISSING");
  const [disputeDescription, setDisputeDescription] = useState("");

  const loadDetail = async () => {
    try {
      const data = await api.getRequest(requestId);
      setRequest(data);
      if (data.clean_date) {
        setCleanDate(data.clean_date);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load request details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // Fast 3s polling so partner acceptance shows up immediately
    const interval = setInterval(loadDetail, 3000);
    return () => clearInterval(interval);
  }, [requestId]);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await api.cancelRequest(requestId, cancelReason, cancelNote || undefined);
      setShowCancelModal(false);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to cancel request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReceived = async () => {
    if (!confirm("Are you sure you want to confirm receipt? This will finalize the order and release partner payout.")) return;
    setActionLoading(true);
    try {
      await api.confirmReceived(requestId);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to confirm receipt.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCleanDate = async () => {
    setActionLoading(true);
    try {
      await api.setCleanDate(requestId, cleanDate || null);
      setShowCleanDateModal(false);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to update clean date.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRate = async () => {
    setActionLoading(true);
    try {
      await api.rateRequest(requestId, ratingStars, ratingComment || undefined);
      setShowRateModal(false);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to submit rating.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    if (disputeDescription.length < 10) {
      alert("Please provide at least 10 characters describing the problem.");
      return;
    }
    setActionLoading(true);
    try {
      await api.disputeRequest(requestId, disputeReason, disputeDescription);
      setShowDisputeModal(false);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to submit dispute.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDemoAdvance = async () => {
    setActionLoading(true);
    try {
      await api.mockAdvanceRequest(requestId);
      await loadDetail();
    } catch (err: any) {
      alert(err.message || "Failed to advance demo order.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: 40, textAlign: "center" }}>
        <RefreshCw size={24} className="spin-animate" style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading order details...</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: 24 }}>
        <button onClick={() => router.push("/app/requests")} className="btn-ghost" style={{ marginBottom: 16 }}>
          <ArrowLeft size={18} style={{ marginRight: 6 }} /> Back to Orders
        </button>
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--danger)" }}>
          <AlertTriangle size={32} style={{ margin: "0 auto 12px" }} />
          <h3>Error loading request</h3>
          <p style={{ fontSize: 13 }}>{error || "Order not found."}</p>
        </div>
      </div>
    );
  }

  const isPendingPayment = request.status === "PAYMENT_PENDING";
  const isOpen = request.status === "OPEN";
  const isAccepted = request.status === "ACCEPTED";
  const isPickedUp = request.status === "PICKED_UP";
  const isCompleted = request.status === "COMPLETED";

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}>
      {/* Top Navbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => router.push("/app/requests")}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            {request.type} DELIVERY
          </span>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>
            {request.ref}
          </div>
        </div>

        <button
          onClick={loadDetail}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Main Status Header Card */}
      <div className="card" style={{ marginBottom: 16, padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <StatusBadge status={request.status} />
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 20,
            background: "var(--primary-subtle)",
            color: "var(--primary)"
          }}>
            {request.tier.label} ({request.tier.window_label})
          </span>
        </div>

        {/* Dynamic status guidance banner */}
        <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {isPendingPayment && (
            <div style={{
              padding: 12,
              background: "rgba(245, 158, 11, 0.12)",
              borderRadius: 8,
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "var(--warning)",
              fontSize: 13,
              fontWeight: 600
            }}>
              ⚠️ Payment of ₹{(request.price_paise / 100).toFixed(0)} is pending. Please complete payment within 15 minutes to broadcast your request.
            </div>
          )}
          {isOpen && (
            <div>
              🔍 Broadcasting to active student delivery partners near <strong>{request.hostel_block.name}</strong>. You will be notified the instant someone accepts.
            </div>
          )}
          {isAccepted && (
            <div style={{
              padding: 12,
              background: "rgba(16, 185, 129, 0.12)",
              borderRadius: 10,
              border: "1.5px solid rgba(16, 185, 129, 0.35)",
              color: "var(--success)",
              fontWeight: 600,
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <span className="radar-dot" style={{ background: "var(--success)" }} />
                <span>Delivery Partner Accepted Your Request!</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                {request.partner?.first_name || "Your partner"} (📞 {request.partner?.phone || ""}) is on the way to {request.type === "DROP" ? "your room" : "the laundry counter"}.
              </div>
            </div>
          )}
          {isPickedUp && (
            <div>
              📦 {request.type === "DROP" ? "Bag is on the way to the campus laundry counter." : "Bag is on the way to your hostel room."}
            </div>
          )}
          {isCompleted && (
            <div style={{ color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={16} /> Delivery successfully completed!
            </div>
          )}
        </div>
      </div>

      {/* 4-Digit Handoff Code Card */}
      {request.handoff_code && (
        <div className="card" style={{
          marginBottom: 16,
          padding: "24px 20px",
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.14) 0%, rgba(139, 92, 246, 0.08) 100%)",
          border: "2px solid rgba(79, 70, 229, 0.4)",
          textAlign: "center"
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--primary)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
            <KeyRound size={15} />
            Handoff Security Code ({request.handoff_code.purpose})
          </div>

          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            {request.type === "DROP"
              ? "Share this 4-digit code with your delivery partner when handing over your laundry bag:"
              : "Share this 4-digit code with your delivery partner when they bring your clean laundry:"}
          </p>

          {/* 4 Large Digit Tiles */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 14 }}>
            {request.handoff_code.value.split("").map((digit, index) => (
              <div
                key={index}
                style={{
                  width: 54,
                  height: 64,
                  background: "#ffffff",
                  color: "#1e1b4b",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 900,
                  boxShadow: "0 8px 16px rgba(79, 70, 229, 0.2)",
                  border: "1px solid rgba(79, 70, 229, 0.3)",
                  letterSpacing: "0.02em"
                }}
              >
                {digit}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            🔒 Attempts left: {request.handoff_code.attempts_left} • Never share over phone/text
          </div>
        </div>
      )}

      {/* Partner Contact Card */}
      {request.partner && (
        <div className="card" style={{ marginBottom: 16, padding: "16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10 }}>
            ASSIGNED DELIVERY PARTNER
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--primary-subtle)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 18
              }}>
                {request.partner.first_name[0]}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  {request.partner.first_name}
                </h4>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", marginTop: 2 }}>
                  📞 {request.partner.phone}
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Verified Campus Delivery Partner
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={`tel:${request.partner.phone}`}
                className="btn-secondary"
                style={{ padding: "8px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              >
                <Phone size={14} /> Call
              </a>
              <a
                href={`https://wa.me/${request.partner.phone.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ padding: "8px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              >
                <MessageSquare size={14} /> Chat
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Status Timeline */}
      <div className="card" style={{ marginBottom: 16, padding: "20px" }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>
          Order Progress
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          {request.timeline.map((event, idx) => (
            <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: idx === request.timeline.length - 1 ? "var(--primary)" : "var(--primary-subtle)",
                color: idx === request.timeline.length - 1 ? "#fff" : "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 2
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {event.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {new Date(event.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details Breakdown */}
      <div className="card" style={{ marginBottom: 16, padding: "20px" }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>
          Delivery Information
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Hostel Location:</span>
            <span style={{ fontWeight: 600 }}>{request.hostel_block.name}, Room {request.room}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Laundry Counter:</span>
            <span style={{ fontWeight: 600 }}>{request.laundry_location.name}</span>
          </div>

          {request.rack_number && (
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>Laundry Rack Token:</span>
              <span style={{ fontWeight: 800, fontFamily: "monospace", color: "var(--primary)" }}>{request.rack_number}</span>
            </div>
          )}

          {request.media && request.media.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>Laundry Page Screenshot:</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <a href={request.media[0].url} target="_blank" rel="noreferrer" style={{ display: "inline-block" }}>
                  <img
                    src={request.media[0].url}
                    alt="Laundry screenshot"
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-color)" }}
                    onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                  />
                </a>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Attached for counter verification</span>
              </div>
            </div>
          )}

          {request.clean_date && (
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>Expected Clean Date:</span>
              <span style={{ fontWeight: 600 }}>{request.clean_date}</span>
            </div>
          )}

          {request.note && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>Student Note:</span>
              <span style={{ fontStyle: "italic" }}>"{request.note}"</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Amount Paid:</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>₹{(request.price_paise / 100).toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Floating / Sticky Action Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        {/* Payment CTA */}
        {request.allowed_actions.includes("pay") && request.payment && (
          <Link
            href={request.payment.redirect_url || `/app/pay/mock?order=CLP-RETRY&amount=${request.price_paise}&req=${request.id}`}
            className="btn-primary"
            style={{
              padding: "16px",
              textAlign: "center",
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8
            }}
          >
            <CreditCard size={18} />
            Pay ₹{(request.price_paise / 100).toFixed(0)} Now (PhonePe / UPI)
          </Link>
        )}

        {/* Confirm Received */}
        {request.allowed_actions.includes("confirm_received") && (
          <button
            onClick={handleConfirmReceived}
            disabled={actionLoading}
            className="btn-primary"
            style={{
              padding: "14px",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--success)"
            }}
          >
            <CheckCircle2 size={18} />
            Confirm Delivery Received
          </button>
        )}

        {/* Set Clean Date (DROP requests) */}
        {request.allowed_actions.includes("set_clean_date") && (
          <button
            onClick={() => setShowCleanDateModal(true)}
            className="btn-secondary"
            style={{ padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Calendar size={15} />
            {request.clean_date ? `Change Clean Date (${request.clean_date})` : "Set Laundry Clean Date"}
          </button>
        )}

        {/* Rate Delivery */}
        {request.allowed_actions.includes("rate") && (
          <button
            onClick={() => setShowRateModal(true)}
            className="btn-secondary"
            style={{ padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Star size={15} color="var(--warning)" />
            Rate Delivery Partner
          </button>
        )}

        {/* Cancel Order */}
        {request.allowed_actions.includes("cancel") && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="btn-ghost"
            style={{ padding: "12px", fontSize: 13, color: "var(--danger)" }}
          >
            Cancel Order
          </button>
        )}

        {/* Dispute Button */}
        {request.allowed_actions.includes("dispute") && !request.dispute && (
          <button
            onClick={() => setShowDisputeModal(true)}
            className="btn-ghost"
            style={{ padding: "10px", fontSize: 12, color: "var(--text-muted)" }}
          >
            Report an Issue / Open Dispute
          </button>
        )}

        {/* Demo Helper Button */}
        {(isOpen || isAccepted || isPickedUp) && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: "rgba(79, 70, 229, 0.08)",
            borderRadius: 12,
            border: "1px dashed var(--primary)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                💡 Demo Mode Simulator:
              </span>
              <button
                onClick={handleDemoAdvance}
                disabled={actionLoading}
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                <Sparkles size={13} style={{ marginRight: 4 }} />
                Advance Next Step
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
              Simulates partner accept, handoff code verification, or delivery completion without needing partner app login.
            </p>
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 400, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cancel Request</h3>
              <button onClick={() => setShowCancelModal(false)} className="btn-ghost" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
              {isAccepted
                ? "Note: Cancelling after partner acceptance may incur a 20% cancellation fee if past the 120-second grace period."
                : "Your request will be cancelled immediately and 100% of captured payment will be refunded."}
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="input-field"
                style={{ width: "100%", padding: 10 }}
              >
                <option value="CHANGED_MIND">Changed my mind</option>
                <option value="WRONG_DETAILS">Incorrect room or items</option>
                <option value="TOO_SLOW">Partner took too long</option>
                <option value="OTHER">Other reason</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Additional note (optional)</label>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                maxLength={300}
                placeholder="Give details..."
                className="input-field"
                style={{ width: "100%", height: 70, padding: 10 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCancelModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                Keep Order
              </button>
              <button onClick={handleCancel} disabled={actionLoading} className="btn-primary" style={{ flex: 1, background: "var(--danger)" }}>
                {actionLoading ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Date Modal */}
      {showCleanDateModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 360, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Laundry Ready Date</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Enter the estimated clean date shown on your laundry token/app to track when your bag is ready:
            </p>
            <input
              type="date"
              value={cleanDate}
              onChange={(e) => setCleanDate(e.target.value)}
              className="input-field"
              style={{ width: "100%", padding: 12, marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCleanDateModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleSaveCleanDate} disabled={actionLoading} className="btn-primary" style={{ flex: 1 }}>
                Save Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate Modal */}
      {showRateModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 380, padding: 24, textAlign: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Rate Delivery</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              How was your experience with {request.partner?.first_name || "the delivery partner"}?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatingStars(star)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4
                  }}
                >
                  <Star
                    size={32}
                    fill={star <= ratingStars ? "var(--warning)" : "none"}
                    color={star <= ratingStars ? "var(--warning)" : "var(--border-color)"}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Leave a comment (optional)..."
              maxLength={300}
              className="input-field"
              style={{ width: "100%", height: 70, padding: 10, marginBottom: 20 }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowRateModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                Skip
              </button>
              <button onClick={handleRate} disabled={actionLoading} className="btn-primary" style={{ flex: 1 }}>
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 420, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Report Problem</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Please describe the issue. Our admin team will investigate and follow up promptly.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="input-field"
                style={{ width: "100%", padding: 10 }}
              >
                <option value="ITEMS_MISSING">Clothes or items missing</option>
                <option value="ITEMS_DAMAGED">Items damaged in transit</option>
                <option value="WRONG_BAG">Received wrong bag</option>
                <option value="BAG_NOT_DELIVERED">Bag was not delivered</option>
                <option value="PARTNER_BEHAVIOUR">Partner conduct issue</option>
                <option value="OTHER">Other problem</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Description (min 10 chars)</label>
              <textarea
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                minLength={10}
                maxLength={1000}
                placeholder="Explain what happened..."
                className="input-field"
                style={{ width: "100%", height: 90, padding: 10 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowDisputeModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleDispute} disabled={actionLoading} className="btn-primary" style={{ flex: 1, background: "var(--danger)" }}>
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
