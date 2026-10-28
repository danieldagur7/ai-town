import { ConvexError, v } from 'convex/values';
import { internalAction, internalMutation, mutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { agentId, playerId } from '../aiTown/ids';
import { insertInput } from '../aiTown/insertInput';
import { fetchEmbedding } from '../util/llm';
import { adjustFaith } from './faith';
import { DEFAULT_NAME, FAITH_WITNESS, GOD_SPEECH_IMPORTANCE } from '../constants';
import { GOD_CHARACTER } from '../../data/characters';

// Joins the world as the god's visible form, replacing the player's normal
// character if they're already in the town. Withdrawing is the normal leave.
export const manifest = mutation({
  args: { worldId: v.id('worlds'), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError('Choose a name to appear as');
    }
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }
    const existing = world.players.find((p) => p.human === DEFAULT_NAME);
    if (existing) {
      await insertInput(ctx, world._id, 'leave', { playerId: existing.id });
    }
    return await insertInput(ctx, world._id, 'join', {
      name,
      character: GOD_CHARACTER,
      description: `${name} is the unseen god of this town, appearing in person.`,
      tokenIdentifier: DEFAULT_NAME,
    });
  },
});

// Scheduled by the godSpeaks input: gives every witness a vivid memory and a
// little more faith.
export const rememberGodSpeech = internalAction({
  args: {
    worldId: v.id('worlds'),
    godName: v.string(),
    words: v.string(),
    asleep: v.boolean(),
    witnesses: v.array(v.object({ playerId, agentId })),
  },
  handler: async (ctx, args) => {
    const description = args.asleep
      ? `In a dream, ${args.godName}, the god of our town, appeared to me in light and said: "${args.words}"`
      : `I saw ${args.godName}, the god of our town, appear in person, glowing, right in front of me. They said: "${args.words}"`;
    const { embedding } = await fetchEmbedding(description);
    for (const witness of args.witnesses) {
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        agentId: witness.agentId,
        playerId: witness.playerId,
        description,
        importance: GOD_SPEECH_IMPORTANCE,
        lastAccess: Date.now(),
        data: { type: 'godSpeech' },
        embedding,
      });
      await ctx.runMutation(internal.god.manifest.witnessFaith, {
        worldId: args.worldId,
        playerId: witness.playerId,
      });
    }
  },
});

export const witnessFaith = internalMutation({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, args) => {
    await adjustFaith(ctx.db, args.worldId, args.playerId, FAITH_WITNESS);
  },
});
