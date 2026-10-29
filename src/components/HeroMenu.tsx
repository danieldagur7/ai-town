import { useEffect, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { characters } from '../../data/characters';
import {
  ACCESSORIES,
  Accessory,
  BASES,
  HAIR_COLOURS,
  Look,
  OUTFIT_COLOURS,
  QUIRKS,
  QUIRK_NAMES,
  lookString,
  parseLook,
  quirkOf,
  randomLook,
} from '../../data/looks';
import { lookPreviewUrl } from '../lookTexture';
import { vivid } from '../vivid';
import { useSendInput, waitForInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import { useServerGame } from '../hooks/serverGame';
import { useGodUi } from '../godUi';
import { useMenu } from '../hooks/useMenu';

const panel =
  'pointer-events-auto absolute left-0 top-full mt-2 z-20 w-80 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-10rem)] overflow-y-auto border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-3 flex flex-col gap-3';

// Playing as yourself: make a character (once; it's the same every time you
// join), play them until they die, then start over or carry on as your child.
export default function HeroMenu() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const mine = useQuery(api.hero.myHero, worldId ? { worldId } : 'skip');
  const humanToken = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const [open, setOpen] = useMenu('hero');
  if (!worldStatus || !game || mine === undefined) return null;
  const me = [...game.world.players.values()].find((p) => p.human === humanToken);
  const playingHero = !!me && !!mine.hero && me.id === mine.hero.playerId;
  const label = mine.hero ? `${mine.hero.name} · ${mine.hero.age}` : 'Play as me';
  return (
    <div className="relative pointer-events-auto">
      <button
        className="button text-white shadow-solid text-xl pointer-events-auto"
        onClick={() => setOpen(!open)}
      >
        <div className="inline-block bg-clay-700">
          <span>
            <i className="not-italic">🧍</i> {label}
          </span>
        </div>
      </button>
      {open && (
        <div className={panel}>
          {!mine.hero ? (
            <NoHero worldId={worldStatus.worldId} mine={mine} />
          ) : playingHero ? (
            <HeroPanel
              worldId={worldStatus.worldId}
              engineId={worldStatus.engineId}
              mine={mine}
              playerId={me!.id}
            />
          ) : (
            <JoinHero worldId={worldStatus.worldId} mine={mine} busyAsOther={!!me} />
          )}
        </div>
      )}
    </div>
  );
}

type Mine = NonNullable<ReturnType<typeof useQuery<typeof api.hero.myHero>>>;

const ACCESSORY_LABELS: Record<Accessory, string> = {
  none: 'No extra',
  hat: '🎩 Hat',
  cap: '🧢 Cap',
  glasses: '👓 Glasses',
  flower: '🌸 Flower',
  bow: '🎀 Bow',
  scarf: '🧣 Scarf',
  beard: '🧔 Beard',
  headband: '🎽 Headband',
};

function SpritePreview({ character }: { character: string }) {
  const look = parseLook(character);
  const c = characters.find((c) => c.name === look.base) ?? characters[0];
  const [url, setUrl] = useState(vivid(c.textureUrl));
  useEffect(() => {
    let live = true;
    void lookPreviewUrl(look, vivid(c.textureUrl)).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [look.base, look.hair, look.outfit]);
  const frame = (c.spritesheetData.frames as any).down.frame;
  return (
    <div className={`look-preview quirk-${quirkOf('', character)}`}>
      <div
        className="pixelated"
        style={{
          width: 32,
          height: 32,
          backgroundImage: `url(${url})`,
          backgroundPosition: `-${frame.x}px -${frame.y}px`,
        }}
      />
    </div>
  );
}

// The feature wheel: step through each feature, or spin for a random look.
function LookWheel({ value, onChange }: { value: Look; onChange: (look: Look) => void }) {
  const [spinning, setSpinning] = useState(false);
  const cycle = <T,>(list: readonly T[], current: T, step: number) =>
    list[(list.indexOf(current) + step + list.length) % list.length];
  const rows: { label: string; text: string; step: (d: number) => Look }[] = [
    {
      label: 'Body',
      text: `${BASES.indexOf(value.base) + 1} / ${BASES.length}`,
      step: (d) => ({ ...value, base: cycle(BASES, value.base, d) }),
    },
    {
      label: 'Hair',
      text: HAIR_COLOURS[value.hair].name,
      step: (d) => ({
        ...value,
        hair: (value.hair + d + HAIR_COLOURS.length) % HAIR_COLOURS.length,
      }),
    },
    {
      label: 'Outfit',
      text: OUTFIT_COLOURS[value.outfit].name,
      step: (d) => ({
        ...value,
        outfit: (value.outfit + d + OUTFIT_COLOURS.length) % OUTFIT_COLOURS.length,
      }),
    },
    {
      label: 'Extra',
      text: ACCESSORY_LABELS[value.accessory],
      step: (d) => ({ ...value, accessory: cycle(ACCESSORIES, value.accessory, d) }),
    },
    {
      label: 'Habit',
      text: value.quirk ?? 'still',
      step: (d) => ({ ...value, quirk: cycle(QUIRK_NAMES, value.quirk ?? 'still', d) }),
    },
  ];
  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    // A few quick random looks, slowing down, then it lands.
    const delays = [60, 70, 85, 100, 120, 150, 190, 240];
    let at = 0;
    delays.forEach((ms, i) => {
      at += ms;
      setTimeout(() => {
        onChange(randomLook());
        if (i === delays.length - 1) setSpinning(false);
      }, at);
    });
  };
  return (
    <div className="flex gap-3 items-center">
      <div className="flex flex-col items-center gap-2">
        <div className={`look-stage ${spinning ? 'spinning' : ''}`}>
          <SpritePreview character={lookString(value)} />
        </div>
        <button className="bg-clay-700 text-white text-sm px-2 py-1" onClick={spin}>
          🎲 Spin
        </button>
      </div>
      <div className="flex-1 flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1">
            <span className="w-12 text-brown-300 text-xs">{r.label}</span>
            <button className="wheel-arrow" onClick={() => onChange(r.step(-1))}>
              ◀
            </button>
            <span className="flex-1 text-center truncate capitalize">{r.text}</span>
            <button className="wheel-arrow" onClick={() => onChange(r.step(1))}>
              ▶
            </button>
          </div>
        ))}
        <p className="text-xs text-brown-300 italic">
          {QUIRKS[value.quirk ?? 'still'].split(' (')[0]}
        </p>
      </div>
    </div>
  );
}

function NoHero({ worldId, mine }: { worldId: Id<'worlds'>; mine: Mine }) {
  const create = useMutation(api.hero.createHero);
  const playAsHeir = useMutation(api.hero.playAsHeir);
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>(() => randomLook());
  const character = lookString(look);
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  return (
    <>
      {mine.fallen.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xl">In memory</h3>
          {mine.fallen.map((f, i) => (
            <p key={i} className="text-sm text-brown-300">
              🪦 {f.name}, died of {f.cause} on day {f.diedDay}
            </p>
          ))}
        </section>
      )}
      {mine.heirs.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xl">Carry on as your child</h3>
          {mine.heirs.map((h) => (
            <button
              key={h.playerId}
              className="bg-clay-700 text-white text-sm py-1"
              onClick={() => void toastOnError(playAsHeir({ worldId, playerId: h.playerId }))}
            >
              Become {h.name} ({h.age})
            </button>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">Create your character</h3>
        <p className="text-xs text-brown-300">
          You live in town as them: make friends and enemies, fall in love, work, pray and grow old.
          When they die, they're gone for good.
        </p>
        <input
          className="text-sm text-black bg-white p-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <LookWheel value={look} onChange={setLook} />
        <textarea
          className="text-sm text-black bg-white p-2 resize-none"
          rows={3}
          placeholder="Who are you? e.g. a quiet carpenter who moved here to start over"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <input
          className="text-sm text-black bg-white p-2"
          placeholder="Interests, e.g. fishing, music, stargazing"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />
        <button
          className="bg-clay-700 text-white py-1 disabled:opacity-50"
          disabled={!name.trim()}
          onClick={() => void toastOnError(create({ worldId, name, character, bio, interests }))}
        >
          Create
        </button>
      </section>
    </>
  );
}

function JoinHero({
  worldId,
  mine,
  busyAsOther,
}: {
  worldId: Id<'worlds'>;
  mine: Mine;
  busyAsOther: boolean;
}) {
  const convex = useConvex();
  const join = useMutation(api.hero.joinAsHero);
  const hero = mine.hero!;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <SpritePreview character={hero.character} />
        <div>
          <h3 className="text-xl">{hero.name}</h3>
          <p className="text-xs text-brown-300">Age {hero.age}</p>
        </div>
      </div>
      <p className="text-sm">{hero.bio}</p>
      {busyAsOther ? (
        <p className="text-sm text-brown-300">
          You're in the world in another form. Leave (or withdraw from manifesting) first.
        </p>
      ) : (
        <button
          className="bg-clay-700 text-white py-1"
          onClick={async () => {
            const inputId = await toastOnError(join({ worldId }));
            await toastOnError(waitForInput(convex, inputId));
          }}
        >
          Enter the town as {hero.name}
        </button>
      )}
    </section>
  );
}

function HeroPanel({
  worldId,
  engineId,
  mine,
  playerId,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  mine: Mine;
  playerId: string;
}) {
  const work = useSendInput(engineId, 'heroWork');
  const pray = useMutation(api.hero.heroPrays);
  const leave = useMutation(api.world.leaveWorld);
  const { focusOn } = useGodUi();
  const [prayer, setPrayer] = useState('');
  const hero = mine.hero!;
  const doWork = async (kind: 'wood' | 'stone' | 'food' | 'build') => {
    const result = await toastOnError(work({ playerId, kind }));
    if (kind !== 'build') toast(`+${result} ${kind}`);
  };
  return (
    <>
      <section className="flex items-center gap-3">
        <SpritePreview character={hero.character} />
        <div className="flex-1">
          <h3 className="text-xl">{hero.name}</h3>
          <p className="text-xs text-brown-300">Age {hero.age}</p>
        </div>
        <button
          className="bg-clay-700 text-white text-xs px-2 py-1"
          onClick={() => focusOn(playerId)}
        >
          Find me
        </button>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-lg">Work</h3>
        <div className="grid grid-cols-2 gap-1 text-sm">
          <button className="bg-brown-900 py-1" onClick={() => void doWork('wood')}>
            🪓 Chop wood
          </button>
          <button className="bg-brown-900 py-1" onClick={() => void doWork('stone')}>
            ⛏️ Quarry stone
          </button>
          <button
            className="bg-brown-900 py-1"
            title="Stand by the farm fields"
            onClick={() => void doWork('food')}
          >
            🌾 Farm
          </button>
          <button
            className="bg-brown-900 py-1"
            title="Stand by the building site"
            onClick={() => void doWork('build')}
          >
            🔨 Help build
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-lg">How people feel about you</h3>
        {mine.feelings.length === 0 && (
          <p className="text-xs text-brown-300">Nobody knows you yet. Go say hello.</p>
        )}
        {mine.feelings.map((f) => (
          <div key={f.name} className="flex items-center gap-2 text-sm">
            <span className="w-16 truncate">{f.name}</span>
            <div className="flex-1 h-2 bg-brown-900 relative">
              <div
                className="absolute h-2 top-0"
                style={{
                  left: f.affinity >= 0 ? '50%' : `${50 + f.affinity / 2}%`,
                  width: `${Math.abs(f.affinity) / 2}%`,
                  background: f.affinity >= 0 ? '#63c74d' : '#e43b44',
                }}
              />
            </div>
            <span className="w-5">{f.crush ? '💘' : ''}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-lg">Pray</h3>
        <textarea
          className="text-sm text-black bg-white p-2 resize-none"
          rows={2}
          placeholder="Ask the god for something…"
          value={prayer}
          onChange={(e) => setPrayer(e.target.value)}
        />
        <button
          className="bg-clay-700 text-white text-sm py-1"
          onClick={async () => {
            await toastOnError(pray({ worldId, text: prayer }));
            setPrayer('');
            toast('🙏 Your prayer rises to the heavens.');
          }}
        >
          Pray
        </button>
      </section>
      {mine.heirs.length > 0 && (
        <p className="text-sm">
          👶 Your children: {mine.heirs.map((h) => `${h.name} (${h.age})`).join(', ')}
        </p>
      )}
      <p className="text-xs text-brown-300">
        Click someone and "Start conversation" to talk. Join meetings from their card at the bottom
        left.
      </p>
      <button
        className="bg-brown-900 text-white text-sm py-1"
        onClick={() => void leave({ worldId })}
      >
        Leave the town for now
      </button>
    </>
  );
}
