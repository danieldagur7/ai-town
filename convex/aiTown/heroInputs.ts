import { v } from 'convex/values';
import { inputHandler } from './inputHandler';
import { parseGameId, playerId } from './ids';
import { distance } from '../util/geometry';
import { movePlayer } from './movement';
import { clockState } from './clock';
import { FIELDS } from '../../data/town';
import { finishProject, projectSpot } from './project';
import { HERO_BUILD_WORK, HERO_GATHER_AMOUNT, HERO_WORK_DURATION } from '../constants';

const WORK = {
  wood: { description: 'chopping wood', emoji: '🪓' },
  stone: { description: 'quarrying stone', emoji: '⛏️' },
  food: { description: 'farming', emoji: '🌾' },
  build: { description: 'building', emoji: '🔨' },
} as const;

// What the player's own character can do in town.
export const heroInputs = {
  heroWork: inputHandler({
    args: {
      playerId,
      kind: v.union(v.literal('wood'), v.literal('stone'), v.literal('food'), v.literal('build')),
    },
    handler: (game, now, args) => {
      const player = game.world.players.get(parseGameId('players', args.playerId));
      if (!player || !player.human) throw new Error('Join the world first');
      if (player.activity && player.activity.until > now) {
        throw new Error(`You're still ${player.activity.description}`);
      }
      const clock = game.world.clock && clockState(game.world.clock.elapsed);
      if (clock?.phase === 'night') throw new Error("It's too dark to work. Get some sleep.");
      const project = game.world.project;
      if (args.kind === 'build') {
        if (!project) throw new Error('Nothing is being built right now');
        if (distance(player.position, projectSpot(project)) > 4) {
          throw new Error(`Walk over to ${project.name} first`);
        }
      }
      if (args.kind === 'food') {
        const nearField = FIELDS.some(
          (f) =>
            player.position.x >= f.x - 2 &&
            player.position.x <= f.x + f.w + 1 &&
            player.position.y >= f.y - 2 &&
            player.position.y <= f.y + f.h + 1,
        );
        if (!nearField) throw new Error('Walk to the farm fields south of the road first');
      }
      delete player.pathfinding;
      const work = WORK[args.kind];
      player.activity = {
        description: work.description,
        emoji: work.emoji,
        until: now + HERO_WORK_DURATION,
      };
      if (args.kind === 'build') {
        project!.work = Math.min(project!.workNeeded, project!.work + HERO_BUILD_WORK);
        if (project!.work >= project!.workNeeded) finishProject(game);
        return project!.name;
      }
      game.world.resources[args.kind] += HERO_GATHER_AMOUNT;
      return HERO_GATHER_AMOUNT;
    },
  }),
  // Walk over to a group chat or town meeting and join it.
  joinGathering: inputHandler({
    args: { playerId, gatheringId: v.string() },
    handler: (game, now, args) => {
      const id = parseGameId('players', args.playerId);
      const player = game.world.players.get(id);
      const gathering = game.world.gatherings.find((g) => g.id === args.gatheringId);
      if (!player || !gathering) throw new Error('That gathering is over');
      game.world.playerConversation(player)?.leave(game, now, player);
      for (const g of game.world.gatherings) {
        g.participants = g.participants.filter((p) => p !== id);
      }
      gathering.participants.push(id);
      movePlayer(game, now, player, {
        x: Math.round(gathering.location.x + 2),
        y: Math.round(gathering.location.y + 2),
      });
      return null;
    },
  }),
  leaveGathering: inputHandler({
    args: { playerId },
    handler: (game, _now, args) => {
      const id = parseGameId('players', args.playerId);
      for (const g of game.world.gatherings) {
        g.participants = g.participants.filter((p) => p !== id);
      }
      return null;
    },
  }),
  // The player said something in a gathering (the message is already saved).
  // It doesn't count toward the message limit, so the others get to answer.
  gatheringHumanSaid: inputHandler({
    args: { playerId, gatheringId: v.string() },
    handler: (game, now, args) => {
      const gathering = game.world.gatherings.find((g) => g.id === args.gatheringId);
      if (!gathering) return null;
      gathering.lastMessage = { author: args.playerId, timestamp: now };
      return null;
    },
  }),
};
