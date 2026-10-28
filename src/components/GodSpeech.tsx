import { Graphics } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { useCallback, useEffect, useState } from 'react';

const PULSE_MS = 4000;

// Preview of how far the god's words will reach, centered on the god.
export function SpeechRadius({
  x,
  y,
  radius,
  tileDim,
}: {
  x: number;
  y: number;
  radius: number;
  tileDim: number;
}) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.beginFill(0xffe9a0, 0.1);
      g.lineStyle(3, 0xffd34d, 0.8);
      g.drawCircle((x + 0.5) * tileDim, (y + 0.5) * tileDim, radius * tileDim);
      g.endFill();
    },
    [x, y, radius, tileDim],
  );
  return <Graphics draw={draw} />;
}

// A ring of light that sweeps out to the radius right after the god speaks.
export function SpeechPulse({
  speech,
  tileDim,
}: {
  speech: { x: number; y: number; radius: number; time: number };
  tileDim: number;
}) {
  const [now, setNow] = useState(Date.now());
  const active = now - speech.time < PULSE_MS;
  useEffect(() => {
    if (Date.now() - speech.time >= PULSE_MS) {
      return;
    }
    let frame = requestAnimationFrame(function step() {
      setNow(Date.now());
      if (Date.now() - speech.time < PULSE_MS) {
        frame = requestAnimationFrame(step);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [speech.time]);
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const t = Math.min(1, Math.max(0, (now - speech.time) / PULSE_MS));
      const cx = (speech.x + 0.5) * tileDim;
      const cy = (speech.y + 0.5) * tileDim;
      g.beginFill(0xfff4c2, 0.25 * (1 - t));
      g.drawCircle(cx, cy, Math.min(1, t * 2) * speech.radius * tileDim);
      g.endFill();
      g.lineStyle(4, 0xffd34d, 1 - t);
      g.drawCircle(cx, cy, Math.min(1, t * 2) * speech.radius * tileDim);
    },
    [now, speech, tileDim],
  );
  return active ? <Graphics draw={draw} /> : null;
}

const BOLT_MS = 900;
const SCORCH_MS = 6000;

// A lightning bolt from the sky onto the punished character, then a scorch mark.
export function Smite({
  smite,
  tileDim,
}: {
  smite: { x: number; y: number; time: number };
  tileDim: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (Date.now() - smite.time >= SCORCH_MS) {
      return;
    }
    let frame = requestAnimationFrame(function step() {
      setNow(Date.now());
      if (Date.now() - smite.time < SCORCH_MS) {
        frame = requestAnimationFrame(step);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [smite.time]);
  const age = now - smite.time;
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const cx = (smite.x + 0.5) * tileDim;
      const cy = (smite.y + 0.5) * tileDim;
      // Scorch mark that fades out.
      g.beginFill(0x2a1a0a, 0.5 * (1 - age / SCORCH_MS));
      g.drawEllipse(cx, cy + 10, 18, 7);
      g.endFill();
      if (age < BOLT_MS) {
        // Flicker the bolt, with a fixed zigzag seeded by the strike time.
        const alpha = Math.floor(age / 90) % 2 === 0 ? 1 : 0.4;
        let seed = smite.time % 9973;
        const rand = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
        const points = [];
        for (let i = 0; i <= 10; i++) {
          points.push([cx + (i < 10 ? (rand() - 0.5) * 36 : 0), cy - 420 + i * 42]);
        }
        for (const [width, color] of [
          [10, 0xfff3a0],
          [4, 0xffffff],
        ] as const) {
          g.lineStyle(width, color, alpha);
          g.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) {
            g.lineTo(x, y);
          }
        }
      }
    },
    [age, smite, tileDim],
  );
  return age < SCORCH_MS ? <Graphics draw={draw} /> : null;
}
