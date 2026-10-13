"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Plus, ArrowDownCircle, ArrowUpCircle, X, Sparkles, Clock } from "lucide-react";

export function NewRequestSheet() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fab-btn"
        aria-label="Create new laundry request"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {isOpen && (
        <div className="sheet-backdrop" onClick={() => setIsOpen(false)}>
          <div className="sheet-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800 }}>Start Laundry Request</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>Fast campus pickup & delivery in 1-2 hours</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: "var(--color-surface-hover)",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--color-text-muted)"
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Link
                href="/app/new/drop"
                onClick={() => setIsOpen(false)}
                className="card card-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  textDecoration: "none",
                  border: "1.5px solid var(--color-border)",
                  padding: "16px",
                  background: "linear-gradient(135deg, var(--color-surface) 0%, rgba(37, 99, 235, 0.04) 100%)"
                }}
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  background: "rgba(37, 99, 235, 0.1)",
                  color: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <ArrowDownCircle size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                      Drop bag at laundry
                    </h4>
                    <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(37, 99, 235, 0.1)", color: "var(--color-primary)", fontWeight: 700 }}>
                      FROM HOSTEL
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                    Partner collects your dirty clothes bag from your room door & drops at the counter
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", fontSize: "0.75rem", color: "var(--color-primary)", fontWeight: 600 }}>
                    <span>Starting from ₹30</span>
                    <span>•</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={12} /> Fast delivery</span>
                  </div>
                </div>
              </Link>

              <Link
                href="/app/new/pickup"
                onClick={() => setIsOpen(false)}
                className="card card-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  textDecoration: "none",
                  border: "1.5px solid var(--color-border)",
                  padding: "16px",
                  background: "linear-gradient(135deg, var(--color-surface) 0%, rgba(234, 88, 12, 0.04) 100%)"
                }}
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  background: "rgba(234, 88, 12, 0.1)",
                  color: "var(--color-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <ArrowUpCircle size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                      Bring cleaned bag
                    </h4>
                    <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(234, 88, 12, 0.1)", color: "var(--color-accent)", fontWeight: 700 }}>
                      TO HOSTEL
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                    Enter laundry rack token number. Partner collects your cleaned laundry & brings to your room
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", fontSize: "0.75rem", color: "var(--color-accent)", fontWeight: 600 }}>
                    <span>Starting from ₹30</span>
                    <span>•</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Clock size={12} /> Doorstep delivery</span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
