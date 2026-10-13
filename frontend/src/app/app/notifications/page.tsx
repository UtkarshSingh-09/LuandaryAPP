"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, RefreshCw, MessageSquare, Package, ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { NotificationItem } from "@/lib/types";

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.listNotifications();
      setNotifications(res.items);
      setUnreadCount(res.unread_count);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleItemClick = async (notif: NotificationItem) => {
    if (!notif.read_at) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error(err);
      }
    }

    if (notif.data && notif.data.deeplink) {
      router.push(notif.data.deeplink);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 90px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Notifications
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}` : "All caught up"}
          </p>
        </div>

        <button
          onClick={() => loadNotifications(true)}
          disabled={refreshing || loading}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
          title="Refresh"
        >
          <RefreshCw size={18} className={refreshing ? "spin-animate" : ""} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ height: 80, opacity: 0.5, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
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
            <Bell size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
            No notifications yet
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, maxWidth: 300 }}>
            You'll receive live status alerts when your orders are accepted, picked up, and delivered.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.map((item) => {
            const isUnread = !item.read_at;
            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="card"
                style={{
                  padding: "16px",
                  cursor: "pointer",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  background: isUnread ? "rgba(79, 70, 229, 0.05)" : "var(--card-bg)",
                  borderColor: isUnread ? "rgba(79, 70, 229, 0.3)" : "var(--border-color)",
                  transition: "transform 0.15s ease"
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isUnread ? "var(--primary)" : "var(--primary-subtle)",
                  color: isUnread ? "#ffffff" : "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <Package size={18} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <h4 style={{ fontSize: 14, fontWeight: isUnread ? 700 : 600, margin: 0, color: "var(--text-primary)" }}>
                      {item.title}
                    </h4>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(item.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                    {item.body}
                  </p>

                  {item.data?.deeplink && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--primary)", fontWeight: 600, marginTop: 6 }}>
                      View order <ArrowRight size={12} />
                    </div>
                  )}
                </div>

                {isUnread && (
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--primary)",
                    marginTop: 6,
                    flexShrink: 0
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
