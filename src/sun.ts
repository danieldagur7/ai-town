// Where the sun is, for shadows. The game sets the target hour as the world
// clock updates; a ticker eases towards it every frame so shadows glide
// rather than jump. Everything reads `sun` directly: no React state.

import { Ticker } from 'pixi.js';

export const sun = {
  // Sideways lean of shadows: -1 long to the west (morning) .. 1 east (evening).
  lean: 0,
  // How strong shadows are (0 at night, strongest at midday).
  strength: 0.5,
};
const target = { lean: 0, strength: 0.5 };

let ticking = false;
export function setSunHour(hour: number) {
  if (!ticking) {
    ticking = true;
    Ticker.shared.add(() => {
      sun.lean += (target.lean - sun.lean) * 0.02;
      sun.strength += (target.strength - sun.strength) * 0.02;
    });
  }
  const day = (hour - 6) / 12; // 0 at sunrise, 1 at sunset
  if (day <= 0 || day >= 1) {
    // Moonlight: faint, straight-down shadows.
    target.lean = 0;
    target.strength = 0.18;
    return;
  }
  target.lean = day * 2 - 1;
  // Softer near dawn and dusk.
  target.strength = 0.25 + 0.3 * Math.sin(day * Math.PI);
}
