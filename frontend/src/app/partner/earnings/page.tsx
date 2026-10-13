"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, DollarSign, Wallet, Clock, ArrowDownLeft, 
  ArrowUpRight, AlertCircle, ShieldCheck, CheckCircle2, 
  Sparkles, X, Star, AlertTriangle 
} from "lucide-react";
import { api } from "@/lib/api";
import { PartnerEarnings } from "@/lib/types";

export default function PartnerEarningsPage() {
  const router = useRouter();
  const [earnings, setEarnings] = useState<PartnerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payout Modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState(100);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  const loadEarnings = async () => {
    try {
      const data = await api.getPartnerEarnings();
      setEarnings(data);
    } catch (err: any) {
      setError(err.message || "Failed to load partner earnings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEarnings();
  }, []);

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payoutAmount < 100) {
      alert("Minimum payout amount is ₹100.");
      return;
    }
    const amountPaise = payoutAmount * 100;
    if (earnings && amountPaise > earnings.available_balance_paise) {
      alert("Amount exceeds your available balance.");
      return;
    }

    setPayoutLoading(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api.requestPayout(amountPaise, idempotencyKey);
      setPayoutSuccess(true);
      setShowPayoutModal(false);
      await loadEarnings();
    } catch (err: any) {
      alert(err.message || "Failed to submit payout request.");
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading wallet balance...</p>
      </div>
    );
  }

  const availableRupees = earnings ? (earnings.available_balance_paise / 100).toFixed(0) : "0";
  const pendingRupees = earnings ? (earnings.pending_balance_paise / 100).toFixed(0) : "0";
  const lifetimeRupees = earnings ? (earnings.lifetime_earned_paise / 100).toFixed(0) : "0";
  const canWithdraw = earnings && earnings.available_balance_paise >= 10000;

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}>
      {/* Top Navbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.push("/partner")}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
          Partner Earnings & Wallet
        </h2>
      </div>

      {payoutSuccess && (
        <div style={{
          padding: 14,
          background: "rgba(16, 185, 129, 0.12)",
          color: "var(--success)",
          borderRadius: 12,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <CheckCircle2 size={18} />
          Payout request submitted! Funds will be transferred to your registered UPI ID.
        </div>
      )}

      {/* Main Balance Card */}
      <div className="card" style={{
        marginBottom: 16,
        padding: "24px 20px",
        background: "linear-gradient(135deg, rgba(79, 70, 229, 0.14) 0%, rgba(16, 185, 129, 0.08) 100%)",
        border: "1px solid rgba(79, 70, 229, 0.3)",
        textAlign: "center"
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
          Available for Withdrawal
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em", marginBottom: 4 }}>
          ₹{availableRupees}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>
          Registered UPI: <strong style={{ color: "var(--text-primary)" }}>{earnings?.upi_id || "On file"}</strong>
        </p>

        <button
          onClick={() => setShowPayoutModal(true)}
          disabled={!canWithdraw}
          className="btn-primary"
          style={{
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 30,
            opacity: canWithdraw ? 1 : 0.6
          }}
        >
          <Wallet size={16} />
          {canWithdraw ? "Request UPI Payout" : "Minimum ₹100 to Withdraw"}
        </button>

        {/* Secondary Balances */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--border-color)",
          textAlign: "left",
          fontSize: 13
        }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}>HELD BALANCE</div>
            <div style={{ fontWeight: 800, color: "var(--warning)", marginTop: 2 }}>
              ₹{pendingRupees}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              Releases in 2h or upon student confirm
            </div>
          </div>

          <div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}>LIFETIME EARNED</div>
            <div style={{ fontWeight: 800, color: "var(--success)", marginTop: 2 }}>
              ₹{lifetimeRupees}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              From {earnings?.completed_jobs_count || 0} completed orders
            </div>
          </div>
        </div>
      </div>

      {/* Partner Performance Summary */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12 }}>
          PERFORMANCE & TRUST
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
          <div style={{ padding: 10, background: "var(--card-subtle)", borderRadius: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{earnings?.completed_jobs_count || 0}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Completed</div>
          </div>
          <div style={{ padding: 10, background: "var(--card-subtle)", borderRadius: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {earnings?.rating_avg ? earnings.rating_avg.toFixed(1) : "5.0"}
              <Star size={14} fill="var(--warning)" color="var(--warning)" />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Rating</div>
          </div>
          <div style={{ padding: 10, background: "var(--card-subtle)", borderRadius: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: (earnings?.strikes || 0) > 0 ? "var(--danger)" : "var(--success)" }}>
              {earnings?.strikes || 0} / 3
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Strikes</div>
          </div>
        </div>
      </div>

      {/* Statement / Ledger Entries */}
      <div className="card" style={{ padding: "20px" }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>
          Transaction Statement
        </h4>

        {(!earnings?.recent_entries || earnings.recent_entries.length === 0) ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
            No ledger transactions yet. Complete deliveries to see your earnings statement here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {earnings.recent_entries.map((entry) => {
              const isCredit = entry.available_delta_paise > 0 || entry.pending_delta_paise > 0;
              const deltaPaise = entry.available_delta_paise !== 0 ? entry.available_delta_paise : entry.pending_delta_paise;
              const deltaRupees = (Math.abs(deltaPaise) / 100).toFixed(0);

              return (
                <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {entry.entry_type === "EARN_HOLD" ? "Delivery Payout (Hold)"
                        : entry.entry_type === "EARN_RELEASE" ? "Hold Released to Available"
                        : entry.entry_type === "PAYOUT_RESERVE" ? "UPI Payout Requested"
                        : entry.entry_type === "CANCEL_COMP" ? "Cancellation Compensation"
                        : entry.entry_type}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {new Date(entry.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  <div style={{
                    fontWeight: 800,
                    fontSize: 14,
                    color: isCredit ? "var(--success)" : "var(--danger)"
                  }}>
                    {isCredit ? `+₹${deltaRupees}` : `-₹${deltaRupees}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payout Request Modal */}
      {showPayoutModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 380, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Request UPI Payout</h3>
              <button onClick={() => setShowPayoutModal(false)} className="btn-ghost" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Transfer your available earnings directly to your UPI ID: <strong>{earnings?.upi_id}</strong>.
            </p>

            <form onSubmit={handleRequestPayout}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Amount in Rupees (₹)
                </label>
                <input
                  type="number"
                  min={100}
                  step={1}
                  max={parseInt(availableRupees, 10)}
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(parseInt(e.target.value || "0", 10))}
                  className="input-field"
                  style={{ width: "100%", padding: 12, fontSize: 18, fontWeight: 800 }}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Available: ₹{availableRupees} • Min ₹100
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowPayoutModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={payoutLoading} className="btn-primary" style={{ flex: 1 }}>
                  {payoutLoading ? "Submitting..." : `Withdraw ₹${payoutAmount}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
