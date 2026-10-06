export function TokenAvatar({ hue, ticker, size = 44 }: { hue: number; ticker: string; size?: number }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 90% 70% / .9), hsl(${hue} 70% 30% / .9) 55%, #050505)`,
      }}
    >
      <span className="font-serif text-white/90 italic" style={{ fontSize: size * 0.42 }}>{ticker[0]}</span>
    </div>
  );
}
