import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame';
import { ERAS } from '../../convex/aiTown/eras';

// Town news in the toolbar: the era, and a feed of buildings, births and deaths.
// New events also pop up as toasts.
export default function TownNews() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const events = useQuery(api.society.recentEvents, worldId ? { worldId } : 'skip');
  const [open, setOpen] = useState(false);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!events) return;
    const newest = events[0]?.time ?? 0;
    if (seen.current !== null) {
      for (const e of [...events].reverse()) {
        if (e.time > seen.current) toast(`${e.emoji} ${e.text}`, { autoClose: 6000 });
      }
    }
    seen.current = Math.max(seen.current ?? 0, newest);
  }, [events]);
  if (!game) return null;
  const era = ERAS[game.world.era] ?? ERAS[0];
  return (
    <div className="relative pointer-events-auto">
      <button
        className="bg-brown-800 border-4 border-brown-900 text-brown-100 shadow-solid text-xl px-3 py-1"
        title="Town news"
        onClick={() => setOpen(!open)}
      >
        {era.emoji} {era.name}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 w-80 max-w-[calc(100vw-1.5rem)] max-h-96 overflow-y-auto border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-3 flex flex-col gap-2">
          <h3 className="text-xl">Town news</h3>
          <p className="text-xs text-brown-300">{era.blurb}.</p>
          {(events ?? []).length === 0 && (
            <p className="text-sm text-brown-300">Nothing yet. Build something!</p>
          )}
          {(events ?? []).map((e) => (
            <p key={e._id} className="text-sm leading-snug">
              {e.emoji} {e.text}
              {e.day !== undefined && (
                <span className="text-xs text-brown-300"> · day {e.day}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
