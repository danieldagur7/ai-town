import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSendInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import Button from './buttons/Button';
import sunImg from '../../assets/sun.svg';
import skipImg from '../../assets/skip.svg';
import closeImg from '../../assets/close.svg';
import { Id } from '../../convex/_generated/dataModel';

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
    <div className="pointer-events-auto absolute left-3 top-full z-20 w-96 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-6rem)] overflow-y-auto border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-4 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-display game-title">God Mode</h2>
        <a className="button text-white shadow-solid cursor-pointer" onClick={onClose}>
          <span className="inline-block bg-clay-700">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </span>
        </a>
      </div>
      <PrayerInbox worldId={worldId} />
      <Decrees worldId={worldId} />
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

function Decrees({ worldId }: { worldId: Id<'worlds'> }) {
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

function PrayerInbox({ worldId }: { worldId: Id<'worlds'> }) {
  const inbox = useQuery(api.god.prayers.prayerInbox, { worldId });
  if (!inbox) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xl">Prayers</h3>
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
  prayer: { _id: Id<'prayers'>; name: string; night: number; text?: string };
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
      <p className="text-sm leading-snug">{prayer.text}</p>
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
