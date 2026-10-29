import { Container, Text, useTick } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { useRef } from 'react';
import { HOUSES } from '../../data/town';
import { houseAt } from '../../convex/aiTown/beds';
import { ServerGame } from '../hooks/serverGame';

// People sleep inside their houses (Player.tsx hides them); a little "z z z"
// drifts up from the roof of every house with someone asleep in it.
export function Beds({ game, tileDim }: { game: ServerGame; tileDim: number }) {
  const occupied = new Set<number>();
  for (const p of game.world.players.values()) {
    if (p.activity?.emoji !== '😴') continue;
    const home = houseAt(p.position);
    if (home !== undefined) occupied.add(home);
  }
  return (
    <>
      {[...occupied].map((home) => (
        <Snores key={home} x={(HOUSES[home].x + 2.3) * tileDim} y={HOUSES[home].y * tileDim + 4} />
      ))}
    </>
  );
}

const zStyle = new PIXI.TextStyle({
  fontFamily: 'VCR OSD Mono, monospace',
  fontSize: 14,
  fill: 0xf2e8ff,
  stroke: 0x181425,
  strokeThickness: 3,
});

function Snores({ x, y }: { x: number; y: number }) {
  const refs = [
    useRef<PIXI.Text | null>(null),
    useRef<PIXI.Text | null>(null),
    useRef<PIXI.Text | null>(null),
  ];
  const t = useRef(Math.random() * 3);
  useTick((delta) => {
    t.current += delta / 60;
    refs.forEach((ref, i) => {
      const z = ref.current;
      if (!z) return;
      // Each z rises, drifts and fades over three seconds, one after another.
      const p = (t.current / 3 + i / 3) % 1;
      z.y = -p * 28;
      z.x = Math.sin(p * Math.PI * 2) * 4 + p * 8;
      z.alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      z.scale.set(0.6 + p * 0.6);
    });
  });
  return (
    <Container x={x} y={y}>
      {refs.map((ref, i) => (
        <Text key={i} ref={ref} text="z" style={zStyle} anchor={0.5} resolution={2} />
      ))}
    </Container>
  );
}
