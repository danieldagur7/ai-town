import { Game } from './game';
import { Point } from '../util/types';
import { HOUSES } from '../../data/town';
import type { Agent } from './agent';
import { blocked } from './movement';

// Everyone lives in one of the village houses. A home is handed out once and
// kept: children move in with a parent (set when they're born), everyone else
// takes the emptiest house.
export function homeOf(game: Game, agent: Agent): number {
  if (agent.home !== undefined && agent.home < HOUSES.length) return agent.home;
  const counts = HOUSES.map(() => 0);
  for (const other of game.world.agents.values()) {
    if (other.home !== undefined && other.home < HOUSES.length) counts[other.home]++;
  }
  agent.home = counts.indexOf(Math.min(...counts));
  return agent.home;
}

// The tile in front of a house's door.
export function houseDoor(home: number): Point {
  const h = HOUSES[home];
  return { x: h.x + 1, y: h.y + 5 };
}

// Where someone sleeps: their house's door, or the nearest free tile to it
// when housemates are already there. Sleepers by a door are drawn as inside.
export function bedFor(game: Game, now: number, agent: Agent): Point {
  const door = houseDoor(homeOf(game, agent));
  for (let r = 0; r <= 3; r++) {
    for (let dy = 0; dy <= r; dy++) {
      for (const dx of [0, -r, r, -1, 1]) {
        if (Math.abs(dx) > r) continue;
        const spot = { x: door.x + dx, y: door.y + dy };
        if (!blocked(game, now, spot, agent.playerId)) return spot;
      }
    }
  }
  return door;
}

export const NEAR_DOOR = 3;
// The house whose door `pos` is right by, if any (for drawing sleepers inside).
export function houseAt(pos: Point): number | undefined {
  const i = HOUSES.findIndex(
    (_, home) =>
      Math.abs(pos.x - houseDoor(home).x) <= NEAR_DOOR &&
      pos.y - houseDoor(home).y >= -0.5 &&
      pos.y - houseDoor(home).y <= NEAR_DOOR,
  );
  return i >= 0 ? i : undefined;
}
