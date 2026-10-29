import { v } from 'convex/values';
import type { Game } from './game';
import type { Agent } from './agent';
import type { Player } from './player';
import { clockState } from './clock';
import { distance } from '../util/geometry';
import { blocked, movePlayer } from './movement';
import { FIELDS, HOUSES, PLAZA, STATUE_SITE } from '../../data/town';
import { BEDS, SPARE_BEDS } from '../../data/beds';
import {
  BUILDING_COST,
  BUILDING_WORK_NEEDED,
  ERA_PROJECTS,
  FARM_YIELD,
  GATHER_YIELD,
  STATUE_COST,
  STATUE_WORK_NEEDED,
  WORK_CHANCE,
  WORK_REST,
  WORK_SHIFT,
} from '../constants';
import { ERAS, eraOf, houseArtKey, structureArtKey } from './eras';

export const BUILDING = 'building';

// A town building project. `work` counts full shifts done, out of `workNeeded`;
// `cost` is the total material bill, spent a shift's share at a time. The
// statue is drawn from static art; anything else gets generated art under
// `structureArtKey(structureId)`.
export const serializedProject = v.object({
  kind: v.union(v.literal('statue'), v.literal('building')),
  name: v.string(),
  // What the art shows (the pixel-art prompt).
  subject: v.optional(v.string()),
  // Top-left of the site and the structure's id once built.
  site: v.optional(v.object({ x: v.number(), y: v.number() })),
  structureId: v.optional(v.number()),
  // Who suggested it, if a townsperson did.
  proposer: v.optional(v.string()),
  work: v.number(),
  workNeeded: v.number(),
  cost: v.object({ wood: v.number(), stone: v.number() }),
  startedDay: v.number(),
  finishedDay: v.optional(v.number()),
});
export type Project = typeof serializedProject.type;

// A finished building on the map. `effects` are visual touches the god adds
// from the admin console (e.g. "glow").
export const serializedStructure = v.object({
  id: v.number(),
  kind: v.union(v.literal('statue'), v.literal('building')),
  name: v.string(),
  x: v.number(),
  y: v.number(),
  builtDay: v.number(),
  era: v.number(),
  effects: v.optional(v.array(v.string())),
});
export type Structure = typeof serializedStructure.type;

// The tile a project's or structure's sprite stands on (bottom middle).
export function projectSpot(project: Project) {
  if (project.kind === 'statue' && !project.site) return STATUE_SITE;
  const site = project.site ?? STATUE_SITE;
  return { x: site.x + 1, y: site.y + 2 };
}
export function structureSpot(s: Structure) {
  return s.kind === 'statue' ? { x: s.x, y: s.y } : { x: s.x + 1, y: s.y + 2 };
}

// Which build stage to draw: 0 materials piled up, 1 half built.
export function projectStage(project: Project) {
  return project.work / project.workNeeded < 0.5 ? 0 : 1;
}

function today(game: Game) {
  return game.world.clock ? clockState(game.world.clock.elapsed).day : 0;
}

// Lines for prompts, so people know what age they live in and what's going on.
export function townPrompt(world: {
  era?: number;
  project?: Project;
  structures?: Structure[];
  hungryDays?: number;
  resources?: { food: number };
}): string {
  const era = eraOf(world.era);
  let text = ` The town is in its ${era.name} era: ${era.blurb}.`;
  if (world.hungryDays) text += ' Food has run out and people are going hungry.';
  else if (world.resources && world.resources.food < 5) text += ' Food is running low.';
  const built = (world.structures ?? []).slice(-6).map((s) => s.name);
  if (built.length > 0) text += ` The town has built ${built.join(', ')}.`;
  const project = world.project;
  if (project) {
    const pct = Math.floor((100 * project.work) / project.workNeeded);
    text += ` Right now everyone is pitching in to build ${project.name} (${pct}% done).`;
  }
  return text;
}

// Start building something. Gathering isn't simulated yet, so the town is
// assumed to have collected the materials: the stockpile is topped up.
export function startProject(
  game: Game,
  args: { kind: 'statue' | 'building'; name: string; subject?: string; proposer?: string },
) {
  const world = game.world;
  if (world.project) {
    throw new Error(`The town is already building ${world.project.name}`);
  }
  const statue = args.kind === 'statue';
  const cost = statue ? { ...STATUE_COST } : { ...BUILDING_COST };
  const site = statue ? undefined : findSite(game);
  if (!statue && !site) {
    throw new Error('There is no free space left to build on');
  }
  const structureId = Math.max(0, ...world.structures.map((s) => s.id)) + 1;
  // A build the god commands comes with the materials; the town's own ideas
  // have to be gathered for.
  if (!args.proposer) {
    world.resources.wood = Math.max(world.resources.wood, cost.wood);
    world.resources.stone = Math.max(world.resources.stone, cost.stone);
  }
  world.project = {
    kind: args.kind,
    name: args.name,
    subject: args.subject,
    site,
    structureId,
    proposer: args.proposer,
    work: 0,
    workNeeded: statue ? STATUE_WORK_NEEDED : BUILDING_WORK_NEEDED,
    cost,
    startedDay: today(game),
  };
  if (!statue) {
    // Draw it now, so the art is ready by the time it's finished.
    game.scheduleOperation('requestArt', {
      worldId: game.worldId,
      key: structureArtKey(structureId),
      subject: buildingArtSubject(args.name, args.subject, world.era),
    });
  }
  game.scheduleOperation('townEvent', {
    worldId: game.worldId,
    emoji: '🏗️',
    text: args.proposer
      ? `${args.proposer} got the town building ${args.name}.`
      : `The town started building ${args.name}.`,
  });
  return structureId;
}

// Mark the active project done: it becomes a structure on the map, and enough
// of them move the town into the next era.
export function finishProject(game: Game) {
  const world = game.world;
  const project = world.project;
  if (!project) return;
  const spot = project.site ?? STATUE_SITE;
  world.structures.push({
    id: project.structureId ?? Math.max(0, ...world.structures.map((s) => s.id)) + 1,
    kind: project.kind,
    name: project.name,
    x: spot.x,
    y: spot.y,
    builtDay: today(game),
    era: world.era,
    // Keep the statue in the god's light.
    effects: project.kind === 'statue' ? ['glow'] : undefined,
  });
  delete world.project;
  for (const agent of world.agents.values()) delete agent.working;
  game.scheduleOperation('townEvent', {
    worldId: game.worldId,
    emoji: project.kind === 'statue' ? '🗿' : '🏛️',
    text: `The town finished building ${project.name}!`,
  });
  game.scheduleOperation('considerTownMeeting', {
    worldId: game.worldId,
    reason: `The town just finished building ${project.name}!`,
  });
  game.scheduleOperation('proposeProject', { worldId: game.worldId });
  game.scheduleOperation('everyoneWellbeing', { worldId: game.worldId, delta: 5 });
  const builtThisEra = world.structures.filter((s) => s.era === world.era).length;
  if (builtThisEra >= ERA_PROJECTS && world.era < ERAS.length - 1) {
    setEra(game, world.era + 1);
  }
}

// Move the town into an era: homes get redrawn in its style.
export function setEra(game: Game, era: number) {
  const world = game.world;
  world.era = Math.min(Math.max(Math.round(era), 0), ERAS.length - 1);
  const info = ERAS[world.era];
  if (info.house) {
    for (const style of [0, 1]) {
      game.scheduleOperation('requestArt', {
        worldId: game.worldId,
        key: houseArtKey(world.era, style),
        subject: `${info.house}, ${info.style}`,
        size: 112,
        seed: style + 1,
      });
    }
  }
  game.scheduleOperation('townEvent', {
    worldId: game.worldId,
    emoji: info.emoji,
    text: `The town has entered the ${info.name} era!`,
  });
}

// A free 3x3 spot (with a one-tile margin) for a new building, as close to the
// plaza as possible: no map objects, houses, fields, beds or other buildings.
function findSite(game: Game) {
  const map = game.worldMap;
  const taken: { x: number; y: number; w: number; h: number }[] = [
    { ...PLAZA },
    ...HOUSES.map((h) => ({ x: h.x, y: h.y, w: 3, h: 6 })),
    ...FIELDS.map((f) => ({ x: f.x, y: f.y - 1, w: f.w, h: f.h + 1 })),
    ...[...Object.values(BEDS), ...SPARE_BEDS].map((b) => ({ x: b.x, y: b.y, w: 1, h: 1 })),
    ...game.world.structures.map((s) =>
      s.kind === 'statue' ? { x: s.x - 1, y: s.y - 2, w: 3, h: 3 } : { x: s.x, y: s.y, w: 3, h: 3 },
    ),
  ];
  const overlaps = (x: number, y: number) =>
    taken.some((t) => x - 1 < t.x + t.w && x + 4 > t.x && y - 1 < t.y + t.h && y + 4 > t.y);
  const free = (x: number, y: number) => {
    for (let i = x - 1; i <= x + 3; i++) {
      for (let j = y - 1; j <= y + 3; j++) {
        if (i < 0 || j < 0 || i >= map.width || j >= map.height) return false;
        for (const layer of map.objectTiles) {
          if (layer[i][j] !== -1) return false;
        }
      }
    }
    return true;
  };
  const center = { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2 };
  let best: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (let x = 1; x < map.width - 4; x++) {
    for (let y = 1; y < map.height - 4; y++) {
      const d = distance({ x: x + 1.5, y: y + 1.5 }, center);
      if (d < bestDist && !overlaps(x, y) && free(x, y)) {
        best = { x, y };
        bestDist = d;
      }
    }
  }
  return best;
}

function shiftShare(project: Project) {
  return {
    wood: project.cost.wood / project.workNeeded,
    stone: project.cost.stone / project.workNeeded,
  };
}

// Spots around the sprite's base where workers stand.
const WORK_SPOTS = [
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -2, y: -1 },
  { x: 2, y: -1 },
];

export type Job = 'farm' | 'wood' | 'stone' | 'build';
const JOBS: Record<Job, { description: string; emoji: string }> = {
  farm: { description: 'farming', emoji: '🌾' },
  wood: { description: 'chopping wood', emoji: '🪓' },
  stone: { description: 'quarrying stone', emoji: '⛏️' },
  build: { description: BUILDING, emoji: '🔨' },
};

// What the town needs most right now (plain rules): food first, then whatever
// the current building is short of, then building, then stocking up on food.
function chooseJob(game: Game): Job | undefined {
  const world = game.world;
  const people = world.agents.size;
  const r = world.resources;
  if (r.food < people * 2) return 'farm';
  const project = world.project;
  if (project) {
    const share = shiftShare(project);
    if (r.wood < share.wood) return 'wood';
    if (r.stone < share.stone) return 'stone';
    return 'build';
  }
  if (r.food < people * 5) return 'farm';
  return undefined;
}

function jobSpot(game: Game, job: Job, player: Player) {
  if (job === 'build') {
    const base = projectSpot(game.world.project!);
    const spot = WORK_SPOTS[Math.floor(Math.random() * WORK_SPOTS.length)];
    return { x: base.x + spot.x, y: base.y + spot.y };
  }
  if (job === 'farm') {
    const f = FIELDS[Math.floor(Math.random() * FIELDS.length)];
    return {
      x: f.x + Math.floor(Math.random() * f.w),
      y: f.y + Math.floor(Math.random() * f.h),
    };
  }
  // Wood and stone: somewhere open on the edge of town.
  const center = { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2 };
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const d = 8 + Math.random() * 8;
    const spot = {
      x: Math.round(center.x + Math.cos(angle) * d),
      y: Math.round(center.y + Math.sin(angle) * d),
    };
    if (
      spot.x > 0 &&
      spot.y > 0 &&
      spot.x < game.worldMap.width - 1 &&
      spot.y < game.worldMap.height - 1 &&
      !blocked(game, Date.now(), spot, player.id)
    ) {
      return spot;
    }
  }
  return undefined;
}

// Called when an agent is free (no conversation, no activity). Returns true if
// it's busy working for the town this tick. All plain game logic.
export function tickWorker(game: Game, now: number, agent: Agent, player: Player): boolean {
  const world = game.world;
  const working = agent.working;
  if (working) {
    const job: Job = working.job ?? 'build';
    if ('shiftStarted' in working) {
      // The shift is over (or was cut short by a conversation): count the time worked.
      const share = Math.min(1, (now - working.shiftStarted) / WORK_SHIFT);
      delete agent.working;
      agent.lastWorked = now;
      if (share <= 0) return false;
      if (job === 'farm') world.resources.food += FARM_YIELD * share;
      else if (job === 'wood') world.resources.wood += GATHER_YIELD * share;
      else if (job === 'stone') world.resources.stone += GATHER_YIELD * share;
      else if (world.project) {
        const project = world.project;
        const cost = shiftShare(project);
        world.resources.wood = Math.max(0, world.resources.wood - cost.wood * share);
        world.resources.stone = Math.max(0, world.resources.stone - cost.stone * share);
        project.work = Math.min(project.workNeeded, project.work + share);
        if (project.work >= project.workNeeded - 0.001) {
          finishProject(game);
        }
      }
      return false;
    }
    if (player.pathfinding) {
      return true;
    }
    delete agent.working;
    if (!isWorkTime(game)) return false;
    if (
      job === 'build' &&
      !(
        world.project &&
        canBuild(game) &&
        distance(player.position, projectSpot(world.project)) <= 3
      )
    ) {
      return false;
    }
    // Arrived (or close enough): start the shift.
    agent.working = { shiftStarted: now, job };
    const what = JOBS[job];
    player.activity = {
      description: job === 'build' ? `${BUILDING} ${world.project!.name}` : what.description,
      emoji: what.emoji,
      until: now + WORK_SHIFT,
    };
    return true;
  }
  if (
    !isWorkTime(game) ||
    (agent.lastWorked !== undefined && now < agent.lastWorked + WORK_REST) ||
    Math.random() >= WORK_CHANCE
  ) {
    return false;
  }
  const job = chooseJob(game);
  if (!job) return false;
  const spot = jobSpot(game, job, player);
  if (!spot) return false;
  movePlayer(game, now, player, spot);
  agent.working = { walking: true, job };
  return true;
}

function isWorkTime(game: Game) {
  const clock = game.world.clock;
  if (!clock) return false;
  const phase = clockState(clock.elapsed).phase;
  return phase === 'morning' || phase === 'day';
}

// Building needs materials to hand.
function canBuild(game: Game) {
  const project = game.world.project;
  if (!project) return false;
  const cost = shiftShare(project);
  // Leave a little slack for rounding.
  return (
    game.world.resources.wood >= cost.wood * 0.5 - 0.01 &&
    game.world.resources.stone >= cost.stone * 0.5 - 0.01
  );
}

// The pixel-art prompt for a building: its outside, in the era's style.
export function buildingArtSubject(name: string, look: string | undefined, era: number) {
  const details = look && look !== name ? `, ${look}` : '';
  return `the outside of ${name}, a whole building seen from the front${details}, ${eraOf(era).style}`;
}
