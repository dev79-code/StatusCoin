import { ImageResponse } from "next/og";
import { fetchStatus, isWallet } from "@/lib/api";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Status score card";

const COLORS = { ELITE: "#e9c46a", VERIFIED: "#6ee7f0", OPEN: "#b4b3bf", DENIED: "#ff4d5e", UNRANKED: "#8b7cf6" } as const;
const LABEL = { ELITE: "Elite", VERIFIED: "Verified", OPEN: "Open", DENIED: "Denied", UNRANKED: "Probation" } as const;

export default async function Image({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const r = isWallet(wallet) ? await fetchStatus(wallet).catch(() => null) : null;
  const tier = r?.tier ?? "UNRANKED";
  const c = COLORS[tier];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: `radial-gradient(900px 500px at 100% 0%, ${c}33, transparent), #060608`, color: "#ecebf0", fontFamily: "monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, letterSpacing: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 16, height: 16, borderRadius: 99, background: "#d6ff3d" }} /><span>STATUS</span></span>
          <span style={{ color: "#8b8a96", fontSize: 22, letterSpacing: 4 }}>{`${wallet.slice(0, 6)}…${wallet.slice(-6)}`}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, color: "#8b8a96", letterSpacing: 6, textTransform: "uppercase" }}>{r?.verdict ?? ""}</span>
            <span style={{ fontSize: 150, color: c, fontStyle: "italic", lineHeight: 1 }}>{LABEL[tier]}</span>
          </div>
          <span style={{ fontSize: 220, lineHeight: 0.9 }}>{String(r?.score ?? "—")}</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#cfcfd6", maxWidth: 1000 }}>{`“${r?.roast ?? "Not everyone gets in."}”`}</div>
      </div>
    ),
    size,
  );
}
