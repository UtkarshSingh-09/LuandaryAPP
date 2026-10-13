"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, CheckCircle2, XCircle, Smartphone, Clock } from "lucide-react";
import { api } from "@/lib/api";

function MockPayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = searchParams.get("order") || "CLP-MOCK";
  const amountPaise = parseInt(searchParams.get("amount") || "3000", 10);
  const amountRupees = (amountPaise / 100).toFixed(0);
  const requestId = searchParams.get("req");

  const [timeLeft, setTimeLeft] = useState(899); // 15 mins
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handlePaySuccess = async () => {
    if (!requestId) {
      router.push("/app/requests");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.mockCompletePayment(requestId, "SUCCESS");
      router.push(`/app/requests/${requestId}`);
    } catch (err: any) {
      setError(err.message || "Payment simulation failed.");
      setLoading(false);
    }
  };

  const handlePayCancel = async () => {
    if (!requestId) {
      router.push("/app");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.mockCompletePayment(requestId, "FAILED");
      router.push(`/app/requests/${requestId}`);
    } catch (err: any) {
      setError(err.message || "Failed to cancel payment.");
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "20px 16px 80px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.back()}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>UPI Payment Gateway</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Mock Gateway Simulator (Sandbox)
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12,
          background: "var(--danger-bg)",
          color: "var(--danger)",
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 13
        }}>
          {error}
        </div>
      )}

      {/* Bill Card */}
      <div className="card" style={{ textAlign: "center", padding: "28px 20px", marginBottom: 20 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--primary-subtle)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px"
        }}>
          <Smartphone size={28} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
          Amount to Pay
        </p>
        <div style={{ fontSize: 36, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          ₹{amountRupees}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          Order ID: <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{orderId}</span>
        </p>

        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(245, 158, 11, 0.12)",
          color: "var(--warning)",
          padding: "6px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          marginTop: 14
        }}>
          <Clock size={14} />
          Expires in {formatTimer(timeLeft)}
        </div>
      </div>

      {/* UPI QR & Payment Simulation Card */}
      <div className="card" style={{ marginBottom: 24, padding: "20px" }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
          Simulate UPI Intent Callback
        </h4>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 20 }}>
          In production, students are redirected to PhonePe/Paytm UPI. Select an action below to simulate the bank webhook response:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={handlePaySuccess}
            disabled={loading}
            className="btn-primary"
            style={{
              padding: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 15,
              fontWeight: 700
            }}
          >
            <CheckCircle2 size={18} />
            {loading ? "Processing..." : `Approve & Pay ₹${amountRupees}`}
          </button>

          <button
            onClick={handlePayCancel}
            disabled={loading}
            className="btn-ghost"
            style={{
              padding: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 14,
              color: "var(--danger)"
            }}
          >
            <XCircle size={16} />
            Simulate Payment Failure / Cancel
          </button>
        </div>
      </div>

      {/* Security badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--text-muted)",
        fontSize: 12
      }}>
        <ShieldCheck size={16} color="var(--success)" />
        100% Secure Campus Sandbox • 256-bit Encryption
      </div>
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: 40, textAlign: "center" }}>Loading payment gateway...</div>}>
      <MockPayContent />
    </Suspense>
  );
}
