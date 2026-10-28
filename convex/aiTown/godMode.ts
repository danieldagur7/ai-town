import { v } from 'convex/values';
import { inputHandler } from './inputHandler';
import { clockState, isSleepTime } from './clock';
import { distance } from '../util/geometry';
import { stopPlayer } from './movement';
import { GOD_CHARACTER } from '../../data/characters';
import { GOD_SPEECH_AWE_DURATION, GOD_SPEECH_MAX_RADIUS } from '../constants';

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
};
