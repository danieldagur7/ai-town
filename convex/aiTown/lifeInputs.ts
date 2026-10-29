import { v } from 'convex/values';
import { inputHandler } from './inputHandler';
import { Player } from './player';
import { Agent } from './agent';
import { AgentDescription } from './agentDescription';
import { parseGameId, playerId } from './ids';

// Births, newcomers and deaths. Ages are tracked outside the engine (convex/life.ts).
export const lifeInputs = {
  residentBorn: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      identity: v.string(),
      plan: v.string(),
      child: v.optional(v.boolean()),
      // A baby lives in a parent's house.
      parentIds: v.optional(v.array(v.string())),
    },
    handler: (game, now, args) => {
      const playerId = Player.join(game, now, args.name, args.character, args.identity);
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
          child: args.child,
          home: [...game.world.agents.values()].find(
            (a) => a.home !== undefined && args.parentIds?.includes(a.playerId),
          )?.home,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({ agentId, identity: args.identity, plan: args.plan }),
      );
      return { playerId, agentId };
    },
  }),
  // Each morning: who is still a child.
  setChildren: inputHandler({
    args: { playerIds: v.array(v.string()) },
    handler: (game, _now, args) => {
      for (const agent of game.world.agents.values()) {
        agent.child = args.playerIds.includes(agent.playerId) || undefined;
        if (agent.child) delete agent.working;
      }
      return null;
    },
  }),
  residentDies: inputHandler({
    args: { playerId },
    handler: (game, now, args) => {
      const id = parseGameId('players', args.playerId);
      const player = game.world.players.get(id);
      const agent = [...game.world.agents.values()].find((a) => a.playerId === id);
      if (!player || !agent) {
        throw new Error('Only living townspeople can die');
      }
      for (const g of game.world.gatherings) {
        g.participants = g.participants.filter((p) => p !== id);
      }
      player.leave(game, now);
      game.world.agents.delete(agent.id);
      return null;
    },
  }),
};
