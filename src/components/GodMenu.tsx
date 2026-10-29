import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSendInput, waitForInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import Button from './buttons/Button';
import sunImg from '../../assets/sun.svg';
import skipImg from '../../assets/skip.svg';
import closeImg from '../../assets/close.svg';
import { Id } from '../../convex/_generated/dataModel';
import { useServerGame } from '../hooks/serverGame';
import { useGodUi } from '../godUi';
import { GOD_CHARACTER } from '../../data/characters';
import { GOD_SPEECH_DEFAULT_RADIUS, GOD_SPEECH_MAX_RADIUS } from '../../convex/constants';

// The god's toolbox: a pop-up menu that collects the god-mode features.
export default function GodMenu() {
  const [open, setOpen] = useState(false);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const inbox = useQuery(api.god.prayers.prayerInbox, worldId ? { worldId } : 'skip');
  const waiting = inbox?.pending.length ?? 0;
  return (
    <>
      <Button imgUrl={sunImg} title="Open the god menu" onClick={() => setOpen(!open)}>
        God Mode{waiting > 0 && ` (${waiting})`}
      </Button>
      {open && worldStatus && (
        <GodMenuPanel
          worldId={worldStatus.worldId}
          engineId={worldStatus.engineId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GodMenuPanel({
  worldId,
  engineId,
  onClose,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  onClose: () => void;
}) {
  const skipToNextPhase = useSendInput(engineId, 'skipToNextPhase');
  return (
    <div className="pointer-events-auto absolute left-3 top-full z-20 w-96 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-10rem)] overflow-y-auto border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-4 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-display game-title">God Mode</h2>
        <a className="button text-white shadow-solid cursor-pointer" onClick={onClose}>
          <span className="inline-block bg-clay-700">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </span>
        </a>
      </div>
      <Manifest worldId={worldId} engineId={engineId} />
      <PrayerInbox worldId={worldId} />
      <Decrees worldId={worldId} engineId={engineId} />
      <FaithScores worldId={worldId} />
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">Time</h3>
        <Button
          imgUrl={skipImg}
          title="Jump to the start of the next phase of the day"
          onClick={() => void toastOnError(skipToNextPhase({}))}
        >
          Skip to next phase
        </Button>
      </section>
    </div>
  );
}

function Manifest({ worldId, engineId }: { worldId: Id<'worlds'>; engineId: Id<'engines'> }) {
  const convex = useConvex();
  const game = useServerGame(worldId);
  const humanToken = useQuery(api.world.userStatus, { worldId });
  const manifest = useMutation(api.god.manifest.manifest);
  const leave = useMutation(api.world.leaveWorld);
  const [name, setName] = useState('The Light');
  const [busy, setBusy] = useState(false);
  const me = game && [...game.world.players.values()].find((p) => p.human === humanToken);
  const manifested = !!me && game?.playerDescriptions.get(me.id)?.character === GOD_CHARACTER;

  const appear = async () => {
    setBusy(true);
    try {
      const inputId = await toastOnError(manifest({ worldId, name }));
      await toastOnError(waitForInput(convex, inputId));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">Manifest</h3>
      {manifested ? (
        <>
          <SpeakToTown engineId={engineId} />
          <button
            className="bg-brown-900 text-white text-sm py-1"
            onClick={() => void toastOnError(leave({ worldId }))}
          >
            Withdraw from the town
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-brown-300">
            Appear in the town in your divine form. Characters will know who you are.
          </p>
          <input
            className="text-sm text-black bg-white p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The name you appear as"
          />
          <button
            className="bg-clay-700 text-white text-lg py-1 disabled:opacity-50"
            disabled={busy || !name.trim()}
            onClick={() => void appear()}
          >
            Manifest
          </button>
        </>
      )}
    </section>
  );
}

function SpeakToTown({ engineId }: { engineId: Id<'engines'> }) {
  const godSpeaks = useSendInput(engineId, 'godSpeaks');
  const { setSpeechRadius } = useGodUi();
  const [words, setWords] = useState('');
  const [radius, setRadius] = useState(GOD_SPEECH_DEFAULT_RADIUS);
  // Show the reach on the map while these controls are open.
  useEffect(() => {
    setSpeechRadius(radius);
    return () => setSpeechRadius(null);
  }, [radius]);
  const speak = async () => {
    const witnesses = await toastOnError(godSpeaks({ words, radius }));
    toast.success(
      witnesses === 0
        ? 'Nobody was close enough to see you.'
        : `${witnesses} ${witnesses === 1 ? 'person' : 'people'} saw you and heard your words.`,
    );
    setWords('');
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="text-sm text-black bg-white p-2 resize-none"
        rows={2}
        placeholder="What you say to those around you"
        value={words}
        onChange={(e) => setWords(e.target.value)}
      />
      <label className="text-sm flex items-center gap-2">
        Reach
        <input
          type="range"
          min={1}
          max={GOD_SPEECH_MAX_RADIUS}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="flex-1"
        />
        {radius} tiles
      </label>
      <button
        className="bg-clay-700 text-white text-lg py-1 disabled:opacity-50"
        disabled={!words.trim()}
        onClick={() => void speak()}
      >
        Speak
      </button>
    </div>
  );
}

function Decrees({ worldId, engineId }: { worldId: Id<'worlds'>; engineId: Id<'engines'> }) {
  const decrees = useQuery(api.god.decrees.listDecrees, { worldId });
  const issueDecree = useMutation(api.god.decrees.issueDecree);
  const endDecree = useMutation(api.god.decrees.endDecree);
  const [text, setText] = useState('');
  const issue = async () => {
    if (!text.trim()) {
      return;
    }
    await toastOnError(issueDecree({ worldId, text }));
    setText('');
  };
  if (!decrees) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xl">Decrees</h3>
      <div className="flex flex-col gap-2">
        <textarea
          className="text-sm text-black bg-white p-2 resize-none"
          rows={2}
          placeholder='A mission for the town, e.g. "Grow more food"'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="bg-clay-700 text-white text-lg py-1 disabled:opacity-50"
          disabled={!text.trim()}
          onClick={() => void issue()}
        >
          Issue decree
        </button>
      </div>
      {decrees.active.map((decree) => (
        <div key={decree._id} className="bg-brown-200 text-black p-3 flex flex-col gap-2">
          <p className="text-sm font-bold">“{decree.text}”</p>
          {decree.opinions.length === 0 ? (
            <p className="text-xs text-brown-700">Nobody has talked about it yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {decree.opinions.map((o) => (
                <li key={o.name} className="text-xs leading-snug">
                  {o.text}
                </li>
              ))}
            </ul>
          )}
          <Punish
            worldId={worldId}
            engineId={engineId}
            decree={{ _id: decree._id, text: decree.text }}
          />
          <div className="flex gap-2">
            <button
              className="flex-1 bg-clay-700 text-white text-sm py-1"
              onClick={() =>
                void toastOnError(endDecree({ decreeId: decree._id, status: 'completed' }))
              }
            >
              Completed
            </button>
            <button
              className="flex-1 bg-brown-900 text-white text-sm py-1"
              onClick={() =>
                void toastOnError(endDecree({ decreeId: decree._id, status: 'cancelled' }))
              }
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
      {decrees.ended.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-brown-300">
          {decrees.ended.map((d) => (
            <li key={d._id}>
              {d.status === 'completed' ? '✓' : '✗'} “{d.text}” ({d.status})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Strike a character down for ignoring a decree.
function Punish({
  worldId,
  engineId,
  decree,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  decree: { _id: Id<'decrees'>; text: string };
}) {
  const game = useServerGame(worldId);
  const punish = useSendInput(engineId, 'punish');
  const suggestPunishments = useAction(api.god.punishment.suggestPunishments);
  const [target, setTarget] = useState('');
  const [punishment, setPunishment] = useState('');
  const [emoji, setEmoji] = useState('⚡');
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<{ emoji: string; text: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const townspeople = game
    ? [...game.world.agents.values()].map((a) => ({
        id: a.playerId,
        name: game.playerDescriptions.get(a.playerId)?.name ?? a.playerId,
      }))
    : [];
  const chooseTarget = async (playerId: string) => {
    setTarget(playerId);
    setSuggestions([]);
    if (!playerId) {
      return;
    }
    setSuggesting(true);
    try {
      setSuggestions(
        await toastOnError(suggestPunishments({ worldId, playerId, decreeText: decree.text })),
      );
    } finally {
      setSuggesting(false);
    }
  };
  const strike = async () => {
    const witnesses = await toastOnError(
      punish({
        playerId: target,
        decreeId: decree._id,
        decreeText: decree.text,
        message: message || undefined,
        punishment: punishment || undefined,
        emoji,
      }),
    );
    const name = townspeople.find((p) => p.id === target)?.name;
    toast.success(`${name} was punished${witnesses > 0 ? `; ${witnesses} saw it happen` : ''}.`);
    setMessage('');
    setPunishment('');
    setEmoji('⚡');
  };
  return (
    <div className="flex flex-col gap-1 border-t border-brown-700 pt-2">
      <p className="text-xs font-bold">Punish someone for ignoring it</p>
      <select
        className="text-sm text-black bg-white p-1"
        value={target}
        onChange={(e) => void chooseTarget(e.target.value)}
      >
        <option value="">Choose who…</option>
        {townspeople.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {suggesting && <p className="text-xs">Thinking of what would hurt most…</p>}
      {suggestions.map((s) => (
        <button
          key={s.text}
          className={
            'text-left text-xs p-1 border ' +
            (punishment === s.text ? 'bg-yellow-300 border-black' : 'bg-white border-brown-300')
          }
          onClick={() => {
            setPunishment(s.text);
            setEmoji(s.emoji);
          }}
        >
          {s.emoji} {s.text}
        </button>
      ))}
      {target && (
        <>
          <textarea
            className="text-sm text-black bg-white p-1 resize-none"
            rows={2}
            placeholder="Or describe your own punishment (default: struck with lightning)"
            value={punishment}
            onChange={(e) => setPunishment(e.target.value)}
          />
          <input
            className="text-sm text-black bg-white p-1"
            placeholder="Optional words of thunder"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </>
      )}
      <button
        className="bg-yellow-600 text-black text-sm py-1 font-bold disabled:opacity-50"
        disabled={!target}
        onClick={() => void strike()}
      >
        {emoji} Punish
      </button>
    </div>
  );
}

function PrayerInbox({ worldId }: { worldId: Id<'worlds'> }) {
  const inbox = useQuery(api.god.prayers.prayerInbox, { worldId });
  const summarizePrayers = useAction(api.god.prayers.summarizePrayers);
  const [summarizing, setSummarizing] = useState(false);
  if (!inbox) {
    return null;
  }
  const unsummarized = inbox.pending.filter((p) => !p.summary).length;
  const summarize = async () => {
    setSummarizing(true);
    try {
      await toastOnError(summarizePrayers({ worldId }));
    } finally {
      setSummarizing(false);
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl">Prayers</h3>
        {unsummarized > 0 && (
          <button
            className="bg-clay-700 text-white text-sm px-2 py-1 disabled:opacity-50"
            disabled={summarizing}
            onClick={() => void summarize()}
          >
            {summarizing ? 'Summarizing…' : 'Summarize all'}
          </button>
        )}
      </div>
      {inbox.praying.length > 0 && (
        <p className="text-sm text-brown-300">Praying now: {inbox.praying.join(', ')}…</p>
      )}
      {inbox.pending.length === 0 && (
        <p className="text-sm text-brown-300">
          No prayers waiting. Characters pray as they fall asleep.
        </p>
      )}
      {inbox.pending.map((prayer) => (
        <PrayerCard key={prayer._id} prayer={prayer} />
      ))}
    </section>
  );
}

function PrayerCard({
  prayer,
}: {
  prayer: { _id: Id<'prayers'>; name: string; night: number; text?: string; summary?: string };
}) {
  const answerPrayer = useMutation(api.god.prayers.answerPrayer);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const answer = async (accept: boolean) => {
    setSending(true);
    try {
      await toastOnError(answerPrayer({ prayerId: prayer._id, accept, message }));
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="bg-brown-200 text-black p-3 flex flex-col gap-2">
      <p className="text-sm font-bold">
        {prayer.name} · night {prayer.night}
      </p>
      {prayer.summary ? (
        <>
          <p className="text-sm leading-snug font-bold">{prayer.summary}</p>
          <details className="text-xs">
            <summary className="cursor-pointer">Full prayer</summary>
            <p className="leading-snug mt-1">{prayer.text}</p>
          </details>
        </>
      ) : (
        <p className="text-sm leading-snug">{prayer.text}</p>
      )}
      <textarea
        className="text-sm text-black bg-white p-2 resize-none"
        rows={2}
        placeholder="Optional message from you"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="flex-1 bg-clay-700 text-white text-lg py-1 disabled:opacity-50"
          disabled={sending}
          onClick={() => void answer(true)}
        >
          Accept
        </button>
        <button
          className="flex-1 bg-brown-900 text-white text-lg py-1 disabled:opacity-50"
          disabled={sending}
          onClick={() => void answer(false)}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function FaithScores({ worldId }: { worldId: Id<'worlds'> }) {
  const faith = useQuery(api.god.prayers.faithScores, { worldId });
  if (!faith || faith.scores.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">Faith</h3>
      {faith.scores.map(({ name, score }) => (
        <div key={name} className="flex items-center gap-2 text-sm">
          <span className="w-16 shrink-0">{name}</span>
          <div className="flex-1 h-3 bg-brown-900">
            <div
              className="h-full bg-clay-300"
              style={{ width: `${(score / faith.max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right">{score}</span>
        </div>
      ))}
    </section>
  );
}
