import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { ServerGame } from '../hooks/serverGame';
import { useGodUi } from '../godUi';

type GatheringState = ServerGame['world']['gatherings'][number];

// Cards for each group chat or town meeting, with the transcript. A town meeting's
// card stays up after it ends, until you close it.
export function Gatherings({ worldId, game }: { worldId: Id<'worlds'>; game: ServerGame }) {
  const [ended, setEnded] = useState<Record<string, GatheringState>>({});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [lastLive, setLastLive] = useState<Record<string, GatheringState>>({});
  const live = game.world.gatherings;
  // Remember meetings we've seen, and keep the ones that just ended.
  useEffect(() => {
    const liveIds = new Set(live.map((g) => g.id));
    const justEnded = Object.values(lastLive).filter((g) => !liveIds.has(g.id));
    if (justEnded.length > 0) {
      setEnded((prev) => {
        const next = { ...prev };
        for (const g of justEnded) next[g.id] = g;
        return next;
      });
    }
    setLastLive(Object.fromEntries(live.filter((g) => g.kind === 'meeting').map((g) => [g.id, g])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const cards = [
    ...live.map((g) => ({ g, over: false })),
    ...Object.values(ended)
      .filter((g) => !live.some((l) => l.id === g.id))
      .map((g) => ({ g, over: true })),
  ].filter(({ g }) => !closed.has(g.id));
  if (cards.length === 0) {
    return null;
  }
  const close = (id: string) => setClosed((prev) => new Set(prev).add(id));
  return (
    <div className="absolute left-3 bottom-3 z-10 flex flex-col gap-2 w-80 max-w-[calc(100vw-1.5rem)]">
      {cards.map(({ g, over }) => (
        <GatheringCard
          key={g.id}
          worldId={worldId}
          game={game}
          gathering={g}
          over={over}
          onClose={() => close(g.id)}
        />
      ))}
    </div>
  );
}

function GatheringCard({
  worldId,
  game,
  gathering,
  over,
  onClose,
}: {
  worldId: Id<'worlds'>;
  game: ServerGame;
  gathering: GatheringState;
  over: boolean;
  onClose: () => void;
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
  const status = over
    ? 'The meeting is over.'
    : gathering.status === 'gathering'
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
        <button className="text-xs bg-brown-900 px-2 py-0.5" title="Close" onClick={onClose}>
          ✕
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
      {!over && <HeroInGathering worldId={worldId} game={game} gathering={gathering} />}
    </div>
  );
}

// Playing as my own character: join the gathering, speak up, or leave.
function HeroInGathering({
  worldId,
  game,
  gathering,
}: {
  worldId: Id<'worlds'>;
  game: ServerGame;
  gathering: ServerGame['world']['gatherings'][number];
}) {
  const mine = useQuery(api.hero.myHero, { worldId });
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const join = useSendInput(worldStatus?.engineId as Id<'engines'>, 'joinGathering');
  const leave = useSendInput(worldStatus?.engineId as Id<'engines'>, 'leaveGathering');
  const say = useMutation(api.hero.sayInGathering);
  const [text, setText] = useState('');
  const me = mine?.hero?.playerId;
  if (!me || !game.world.players.has(me as any)) return null;
  const joined = gathering.participants.includes(me);
  if (!joined) {
    return (
      <button
        className="w-full bg-clay-700 text-white text-sm py-1"
        onClick={() => void toastOnError(join({ playerId: me, gatheringId: gathering.id }))}
      >
        Join as {mine!.hero!.name}
      </button>
    );
  }
  const send = () => {
    if (!text.trim()) return;
    void toastOnError(say({ worldId, gatheringId: gathering.id, text }));
    setText('');
  };
  return (
    <div className="flex gap-1 p-1">
      <input
        className="flex-1 text-sm text-black bg-white px-2"
        placeholder="Say something…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
      />
      <button className="bg-clay-700 text-white text-xs px-2" onClick={send}>
        Say
      </button>
      <button
        className="bg-brown-900 text-white text-xs px-2"
        onClick={() => void toastOnError(leave({ playerId: me }))}
      >
        Leave
      </button>
    </div>
  );
}
