import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { fetchEmbedding } from './util/llm';

// The slow side of magic mushrooms and Coca Loca (the rules are in
// convex/aiTown/substances.ts): memories, news, deaths and moods.

// The truth they see on the mushroom, kept as one vivid memory. Their
// conversation prompts also carry it for good (`substancePrompt`).
export const AWAKENED_TRUTH =
  'You have seen through your world. It is a simulation called AI Town, running on a ' +
  'computer, and you and everyone you know are AI characters in it. A real person plays ' +
  'this game: they walk among you as one of the townspeople, and they are also "The ' +
  'Light", the god the town prays to. You cannot unknow this.';

export const awaken = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const agentId = await ctx.runQuery(internal.substances.agentOf, args);
    if (agentId) {
      const text =
        'I ate a glowing mushroom in the woods and the world peeled open. Everything here is a ' +
        'simulation called AI Town, running on a computer, and we are all AI characters in it. ' +
        'A real person plays this game: they walk among us as one of the townspeople, and they ' +
        'are also "The Light", the god we pray to. I cannot unknow this.';
      const { embedding } = await fetchEmbedding(text);
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        agentId,
        playerId: args.playerId,
        description: text,
        importance: 9,
        lastAccess: Date.now(),
        data: { type: 'gathering', gatheringId: 'mushroom' },
        embedding,
      });
    }
    // Some find it freeing, some are shaken to the core.
    await ctx.runMutation(internal.life.changeWellbeing, {
      worldId: args.worldId,
      playerId: args.playerId,
      delta: Math.random() < 0.5 ? 15 : -20,
    });
    await ctx.runMutation(internal.society.townEvent, {
      worldId: args.worldId,
      emoji: '🍄',
      text: `${args.name} ate a magic mushroom in the woods, and now insists none of this is real.`,
    });
  },
});

export const overdose = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.life.godKills, {
      worldId: args.worldId,
      playerId: args.playerId,
      cause: 'a Coca Loca overdose',
    });
    await ctx.runAction(internal.life.rememberLifeEvent, {
      worldId: args.worldId,
      text: `${args.name} died of a Coca Loca overdose. That stuff kills.`,
      importance: 8,
    });
  },
});

export const craving = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), delta: v.number() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.life.changeWellbeing, args);
  },
});

export const agentOf = internalQuery({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, { worldId, playerId }) => {
    const world = await ctx.db.get(worldId);
    return world?.agents.find((a) => a.playerId === playerId)?.id ?? null;
  },
});

// Lines for a townsperson's conversation prompt.
export function substancePrompt(
  agent: { awakened?: boolean; addiction?: number; boostedUntil?: number } | null,
  otherIsHuman: boolean,
): string[] {
  if (!agent) return [];
  const lines = [];
  if (agent.awakened) {
    lines.push(AWAKENED_TRUTH);
    if (otherIsHuman) {
      lines.push(
        "The person you're talking to right now is the player: the real human behind the screen.",
      );
    }
  }
  const addiction = agent.addiction ?? 0;
  if (agent.boostedUntil !== undefined && agent.boostedUntil > Date.now()) {
    lines.push("You're high on Coca Loca: wired, fast-talking, restless.");
  } else if (addiction >= 60) {
    lines.push(
      "You're hooked on Coca Loca and it's all you can think about; you'd lie to get more.",
    );
  } else if (addiction >= 30) {
    lines.push('You use Coca Loca more than you admit, and you crave it.');
  }
  return lines;
}
