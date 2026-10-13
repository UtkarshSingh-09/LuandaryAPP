"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { NewRequestSheet } from "@/components/NewRequestSheet";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "14px"
      }}>
        <div className="radar-dot" style={{ width: "24px", height: "24px" }} />
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
          Loading CampusLaundry...
        </span>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main style={{ paddingBottom: "100px", minHeight: "calc(100vh - 60px)" }}>
        {children}
      </main>
      <NewRequestSheet />
      <BottomNav />
    </>
  );
}
