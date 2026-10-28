import { v } from 'convex/values';
import { DatabaseReader, internalAction, internalMutation } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { agentId, playerId } from '../aiTown/ids';
import { fetchEmbedding } from '../util/llm';
import { adjustFaith } from './faith';
import { DAY_LENGTH } from '../aiTown/clock';
import {
  PUNISHMENT_PROMPT_DAYS,
  PUNISH_FAITH,
  PUNISH_IMPORTANCE,
  PUNISH_WITNESS_IMPORTANCE,
} from '../constants';

// Scheduled by the punish input: records it and gives the target and every
// witness a strong memory.
export const rememberPunishment = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    name: v.string(),
    decreeId: v.optional(v.id('decrees')),
    decreeText: v.optional(v.string()),
    message: v.optional(v.string()),
    witnesses: v.array(v.object({ playerId, agentId })),
  },
  handler: async (ctx, args) => {
    const punishmentId = await ctx.runMutation(internal.god.punishment.recordPunishment, {
      worldId: args.worldId,
      playerId: args.playerId,
      name: args.name,
      decreeId: args.decreeId,
      decreeText: args.decreeText,
      message: args.message,
    });
    const why = args.decreeText ? ` for ignoring the decree "${args.decreeText}"` : '';
    const said = args.message ? ` The god's voice thundered: "${args.message}"` : '';
    const memories = [
      {
        playerId: args.playerId,
        agentId: args.agentId,
        importance: PUNISH_IMPORTANCE,
        description:
          `The god struck me with lightning${why}.${said} It hurt and terrified me. ` +
          `I need to take the god's commands seriously.`,
      },
      ...args.witnesses.map((w) => ({
        ...w,
        importance: PUNISH_WITNESS_IMPORTANCE,
        description: `I saw the god strike ${args.name} with lightning${why}.${said} Nobody dares to ignore the god now.`,
      })),
    ];
    for (const memory of memories) {
      const { embedding } = await fetchEmbedding(memory.description);
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        ...memory,
        lastAccess: Date.now(),
        data: { type: 'punishment', punishmentId },
        embedding,
      });
    }
  },
});

export const recordPunishment = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    name: v.string(),
    decreeId: v.optional(v.id('decrees')),
    decreeText: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<'punishments'>> => {
    await adjustFaith(ctx.db, args.worldId, args.playerId, PUNISH_FAITH);
    return await ctx.db.insert('punishments', args);
  },
});

// Prompt lines about recent punishments: the character's own, and others' they know of.
export async function punishmentPrompt(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  playerId: string,
): Promise<string[]> {
  const since = Date.now() - PUNISHMENT_PROMPT_DAYS * DAY_LENGTH;
  const recent = await db
    .query('punishments')
    .withIndex('worldId', (q) => q.eq('worldId', worldId).gt('_creationTime', since))
    .collect();
  if (recent.length === 0) {
    return [];
  }
  const lines = [];
  const own = recent.filter((p) => p.playerId === playerId).pop();
  if (own) {
    const why = own.decreeText ? ` for ignoring the decree "${own.decreeText}"` : '';
    lines.push(
      `Recently the god struck you with lightning${why}. You're shaken and you now take the ` +
        `god's commands very seriously. You still have free will, but defying the god again feels dangerous.`,
    );
  }
  const others = [...new Set(recent.filter((p) => p.playerId !== playerId).map((p) => p.name))];
  if (others.length > 0) {
    lines.push(`Everyone knows the god recently punished ${others.join(' and ')} with lightning.`);
  }
  return lines;
}
