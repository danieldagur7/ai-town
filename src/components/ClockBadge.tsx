import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame';
import { clockState, formatClock } from '../../convex/aiTown/clock';

export const PHASE_LABELS = { morning: 'Morning', day: 'Day', evening: 'Evening', night: 'Night' };

export default function ClockBadge() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const game = useServerGame(worldStatus?.worldId);
  const clock = game?.world.clock && clockState(game.world.clock.elapsed);
  if (!clock) {
    return null;
  }
  return (
    <div className="pointer-events-auto bg-brown-800 border-4 border-brown-900 text-brown-100 shadow-solid text-xl px-3 py-1">
      Day {clock.day} · {formatClock(clock)} · {PHASE_LABELS[clock.phase]}
    </div>
  );
}
