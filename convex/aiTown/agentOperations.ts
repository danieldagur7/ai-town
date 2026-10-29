import { yieldToPlayer } from '../priority';
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  cleanMessage,
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import {
  ACTIVITIES,
  INJURY_FACTOR,
  RISKY_ACTIVITY_CHANCE,
  ACTIVITY_COOLDOWN,
  CONVERSATION_COOLDOWN,
  GROUP_CHANCE,
  GROUP_RADIUS,
} from '../constants';
import { distance } from '../util/geometry';
import { gatheringMessage } from '../agent/gathering';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await yieldToPlayer(ctx, args.worldId);
    try {
      await rememberConversation(
        ctx,
        args.worldId,
        args.agentId as GameId<'agents'>,
        args.playerId as GameId<'players'>,
        args.conversationId as GameId<'conversations'>,
      );
      await sleep(Math.random() * 1000);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishRememberConversation',
        args: {
          agentId: args.agentId,
          operationId: args.operationId,
        },
      });
    } finally {
      await release();
    }
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    // Townspeople chatting among themselves let the player's conversation go
    // first; a reply to a human never waits.
    const status = await ctx.runQuery(internal.priority.conversationStatus, {
      worldId: args.worldId,
      conversationId: args.conversationId,
    });
    if (!status.active) return;
    let release = async () => {};
    if (!status.withHuman) {
      // Not longer than the agent's operation lasts (ACTION_TIMEOUT).
      release = await yieldToPlayer(ctx, args.worldId, args.conversationId, 60_000);
    }
    try {
      // It may have ended while we waited (night, the other person left).
      const after = await ctx.runQuery(internal.priority.conversationStatus, {
        worldId: args.worldId,
        conversationId: args.conversationId,
      });
      if (!after.active) return;
      let completionFn;
      switch (args.type) {
        case 'start':
          completionFn = startConversationMessage;
          break;
        case 'continue':
          completionFn = continueConversationMessage;
          break;
        case 'leave':
          completionFn = leaveConversationMessage;
          break;
        default:
          assertNever(args.type);
      }
      const completion = await completionFn(
        ctx,
        args.worldId,
        args.conversationId as GameId<'conversations'>,
        args.playerId as GameId<'players'>,
        args.otherPlayerId as GameId<'players'>,
      );
      // TODO: stream in the text instead of reading it all at once.
      const text = cleanMessage(await completion.readAll());

      await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
        worldId: args.worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text,
        messageUuid: args.messageUuid,
        leaveConversation: args.type === 'leave',
        operationId: args.operationId,
      });
    } finally {
      await release();
    }
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    // Decide whether to do an activity or wander somewhere.
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        // Low spirits make people take more risks.
        const wellbeing = await ctx.runQuery(internal.life.wellbeingOf, {
          worldId: args.worldId,
          playerId: player.id,
        });
        // Kids are reckless, and so are people in low spirits. The town learns:
        // every accident makes that activity less tempting for everyone.
        const riskyChance =
          RISKY_ACTIVITY_CHANCE * (wellbeing < 35 ? 2 : 1) * (agent.child ? 1.5 : 1);
        const lessons = await ctx.runQuery(internal.life.lessons, { worldId: args.worldId });
        const risky = Math.random() < riskyChance;
        const pool = ACTIVITIES.filter((a) => (risky ? a.risk > 0 : a.risk === 0)).filter(
          (a) => !risky || Math.random() < 1 / (1 + (lessons[a.description] ?? 0)),
        );
        const choices = pool.length > 0 ? pool : ACTIVITIES.filter((a) => a.risk === 0);
        const activity = choices[Math.floor(Math.random() * choices.length)];
        if (activity.risk > 0) {
          const roll = Math.random();
          if (roll < activity.risk * INJURY_FACTOR) {
            // Something goes wrong, discovered when the activity ends.
            await ctx.scheduler.runAfter(activity.duration, internal.life.accident, {
              worldId: args.worldId,
              playerId: player.id,
              activity: activity.description,
              fatal: roll < activity.risk,
            });
          }
        }
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }
    // Sometimes, with a few people around, start a group chat instead.
    const nearby = args.otherFreePlayers.filter(
      (p) => distance(p.position, player.position) <= GROUP_RADIUS,
    );
    if (
      !justLeftConversation &&
      !recentlyAttemptedInvite &&
      nearby.length >= 2 &&
      Math.random() < GROUP_CHANCE
    ) {
      await sleep(Math.random() * 1000);
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'finishDoSomething',
        args: {
          operationId: args.operationId,
          agentId: args.agent.id,
          group: nearby.slice(0, 3).map((p) => p.id),
        },
      });
      return;
    }
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}

// One line in a group chat or town meeting.
export const agentGatheringMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    gatheringId: v.string(),
    messageUuid: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const release = await yieldToPlayer(ctx, args.worldId, args.gatheringId);
    try {
      let text;
      try {
        text = await gatheringMessage(ctx, args.worldId, args.gatheringId, args.playerId);
      } catch (e: any) {
        console.error(`Gathering message failed: ${e.message ?? e}`);
      }
      await ctx.runMutation(internal.agent.gathering.writeGatheringMessage, {
        worldId: args.worldId,
        gatheringId: args.gatheringId,
        playerId: args.playerId,
        agentId: args.agentId,
        operationId: args.operationId,
        messageUuid: args.messageUuid,
        text,
      });
    } finally {
      await release();
    }
  },
});
