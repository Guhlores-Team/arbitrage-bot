import { useEffect, useState } from "react";

// A celebratory coin shower fired on every "loot" (sale). `trigger` is a counter
// — each increment spawns a fresh burst that cleans itself up after the animation.
export default function CoinBurst({ trigger }: { trigger: number }) {
  const [coins, setCoins] = useState<{ id: number; dx: number; dy: number; delay: number }[]>([]);

  useEffect(() => {
    if (trigger === 0) return;
    const batch = Array.from({ length: 18 }, (_, i) => ({
      id: trigger * 100 + i,
      dx: (Math.random() - 0.5) * 320,
      dy: -(80 + Math.random() * 160),
      delay: Math.random() * 0.12,
    }));
    setCoins(batch);
    const t = setTimeout(() => setCoins([]), 1100);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!coins.length) return null;
  return (
    <div className="coinlayer">
      {coins.map((c) => (
        <div key={c.id} className="coin"
          style={{ ["--dx" as any]: `${c.dx}px`, ["--dy" as any]: `${c.dy}px`, animationDelay: `${c.delay}s` }} />
      ))}
    </div>
  );
}
