"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Sparkles, Clock, ShieldCheck, ArrowRight, User, Bike, 
  CheckCircle2, DollarSign, MapPin, Phone, MessageSquare, LogOut 
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LandingPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  return (
    <div style={{ maxWidth: 540, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Brand Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "42px",
            height: "42px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, var(--color-primary) 0%, #1D4ED8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            boxShadow: "0 4px 14px var(--color-primary-glow)"
          }}>
            <Sparkles size={22} />
          </div>
          <div>
            <span style={{ fontSize: "1.25rem", fontWeight: 900, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
              Campus<span style={{ color: "var(--color-accent)" }}>Laundry</span>
            </span>
            <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
              SRM University AP
            </div>
          </div>
        </div>

        {user ? (
          <button 
            onClick={() => logout()}
            className="btn-ghost" 
            style={{ fontSize: 12, padding: "6px 10px", display: "flex", alignItems: "center", gap: 4, borderRadius: 8 }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        ) : (
          <Link href="/login" className="btn btn-secondary btn-sm" style={{ padding: "6px 14px", fontSize: 12 }}>
            Sign In
          </Link>
        )}
      </div>

      {/* Logged in Active Session Banner */}
      {user && (
        <div className="card" style={{
          padding: "16px",
          background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)",
          border: "1.5px solid rgba(37, 99, 235, 0.3)",
          borderRadius: 14
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--color-primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14
              }}>
                {(user.name || "U")[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Welcome back, {user.name || "Student"}!
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {user.email} • {user.room ? `Room ${user.room}` : "Hostel Resident"}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Link
              href="/app"
              className="btn btn-primary"
              style={{ fontSize: 13, padding: "10px", justifyContent: "center" }}
            >
              🎓 Student App
            </Link>
            <Link
              href="/partner"
              className="btn btn-secondary"
              style={{ fontSize: 13, padding: "10px", justifyContent: "center" }}
            >
              🛵 Partner Hub
            </Link>
          </div>
        </div>
      )}

      {/* Hero Title */}
      <div>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "5px 12px",
          borderRadius: "var(--radius-full)",
          background: "rgba(37, 99, 235, 0.08)",
          color: "var(--color-primary)",
          fontSize: "0.78rem",
          fontWeight: 700,
          marginBottom: 10
        }}>
          <span className="radar-dot" />
          Campus Laundry Delivery System
        </div>

        <h1 style={{ fontSize: "1.95rem", fontWeight: 900, lineHeight: 1.2, color: "var(--color-text-main)", margin: "0 0 10px" }}>
          Never walk to the campus laundry counter again.
        </h1>

        <p style={{ fontSize: "0.92rem", color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>
          Peer-to-peer laundry delivery for hostel students. Choose your role below to get started:
        </p>
      </div>

      {/* TWO PRIMARY SELECTION OPTIONS (STUDENT vs DELIVERY PARTNER) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* OPTION 1: LOGIN AS STUDENT */}
        <Link
          href="/login?role=student"
          className="card card-interactive"
          style={{
            padding: "20px",
            borderRadius: "16px",
            border: "2px solid var(--color-primary)",
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(30, 64, 175, 0.04) 100%)",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            boxShadow: "0 8px 24px rgba(37, 99, 235, 0.15)",
            transition: "transform 0.15s ease, box-shadow 0.15s ease"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "var(--color-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px var(--color-primary-glow)"
              }}>
                <User size={26} />
              </div>
              <div>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-primary)",
                  display: "block",
                  marginBottom: 2
                }}>
                  FOR HOSTEL RESIDENTS
                </span>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-main)", margin: 0 }}>
                  Login as Student
                </h3>
              </div>
            </div>

            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(37, 99, 235, 0.15)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ArrowRight size={18} />
            </div>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.45 }}>
            Drop dirty laundry or get fresh clean clothes brought to your room. Upload laundry screenshot, pay UPI, and share a 4-digit code at your door.
          </p>

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(37, 99, 235, 0.25)"
          }}>
            <span style={{ fontSize: "0.72rem", color: "var(--color-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={13} /> Under 2hr Delivery
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={13} /> Doorstep Handoff Code
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={13} /> Partner Live Contact
            </span>
          </div>
        </Link>

        {/* OPTION 2: LOGIN AS DELIVERY PARTNER */}
        <Link
          href="/login?role=partner"
          className="card card-interactive"
          style={{
            padding: "20px",
            borderRadius: "16px",
            border: "2px solid #10B981",
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            boxShadow: "0 8px 24px rgba(16, 185, 129, 0.15)",
            transition: "transform 0.15s ease, box-shadow 0.15s ease"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "#10B981",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)"
              }}>
                <Bike size={26} />
              </div>
              <div>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#059669",
                  display: "block",
                  marginBottom: 2
                }}>
                  EARN ₹15 - ₹35 PER TRIP
                </span>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-main)", margin: 0 }}>
                  Login as Delivery Partner
                </h3>
              </div>
            </div>

            <div style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ArrowRight size={18} />
            </div>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.45 }}>
            See live student laundry requests, accept deliveries, get student room & phone number, and deliver bags between hostels and the laundry desk.
          </p>

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(16, 185, 129, 0.25)"
          }}>
            <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <ShieldCheck size={13} /> Must be 18+ to Work
            </span>
            <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <DollarSign size={13} /> Instant Payout to UPI
            </span>
            <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={13} /> Flexible Hours Between Classes
            </span>
            <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={13} /> Direct Student Call & Chat
            </span>
          </div>
        </Link>
      </div>

      {/* How It Works Diagram */}
      <div className="card" style={{ padding: "18px" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 800, margin: "0 0 14px" }}>
          🔄 How Peer Delivery Works
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.82rem" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "var(--color-primary)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
              flexShrink: 0
            }}>1</div>
            <div>
              <strong>Student Places Request:</strong> Enter your Name, Room No, and upload a screenshot of your laundry portal booking.
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#10B981",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
              flexShrink: 0
            }}>2</div>
            <div>
              <strong>Partner Accepts:</strong> A nearby delivery partner sees the request in the Partner Pool and accepts it with 1 tap.
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#F59E0B",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
              flexShrink: 0
            }}>3</div>
            <div>
              <strong>Instant Direct Notification:</strong> Student is notified with partner's Name & Phone. Partner receives student's Name, Room & Phone.
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#8B5CF6",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 12,
              flexShrink: 0
            }}>4</div>
            <div>
              <strong>Secure Doorstep Verification:</strong> Student shares their 4-digit code at the door. Partner hands over laundry at counter.
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tiers Preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 800, margin: 0 }}>Delivery Pricing</h3>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Fixed campus rates</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <div className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-text-muted)" }}>STANDARD</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "var(--color-primary)", margin: "4px 0" }}>₹30</div>
            <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>2 - 3 hours</div>
          </div>

          <div className="card" style={{ padding: "12px 10px", textAlign: "center", border: "1.5px solid var(--color-primary)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-primary)" }}>FAST</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "var(--color-primary)", margin: "4px 0" }}>₹40</div>
            <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>1.5 - 2 hours</div>
          </div>

          <div className="card" style={{ padding: "12px 10px", textAlign: "center", border: "1.5px solid var(--color-accent)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-accent)" }}>EXPRESS</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "var(--color-accent)", margin: "4px 0" }}>₹50</div>
            <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>Under 1 hour</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-dim)", margin: 0 }}>
          CampusLaundry • SRM University AP Campus Pilot
        </p>
      </div>
    </div>
  );
}
