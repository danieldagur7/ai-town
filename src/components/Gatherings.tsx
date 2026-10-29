import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ServerGame } from '../hooks/serverGame';
import { useGodUi } from '../godUi';

// Cards for each group chat or town meeting in progress, with the transcript.
export function Gatherings({ worldId, game }: { worldId: Id<'worlds'>; game: ServerGame }) {
  if (game.world.gatherings.length === 0) {
    return null;
  }
  return (
    <div className="absolute left-3 bottom-3 z-10 flex flex-col gap-2 w-80 max-w-[calc(100vw-1.5rem)]">
      {game.world.gatherings.map((g) => (
        <GatheringCard key={g.id} worldId={worldId} game={game} gathering={g} />
      ))}
    </div>
  );
}

function GatheringCard({
  worldId,
  game,
  gathering,
}: {
  worldId: Id<'worlds'>;
  game: ServerGame;
  gathering: ServerGame['world']['gatherings'][number];
}) {
  const [open, setOpen] = useState(gathering.kind === 'meeting');
  const { focusOn } = useGodUi();
  const messages = useQuery(api.messages.listMessages, {
    worldId,
    conversationId: gathering.id,
  });
  const nameOf = (id: string) => game.playerDescriptions.get(id as any)?.name ?? id;
  const title =
    gathering.kind === 'meeting'
      ? `📣 Town meeting: ${gathering.topic}`
      : `👥 ${gathering.participants.map(nameOf).join(', ')}`;
  const status =
    gathering.status === 'gathering'
      ? 'Gathering…'
      : gathering.speaking
        ? `${nameOf(gathering.speaking)} is speaking…`
        : '';
  return (
    <div className="pointer-events-auto border-4 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl">
      <div className="flex items-center gap-2 px-2 py-1">
        <button className="flex-1 text-left text-sm font-bold" onClick={() => setOpen(!open)}>
          {title}
        </button>
        <button
          className="text-xs bg-clay-700 px-2 py-0.5"
          title="Fly the camera there"
          onClick={() => focusOn(gathering.caller)}
        >
          Go
        </button>
      </div>
      {open && (
        <div className="bg-brown-200 text-black text-xs max-h-52 overflow-y-auto p-2 flex flex-col gap-1">
          {(messages ?? []).map((m) => (
            <p key={m._id}>
              <span className="font-bold">{m.authorName}:</span> {m.text}
            </p>
          ))}
          {status && <p className="italic text-brown-700">{status}</p>}
        </div>
      )}
    </div>
  );
}
