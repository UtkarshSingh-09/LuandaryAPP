"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Package, ArrowUpRight, Clock, MapPin, 
  RefreshCw, Plus, ChevronRight, AlertCircle, Sparkles 
} from "lucide-react";
import { api } from "@/lib/api";
import { RequestSummary } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function RequestsListPage() {
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listRequests({ scope: activeTab });
      setRequests(res.items);
    } catch (err: any) {
      setError(err.message || "Failed to load requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [activeTab]);

  return (
    <div style={{ padding: "16px 16px 90px", maxWidth: 640, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            My Orders
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            Track and manage your laundry deliveries
          </p>
        </div>
        <button
          onClick={() => loadRequests(true)}
          disabled={refreshing || loading}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
          title="Refresh"
        >
          <RefreshCw size={18} className={refreshing ? "spin-animate" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        background: "var(--card-bg)",
        padding: 4,
        borderRadius: 12,
        border: "1px solid var(--border-color)",
        marginBottom: 20
      }}>
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
          Active Orders
        </button>
        <button
          onClick={() => setActiveTab("history")}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: 13,
            fontWeight: activeTab === "history" ? 700 : 500,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: activeTab === "history" ? "var(--primary)" : "transparent",
            color: activeTab === "history" ? "#ffffff" : "var(--text-secondary)",
            transition: "all 0.15s ease"
          }}
        >
          Order History
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

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ height: 110, opacity: 0.5, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
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
            <Package size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
            {activeTab === "active" ? "No active orders right now" : "No past orders found"}
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", maxWidth: 280 }}>
            {activeTab === "active"
              ? "Need your laundry picked up or delivered? Place a request in seconds."
              : "Completed and cancelled orders will be archived here."}
          </p>
          {activeTab === "active" && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Link href="/app/new/drop" className="btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
                <Plus size={15} style={{ marginRight: 6 }} /> Drop Bag
              </Link>
              <Link href="/app/new/pickup" className="btn-secondary" style={{ fontSize: 13, padding: "8px 16px" }}>
                <Plus size={15} style={{ marginRight: 6 }} /> Pickup Bag
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requests.map((item) => (
            <Link
              key={item.id}
              href={`/app/requests/${item.id}`}
              className="card"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
                padding: "16px",
                transition: "transform 0.15s ease, border-color 0.15s ease",
                cursor: "pointer"
              }}
            >
              {/* Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
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
                      {item.type}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
                      {item.ref}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>

                <StatusBadge status={item.status} />
              </div>

              {/* Middle Info */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                padding: "10px 0",
                borderTop: "1px solid var(--border-color)",
                borderBottom: "1px solid var(--border-color)",
                fontSize: 13
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                    <MapPin size={14} color="var(--primary)" />
                    <span>{item.hostel_block.name} • Room {item.room}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12 }}>
                    <Clock size={13} />
                    <span>Tier: {item.tier_code}</span>
                    <span>• {item.type === "DROP" ? "Hostel → Laundry Drop" : "Laundry → Room Delivery"}</span>
                    {item.rack_number && <span>• Rack: {item.rack_number}</span>}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    ₹{(item.price_paise / 100).toFixed(0)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Total
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 10,
                fontSize: 12,
                color: "var(--primary)",
                fontWeight: 600
              }}>
                <span>
                  {item.status === "PAYMENT_PENDING"
                    ? "⚠️ Payment required to open"
                    : item.status === "ACCEPTED"
                    ? "🏃 Partner is on the way"
                    : item.status === "OPEN"
                    ? "🔎 Searching partner..."
                    : "View order details"}
                </span>
                <ChevronRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
