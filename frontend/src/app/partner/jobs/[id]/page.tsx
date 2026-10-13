"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, MessageSquare, MapPin, Clock,
  KeyRound, CheckCircle2, AlertTriangle, ShieldCheck,
  ChevronRight, X, Sparkles, RefreshCw
} from "lucide-react";
import { api } from "@/lib/api";
import { PartnerJobDetail } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PartnerJobExecutionPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const jobId = resolvedParams.id;
  const router = useRouter();

  const [job, setJob] = useState<PartnerJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [originCode, setOriginCode] = useState("");
  const [countedItems, setCountedItems] = useState<number | undefined>(undefined);
  const [rackNumber, setRackNumber] = useState("");
  const [destinationCode, setDestinationCode] = useState("");

  // Withdraw Modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("BUSY");
  const [withdrawNote, setWithdrawNote] = useState("");

  const loadJob = async () => {
    try {
      const data = await api.getPartnerJobDetail(jobId);
      setJob(data);
      if (data.total_count) {
        setCountedItems(data.total_count);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load job details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobId]);

  const handleVerifyOrigin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (originCode.length !== 4) {
      alert("Please enter the 4-digit code provided by the student.");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await api.verifyOriginCode(jobId, originCode, countedItems);
      setOriginCode("");
      await loadJob();
    } catch (err: any) {
      setError(err.message || "Invalid verification code.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (job?.type === "DROP" && (!rackNumber || !rackNumber.trim())) {
      alert("Please enter the laundry rack number from the counter slip.");
      return;
    }
    if (job?.type === "PICKUP" && destinationCode.length !== 4) {
      alert("Please enter the 4-digit delivery code from the student.");
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await api.completePartnerJob(jobId, {
        rack_number: job?.type === "DROP" ? rackNumber.trim().toUpperCase() : undefined,
        code: job?.type === "PICKUP" ? destinationCode : undefined
      });
      await loadJob();
    } catch (err: any) {
      setError(err.message || "Failed to complete delivery.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.withdrawJob(jobId, withdrawReason, withdrawNote || undefined);
      if (res.strike_added > 0) {
        alert("Job returned to pool. Note: 1 strike was added due to withdrawal past 5 minutes.");
      }
      router.push("/partner");
    } catch (err: any) {
      alert(err.message || "Failed to withdraw from job.");
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: 40, textAlign: "center" }}>
        <RefreshCw size={24} className="spin-animate" style={{ margin: "0 auto 12px", color: "var(--primary)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading delivery details...</p>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", padding: 24 }}>
        <button onClick={() => router.push("/partner")} className="btn-ghost" style={{ marginBottom: 16 }}>
          <ArrowLeft size={18} style={{ marginRight: 6 }} /> Back to Partner Hub
        </button>
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--danger)" }}>
          <AlertTriangle size={32} style={{ margin: "0 auto 12px" }} />
          <h3>Error loading job</h3>
          <p style={{ fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const isAccepted = job.status === "ACCEPTED";
  const isPickedUp = job.status === "PICKED_UP";
  const isCompleted = job.status === "COMPLETED";

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}>
      {/* Top Navbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => router.push("/partner")}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            {job.type} DELIVERY
          </span>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>
            {job.ref}
          </div>
        </div>

        <div style={{
          fontSize: 14,
          fontWeight: 800,
          color: "var(--success)",
          background: "rgba(16, 185, 129, 0.12)",
          padding: "4px 10px",
          borderRadius: 20
        }}>
          +₹{(job.payout_paise / 100).toFixed(0)}
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12,
          background: "var(--danger-bg)",
          color: "var(--danger)",
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Student Contact Card */}
      <div className="card" style={{ marginBottom: 16, padding: "18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 }}>
          STUDENT CONTACT
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
              {job.student.first_name[0]}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                {job.student.first_name}
              </h4>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", marginTop: 2 }}>
                📞 {job.student.phone}
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                {job.hostel_block.name} • Room {job.room}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`tel:${job.student.phone}`}
              className="btn-primary"
              style={{ padding: "8px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <Phone size={14} /> Call
            </a>
            <a
              href={`https://wa.me/${job.student.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ padding: "8px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <MessageSquare size={14} /> Chat
            </a>
          </div>
        </div>

        {job.note && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--card-subtle)", borderRadius: 8, fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>
            Note: "{job.note}"
          </div>
        )}
      </div>

      {/* Navigation / Destination Card */}
      <div className="card" style={{ marginBottom: 16, padding: "18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12 }}>
          ROUTE INFORMATION
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <MapPin size={16} color="var(--primary)" style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {job.type === "DROP" ? "Origin (Pickup bag here):" : "Destination (Deliver bag here):"}
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                {job.hostel_block.name}, Room {job.room}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Clock size={16} color="var(--success)" style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {job.type === "DROP" ? "Destination (Hand in bag):" : "Origin (Collect bag):"}
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                {job.laundry_location.name} {job.laundry_location.landmark && `(${job.laundry_location.landmark})`}
              </div>
            </div>
          </div>

          {job.rack_number && (
            <div style={{ padding: "8px 12px", background: "rgba(79, 70, 229, 0.08)", borderRadius: 8, fontWeight: 700, color: "var(--primary)" }}>
              Laundry Rack Token: {job.rack_number}
            </div>
          )}

          {job.media && job.media.length > 0 && (
            <div style={{ marginTop: 8, padding: "12px", background: "var(--card-subtle)", borderRadius: 8, border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                Student Laundry Screenshot / Token
              </div>
              <a href={job.media[0].url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                <img
                  src={job.media[0].url}
                  alt="Student laundry screenshot"
                  style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 6, background: "#000" }}
                  onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                />
              </a>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
                Show this screenshot at the laundry counter if required
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Box 1: DROP ORIGIN VERIFICATION */}
      {job.type === "DROP" && isAccepted && (
        <div className="card" style={{
          marginBottom: 16,
          padding: "20px",
          background: "linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)",
          border: "2px solid rgba(79, 70, 229, 0.3)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            <KeyRound size={16} />
            Step 1: Verify 4-Digit Student Code
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Meet student at <strong>{job.hostel_block.name} Room {job.room}</strong>. Ask student to read out their 4-digit handoff code:
          </p>

          <form onSubmit={handleVerifyOrigin}>
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                pattern="^[0-9]{4}$"
                maxLength={4}
                required
                placeholder="4-digit code (e.g. 4821)"
                value={originCode}
                onChange={(e) => setOriginCode(e.target.value.replace(/[^0-9]/g, ""))}
                className="input-field"
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: 20,
                  textAlign: "center",
                  letterSpacing: "0.2em",
                  fontWeight: 800
                }}
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading || originCode.length !== 4}
              className="btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700 }}
            >
              {actionLoading ? "Verifying..." : "Verify Code & Collect Bag"}
            </button>
          </form>
        </div>
      )}

      {/* Action Box 2: DROP LAUNDRY HANDOVER (COMPLETION) */}
      {job.type === "DROP" && isPickedUp && (
        <div className="card" style={{
          marginBottom: 16,
          padding: "20px",
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)",
          border: "2px solid rgba(16, 185, 129, 0.3)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            <CheckCircle2 size={16} />
            Step 2: Hand In At Laundry Counter
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Hand over laundry bag at <strong>{job.laundry_location.name}</strong>. Enter the rack token number printed on the receipt/slip:
          </p>

          <form onSubmit={handleCompleteJob}>
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                required
                maxLength={20}
                placeholder="Rack Number (e.g. R-4821)"
                value={rackNumber}
                onChange={(e) => setRackNumber(e.target.value.toUpperCase())}
                className="input-field"
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: 16,
                  textAlign: "center",
                  fontWeight: 800
                }}
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading || !rackNumber}
              className="btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700, background: "var(--success)" }}
            >
              {actionLoading ? "Completing..." : `Complete Delivery & Earn ₹${(job.payout_paise / 100).toFixed(0)}`}
            </button>
          </form>
        </div>
      )}

      {/* Action Box 3: PICKUP DESTINATION VERIFICATION */}
      {job.type === "PICKUP" && isPickedUp && (
        <div className="card" style={{
          marginBottom: 16,
          padding: "20px",
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)",
          border: "2px solid rgba(16, 185, 129, 0.3)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success)", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            <KeyRound size={16} />
            Deliver Clean Bag to Room {job.room}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Hand over clean clothes bag to student. Ask for their 4-digit completion code:
          </p>

          <form onSubmit={handleCompleteJob}>
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                pattern="^[0-9]{4}$"
                maxLength={4}
                required
                placeholder="4-digit student code"
                value={destinationCode}
                onChange={(e) => setDestinationCode(e.target.value.replace(/[^0-9]/g, ""))}
                className="input-field"
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: 20,
                  textAlign: "center",
                  letterSpacing: "0.2em",
                  fontWeight: 800
                }}
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading || destinationCode.length !== 4}
              className="btn-primary"
              style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700, background: "var(--success)" }}
            >
              {actionLoading ? "Completing..." : `Verify & Complete Delivery`}
            </button>
          </form>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="card" style={{ textAlign: "center", padding: "28px 20px", marginBottom: 16, border: "1px solid rgba(16, 185, 129, 0.4)" }}>
          <CheckCircle2 size={40} color="var(--success)" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>
            Delivery Complete!
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            ₹{(job.payout_paise / 100).toFixed(0)} credited to your earnings (held balance). Automatically releases to available balance after 2 hours or when student confirms receipt.
          </p>
          <Link href="/partner" className="btn-primary" style={{ padding: "10px 20px", fontSize: 13, textDecoration: "none", display: "inline-block" }}>
            Back to Partner Hub
          </Link>
        </div>
      )}

      {/* Withdraw Button */}
      {isAccepted && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowWithdrawModal(true)}
            className="btn-ghost"
            style={{ width: "100%", padding: "12px", fontSize: 13, color: "var(--danger)" }}
          >
            Give Back Job (Withdraw)
          </button>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 400, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Withdraw Job</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="btn-ghost" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
              Note: Withdrawing after 5 minutes of acceptance will add 1 strike to your partner record per campus policy.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason</label>
              <select
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                className="input-field"
                style={{ width: "100%", padding: 10 }}
              >
                <option value="BUSY">Emergency / Busy</option>
                <option value="LAUNDRY_NOT_READY">Laundry not ready (PICKUP)</option>
                <option value="LAUNDRY_CLOSED">Laundry is closed</option>
                <option value="STUDENT_UNREACHABLE">Student not answering (at hostel)</option>
                <option value="CHANGED_MIND">Changed mind</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Additional note</label>
              <textarea
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                placeholder="Details..."
                className="input-field"
                style={{ width: "100%", height: 70, padding: 10 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowWithdrawModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                Keep Job
              </button>
              <button onClick={handleWithdraw} disabled={actionLoading} className="btn-primary" style={{ flex: 1, background: "var(--danger)" }}>
                {actionLoading ? "Withdrawing..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
