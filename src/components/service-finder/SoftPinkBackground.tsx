import { useMemo } from "react";

interface Circle {
  size: number;
  top: number;
  left: number;
  opacity: number;
}

interface SoftPinkBackgroundProps {
  density?: number;
  seed?: number;
}

const seededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const dist = (a: Circle, b: Circle) => {
  const dx = a.left - b.left;
  const dy = a.top - b.top;
  return Math.sqrt(dx * dx + dy * dy);
};

const SoftPinkBackground = ({ density = 6, seed = 42 }: SoftPinkBackgroundProps) => {
  const circles: Circle[] = useMemo(() => {
    const rand = seededRandom(seed);
    const count = Math.round(density * 1.5);
    const sizes = [60, 90, 120, 160, 200, 240, 80, 110, 145];
    const placed: Circle[] = [];
    let attempts = 0;

    while (placed.length < count && attempts < count * 40) {
      attempts++;
      const size = sizes[Math.floor(rand() * sizes.length)];
      const top = 5 + rand() * 85;
      const left = 5 + rand() * 85;
      const candidate: Circle = { size, top, left, opacity: 0.45 + rand() * 0.3 };

      const minGap = size * 0.6;
      const tooClose = placed.some((p) => dist(candidate, p) < (minGap + p.size * 0.3) / 10);
      if (!tooClose) placed.push(candidate);
    }
    return placed;
  }, [density, seed]);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {circles.map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: c.size,
            height: c.size,
            borderRadius: "50%",
            background: "#FBD5D8",
            top: `${c.top}%`,
            left: `${c.left}%`,
            opacity: c.opacity,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
};

export default SoftPinkBackground;
