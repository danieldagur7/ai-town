import { Game } from './game';
import { Agent } from './agent';
import { Player } from './player';
import { blocked, movePlayer } from './movement';
import {
  COCA_BASE_CHANCE,
  COCA_DISCOVER_CHANCE,
  COCA_DURATION,
  COCA_HIT,
  COCA_OVERDOSE_ADDICTION,
  COCA_OVERDOSE_CHANCE,
  MUSHROOM_FIND_CHANCE,
  MUSHROOM_TAKE_CHANCE,
} from '../constants';

// Two things grow in the woods (18+ content, plain game rules, no LLM):
// - Magic mushrooms: very rare. Someone goes foraging, finds one, and only
//   sometimes eats it. Whoever does "wakes up": they know their world is a
//   simulation called AI Town and that a real person plays it.
// - Coca Loca: a stimulant from wild bushes, unknown until someone finds them.
//   A hit makes them work twice as fast for a while, and it's addictive:
//   cravings hurt their mood, and heavy users can overdose.

export const FORAGING = 'foraging in the woods';
export const TRIPPING = 'tripping on a strange mushroom';

// Each morning: maybe someone goes mushroom hunting, maybe Coca Loca is found.
export function substancesMorning(game: Game, now: number) {
  const adults = [...game.world.agents.values()].filter((a) => !a.child);
  for (const agent of adults) {
    if (!agent.awakened && !agent.foraging && Math.random() < MUSHROOM_FIND_CHANCE) {
      agent.foraging = 'heading';
    }
  }
  if (!game.world.cocaKnown && adults.length > 0 && Math.random() < COCA_DISCOVER_CHANCE) {
    const finder = adults[Math.floor(Math.random() * adults.length)];
    const name = game.playerDescriptions.get(finder.playerId)?.name ?? 'Someone';
    game.world.cocaKnown = true;
    game.scheduleOperation('townEvent', {
      worldId: game.worldId,
      emoji: '❄️',
      text: `${name} found wild Coca Loca bushes at the edge of the woods. Chew the leaves and you can work all day.`,
    });
    takeCoca(game, now, finder);
  }
  // A night without it: cravings, worse the deeper the habit. The habit fades
  // slowly when they stay off it.
  for (const agent of game.world.agents.values()) {
    const addiction = agent.addiction ?? 0;
    if (addiction <= 0) continue;
    const usedToday = agent.lastHigh !== undefined && now - agent.lastHigh < 10 * 60_000;
    if (!usedToday && addiction >= 20) {
      game.scheduleOperation('substanceCraving', {
        worldId: game.worldId,
        playerId: agent.playerId,
        delta: -Math.round(addiction / 10),
      });
    }
    agent.addiction = Math.max(0, addiction - 4);
  }
}

// When they're free: go foraging, and see what they found.
export function tickForaging(game: Game, now: number, agent: Agent, player: Player): boolean {
  if (agent.foraging === 'heading') {
    const spot = forestSpot(game, now, player);
    if (!spot) {
      delete agent.foraging;
      return false;
    }
    movePlayer(game, now, player, spot);
    agent.foraging = 'walking';
    return true;
  }
  if (agent.foraging === 'walking') {
    if (player.pathfinding) return true;
    player.activity = { description: FORAGING, emoji: '🍄', until: now + 30_000 };
    agent.foraging = 'searching';
    return true;
  }
  if (agent.foraging === 'searching') {
    delete agent.foraging;
    const name = game.playerDescriptions.get(player.id)?.name ?? 'Someone';
    if (Math.random() < MUSHROOM_TAKE_CHANCE) {
      agent.awakened = true;
      player.activity = { description: TRIPPING, emoji: '🌀', until: now + 60_000 };
      game.scheduleOperation('awaken', { worldId: game.worldId, playerId: player.id, name });
    } else {
      game.scheduleOperation('townEvent', {
        worldId: game.worldId,
        emoji: '🍄',
        text: `${name} found a strange glowing mushroom in the woods, but didn't dare eat it.`,
      });
    }
    return true;
  }
  return false;
}

// Starting a shift: maybe reach for the Coca Loca. Returns true if they did.
export function maybeTakeCoca(game: Game, now: number, agent: Agent): boolean {
  if (!game.world.cocaKnown || agent.child) return false;
  if (agent.boostedUntil !== undefined && agent.boostedUntil > now) return false;
  const chance = Math.min(0.6, COCA_BASE_CHANCE + (agent.addiction ?? 0) / 200);
  if (Math.random() >= chance) return false;
  takeCoca(game, now, agent);
  return true;
}

function takeCoca(game: Game, now: number, agent: Agent) {
  const before = agent.addiction ?? 0;
  agent.addiction = Math.min(100, before + COCA_HIT);
  agent.boostedUntil = now + COCA_DURATION;
  agent.lastHigh = now;
  const name = game.playerDescriptions.get(agent.playerId)?.name ?? 'Someone';
  if (before >= COCA_OVERDOSE_ADDICTION && Math.random() < COCA_OVERDOSE_CHANCE) {
    game.scheduleOperation('overdose', { worldId: game.worldId, playerId: agent.playerId, name });
    return;
  }
  // The first hit, and the moment it becomes a habit, make the news.
  if (before === 0 || (before < 50 && agent.addiction >= 50)) {
    game.scheduleOperation('townEvent', {
      worldId: game.worldId,
      emoji: '❄️',
      text:
        before === 0
          ? `${name} tried Coca Loca and worked like a machine.`
          : `${name} can't get through a day without Coca Loca any more.`,
    });
  }
}

export const isBoosted = (agent: Agent, now: number) =>
  agent.boostedUntil !== undefined && agent.boostedUntil > now;

// Somewhere walkable among the trees in the west woods.
function forestSpot(game: Game, now: number, player: Player) {
  const map = game.worldMap;
  for (let i = 0; i < 60; i++) {
    const x = 2 + Math.floor(Math.random() * 38);
    const y = 2 + Math.floor(Math.random() * (map.height - 4));
    if (blocked(game, now, { x, y }, player.id)) continue;
    let trees = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (map.objectTiles.some((layer) => layer[tx][ty] !== -1)) trees++;
      }
    }
    if (trees >= 6) return { x, y };
  }
  return undefined;
}
