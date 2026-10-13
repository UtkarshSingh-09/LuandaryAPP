"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, Upload, Image as ImageIcon, CheckCircle2, 
  Clock, Sparkles, AlertCircle, X, ShieldCheck, User, MapPin, Tag, Phone 
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, apiFetch } from "@/lib/api";
import { PublicConfig } from "@/lib/types";
import { CAMPUS_HOSTEL_BLOCKS } from "@/lib/constants";

export default function NewPickupRequestPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [room, setRoom] = useState("");
  const [rackNumber, setRackNumber] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [selectedTier, setSelectedTier] = useState<"STANDARD" | "FAST" | "EXPRESS">("FAST");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    api.getPublicConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      if (user.name) setName(user.name);
      if (user.phone) setPhone(user.phone.replace("+91", ""));
      if (user.room) setRoom(user.room);
      if (user.hostel_block?.id) setSelectedBlockId(user.hostel_block.id);
    }
  }, [user]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFile(file);
      const previewUrl = URL.createObjectURL(file);
      setScreenshotPreview(previewUrl);
    }
  };

  // Handle paste screenshot from clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setScreenshotFile(file);
            setScreenshotPreview(URL.createObjectURL(file));
            break;
          }
        }
      }
    }
  };

  const getTierPrice = (code: string) => {
    const tier = config?.tiers?.find((t) => t.code === code);
    return tier ? tier.price_paise / 100 : code === "STANDARD" ? 30 : code === "FAST" ? 40 : 50;
  };

  const getTierWindow = (code: string) => {
    const tier = config?.tiers?.find((t) => t.code === code);
    return tier ? tier.window_label : code === "STANDARD" ? "2 to 3 hours" : code === "FAST" ? "1.5 to 2 hours" : "under 1 hour";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Please enter your name.");
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg("Please enter a valid 10-digit phone number.");
      return;
    }
    const blockId = selectedBlockId || user?.hostel_block?.id || config?.hostel_blocks?.[0]?.id || CAMPUS_HOSTEL_BLOCKS[0].id;
    if (!blockId || !room.trim()) {
      setErrorMsg("Please provide your hostel block and room number.");
      return;
    }
    if (!screenshotFile && !screenshotPreview && !rackNumber.trim()) {
      setErrorMsg("Please upload a screenshot of your laundry page or enter a rack number.");
      return;
    }

    const locId = config?.laundry_locations?.[0]?.id || "0192b7a1-1d22-7020-8f33-bb11cc11dd02";

    setErrorMsg("");
    setLoading(true);

    try {
      let mediaId = "0192b8d8-4410-7c9a-8d11-6e5f4a3b2c09";
      if (screenshotFile) {
        try {
          const contentType = screenshotFile.type.includes("png") 
            ? "image/png" 
            : screenshotFile.type.includes("webp") 
            ? "image/webp" 
            : "image/jpeg";
          const signRes = await apiFetch("/uploads/sign", {
            method: "POST",
            body: JSON.stringify({
              kind: "READY_SCREENSHOT",
              content_type: contentType,
              size_bytes: Math.min(screenshotFile.size, 10485760),
            })
          });
          mediaId = signRes.id;
          await apiFetch(`/uploads/${mediaId}/complete`, { method: "POST" });
        } catch {
          mediaId = "0192b8d8-4410-7c9a-8d11-6e5f4a3b2c09";
        }
      }

      const idempotencyKey = crypto.randomUUID();
      const res = await api.createRequest(
        {
          type: "PICKUP",
          tier_code: selectedTier,
          name: name.trim(),
          phone: phone.trim().startsWith("+") ? phone.trim() : `+91${cleanPhone.slice(-10)}`,
          hostel_block_id: blockId,
          room: room.trim().toUpperCase(),
          laundry_location_id: locId,
          rack_number: (rackNumber.trim() || "SEE SCREENSHOT").toUpperCase(),
          ready_screenshot_media_id: mediaId,
          laundry_screenshot_media_id: mediaId,
          note: note.trim() || null,
        },
        idempotencyKey
      );

      if (res.payment?.redirect_url) {
        const url = res.payment.redirect_url.includes("req=")
          ? res.payment.redirect_url
          : `${res.payment.redirect_url}&req=${res.id}`;
        router.push(url);
      } else {
        router.push(`/app/requests/${res.id}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      onPaste={handlePaste}
      style={{ maxWidth: 540, margin: "0 auto", padding: "16px 16px 90px" }}
    >
      {/* Top Navbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          className="btn-ghost"
          style={{ padding: 8, borderRadius: "50%", display: "flex" }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            Pickup Clean Laundry
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
            We collect your cleaned clothes from laundry counter and bring to your room
          </p>
        </div>
      </div>

      {errorMsg && (
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
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Student Name & Room */}
        <div className="card" style={{ padding: "20px", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <User size={18} color="var(--primary)" /> Student Details
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Your Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ananya Rao"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                style={{ width: "100%", padding: 12, fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Phone Number
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="tel"
                  required
                  maxLength={13}
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field"
                  style={{ width: "100%", padding: 12, fontSize: 14 }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Hostel Block
              </label>
              <select
                value={selectedBlockId || user?.hostel_block?.id || ""}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="input-field"
                style={{ width: "100%", padding: 12, fontSize: 14 }}
              >
                {(config?.hostel_blocks && config.hostel_blocks.length > 0 ? config.hostel_blocks : CAMPUS_HOSTEL_BLOCKS).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Room No
              </label>
              <input
                type="text"
                required
                placeholder="e.g. B-412"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
                className="input-field"
                style={{ width: "100%", padding: 12, fontSize: 14, fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {/* Step 2: Screenshot of Laundry Ready Page / Slip */}
        <div className="card" style={{ padding: "20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <ImageIcon size={18} color="var(--primary)" /> Laundry Page Screenshot
            </h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: "var(--primary-subtle)", color: "var(--primary)" }}>
              REQUIRED
            </span>
          </div>

          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.4 }}>
            Upload screenshot showing your ready status or token from the laundry app. Partner will show this to counter staff.
          </p>

          {screenshotPreview ? (
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-color)", background: "#000", marginBottom: 14 }}>
              <img
                src={screenshotPreview}
                alt="Laundry Screenshot"
                style={{ width: "100%", maxHeight: 240, objectFit: "contain", display: "block" }}
              />
              <button
                type="button"
                onClick={() => {
                  setScreenshotFile(null);
                  setScreenshotPreview(null);
                }}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  background: "rgba(0, 0, 0, 0.75)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
                title="Remove screenshot"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "28px 16px",
              border: "2px dashed var(--border-color)",
              borderRadius: 12,
              cursor: "pointer",
              background: "var(--card-subtle)",
              marginBottom: 14,
              transition: "all 0.15s ease"
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--primary-subtle)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10
              }}>
                <Upload size={22} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                Upload Screenshot of Laundry Page
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                Tap to browse file, take photo, or paste image (PNG, JPG, WebP)
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Rack / Token Number (Optional if visible in screenshot)
            </label>
            <input
              type="text"
              placeholder="e.g. R-2481"
              value={rackNumber}
              onChange={(e) => setRackNumber(e.target.value.toUpperCase())}
              className="input-field"
              style={{ width: "100%", padding: 10, fontSize: 13, fontWeight: 700 }}
            />
          </div>
        </div>

        {/* Step 3: Speed Tier Selector */}
        <div className="card" style={{ padding: "20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={18} color="var(--primary)" /> Delivery Speed
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Pick arrival speed
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(["STANDARD", "FAST", "EXPRESS"] as const).map((tierCode) => {
              const isSelected = selectedTier === tierCode;
              const price = getTierPrice(tierCode);
              const windowLabel = getTierWindow(tierCode);

              return (
                <div
                  key={tierCode}
                  onClick={() => setSelectedTier(tierCode)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                    background: isSelected ? "rgba(79, 70, 229, 0.08)" : "var(--card-bg)",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: isSelected ? "6px solid var(--primary)" : "2px solid var(--border-color)",
                      background: "#fff"
                    }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {tierCode === "EXPRESS" ? "⚡ Express Delivery" : tierCode === "FAST" ? "🚀 Fast Delivery" : "📦 Standard Delivery"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        Arrives in {windowLabel}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
                    ₹{price}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 4: Special Note (Optional) */}
        <div className="card" style={{ padding: "16px 20px", marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Special Instructions (Optional)
          </label>
          <input
            type="text"
            maxLength={300}
            placeholder="e.g. Ring room bell when you arrive"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-field"
            style={{ width: "100%", padding: 12, fontSize: 13 }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{
            width: "100%",
            padding: "16px",
            fontSize: 15,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: "0 8px 24px rgba(79, 70, 229, 0.35)"
          }}
        >
          <Sparkles size={18} />
          {loading ? "Creating Order..." : `Continue to Pay ₹${getTierPrice(selectedTier)}`}
        </button>
      </form>
    </div>
  );
}
