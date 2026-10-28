import { Infer, v } from 'convex/values';
import {
  DAY_DURATION,
  EVENING_DURATION,
  EVENING_WIND_DOWN,
  MAX_CLOCK_TICK,
  MORNING_DURATION,
  NIGHT_DURATION,
} from '../constants';

// The world's day/night clock. `elapsed` is game time in real milliseconds since the
// world started, and only advances while the engine is ticking.
export const serializedClock = v.object({
  elapsed: v.number(),
  lastTick: v.number(),
});
export type Clock = Infer<typeof serializedClock>;

export type Phase = 'morning' | 'day' | 'evening' | 'night';

// Phases in order, with the in-game hours each one spans for the clock display.
const PHASES: { phase: Phase; duration: number; startHour: number; endHour: number }[] = [
  { phase: 'morning', duration: MORNING_DURATION, startHour: 6, endHour: 9 },
  { phase: 'day', duration: DAY_DURATION, startHour: 9, endHour: 18 },
  { phase: 'evening', duration: EVENING_DURATION, startHour: 18, endHour: 22 },
  { phase: 'night', duration: NIGHT_DURATION, startHour: 22, endHour: 30 },
];
export const DAY_LENGTH = PHASES.reduce((sum, p) => sum + p.duration, 0);

export type ClockState = {
  day: number;
  phase: Phase;
  // 0 to 1 through the current phase.
  progress: number;
  msUntilNextPhase: number;
  // In-game time of day as fractional hours, 0 to 24.
  hour: number;
};

export function clockState(elapsed: number): ClockState {
  const day = Math.floor(elapsed / DAY_LENGTH) + 1;
  let t = elapsed % DAY_LENGTH;
  for (const p of PHASES) {
    if (t < p.duration) {
      const progress = t / p.duration;
      const hour = (p.startHour + progress * (p.endHour - p.startHour)) % 24;
      return { day, phase: p.phase, progress, msUntilNextPhase: p.duration - t, hour };
    }
    t -= p.duration;
  }
  throw new Error(`Clock out of range: ${elapsed}`);
}

export function advanceClock(clock: Clock | undefined, now: number): Clock {
  if (!clock) {
    return { elapsed: 0, lastTick: now };
  }
  const dt = Math.min(Math.max(now - clock.lastTick, 0), MAX_CLOCK_TICK);
  return { elapsed: clock.elapsed + dt, lastTick: now };
}

export function isSleepTime(world: { clock?: Clock }) {
  return !!world.clock && clockState(world.clock.elapsed).phase === 'night';
}

export function isWindDown(world: { clock?: Clock }) {
  if (!world.clock) {
    return false;
  }
  const state = clockState(world.clock.elapsed);
  return state.phase === 'evening' && state.msUntilNextPhase < EVENING_WIND_DOWN;
}

export function formatClock(state: ClockState) {
  const h = Math.floor(state.hour);
  const m = Math.floor((state.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
