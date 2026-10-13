"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  User as UserIcon, Mail, Phone, Hash, Building2, 
  MapPin, LogOut, Edit3, ShieldCheck, CheckCircle2, 
  Clock, AlertCircle, ArrowRight, DollarSign, Sparkles, X, ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { HostelBlockRef } from "@/lib/types";
import { CAMPUS_HOSTEL_BLOCKS } from "@/lib/constants";

export default function ProfilePage() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();

  const [blocks, setBlocks] = useState<HostelBlockRef[]>(CAMPUS_HOSTEL_BLOCKS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRegNo, setEditRegNo] = useState("");
  const [editBlockId, setEditBlockId] = useState("");
  const [editRoom, setEditRoom] = useState("");

  // Partner Application Modal
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerUpi, setPartnerUpi] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [partnerSuccess, setPartnerSuccess] = useState(false);

  useEffect(() => {
    api.getPublicConfig().then((cfg) => {
      setBlocks(cfg.hostel_blocks);
    }).catch(console.error);

    if (user) {
      setEditName(user.name || "");
      setEditPhone(user.phone?.replace("+91", "") || "");
      setEditRegNo(user.registration_number || "");
      setEditBlockId(user.hostel_block?.id || "");
      setEditRoom(user.room || "");
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.updateMe({
        name: editName,
        phone: editPhone ? `+91${editPhone}` : undefined,
        registration_number: editRegNo.toUpperCase(),
        hostel_block_id: editBlockId || undefined,
        room: editRoom
      });
      await refreshUser();
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      alert("Please accept partner terms.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Mock student college ID media ID for application
      const mockCollegeId = "0192b7f0-aa10-7b11-8c21-4d3e2f1a0b07";
      await api.applyPartner({
        id_photo_media_id: mockCollegeId,
        upi_id: partnerUpi,
        accepted_terms: true,
        terms_version: "2026-10-01"
      });
      await refreshUser();
      setPartnerSuccess(true);
      setShowPartnerModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to submit partner application.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to log out?")) {
      await logout();
      router.push("/login");
    }
  };

  if (!user) {
    return null;
  }

  const isPartnerApproved = user.partner_status === "APPROVED";
  const isPartnerPending = user.partner_status === "PENDING";

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
          Student Profile
        </h1>
        <button
          onClick={() => setShowEditModal(true)}
          className="btn-secondary"
          style={{ padding: "8px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Edit3 size={14} /> Edit
        </button>
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
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* User Information Card */}
      <div className="card" style={{ padding: "24px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 800,
            boxShadow: "0 8px 16px rgba(79, 70, 229, 0.2)"
          }}>
            {user.name ? user.name[0] : user.email[0].toUpperCase()}
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
              {user.name || "Student User"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              {user.email}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-color)" }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Phone size={14} /> Mobile Phone
            </span>
            <span style={{ fontWeight: 600 }}>{user.phone || "Not set"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-color)" }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Hash size={14} /> Registration No
            </span>
            <span style={{ fontWeight: 600 }}>{user.registration_number || "Not set"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-color)" }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Building2 size={14} /> Hostel Block
            </span>
            <span style={{ fontWeight: 600 }}>{user.hostel_block?.name || "Not selected"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 2 }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={14} /> Room Number
            </span>
            <span style={{ fontWeight: 600 }}>{user.room || "Not set"}</span>
          </div>
        </div>
      </div>

      {/* Campus Delivery Partner Banner / Card */}
      <div className="card" style={{
        padding: "20px",
        marginBottom: 20,
        background: isPartnerApproved
          ? "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)"
          : "linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)",
        border: isPartnerApproved ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border-color)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: isPartnerApproved ? "rgba(16, 185, 129, 0.15)" : "var(--primary-subtle)",
              color: isPartnerApproved ? "var(--success)" : "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <DollarSign size={18} />
            </div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              Campus Delivery Partner
            </h4>
          </div>

          {isPartnerApproved ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12, background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
              APPROVED
            </span>
          ) : isPartnerPending ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12, background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
              PENDING REVIEW
            </span>
          ) : null}
        </div>

        {isPartnerApproved ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 14px" }}>
              You are an authorized delivery partner. Earn ₹13 - ₹23 for every laundry delivery between student rooms and campus laundry.
            </p>
            <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              <div>UPI: <strong style={{ color: "var(--text-primary)" }}>{user.partner?.upi_id || "Registered"}</strong></div>
              <div>• Status: <strong style={{ color: "var(--success)" }}>Active</strong></div>
            </div>
            <Link
              href="/partner"
              className="btn-primary"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                textDecoration: "none"
              }}
            >
              Open Partner Dashboard <ChevronRight size={16} />
            </Link>
          </div>
        ) : isPartnerPending ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              Your application has been received and is under verification. Once campus admin confirms your student ID, your partner account will be unlocked!
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 16px" }}>
              Earn extra pocket money during free hostel hours! Get paid instant payouts directly to your UPI for delivering laundry bags.
            </p>
            <button
              onClick={() => setShowPartnerModal(true)}
              className="btn-primary"
              style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Sparkles size={15} /> Apply as Delivery Partner
            </button>
          </div>
        )}
      </div>

      {/* Logout Action */}
      <button
        onClick={handleLogout}
        className="btn-ghost"
        style={{
          width: "100%",
          padding: "14px",
          color: "var(--danger)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 12,
          border: "1px solid var(--border-color)"
        }}
      >
        <LogOut size={16} /> Log Out of CampusLaundry
      </button>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 420, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Edit Profile</h3>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Mobile Number (10 digits)</label>
                <input
                  type="tel"
                  required
                  pattern="[6-9][0-9]{9}"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Registration Number</label>
                <input
                  type="text"
                  required
                  value={editRegNo}
                  onChange={(e) => setEditRegNo(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Hostel Block</label>
                <select
                  required
                  value={editBlockId}
                  onChange={(e) => setEditBlockId(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                >
                  <option value="">Select block</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Room Number</label>
                <input
                  type="text"
                  required
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 1 }}>
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partner Application Modal */}
      {showPartnerModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 440, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Partner Application</h3>
              <button onClick={() => setShowPartnerModal(false)} className="btn-ghost" style={{ padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Deliver laundry within campus and earn ₹13 to ₹23 for every bag you deliver. Payouts are made directly to your UPI ID.
            </p>

            <form onSubmit={handleApplyPartner}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Payout UPI ID (e.g. name@okaxis, roll@paytm)
                </label>
                <input
                  type="text"
                  required
                  placeholder="yourname@bank"
                  pattern="^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9]{2,32}$"
                  value={partnerUpi}
                  onChange={(e) => setPartnerUpi(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 10 }}
                />
              </div>

              <div style={{
                padding: 12,
                background: "var(--card-subtle)",
                borderRadius: 8,
                border: "1px dashed var(--border-color)",
                marginBottom: 16,
                fontSize: 12,
                color: "var(--text-secondary)"
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Student Verification:</div>
                Your active SRM AP email ({user.email}) and roll number ({user.registration_number || "on record"}) will be verified by administration.
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 20 }}>
                <input
                  type="checkbox"
                  id="partner-terms"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <label htmlFor="partner-terms" style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  I agree to the CampusLaundry Delivery Partner Code of Conduct and Terms (v2026-10-01).
                </label>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowPartnerModal(false)} className="btn-ghost" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 1 }}>
                  {loading ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
