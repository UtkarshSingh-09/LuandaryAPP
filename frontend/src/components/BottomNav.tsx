"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Package, Bell, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navItems = [
    { label: "Home", href: "/app", icon: Home },
    { label: "Requests", href: "/app/requests", icon: Package },
    {
      label: "Alerts",
      href: "/app/notifications",
      icon: Bell,
      badge: user?.unread_notifications || 0,
    },
    { label: "Profile", href: "/app/profile", icon: User },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/app"
            ? pathname === "/app"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive ? "active" : ""}`}
          >
            <div style={{ position: "relative" }}>
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
              {item.badge ? item.badge > 0 && <span className="nav-badge">{item.badge}</span> : null}
            </div>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
