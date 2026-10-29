import { v } from 'convex/values';
import type { Game } from './game';
import type { Agent } from './agent';
import type { Player } from './player';
import { clockState } from './clock';
import { distance } from '../util/geometry';
import { movePlayer } from './movement';
import { STATUE_SITE } from '../../data/town';
import { WORK_CHANCE, WORK_REST, WORK_SHIFT } from '../constants';

export const BUILDING = 'building the statue';

// A town building project. `work` counts full shifts done, out of `workNeeded`;
// `cost` is the total material bill, spent a shift's share at a time.
export const serializedProject = v.object({
  kind: v.literal('statue'),
  name: v.string(),
  work: v.number(),
  workNeeded: v.number(),
  cost: v.object({ wood: v.number(), stone: v.number() }),
  startedDay: v.number(),
  finishedDay: v.optional(v.number()),
});
export type Project = typeof serializedProject.type;

// Which of the three build stages to draw: 0 foundation, 1 rough stone, 2 done.
export function projectStage(project: Project) {
  if (project.finishedDay !== undefined) return 2;
  return project.work / project.workNeeded < 0.5 ? 0 : 1;
}

// One line for prompts, so people know about it and talk about it.
export function projectPrompt(project: Project | undefined): string {
  if (!project) return '';
  if (project.finishedDay !== undefined) {
    return ` The town finished building ${project.name} on the plaza on day ${project.finishedDay}.`;
  }
  const pct = Math.floor((100 * project.work) / project.workNeeded);
  return ` The town is building ${project.name} on the plaza; it's ${pct}% done and everyone pitches in.`;
}

function shiftShare(project: Project) {
  return {
    wood: project.cost.wood / project.workNeeded,
    stone: project.cost.stone / project.workNeeded,
  };
}

// Spots around the statue where workers stand.
const WORK_SPOTS = [
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: -1, y: 2 },
  { x: 1, y: 2 },
  { x: 0, y: 2 },
  { x: -2, y: 1 },
  { x: 2, y: 1 },
];

// Called when an agent is free (no conversation, no activity). Returns true if
// it's busy working on the town's project this tick.
export function tickWorker(game: Game, now: number, agent: Agent, player: Player): boolean {
  const world = game.world;
  const project = world.project;
  if (agent.working) {
    if ('shiftStarted' in agent.working) {
      // The shift is over (or was cut short by a conversation): count the time worked.
      const share = Math.min(1, (now - agent.working.shiftStarted) / WORK_SHIFT);
      delete agent.working;
      agent.lastWorked = now;
      if (project && project.finishedDay === undefined && share > 0) {
        const cost = shiftShare(project);
        world.resources.wood = Math.max(0, world.resources.wood - cost.wood * share);
        world.resources.stone = Math.max(0, world.resources.stone - cost.stone * share);
        project.work = Math.min(project.workNeeded, project.work + share);
        if (project.work >= project.workNeeded - 0.001) {
          project.work = project.workNeeded;
          project.finishedDay = world.clock ? clockState(world.clock.elapsed).day : 0;
          game.scheduleOperation('considerTownMeeting', {
            worldId: game.worldId,
            reason: `The town just finished building ${project.name} on the plaza!`,
          });
        }
      }
      return false;
    }
    if (player.pathfinding) {
      return true;
    }
    delete agent.working;
    // Arrived at the site: start hammering. Otherwise we never got there.
    if (distance(player.position, STATUE_SITE) <= 3 && canWork(game)) {
      agent.working = { shiftStarted: now };
      player.activity = { description: BUILDING, emoji: '🔨', until: now + WORK_SHIFT };
      return true;
    }
    return false;
  }
  if (
    !canWork(game) ||
    (agent.lastWorked !== undefined && now < agent.lastWorked + WORK_REST) ||
    Math.random() >= WORK_CHANCE
  ) {
    return false;
  }
  const spot = WORK_SPOTS[Math.floor(Math.random() * WORK_SPOTS.length)];
  movePlayer(game, now, player, { x: STATUE_SITE.x + spot.x, y: STATUE_SITE.y + spot.y });
  agent.working = { walking: true };
  return true;
}

// Work only happens by day, on an unfinished project, with materials to hand.
function canWork(game: Game) {
  const project = game.world.project;
  const clock = game.world.clock;
  if (!project || project.finishedDay !== undefined || !clock) return false;
  const phase = clockState(clock.elapsed).phase;
  if (phase !== 'morning' && phase !== 'day') return false;
  const cost = shiftShare(project);
  // Leave a little slack for rounding.
  return (
    game.world.resources.wood >= cost.wood * 0.5 - 0.01 &&
    game.world.resources.stone >= cost.stone * 0.5 - 0.01
  );
}
