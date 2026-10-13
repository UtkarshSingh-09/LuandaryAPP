"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Clock, ShieldCheck, ChevronRight, Sparkles, MapPin, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { RequestSummary, PublicConfig } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [activeRequests, setActiveRequests] = useState<RequestSummary[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [reqs, cfg] = await Promise.all([
          api.listRequests({ scope: "active" }),
          api.getPublicConfig(),
        ]);
        setActiveRequests(reqs.items || []);
        setConfig(cfg);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const latestActive = activeRequests[0];

  return (
    <div style={{ padding: "18px 18px 40px 18px", display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Welcome Banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 800 }}>
            Hi, {(user?.name || "Student").split(" ")[0]} 👋
          </h2>
          <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
            Doorstep laundry service for {user?.hostel_block?.name || "Campus"}, Room {user?.room || "Your Room"}
          </p>
        </div>
        <div style={{
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--color-primary) 0%, #1D4ED8 100%)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "1.1rem"
        }}>
          {(user?.name || "S")[0].toUpperCase()}
        </div>
      </div>

      {/* ACTIVE ORDER LIVE HERO BANNER */}
      {latestActive ? (
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(234, 88, 12, 0.08) 100%)",
            borderColor: "var(--color-primary)",
            padding: "18px",
            boxShadow: "0 6px 20px rgba(37, 99, 235, 0.12)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--color-primary)" }}>
                ACTIVE ORDER {latestActive.ref}
              </span>
            </div>
            <StatusBadge status={latestActive.status} type={latestActive.type} />
          </div>

          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "4px" }}>
            {latestActive.type === "DROP" ? "Hostel bag drop to laundry" : "Cleaned bag delivery to room"}
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginBottom: "16px" }}>
            Tier: {latestActive.tier_code} • {latestActive.type === "DROP" ? "Hostel → Laundry Drop" : (latestActive.rack_number ? `Rack: ${latestActive.rack_number}` : "Laundry Screenshot Attached")}
          </p>

          <Link
            href={`/app/requests/${latestActive.id}`}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "space-between" }}
          >
            <span>Track & Show Handoff Code</span>
            <ChevronRight size={18} />
          </Link>
        </div>
      ) : null}

      {/* Quick Request Action Cards */}
      <div>
        <h3 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: "12px", color: "var(--color-text-main)" }}>
          Quick Delivery
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Link
            href="/app/new/drop"
            className="card card-interactive"
            style={{
              textDecoration: "none",
              padding: "18px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "linear-gradient(145deg, var(--color-surface) 0%, rgba(37, 99, 235, 0.04) 100%)",
              border: "1.5px solid var(--color-border)"
            }}
          >
            <div style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              backgroundColor: "rgba(37, 99, 235, 0.1)",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ArrowDownCircle size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                Drop Bag
              </h4>
              <p style={{ fontSize: "0.74rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                Send dirty clothes to laundry
              </p>
            </div>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--color-primary)", marginTop: "auto" }}>
              From ₹30 →
            </span>
          </Link>

          <Link
            href="/app/new/pickup"
            className="card card-interactive"
            style={{
              textDecoration: "none",
              padding: "18px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "linear-gradient(145deg, var(--color-surface) 0%, rgba(234, 88, 12, 0.04) 100%)",
              border: "1.5px solid var(--color-border)"
            }}
          >
            <div style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              backgroundColor: "rgba(234, 88, 12, 0.1)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ArrowUpCircle size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                Bring Clean Bag
              </h4>
              <p style={{ fontSize: "0.74rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                Get bag from laundry rack
              </p>
            </div>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--color-accent)", marginTop: "auto" }}>
              From ₹30 →
            </span>
          </Link>
        </div>
      </div>

      {/* Laundry Counter Operating Hours */}
      <div className="card" style={{ display: "flex", alignItems: "flex-start", gap: "14px", background: "var(--color-surface-hover)" }}>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-primary)",
          flexShrink: 0
        }}>
          <MapPin size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h4 style={{ fontSize: "0.88rem", fontWeight: 700 }}>
              {config?.laundry_locations?.[0]?.name || "Main Campus Laundry"}
            </h4>
            <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#D1FAE5", color: "#065F46", fontWeight: 700 }}>
              OPEN
            </span>
          </div>
          <p style={{ fontSize: "0.76rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
            {config?.laundry_locations?.[0]?.landmark || "Behind food court"} • Counter open 08:00 AM - 08:00 PM
          </p>
        </div>
      </div>

      {/* How it works banner */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>How Campus Delivery Works</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          <div className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
            <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--color-primary)" }}>1</span>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: "4px" }}>Create Order</p>
            <p style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginTop: "2px" }}>Name, room & laundry screenshot</p>
          </div>
          <div className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
            <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--color-accent)" }}>2</span>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: "4px" }}>Peer Pickup</p>
            <p style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginTop: "2px" }}>Show 4-digit OTP at door</p>
          </div>
          <div className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
            <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--color-success)" }}>3</span>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: "4px" }}>Delivered</p>
            <p style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", marginTop: "2px" }}>Delivered within promise</p>
          </div>
        </div>
      </div>
    </div>
  );
}
