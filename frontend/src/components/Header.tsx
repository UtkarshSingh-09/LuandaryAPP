"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, Bell, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { user } = useAuth();

  return (
    <header className="glass" style={{
      position: "sticky",
      top: 0,
      zIndex: 40,
      padding: "12px 18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid var(--color-border)"
    }}>
      <Link href="/app" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <div style={{
          width: "36px",
          height: "36px",
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
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-text-main)", lineHeight: 1.1 }}>
            Campus<span style={{ color: "var(--color-accent)" }}>Laundry</span>
          </h1>
          {user?.hostel_block && user?.room ? (
            <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
              <MapPin size={11} color="var(--color-accent)" />
              <span>{user.hostel_block.name} • Room {user.room}</span>
            </div>
          ) : (
            <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>Fast Campus Delivery</span>
          )}
        </div>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link
          href="/app/notifications"
          style={{
            position: "relative",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-surface-hover)",
            color: "var(--color-text-main)",
            textDecoration: "none"
          }}
        >
          <Bell size={18} />
          {user && user.unread_notifications > 0 && (
            <span style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)"
            }} />
          )}
        </Link>
      </div>
    </header>
  );
}
