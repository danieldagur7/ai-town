import { Clock, clockState } from '../../convex/aiTown/clock';

// Sky tint by in-game hour: [hour, r, g, b, alpha]. Interpolated between keys.
const SKY: [number, number, number, number, number][] = [
  [0, 10, 20, 70, 0.5],
  [5, 10, 20, 70, 0.5],
  [6.5, 255, 170, 120, 0.18],
  [8.5, 255, 255, 255, 0],
  [17, 255, 255, 255, 0],
  [19, 255, 130, 60, 0.2],
  [21, 40, 30, 90, 0.38],
  [22, 10, 20, 70, 0.5],
  [24, 10, 20, 70, 0.5],
];

function skyColor(hour: number) {
  for (let i = 1; i < SKY.length; i++) {
    const [h1, ...a] = SKY[i - 1];
    const [h2, ...b] = SKY[i];
    if (hour <= h2) {
      const t = (hour - h1) / (h2 - h1);
      const [r, g, bl, alpha] = a.map((v, j) => v + (b[j] - v) * t);
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${alpha.toFixed(3)})`;
    }
  }
  return 'transparent';
}

export function DayNightOverlay({ clock }: { clock: Clock }) {
  const { hour } = clockState(clock.elapsed);
  return (
    <div
      className="absolute inset-0 pointer-events-none transition-colors duration-1000 ease-linear"
      style={{ backgroundColor: skyColor(hour) }}
    />
  );
}
