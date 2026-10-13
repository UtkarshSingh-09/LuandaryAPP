"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Bike, Power, DollarSign, Package, Clock, MapPin, 
  ChevronRight, RefreshCw, ArrowLeft, ArrowRight, AlertCircle, Sparkles, CheckCircle2, ShieldCheck 
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PoolItem, PartnerJobDetail, PartnerEarnings } from "@/lib/types";

export default function PartnerHubPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [isOnline, setIsOnline] = useState(false);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"pool" | "active">("pool");
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [activeJobs, setActiveJobs] = useState<PartnerJobDetail[]>([]);
  const [earnings, setEarnings] = useState<PartnerEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      // 1. Load earnings
      const earn = await api.getPartnerEarnings();
      setEarnings(earn);

      // 2. Check profile online status from server or auth
      const onlineStatus = earn?.is_online ?? user?.partner?.is_online ?? isOnline;
      setIsOnline(onlineStatus);

      // 3. Load active jobs
      const jobs = await api.getPartnerJobs(true);
      setActiveJobs(jobs);

      // 4. Load pool if online
      if (onlineStatus) {
        const pool = await api.getPartnerPool();
        setPoolItems(pool);
      } else {
        setPoolItems([]);
      }
    } catch (err: any) {
      if (err.code !== "PARTNER_OFFLINE") {
        setError(err.message || "Failed to load partner data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Fast 3s interval so student requests pop up in pool almost immediately
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [user]);

  const handleToggleOnline = async () => {
    setOnlineLoading(true);
    setError(null);
    try {
      const nextState = !isOnline;
      await api.togglePartnerOnline(nextState);
      setIsOnline(nextState);
      if (nextState) {
        const pool = await api.getPartnerPool();
        setPoolItems(pool);
      } else {
        setPoolItems([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update online status.");
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleAcceptJob = async (jobId: string) => {
    setAcceptingId(jobId);
    setError(null);
    try {
      const accepted = await api.acceptJob(jobId);
      router.push(`/partner/jobs/${accepted.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to accept job.");
      setAcceptingId(null);
      loadData();
    }
  };

  if (!isLoading && !user) {
    return (
      <div style={{ maxWidth: 480, margin: "40px auto", padding: "24px 16px" }}>
        <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(16, 185, 129, 0.12)",
            color: "#10B981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px"
          }}>
            <Bike size={28} />
          </div>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 8px" }}>
            Delivery Partner Login Required
          </h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
            To view open student delivery requests, accept laundry deliveries, and withdraw earnings, please log in as a delivery partner.
          </p>
          <div style={{
            padding: "14px",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "12px",
            fontSize: "0.82rem",
            color: "#D97706",
            fontWeight: 700,
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            textAlign: "left"
          }}>
            <ShieldCheck size={20} style={{ flexShrink: 0 }} />
            <span>Age Requirement: You must be above 18 years of age and agree to the Terms & Conditions to work as a Delivery Partner.</span>
          </div>
          <Link
            href="/login?role=partner"
            className="btn btn-primary"
            style={{
              background: "#10B981",
              borderColor: "#10B981",
              padding: "12px 24px",
              fontSize: "0.95rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none"
            }}
          >
            Login as Delivery Partner <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 90px" }}>
      {/* Top Navbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary) 0%, #10b981 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Bike size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
              Partner Hub
            </h2>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
              Campus Delivery Partner
            </p>
          </div>
        </div>

        <Link
          href="/app"
          className="btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px", border: "1px solid var(--border-color)", borderRadius: 20 }}
        >
          Student App
        </Link>
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

      {/* Online / Offline Toggle Card */}
      <div className="card" style={{
        marginBottom: 16,
        padding: "16px 20px",
        background: isOnline ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)" : "var(--card-bg)",
        border: isOnline ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: isOnline ? "var(--success)" : "var(--text-muted)",
                boxShadow: isOnline ? "0 0 10px var(--success)" : "none"
              }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {isOnline ? "You are Online" : "You are Offline"}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              {isOnline ? "Receiving live delivery requests from campus hostels" : "Go online to see open deliveries in your area"}
            </p>
          </div>

          <button
            onClick={handleToggleOnline}
            disabled={onlineLoading}
            style={{
              padding: "10px 18px",
              borderRadius: 30,
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: isOnline ? "var(--danger)" : "var(--success)",
              color: "#ffffff",
              boxShadow: isOnline ? "0 4px 12px rgba(239, 68, 68, 0.3)" : "0 4px 12px rgba(16, 185, 129, 0.3)",
              transition: "all 0.15s ease"
            }}
          >
            <Power size={15} />
            {onlineLoading ? "Updating..." : isOnline ? "Go Offline" : "Go Online"}
          </button>
        </div>
      </div>

      {/* Quick Earnings Strip */}
      {earnings && (
        <Link
          href="/partner/earnings"
          className="card"
          style={{
            marginBottom: 20,
            padding: "14px 18px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid var(--border-color)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.12)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <DollarSign size={18} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Withdrawable Earnings</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)" }}>
                ₹{(earnings.available_balance_paise / 100).toFixed(0)}
                {earnings.pending_balance_paise > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginLeft: 6 }}>
                    (+₹{(earnings.pending_balance_paise / 100).toFixed(0)} held)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
            Wallet <ChevronRight size={16} />
          </div>
        </Link>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex",
        background: "var(--card-bg)",
        padding: 4,
        borderRadius: 12,
        border: "1px solid var(--border-color)",
        marginBottom: 16
      }}>
        <button
          onClick={() => setActiveTab("pool")}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: 13,
            fontWeight: activeTab === "pool" ? 700 : 500,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: activeTab === "pool" ? "var(--primary)" : "transparent",
            color: activeTab === "pool" ? "#ffffff" : "var(--text-secondary)",
            transition: "all 0.15s ease"
          }}
        >
          Open Requests ({poolItems.length})
        </button>
        <button
          onClick={() => setActiveTab("active")}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: 13,
            fontWeight: activeTab === "active" ? 700 : 500,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: activeTab === "active" ? "var(--primary)" : "transparent",
            color: activeTab === "active" ? "#ffffff" : "var(--text-secondary)",
            transition: "all 0.15s ease"
          }}
        >
          My Active Jobs ({activeJobs.length})
        </button>
      </div>

      {/* Tab 1: Available Pool */}
      {activeTab === "pool" && (
        <div>
          {!isOnline ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
              <Power size={32} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>You are currently offline</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
                Turn on your status to connect to live hostel deliveries in your area.
              </p>
              <button onClick={handleToggleOnline} className="btn-primary" style={{ padding: "10px 20px", fontSize: 13 }}>
                Go Online Now
              </button>
            </div>
          ) : poolItems.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
              <Package size={32} style={{ color: "var(--primary)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Pool is currently quiet</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                No unassigned laundry requests right now. New student requests will pop up automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {poolItems.map((item) => (
                <div key={item.id} className="card" style={{ padding: "16px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: item.type === "DROP" ? "rgba(79, 70, 229, 0.12)" : "rgba(16, 185, 129, 0.12)",
                          color: item.type === "DROP" ? "var(--primary)" : "var(--success)"
                        }}>
                          {item.type === "DROP" ? "ROOM → LAUNDRY" : "LAUNDRY → ROOM"}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
                          {item.ref}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Tier: {item.tier_code}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--success)" }}>
                        +₹{(item.payout_paise / 100).toFixed(0)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Your Payout
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 8,
                    padding: "10px 0",
                    borderTop: "1px solid var(--border-color)",
                    borderBottom: "1px solid var(--border-color)",
                    fontSize: 13,
                    color: "var(--text-secondary)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <MapPin size={14} color="var(--primary)" />
                      <span>{item.hostel_block.name} (Room revealed on accept)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                      <Clock size={13} />
                      <span>{item.laundry_location.name}</span>
                      <span>• {item.type === "DROP" ? "Hostel → Laundry" : "Laundry → Room"}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => handleAcceptJob(item.id)}
                      disabled={acceptingId === item.id}
                      className="btn-primary"
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8
                      }}
                    >
                      <Sparkles size={16} />
                      {acceptingId === item.id ? "Accepting..." : `Accept & Earn ₹${(item.payout_paise / 100).toFixed(0)}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Active Jobs */}
      {activeTab === "active" && (
        <div>
          {activeJobs.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
              <Package size={32} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>No active deliveries</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
                Switch to Open Requests to accept a delivery job!
              </p>
              <button onClick={() => setActiveTab("pool")} className="btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }}>
                Check Pool
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/partner/jobs/${job.id}`}
                  className="card"
                  style={{
                    padding: "16px",
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: job.type === "DROP" ? "rgba(79, 70, 229, 0.12)" : "rgba(16, 185, 129, 0.12)",
                        color: job.type === "DROP" ? "var(--primary)" : "var(--success)"
                      }}>
                        {job.type}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", marginLeft: 8 }}>
                        {job.ref}
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>
                        {job.hostel_block.name} • Room {job.room}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "4px 8px",
                        borderRadius: 12,
                        background: job.status === "PICKED_UP" ? "rgba(245, 158, 11, 0.12)" : "rgba(79, 70, 229, 0.12)",
                        color: job.status === "PICKED_UP" ? "var(--warning)" : "var(--primary)"
                      }}>
                        {job.status === "PICKED_UP" ? "In Transit" : "Assigned"}
                      </span>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--success)", marginTop: 4 }}>
                        ₹{(job.payout_paise / 100).toFixed(0)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border-color)",
                    fontSize: 12,
                    color: "var(--primary)",
                    fontWeight: 600
                  }}>
                    <span>
                      {job.status === "ACCEPTED" ? "🏃 Enter student code to collect bag" : "📦 Deliver & enter rack / code"}
                    </span>
                    <ChevronRight size={16} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
