export function ScoreRing({ score, color, size = 168 }: { score: number | null; color: string; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const p = score === null ? 0.08 : score / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score ?? "unranked"}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const r1 = r + 6, r2 = r + (i % 5 === 0 ? 10 : 8);
        return <line key={i} x1={size / 2 + Math.cos(a) * r1} y1={size / 2 + Math.sin(a) * r1} x2={size / 2 + Math.cos(a) * r2} y2={size / 2 + Math.sin(a) * r2} stroke="var(--line-2)" strokeWidth="1" />;
      })}
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: "stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--text)" style={{ font: `400 ${size * 0.36}px var(--font-serif)` }}>
        {score ?? "—"}
      </text>
    </svg>
  );
}
