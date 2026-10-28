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
