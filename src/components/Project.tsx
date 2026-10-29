import * as PIXI from 'pixi.js';
import { Container, Graphics, Sprite, TilingSprite, useTick } from '@pixi/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Project as ProjectState,
  Structure,
  projectSpot,
  projectStage,
  structureSpot,
} from '../../convex/aiTown/project';
import { houseArtKey, structureArtKey } from '../../convex/aiTown/eras';
import { HOUSES } from '../../data/town';
import { vivid } from '../vivid';
import { sun } from '../sun';

export type ArtByKey = Record<string, { status: string; url: string | null; subject: string }>;

const ASSETS = '/ai-town/assets/projects';
// Static art: the statue's stages are hand-picked generations; buildings use a
// generic pile and scaffold while going up, then their own generated art.
const STATUE_STAGES = [`${ASSETS}/statue_0.png`, `${ASSETS}/statue_1.png`];
const STATUE_DONE = `${ASSETS}/statue_2.png`;
const BUILDING_STAGES = [`${ASSETS}/statue_0.png`, `${ASSETS}/building_1.png`];
const BUILDING_FALLBACK = `${ASSETS}/building_done.png`;

// Re-renders once the image has loaded, so sizes based on it are right.
function useTexture(url: string) {
  const texture = useMemo(() => {
    const t = PIXI.Texture.from(url);
    t.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return t;
  }, [url]);
  const [, setLoaded] = useState(texture.valid);
  useEffect(() => {
    if (texture.valid) return;
    const done = () => setLoaded(true);
    texture.baseTexture.once('loaded', done);
    return () => {
      texture.baseTexture.off('loaded', done);
    };
  }, [texture]);
  return texture;
}

// A project going up: its stage sprite and a progress bar underneath.
export function ProjectSite({ project, tileDim }: { project: ProjectState; tileDim: number }) {
  const stage = projectStage(project);
  const texture = useTexture(
    project.kind === 'statue' ? STATUE_STAGES[stage] : BUILDING_STAGES[stage],
  );
  const fraction = project.work / project.workNeeded;
  const spot = projectSpot(project);
  const drawBar = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const w = tileDim * 3;
      g.beginFill(0x1a1423, 0.85);
      g.drawRoundedRect(-w / 2 - 2, 0, w + 4, 10, 3);
      g.endFill();
      g.beginFill(0xf2c14e);
      g.drawRoundedRect(-w / 2, 2, Math.max(2, w * fraction), 6, 2);
      g.endFill();
    },
    [fraction, tileDim],
  );
  return (
    <Container x={(spot.x + 0.5) * tileDim} y={(spot.y + 1) * tileDim}>
      <CastShadow texture={texture} />
      <Sprite texture={texture} anchor={{ x: 0.5, y: 1 }} />
      <Graphics draw={drawBar} y={4} />
    </Container>
  );
}

// Finished buildings. Generated art shows once it's ready; until then (or if the
// image server is off) a generic building stands in.
export function Structures({
  structures,
  art,
  tileDim,
}: {
  structures: Structure[];
  art: ArtByKey | undefined;
  tileDim: number;
}) {
  return (
    <>
      {structures.map((s) => {
        const url =
          s.kind === 'statue'
            ? STATUE_DONE
            : art?.[structureArtKey(s.id)]?.url ?? BUILDING_FALLBACK;
        return <StructureSprite key={s.id} structure={s} url={url} tileDim={tileDim} />;
      })}
    </>
  );
}

function StructureSprite({
  structure,
  url,
  tileDim,
}: {
  structure: Structure;
  url: string;
  tileDim: number;
}) {
  const texture = useTexture(url);
  const spot = structureSpot(structure);
  const effects = structure.effects ?? [];
  return (
    <Container x={(spot.x + 0.5) * tileDim} y={(spot.y + 1) * tileDim}>
      <CastShadow texture={texture} />
      {effects.includes('glow') && <Glow tileDim={tileDim} />}
      <Sprite texture={texture} anchor={{ x: 0.5, y: 1 }} />
      {effects.includes('sparkle') && <Sparkles tileDim={tileDim} />}
    </Container>
  );
}

// A soft pulsing golden light behind something. Drawn once; the pulse is a
// scale/alpha change each frame, so nothing re-renders.
export function Glow({ tileDim, color = 0xffe08a }: { tileDim: number; color?: number }) {
  const ref = useRef<PIXI.Graphics | null>(null);
  const t = useRef(Math.random() * 10);
  useTick((delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += delta / 60;
    const pulse = 0.75 + 0.25 * Math.sin(t.current * 2);
    g.scale.set(pulse);
    g.alpha = pulse;
  });
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      for (let i = 5; i >= 1; i--) {
        g.beginFill(color, 0.07);
        g.drawCircle(0, 0, tileDim * 0.45 * i);
        g.endFill();
      }
    },
    [tileDim, color],
  );
  return <Graphics ref={ref} draw={draw} y={-tileDim * 1.4} blendMode={PIXI.BLEND_MODES.ADD} />;
}

function Sparkles({ tileDim }: { tileDim: number }) {
  const ref = useRef<PIXI.Graphics | null>(null);
  const t = useRef(0);
  useTick((delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += delta / 60;
    g.clear();
    for (let i = 0; i < 6; i++) {
      const phase = (t.current * 0.7 + i / 6) % 1;
      const x = Math.sin(i * 2.4 + t.current) * tileDim * 1.2;
      const y = -tileDim * (0.5 + phase * 2.5);
      g.beginFill(0xffffff, 1 - phase);
      g.drawRect(x, y, 3, 3);
      g.endFill();
    }
  });
  return <Graphics ref={ref} />;
}

// The object's own silhouette, darkened and laid on the ground behind it,
// leaning away from the sun as the day goes on.
function CastShadow({ texture }: { texture: PIXI.Texture }) {
  const ref = useRef<PIXI.Sprite | null>(null);
  useTick(() => {
    const s = ref.current;
    if (!s) return;
    s.skew.x = -sun.lean * 0.9;
    s.scale.y = 0.35 + Math.abs(sun.lean) * 0.15;
    s.alpha = sun.strength * 0.75;
  });
  return (
    <Sprite
      ref={ref}
      texture={texture}
      anchor={{ x: 0.5, y: 1 }}
      tint={0x1a1030}
      scale={{ x: 1, y: 0.4 }}
      alpha={0.35}
    />
  );
}

// From the Town era on, homes are redrawn in the era's style on top of the
// original tiles (a patch of grass hides the old house).
export function EraHouses({
  era,
  art,
  tileDim,
}: {
  era: number;
  art: ArtByKey | undefined;
  tileDim: number;
}) {
  const urls = [0, 1].map((style) => art?.[houseArtKey(era, style)]?.url ?? null);
  if (era === 0 || !urls[0]) return null;
  return (
    <>
      {HOUSES.map((h, i) => (
        <EraHouse key={i} x={h.x} y={h.y} url={urls[h.style] ?? urls[0]!} tileDim={tileDim} />
      ))}
    </>
  );
}

function EraHouse({ x, y, url, tileDim }: { x: number; y: number; url: string; tileDim: number }) {
  const texture = useTexture(url);
  // Fit the house to the 3-tile-wide plot, standing on the door row.
  const scale = texture.valid
    ? Math.min((tileDim * 3.4) / texture.width, (tileDim * 5) / texture.height)
    : 1;
  return (
    <>
      <TilingSprite
        texture={grassTexture()}
        x={x * tileDim}
        y={y * tileDim}
        width={tileDim * 3}
        height={tileDim * 5}
        tilePosition={{ x: 0, y: 0 }}
      />
      <Container x={(x + 1.5) * tileDim} y={(y + 5) * tileDim} scale={scale}>
        <CastShadow texture={texture} />
        <Sprite texture={texture} anchor={{ x: 0.5, y: 1 }} />
      </Container>
    </>
  );
}

// The map's grass tile (tile 271 of gentle-obj.png, 45 tiles per row).
let grass: PIXI.Texture | undefined;
function grassTexture() {
  grass ??= new PIXI.Texture(
    PIXI.BaseTexture.from(vivid('/ai-town/assets/gentle-obj.png'), {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    }),
    new PIXI.Rectangle((271 % 45) * 32, Math.floor(271 / 45) * 32, 32, 32),
  );
  return grass;
}
