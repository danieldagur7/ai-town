import { v } from 'convex/values';
import { inputHandler } from './inputHandler';
import { clockState, isSleepTime } from './clock';
import { distance } from '../util/geometry';
import { stopPlayer } from './movement';
import { GOD_CHARACTER } from '../../data/characters';
import {
  GOD_SPEECH_AWE_DURATION,
  GOD_SPEECH_MAX_RADIUS,
  PUNISH_STUN_DURATION,
  PUNISH_WITNESS_RADIUS,
} from '../constants';
import { finishProject, setEra, startProject } from './project';
import { parseGameId, playerId } from './ids';

// God mode controls, sent from the God menu in the UI.
export const godModeInputs = {
  skipToNextPhase: inputHandler({
    args: {},
    handler: (game, now, _args) => {
      const clock = game.world.clock ?? { elapsed: 0, lastTick: now };
      // Land just past the boundary so the new phase is unambiguous.
      clock.elapsed += clockState(clock.elapsed).msUntilNextPhase + 1;
      game.world.clock = clock;
      return clockState(clock.elapsed).phase;
    },
  }),
  // Debug: set the town's stockpile directly.
  setResources: inputHandler({
    args: {
      wood: v.optional(v.number()),
      stone: v.optional(v.number()),
      food: v.optional(v.number()),
    },
    handler: (game, _now, args) => {
      const r = game.world.resources;
      for (const key of ['wood', 'stone', 'food'] as const) {
        const value = args[key];
        if (value !== undefined) r[key] = Math.max(0, Math.round(value));
      }
      return r;
    },
  }),
  // Start the statue on the plaza (drawn in the god's image).
  startStatue: inputHandler({
    args: { name: v.optional(v.string()) },
    handler: (game, _now, args) => {
      return startProject(game, {
        kind: 'statue',
        name: args.name?.trim() || 'a statue of the god',
      });
    },
  }),
  // Build anything: the god's command, or a townsperson's proposal.
  startProject: inputHandler({
    args: { name: v.string(), subject: v.optional(v.string()), proposer: v.optional(v.string()) },
    handler: (game, _now, args) => {
      const name = args.name.trim();
      if (!name) throw new Error('Say what to build');
      return startProject(game, {
        kind: 'building',
        name,
        subject: args.subject?.trim() || name,
        proposer: args.proposer,
      });
    },
  }),
  // Debug: add (or remove) work on the project, e.g. to see the later stages.
  addProjectWork: inputHandler({
    args: { shifts: v.number() },
    handler: (game, _now, args) => {
      const project = game.world.project;
      if (!project) throw new Error('No project');
      project.work = Math.min(project.workNeeded, Math.max(0, project.work + args.shifts));
      if (project.work >= project.workNeeded) finishProject(game);
      return null;
    },
  }),
  cancelProject: inputHandler({
    args: {},
    handler: (game) => {
      delete game.world.project;
      for (const agent of game.world.agents.values()) delete agent.working;
      return null;
    },
  }),
  // Admin console: a visual effect on a building, found by (part of) its name.
  structureEffect: inputHandler({
    args: { name: v.string(), effect: v.string(), on: v.boolean() },
    handler: (game, _now, args) => {
      const want = args.name.toLowerCase().replace(/^(a|an|the)\s+/, '');
      const s = game.world.structures.find((s) => s.name.toLowerCase().includes(want));
      if (!s) throw new Error(`No building called ${args.name}`);
      const effects = (s.effects ?? []).filter((e) => e !== args.effect);
      if (args.on) effects.push(args.effect);
      s.effects = effects;
      return s.name;
    },
  }),
  setEra: inputHandler({
    args: { era: v.number() },
    handler: (game, _now, args) => {
      setEra(game, args.era);
      return game.world.era;
    },
  }),
  // The manifested god speaks: everyone within `radius` tiles sees and hears it.
  godSpeaks: inputHandler({
    args: { words: v.string(), radius: v.number() },
    handler: (game, now, args) => {
      const words = args.words.trim();
      if (!words) {
        throw new Error('Say something first');
      }
      const god = [...game.world.players.values()].find(
        (p) => p.human && game.playerDescriptions.get(p.id)?.character === GOD_CHARACTER,
      );
      if (!god) {
        throw new Error('Manifest in the town first');
      }
      const radius = Math.min(Math.max(args.radius, 1), GOD_SPEECH_MAX_RADIUS);
      const asleep = isSleepTime(game.world);
      const witnesses = [];
      for (const agent of game.world.agents.values()) {
        const player = game.world.players.get(agent.playerId);
        if (!player || distance(player.position, god.position) > radius) {
          continue;
        }
        // Sleepers see it in a dream and stay asleep. Those mid-conversation keep
        // talking; everyone else stops where they are and kneels for a while.
        if (!asleep && !game.world.playerConversation(player)) {
          stopPlayer(player);
          player.activity = {
            description: 'awed',
            emoji: '🙏',
            until: now + GOD_SPEECH_AWE_DURATION,
          };
        }
        witnesses.push({ playerId: player.id, agentId: agent.id });
      }
      game.world.godSpeech = { x: god.position.x, y: god.position.y, radius, time: now };
      game.scheduleOperation('rememberGodSpeech', {
        worldId: game.worldId,
        godName: game.playerDescriptions.get(god.id)!.name,
        words,
        asleep,
        witnesses,
      });
      return witnesses.length;
    },
  }),
  // Lightning: the target is stunned on the spot and everyone nearby sees it.
  punish: inputHandler({
    args: {
      playerId,
      decreeId: v.optional(v.id('decrees')),
      decreeText: v.optional(v.string()),
      message: v.optional(v.string()),
      punishment: v.optional(v.string()),
      emoji: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      const targetId = parseGameId('players', args.playerId);
      const target = game.world.players.get(targetId);
      const agent = [...game.world.agents.values()].find((a) => a.playerId === targetId);
      if (!target || !agent) {
        throw new Error('Only townspeople can be punished');
      }
      game.world.playerConversation(target)?.leave(game, now, target);
      stopPlayer(target);
      const punishment = args.punishment?.trim() || 'struck with lightning';
      target.activity = {
        description: punishment,
        emoji: args.emoji?.trim() || '⚡',
        until: now + PUNISH_STUN_DURATION,
      };
      const witnesses = [];
      for (const other of game.world.agents.values()) {
        const player = game.world.players.get(other.playerId);
        if (
          !player ||
          other.id === agent.id ||
          distance(player.position, target.position) > PUNISH_WITNESS_RADIUS
        ) {
          continue;
        }
        witnesses.push({ playerId: player.id, agentId: other.id });
      }
      game.world.godSmite = { x: target.position.x, y: target.position.y, time: now };
      game.scheduleOperation('rememberPunishment', {
        worldId: game.worldId,
        playerId: target.id,
        agentId: agent.id,
        name: game.playerDescriptions.get(target.id)!.name,
        decreeId: args.decreeId,
        decreeText: args.decreeText,
        message: args.message?.trim() || undefined,
        punishment,
        witnesses,
      });
      // Something like this may be worth a town meeting.
      game.scheduleOperation('considerTownMeeting', {
        worldId: game.worldId,
        reason: `The god just punished ${game.playerDescriptions.get(target.id)!.name}: ${punishment}`,
      });
      return witnesses.length;
    },
  }),
};
