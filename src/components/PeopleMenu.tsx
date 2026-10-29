import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame';
import { useGodUi } from '../godUi';
import Button from './buttons/Button';
import peopleImg from '../../assets/people.svg';

// Lists everyone in town; picking someone flies the camera to them.
export default function PeopleMenu() {
  const [open, setOpen] = useState(false);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const game = useServerGame(worldStatus?.worldId);
  const { focusOn } = useGodUi();
  const people = game
    ? [...game.world.players.values()]
        .map((p) => ({
          id: p.id,
          name: game.playerDescriptions.get(p.id)?.name ?? p.id,
          emoji: p.activity && p.activity.until > Date.now() ? p.activity.emoji : undefined,
          talking: !!game.world.playerConversation(p),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return (
    <div className="relative">
      <Button imgUrl={peopleImg} title="Find someone on the map" onClick={() => setOpen(!open)}>
        People
      </Button>
      {open && (
        <div className="pointer-events-auto absolute left-0 top-full mt-2 z-20 w-56 border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-2 flex flex-col gap-1">
          {people.map((p) => (
            <button
              key={p.id}
              className="text-left text-lg px-2 py-1 hover:bg-brown-700 flex justify-between"
              onClick={() => {
                focusOn(p.id);
                setOpen(false);
              }}
            >
              <span>{p.name}</span>
              <span>
                {p.talking ? '💬' : ''}
                {p.emoji ?? ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
