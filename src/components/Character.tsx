import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { divineBaseTexture } from '../divineTexture';

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
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const parseSheet = async () => {
      const base = divine
        ? await divineBaseTexture(textureUrl)
        : BaseTexture.from(textureUrl, {
            scaleMode: PIXI.SCALE_MODES.NEAREST,
          });
      const sheet = new Spritesheet(base, spritesheetData);
      await sheet.parse();
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, []);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation];

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet) return null;

  let blockOffset = { x: 0, y: 0 };
  switch (roundedOrientation) {
    case 2:
      blockOffset = { x: -20, y: 0 };
      break;
    case 0:
      blockOffset = { x: 20, y: 0 };
      break;
    case 3:
      blockOffset = { x: 0, y: -20 };
      break;
    case 1:
      blockOffset = { x: 0, y: 20 };
      break;
  }

  return (
    <Container
      x={x}
      y={y}
      interactive={true}
      pointerdown={onClick}
      pointerover={() => setHovered(true)}
      pointerout={() => setHovered(false)}
      cursor="pointer"
    >
      {isThinking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isViewer && <ViewerIndicator />}
      {divine && <DivineGlow />}
      <AnimatedSprite
        ref={ref}
        isPlaying={isMoving}
        textures={spriteSheet.animations[direction]}
        animationSpeed={speed}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {emoji && (
        <Text x={0} y={-24} scale={{ x: -0.8, y: 0.8 }} text={emoji} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {divine && <Halo />}
      {hovered && name && <NameLabel name={name} y={emoji ? -40 : -26} />}
    </Container>
  );
};

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

function DivineGlow() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    // Soft light on the ground, brighter towards the middle.
    for (let i = 0; i < 5; i++) {
      g.beginFill(0xffe9a0, 0.08);
      g.drawEllipse(0, 12, 26 - i * 4, 12 - i * 2);
      g.endFill();
    }
  }, []);
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
