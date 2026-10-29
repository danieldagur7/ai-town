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
import { BUILDING as BUILDING_ACTIVITY } from '../../convex/aiTown/project';
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
      <Statue worldId={worldId} engineId={engineId} />
      <MeetingSummaries worldId={worldId} />
      <FaithScores worldId={worldId} />
      <TownDebug engineId={engineId} />
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
  const autoAnswer = useAction(api.god.prayers.autoAnswerPrayers);
  const settings = useQuery(api.god.prayers.godSettings, { worldId });
  const setAutoAnswer = useMutation(api.god.prayers.setAutoAnswer);
  const [summarizing, setSummarizing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  if (!inbox) {
    return null;
  }
  const unsummarized = inbox.pending.filter((p) => !p.summary).length;
  const decideAll = async () => {
    setDeciding(true);
    try {
      const results = await toastOnError(autoAnswer({ worldId }));
      for (const r of results) {
        toast(`${r.accept ? '✅ Granted' : '❌ Declined'} ${r.name}: ${r.reason}`, {
          autoClose: 6000,
        });
      }
    } finally {
      setDeciding(false);
    }
  };
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
      <div className="flex items-center justify-between gap-2">
        <label
          className="text-sm flex items-center gap-2 cursor-pointer"
          title="Each new prayer is judged against your decrees and answered as soon as it's written"
        >
          <input
            type="checkbox"
            checked={settings?.autoAnswerPrayers ?? false}
            onChange={(e) =>
              void toastOnError(setAutoAnswer({ worldId, enabled: e.target.checked }))
            }
          />
          Auto-answer new prayers
        </label>
        {inbox.pending.length > 0 && (
          <button
            className="bg-clay-700 text-white text-sm px-2 py-1 disabled:opacity-50"
            title="Let your will (the decrees) decide every waiting prayer"
            disabled={deciding}
            onClick={() => void decideAll()}
          >
            {deciding ? 'Deciding…' : 'Decide all for me'}
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
        <PrayerCard key={prayer._id} prayer={prayer} worldId={worldId} />
      ))}
      {inbox.autoAnswered.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-brown-300">Decided for you</summary>
          <ul className="flex flex-col gap-1 mt-1">
            {inbox.autoAnswered.map((p) => (
              <li key={p._id} className="bg-brown-900 p-2 leading-snug">
                {p.accepted ? '✅' : '❌'} <b>{p.name}</b> (night {p.night}): {p.reason}
                {p.message && <i className="block text-brown-300">"{p.message}"</i>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PrayerCard({
  prayer,
  worldId,
}: {
  prayer: { _id: Id<'prayers'>; name: string; night: number; text?: string; summary?: string };
  worldId: Id<'worlds'>;
}) {
  const answerPrayer = useMutation(api.god.prayers.answerPrayer);
  const autoAnswer = useAction(api.god.prayers.autoAnswerPrayers);
  const decide = async () => {
    setSending(true);
    try {
      const [r] = await toastOnError(autoAnswer({ worldId, prayerId: prayer._id }));
      if (r) {
        toast(`${r.accept ? '✅ Granted' : '❌ Declined'} ${r.name}: ${r.reason}`, {
          autoClose: 6000,
        });
      } else {
        toast.error("Couldn't decide; try again");
      }
    } finally {
      setSending(false);
    }
  };
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
      <button
        className="bg-brown-700 text-white text-sm py-1 disabled:opacity-50"
        title="Judge it against your decrees and answer it for you"
        disabled={sending}
        onClick={() => void decide()}
      >
        ✨ Decide for me
      </button>
    </div>
  );
}

// Debug: set the town's stockpile directly, to test without waiting.
function TownDebug({ engineId }: { engineId: Id<'engines'> }) {
  const setResources = useSendInput(engineId, 'setResources');
  const [values, setValues] = useState({ wood: '', stone: '', food: '' });
  const apply = () => {
    const args: { wood?: number; stone?: number; food?: number } = {};
    for (const key of ['wood', 'stone', 'food'] as const) {
      if (values[key] !== '') args[key] = Number(values[key]);
    }
    void toastOnError(setResources(args));
    setValues({ wood: '', stone: '', food: '' });
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">Town (debug)</h3>
      <div className="flex gap-1">
        {(
          [
            ['wood', '🪵'],
            ['stone', '🪨'],
            ['food', '🌾'],
          ] as const
        ).map(([key, icon]) => (
          <input
            key={key}
            className="w-1/3 text-sm text-black bg-white p-1"
            type="number"
            placeholder={`${icon} set`}
            value={values[key]}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          />
        ))}
      </div>
      <button className="bg-clay-700 text-white text-sm py-1" onClick={apply}>
        Set stockpile
      </button>
    </section>
  );
}

// The town's building project: start the statue, watch it go up.
function Statue({ worldId, engineId }: { worldId: Id<'worlds'>; engineId: Id<'engines'> }) {
  const game = useServerGame(worldId);
  const startStatue = useSendInput(engineId, 'startStatue');
  const addWork = useSendInput(engineId, 'addProjectWork');
  const project = game?.world.project;
  const working = game
    ? [...game.world.players.values()]
        .filter(
          (p) => p.activity?.description === BUILDING_ACTIVITY && p.activity.until > Date.now(),
        )
        .map((p) => game.playerDescriptions.get(p.id)?.name)
    : [];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">Statue</h3>
      {!project || project.finishedDay !== undefined ? (
        <>
          {project && (
            <p className="text-sm text-brown-300">
              🗿 {project.name} was finished on day {project.finishedDay}.
            </p>
          )}
          <p className="text-sm text-brown-300">
            The town has gathered the wood and stone; command them to build a statue on the plaza.
            Townspeople work on it by day.
          </p>
          <button
            className="bg-clay-700 text-white text-sm py-1"
            onClick={() => void toastOnError(startStatue({}))}
          >
            Build a statue of me
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">
            🗿 {project.name}: {Math.floor((100 * project.work) / project.workNeeded)}%
          </p>
          <div className="h-3 bg-brown-900">
            <div
              className="h-3"
              style={{
                width: `${(100 * project.work) / project.workNeeded}%`,
                background: '#f2c14e',
              }}
            />
          </div>
          <p className="text-xs text-brown-300">
            {working.length > 0
              ? `🔨 ${working.join(', ')} at work.`
              : 'Nobody is working right now.'}{' '}
            Started day {project.startedDay}.
          </p>
          <button
            className="bg-brown-900 text-white text-xs py-1"
            title="Debug: add 5 shifts of work"
            onClick={() => void toastOnError(addWork({ shifts: 5 }))}
          >
            +5 shifts (debug)
          </button>
        </>
      )}
    </section>
  );
}

function MeetingSummaries({ worldId }: { worldId: Id<'worlds'> }) {
  const meetings = useQuery(api.agent.gathering.meetingSummaries, { worldId });
  if (!meetings || meetings.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl">Town meetings</h3>
      {meetings.map((m, i) => (
        <details key={m._id} open={i === 0} className="bg-brown-200 text-black p-2 text-sm">
          <summary className="cursor-pointer font-bold">📣 {m.topic}</summary>
          <p className="leading-snug mt-1">{m.summary}</p>
          <p className="text-xs text-brown-700 mt-1">With {m.participants.join(', ')}</p>
        </details>
      ))}
    </section>
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
