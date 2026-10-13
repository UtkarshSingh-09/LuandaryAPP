"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  Sparkles, ArrowRight, CheckCircle2, ShieldAlert, KeyRound, 
  Building, User, Phone, Hash, Bike, ArrowLeft 
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { PublicConfig } from "@/lib/types";
import { CAMPUS_HOSTEL_BLOCKS } from "@/lib/constants";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") === "partner" ? "partner" : "student";

  const { user, loginWithOtp } = useAuth();

  const [role, setRole] = useState<"student" | "partner">(initialRole);
  const [partnerTermsAccepted, setPartnerTermsAccepted] = useState(false);
  const [step, setStep] = useState<"EMAIL" | "OTP" | "ONBOARDING">("EMAIL");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [errorMsg, setErrorMsg] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);

  // Onboarding fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [hostelBlockId, setHostelBlockId] = useState("");
  const [room, setRoom] = useState("");

  useEffect(() => {
    const r = searchParams.get("role");
    if (r === "partner") setRole("partner");
    else if (r === "student") setRole("student");
  }, [searchParams]);

  useEffect(() => {
    api.getPublicConfig().then(setPublicConfig).catch(() => {});
  }, []);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleRequestOtp = async (targetEmail?: string) => {
    if (role === "partner" && !partnerTermsAccepted) {
      setErrorMsg("You must be at least 18 years old and agree to the Terms & Conditions to log in as a Delivery Partner.");
      return;
    }

    const emailToUse = (targetEmail || email).trim().toLowerCase();
    if (!emailToUse) return;

    setErrorMsg("");
    setLoading(true);
    try {
      const res = await api.requestOtp(emailToUse);
      setEmail(emailToUse);
      setStep("OTP");
      setResendCooldown(res.resend_after_seconds || 60);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to request OTP. Ensure using allowed university email domain.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) {
      const digits = val.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (i < 6) newOtp[i] = d;
      });
      setOtp(newOtp);
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    if (role === "partner" && !partnerTermsAccepted) {
      setErrorMsg("You must be at least 18 years old and agree to the Terms & Conditions to log in as a Delivery Partner.");
      return;
    }

    const fullCode = overrideCode || otp.join("");
    if (fullCode.length !== 6) {
      setErrorMsg("Please enter all 6 digits of the verification code.");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    try {
      const isNew = await loginWithOtp(email.trim().toLowerCase(), fullCode);
      const currentUser = await api.getMe();

      if (isNew || !currentUser.profile_complete) {
        setStep("ONBOARDING");
      } else {
        if (role === "partner") {
          router.push("/partner");
        } else {
          router.push("/app");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoRole: "student" | "partner") => {
    setRole(demoRole);
    if (demoRole === "partner" && !partnerTermsAccepted) {
      setErrorMsg("You must be at least 18 years old and tick the Terms & Conditions checkbox above to log in as a Delivery Partner.");
      return;
    }

    const demoEmail = demoRole === "partner" ? "partner@srmap.edu.in" : "student@srmap.edu.in";
    setEmail(demoEmail);
    setErrorMsg("");
    setLoading(true);
    try {
      await api.requestOtp(demoEmail);
      setStep("OTP");
      setOtp(["1", "2", "3", "4", "5", "6"]);
      // Auto verify after a brief tick
      setTimeout(() => {
        handleVerifyOtp(undefined, "123456");
      }, 300);
    } catch (err: any) {
      setErrorMsg(err.message || "Demo login failed");
      setLoading(false);
    }
  };

  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !registrationNumber || !hostelBlockId || !room) {
      setErrorMsg("All fields are required to complete your student profile.");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    try {
      await api.updateMe({
        name,
        phone: phone.startsWith("+91") ? phone : `+91${phone.replace(/[^0-9]/g, "").slice(-10)}`,
        registration_number: registrationNumber,
        hostel_block_id: hostelBlockId,
        room: room.toUpperCase(),
      });

      if (role === "partner") {
        try {
          await api.applyPartner({
            id_photo_media_id: "0192b8c0-77a1-7e02-9b10-3c4d5e6f7a08",
            upi_id: `${phone.replace(/[^0-9]/g, "")}@okaxis`,
            accepted_terms: true,
            terms_version: "2026-v1"
          });
        } catch {}
        router.push("/partner");
      } else {
        router.push("/app");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save profile. Check details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 60px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Brand Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
          <div style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, var(--color-primary) 0%, #1D4ED8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            boxShadow: "0 2px 10px var(--color-primary-glow)"
          }}>
            <Sparkles size={20} />
          </div>
          <span style={{ fontSize: "1.2rem", fontWeight: 900, fontFamily: "var(--font-display)" }}>
            Campus<span style={{ color: "var(--color-accent)" }}>Laundry</span>
          </span>
        </Link>

        <Link href="/" className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      {errorMsg && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-danger-bg)",
          color: "var(--color-danger)",
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          border: "1px solid rgba(239, 68, 68, 0.2)"
        }}>
          <ShieldAlert size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: Email Entry & Role Selector */}
      {step === "EMAIL" && (
        <div className="card" style={{ padding: "24px 20px" }}>
          {/* Role Toggle Switcher */}
          <div style={{
            display: "flex",
            background: "var(--color-surface-hover)",
            padding: 4,
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            marginBottom: 20
          }}>
            <button
              type="button"
              onClick={() => { setRole("student"); setEmail(""); }}
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: 13,
                fontWeight: role === "student" ? 800 : 600,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: role === "student" ? "var(--color-primary)" : "transparent",
                color: role === "student" ? "#ffffff" : "var(--color-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease"
              }}
            >
              <User size={16} /> Student
            </button>
            <button
              type="button"
              onClick={() => { setRole("partner"); setEmail(""); }}
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: 13,
                fontWeight: role === "partner" ? 800 : 600,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: role === "partner" ? "#10B981" : "transparent",
                color: role === "partner" ? "#ffffff" : "var(--color-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease"
              }}
            >
              <Bike size={16} /> Delivery Partner
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleRequestOtp(); }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0 }}>
                {role === "partner" ? "🛵 Delivery Partner Login" : "🎓 Student Login"}
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
                {role === "partner"
                  ? "Sign in to accept hostel laundry jobs, view student contacts & earn cash."
                  : "Sign in with your university email to book doorstep laundry pickup & delivery."}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                College Email ID
              </label>
              <input
                type="email"
                required
                className="input-field"
                placeholder="e.g. your_name@srmap.edu.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>
                Supported domain: @srmap.edu.in
              </span>
            </div>

            {/* Terms and Conditions for Delivery Partner (Age 18+ verification) */}
            {role === "partner" && (
              <div style={{
                padding: "16px",
                background: partnerTermsAccepted ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
                border: partnerTermsAccepted ? "1.5px solid rgba(16, 185, 129, 0.4)" : "1.5px solid rgba(245, 158, 11, 0.4)",
                borderRadius: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                transition: "all 0.2s ease"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    background: partnerTermsAccepted ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    color: partnerTermsAccepted ? "#059669" : "#D97706"
                  }}>
                    Required Age Verification (18+)
                  </span>
                  {partnerTermsAccepted && (
                    <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                      <CheckCircle2 size={14} /> Age & Terms Verified
                    </span>
                  )}
                </div>

                <label style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  cursor: "pointer",
                  userSelect: "none",
                  fontSize: "0.88rem",
                  lineHeight: 1.45,
                  color: "var(--color-text-main)",
                  fontWeight: 600
                }}>
                  <input
                    type="checkbox"
                    id="partner-age-checkbox"
                    checked={partnerTermsAccepted}
                    onChange={(e) => {
                      setPartnerTermsAccepted(e.target.checked);
                      if (e.target.checked) setErrorMsg("");
                    }}
                    style={{
                      width: "20px",
                      height: "20px",
                      marginTop: "2px",
                      accentColor: "#10B981",
                      cursor: "pointer",
                      flexShrink: 0
                    }}
                  />
                  <span>
                    I confirm that I am <strong>above 18 years of age</strong> and agree to the <strong>Terms & Conditions</strong> to work as a Delivery Partner.
                  </span>
                </label>

                <div style={{ fontSize: "0.74rem", color: "var(--color-text-muted)", paddingLeft: "32px", lineHeight: 1.4 }}>
                  Campus delivery partners must be legally an adult (18+) to accept paid deliveries, collect student items, and withdraw payments to their UPI account.
                </div>
              </div>
            )}

            {/* Quick Demo Autofill button for instant testing */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => handleQuickDemoLogin(role)}
                style={{
                  background: role === "partner" ? "rgba(16, 185, 129, 0.08)" : "rgba(37, 99, 235, 0.08)",
                  border: role === "partner" ? "1px dashed #10B981" : "1px dashed var(--color-primary)",
                  color: role === "partner" ? "#059669" : "var(--color-primary)",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center"
                }}
              >
                ⚡ 1-Tap Quick Demo {role === "partner" ? "Partner (partner@srmap.edu.in)" : "Student (student@srmap.edu.in)"}
              </button>
              {role === "partner" && !partnerTermsAccepted && (
                <div style={{ fontSize: "0.74rem", color: "#D97706", textAlign: "center", fontWeight: 600 }}>
                  ⚠️ Check the 18+ Terms & Conditions box above to log in
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!email || loading || (role === "partner" && !partnerTermsAccepted)}
              className="btn btn-primary btn-lg"
              style={{
                background: role === "partner" ? (partnerTermsAccepted ? "#10B981" : "rgba(16, 185, 129, 0.4)") : undefined,
                borderColor: role === "partner" ? (partnerTermsAccepted ? "#10B981" : "transparent") : undefined,
                cursor: (role === "partner" && !partnerTermsAccepted) ? "not-allowed" : "pointer",
                marginTop: 6
              }}
            >
              {loading ? "Sending Code..." : (role === "partner" && !partnerTermsAccepted ? "Accept 18+ Terms to Continue" : `Continue as ${role === "partner" ? "Delivery Partner" : "Student"}`)}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: 6-Digit OTP */}
      {step === "OTP" && (
        <form onSubmit={handleVerifyOtp} className="card" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0 }}>Enter 6-Digit Code</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
              We sent a verification code to <strong style={{ color: "var(--color-text-main)" }}>{email}</strong>
            </p>
          </div>

          {role === "partner" && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 10,
              color: "#059669",
              fontSize: 12,
              fontWeight: 700
            }}>
              <CheckCircle2 size={15} /> Confirmed: Age 18+ & Terms Accepted
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            {otp.map((digit, idx) => (
              <input
                key={idx}
                id={`otp-input-${idx}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                className="input-field"
                style={{
                  width: "48px",
                  height: "56px",
                  textAlign: "center",
                  fontSize: "1.4rem",
                  fontWeight: 900
                }}
                value={digit}
                onChange={(e) => handleOtpChange(idx, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digit && idx > 0) {
                    document.getElementById(`otp-input-${idx - 1}`)?.focus();
                  }
                }}
                autoFocus={idx === 0}
              />
            ))}
          </div>

          <div style={{
            padding: "8px 12px",
            background: "rgba(37, 99, 235, 0.08)",
            borderRadius: 8,
            fontSize: "0.78rem",
            color: "var(--color-primary)",
            textAlign: "center",
            fontWeight: 600
          }}>
            Sandbox Demo: Use code <strong>123456</strong> or <strong>482913</strong>
          </div>

          <button
            type="submit"
            disabled={otp.join("").length !== 6 || loading}
            className="btn btn-primary btn-lg"
            style={{ background: role === "partner" ? "#10B981" : undefined }}
          >
            {loading ? "Verifying..." : `Sign In to ${role === "partner" ? "Partner Hub" : "Student Dashboard"}`}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
            <button
              type="button"
              onClick={() => setStep("EMAIL")}
              className="btn-ghost"
              style={{ padding: "4px 8px" }}
            >
              Change Email
            </button>

            <button
              type="button"
              disabled={resendCooldown > 0 || loading}
              onClick={() => handleRequestOtp()}
              className="btn-ghost"
              style={{ padding: "4px 8px", color: resendCooldown > 0 ? "var(--color-text-dim)" : "var(--color-primary)" }}
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Quick Onboarding for New Users */}
      {step === "ONBOARDING" && (
        <form onSubmit={handleSaveOnboarding} className="card" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0 }}>Complete Your Profile</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
              Provide your campus hostel details to link deliveries.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>Your Full Name</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="e.g. Ananya Rao"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>Mobile Number</label>
              <input
                type="tel"
                required
                className="input-field"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>Reg Number</label>
              <input
                type="text"
                required
                className="input-field"
                placeholder="e.g. AP21110011234"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>Hostel Block</label>
              <select
                required
                className="input-field"
                value={hostelBlockId}
                onChange={(e) => setHostelBlockId(e.target.value)}
              >
                <option value="">Select Block</option>
                {(publicConfig?.hostel_blocks && publicConfig.hostel_blocks.length > 0 ? publicConfig.hostel_blocks : CAMPUS_HOSTEL_BLOCKS).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>Room Number</label>
              <input
                type="text"
                required
                className="input-field"
                placeholder="e.g. B-412"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ background: role === "partner" ? "#10B981" : undefined, marginTop: 10 }}
          >
            {loading ? "Saving Profile..." : `Complete & Enter ${role === "partner" ? "Partner Hub" : "Student Dashboard"}`}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading login...</div>}>
      <LoginForm />
    </Suspense>
  );
}
