import { ImageResponse } from "next/og";

import { brand, seo } from "@/content/site";

export const alt = seo.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 70% 55% at 50% 105%, #2459f2 0%, #0d1a52 45%, #070b1a 80%)",
        color: "#f3f6ff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill="#2459f2" />
          <path d="M5 24 14 8l9 16H5Z" fill="#fff" />
          <path d="m16.5 24 5-8.5 5.5 8.5h-10.5Z" fill="#d4af37" />
        </svg>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{brand.name}</div>
      </div>
      <div
        style={{
          marginTop: 36,
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -3,
          display: "flex",
        }}
      >
        Spend your crypto.
      </div>
      <div
        style={{
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: -3,
          color: "#e0b94a",
          display: "flex",
        }}
      >
        On everyday bills.
      </div>
      <div style={{ marginTop: 28, fontSize: 28, color: "#9aa6c8" }}>
        Airtime · Data · Electricity · Cable TV
      </div>
    </div>,
    { ...size },
  );
}
