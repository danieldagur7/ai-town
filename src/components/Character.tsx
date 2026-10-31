import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Sprite, Text, useTick } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { divineBaseTexture } from '../divineTexture';
import { lookBaseTexture } from '../lookTexture';
import { sun } from '../sun';
import { vivid } from '../vivid';
import { Accessory, Look, OUTFIT_COLOURS, Quirk } from '../../data/looks';

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  emoji = '',
  isViewer = false,
  speed = 0.1,
  name,
  divine = false,
  effects = [],
  look,
  quirk = 'still',
  onClick,
}: {
  // Path to the texture packed image.
  textureUrl: string;
  // The data for the spritesheet.
  spritesheetData: ISpritesheetData;
  // The pose of the NPC.
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  // Shows a thought bubble if true.
  isThinking?: boolean;
  // Shows a speech bubble if true.
  isSpeaking?: boolean;
  emoji?: string;
  // Highlights the player.
  isViewer?: boolean;
  // The speed of the animation. Can be tuned depending on the side and speed of the NPC.
  speed?: number;
  // Shown above the character while hovered.
  name?: string;
  // The god's manifested form: recolored robe, halo and glow.
  divine?: boolean;
  // Admin-console effects: glow, sparkle, giant, tiny.
  effects?: string[];
  // Hair/outfit colours and accessory from the feature wheel.
  look?: Look;
  // Their idle habit, shown while standing around.
  quirk?: Quirk;
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  const [hovered, setHovered] = useState(false);
  const lookKey = look ? `${look.hair}|${look.outfit}` : '';
  useEffect(() => {
    let cancelled = false;
    const parseSheet = async () => {
      // The brighter copy of the art (scripts/make_vivid.py).
      const url = vivid(textureUrl);
      const base = divine
        ? await divineBaseTexture(url)
        : look
          ? await lookBaseTexture(look, url)
          : BaseTexture.from(url, {
              scaleMode: PIXI.SCALE_MODES.NEAREST,
            });
      const sheet = new Spritesheet(base, spritesheetData);
      await sheet.parse();
      if (!cancelled) setSpriteSheet(sheet);
    };
    void parseSheet();
    return () => {
      cancelled = true;
    };
  }, [lookKey]);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation] as Direction;

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    } else {
      // Stand on the neutral frame instead of freezing mid-step.
      ref.current?.gotoAndStop(0);
    }
  }, [direction, isMoving]);

  // Walking bounce and idle quirks are applied straight to the Pixi objects
  // every frame; nothing here causes a React render.
  const body = useRef<PIXI.Container | null>(null);
  const shadow = useRef<PIXI.Sprite | null>(null);
  const clock = useRef({ t: Math.random() * 100, seed: Math.random() * 10 });
  const moving = useRef(isMoving);
  moving.current = isMoving;
  const wired = useRef(false);
  wired.current = effects.includes('wired');
  useTick((delta) => {
    const b = body.current;
    if (!b) return;
    const c = clock.current;
    c.t += delta / 60;
    // Wired on Coca Loca: everything at double speed, and they can't keep still.
    if (wired.current) c.t += delta / 60;
    const p = moving.current
      ? walkPose(c.t)
      : quirkPose(wired.current ? 'fidget' : quirk, c.t, c.seed);
    b.position.set(p.dx, p.dy);
    b.rotation = p.rot;
    b.scale.set(p.sx, p.sy);
    const s = shadow.current;
    if (s) {
      // The shadow stays on the ground, shrinks as they leave it, and
      // stretches away from the sun.
      const lift = Math.min(1, -p.dy / 8);
      const size = 1 - lift * 0.35;
      s.x = sun.lean * 5;
      s.scale.set(size * (1 + Math.abs(sun.lean) * 0.5), size);
      s.alpha = (sun.strength / 0.55) * (1 - lift * 0.4);
    }
  });

  if (!spriteSheet) return null;

  const accessory = look?.accessory ?? 'none';
  const accent = accentColour(look);
  return (
    <Container
      x={x}
      y={y}
      scale={effects.includes('giant') ? 2 : effects.includes('tiny') ? 0.6 : 1}
      interactive={true}
      pointerdown={onClick}
      pointerover={() => setHovered(true)}
      pointerout={() => setHovered(false)}
      cursor="pointer"
    >
      {(divine || effects.includes('glow')) && <DivineGlow />}
      {effects.includes('awakened') && <DivineGlow color={0xb07cff} />}
      {isViewer && <ViewerIndicator />}
      <Sprite ref={shadow} texture={shadowTexture()} anchor={{ x: 0.5, y: 0.5 }} y={15} />
      <Container ref={body}>
        {/* Feet at y=16, so squash/stretch and tilts pivot on the ground. */}
        <AnimatedSprite
          ref={ref}
          isPlaying={isMoving}
          textures={spriteSheet.animations[direction]}
          animationSpeed={speed * 5}
          anchor={{ x: 0.5, y: 1 }}
          y={16}
        />
        {accessory !== 'none' && (
          <AccessoryDrawing accessory={accessory} direction={direction} accent={accent} />
        )}
        {(divine || effects.includes('sparkle')) && <Halo />}
      </Container>
      {isThinking && (
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />}
      {emoji && (
        <Text x={0} y={-24} scale={{ x: -0.8, y: 0.8 }} text={emoji} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {hovered && name && <NameLabel name={name} y={emoji ? -40 : -26} />}
    </Container>
  );
};

type Direction = 'right' | 'down' | 'left' | 'up';
type Pose = { dx: number; dy: number; rot: number; sx: number; sy: number };

const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * 2 * p);
// 0..1 progress through a short move that happens once every `every` seconds,
// or -1 outside it.
const burst = (t: number, every: number, length: number, seed: number) => {
  const p = ((t + seed * every) % every) / length;
  return p <= 1 ? p : -1;
};

// Poses are worked out into this one object (everything runs on the main
// thread, one character at a time), so the frame loop allocates nothing.
const pose: Pose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

function walkPose(t: number): Pose {
  const step = Math.sin(t * 24);
  pose.dx = 0;
  pose.dy = -Math.abs(step) * 1.5;
  pose.rot = step * 0.035;
  pose.sx = 1;
  pose.sy = 1 + Math.abs(step) * 0.03;
  return pose;
}

// Small idle habits. Everyone breathes; on top of that each quirk adds its own move.
function quirkPose(quirk: Quirk, t: number, seed: number): Pose {
  const breath = Math.sin(t * 2 + seed) * 0.018;
  pose.dx = 0;
  pose.dy = 0;
  pose.rot = 0;
  pose.sx = 1 - breath / 2;
  pose.sy = 1 + breath;
  switch (quirk) {
    case 'bouncy': {
      const p = burst(t, 3.2, 0.45, seed);
      if (p >= 0) {
        pose.dy = -Math.sin(Math.PI * p) * 6;
        // Squash on take-off and landing.
        const squash = p < 0.15 || p > 0.85 ? 0.1 : -0.05;
        pose.sy -= squash;
        pose.sx += squash;
      }
      break;
    }
    case 'sway':
      pose.rot = Math.sin(t * 1.7 + seed) * 0.07;
      pose.dx = Math.sin(t * 1.7 + seed) * 0.8;
      break;
    case 'fidget': {
      const p = burst(t, 2.4, 0.5, seed);
      if (p >= 0) pose.dx = Math.sin(p * Math.PI * 6) * 1.5;
      pose.rot = Math.sin(t * 5.3 + seed) * 0.015;
      break;
    }
    case 'proud':
      pose.sy = 1.03 + Math.sin(t * 1.1 + seed) * 0.035;
      pose.sx = 1.02;
      break;
    case 'ponder': {
      const p = burst(t, 5.5, 2, seed);
      if (p >= 0) pose.rot = ease(p) * 0.13;
      break;
    }
    case 'grumble': {
      const p = burst(t, 4.5, 0.7, seed);
      if (p >= 0) {
        pose.rot = Math.sin(p * Math.PI * 4) * 0.08;
        pose.dy = -Math.abs(Math.sin(p * Math.PI * 2)) * 1.5;
      }
      break;
    }
    case 'tap': {
      const p = burst(t, 3, 1.2, seed);
      if (p >= 0) pose.dy = -Math.abs(Math.sin(p * Math.PI * 8)) * 1.2;
      break;
    }
    case 'wobble':
      pose.rot = Math.sin(t * 3 + seed) * 0.045 + Math.sin(t * 7.3) * 0.02;
      break;
    case 'twirl': {
      const p = burst(t, 7, 0.7, seed);
      if (p >= 0) {
        pose.sx *= Math.cos(p * Math.PI * 2);
        pose.dy = -Math.sin(Math.PI * p) * 3;
      }
      break;
    }
    case 'still':
      break;
  }
  return pose;
}

// One soft, round shadow texture shared by everyone.
let shadowTex: PIXI.Texture | undefined;
function shadowTexture() {
  if (!shadowTex) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 12;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 6, 1, 16, 6, 15);
    g.addColorStop(0, 'rgba(20, 12, 30, 0.9)');
    g.addColorStop(0.6, 'rgba(20, 12, 30, 0.45)');
    g.addColorStop(1, 'rgba(20, 12, 30, 0)');
    ctx.setTransform(1, 0, 0, 0.4, 0, 3.6);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(16, 6, 15, 0, Math.PI * 2);
    ctx.fill();
    shadowTex = PIXI.Texture.from(canvas);
  }
  return shadowTex;
}

function accentColour(look?: Look) {
  const ramp = look ? OUTFIT_COLOURS[look.outfit].ramp : null;
  return ramp ? ramp[1] : 0xd94a5a;
}

// Accessories are a few pixels drawn on top of the sprite, placed for the
// direction they face. The head spans roughly y=-15..-2.
function AccessoryDrawing({
  accessory,
  direction,
  accent,
}: {
  accessory: Accessory;
  direction: Direction;
  accent: number;
}) {
  const side = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const ink = 0x181425;
      switch (accessory) {
        case 'hat':
          g.beginFill(0x5a3a24);
          g.lineStyle(1, ink, 1);
          g.drawRect(-8, -13, 16, 2);
          g.drawRect(-5, -19, 10, 6);
          g.endFill();
          g.lineStyle(0);
          g.beginFill(accent);
          g.drawRect(-5, -15, 10, 2);
          g.endFill();
          break;
        case 'cap':
          g.lineStyle(1, ink, 1);
          g.beginFill(accent);
          g.drawRoundedRect(-6, -17, 12, 5, 2);
          g.endFill();
          if (direction !== 'up') {
            g.beginFill(accent);
            g.drawRect(side === 0 ? -5 : side > 0 ? 3 : -9, -13, side === 0 ? 10 : 6, 2);
            g.endFill();
          }
          break;
        case 'glasses':
          if (direction === 'up') break;
          g.lineStyle(1, ink, 1);
          if (side === 0) {
            g.drawRect(-5, -9, 4, 3);
            g.drawRect(1, -9, 4, 3);
            g.moveTo(-1, -8).lineTo(1, -8);
          } else {
            g.drawRect(side > 0 ? 2 : -6, -9, 4, 3);
          }
          break;
        case 'flower': {
          const fx = side === 0 ? 5 : -side * 4;
          g.beginFill(0xff8ac2);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            g.drawCircle(fx + Math.cos(a) * 1.6, -14 + Math.sin(a) * 1.6, 1.3);
          }
          g.endFill();
          g.beginFill(0xffe36a);
          g.drawCircle(fx, -14, 1);
          g.endFill();
          break;
        }
        case 'bow':
          g.lineStyle(1, ink, 1);
          g.beginFill(accent);
          g.drawPolygon([0, -15, -5, -18, -5, -12]);
          g.drawPolygon([0, -15, 5, -18, 5, -12]);
          g.endFill();
          break;
        case 'scarf':
          g.lineStyle(1, ink, 1);
          g.beginFill(accent);
          g.drawRect(-6, -2, 12, 3);
          if (direction !== 'up') g.drawRect(side >= 0 ? 2 : -5, 0, 3, 5);
          g.endFill();
          break;
        case 'beard':
          if (direction === 'up') break;
          g.beginFill(0x6a4630);
          if (side === 0) g.drawRoundedRect(-4, -5, 8, 5, 2);
          else g.drawRoundedRect(side > 0 ? 0 : -6, -5, 6, 5, 2);
          g.endFill();
          break;
        case 'headband':
          g.beginFill(accent);
          g.drawRect(-7, -12, 14, 2);
          g.endFill();
          break;
      }
    },
    [accessory, direction, accent, side],
  );
  return <Graphics draw={draw} />;
}

const nameStyle = new PIXI.TextStyle({
  fontFamily: 'VCR OSD Mono, monospace',
  fontSize: 14,
  fill: 0xffffff,
  stroke: 0x181425,
  strokeThickness: 3,
});

function NameLabel({ name, y }: { name: string; y: number }) {
  const width = PIXI.TextMetrics.measureText(name, nameStyle).width + 10;
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.beginFill(0x3f2832, 0.9);
      g.lineStyle(2, 0x181425, 1);
      g.drawRect(-width / 2, -10, width, 20);
      g.endFill();
    },
    [width],
  );
  return (
    <Container y={y}>
      <Graphics draw={draw} />
      <Text text={name} style={nameStyle} anchor={{ x: 0.5, y: 0.5 }} resolution={2} />
    </Container>
  );
}

// Soft light on the ground: gold for the divine, violet for the awakened.
function DivineGlow({ color = 0xffe9a0 }: { color?: number }) {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      // Brighter towards the middle.
      for (let i = 0; i < 5; i++) {
        g.beginFill(color, 0.08);
        g.drawEllipse(0, 12, 26 - i * 4, 12 - i * 2);
        g.endFill();
      }
    },
    [color],
  );
  return <Graphics draw={draw} />;
}

function Halo() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.lineStyle(2, 0xffd34d, 0.95);
    g.drawEllipse(0, -19, 8, 3);
  }, []);
  return <Graphics draw={draw} />;
}

function ViewerIndicator() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0xffff0b, 0.5);
    g.drawRoundedRect(-10, 10, 20, 10, 100);
    g.endFill();
  }, []);

  return <Graphics draw={draw} />;
}
