import { v } from 'convex/values';
import {
  DatabaseReader,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { agentId, playerId } from '../aiTown/ids';
import { chatCompletion, fetchEmbedding } from '../util/llm';
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
    punishment: v.string(),
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
      punishment: args.punishment,
    });
    const why = args.decreeText ? ` for ignoring the decree "${args.decreeText}"` : '';
    const said = args.message ? ` The god's voice thundered: "${args.message}"` : '';
    const memories = [
      {
        playerId: args.playerId,
        agentId: args.agentId,
        importance: PUNISH_IMPORTANCE,
        description:
          `The god punished me${why}: ${args.punishment}.${said} It shook me to the core. ` +
          `I need to take the god's commands seriously.`,
      },
      ...args.witnesses.map((w) => ({
        ...w,
        importance: PUNISH_WITNESS_IMPORTANCE,
        description: `I saw the god punish ${args.name}${why}: ${args.punishment}.${said} Nobody dares to ignore the god now.`,
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
    punishment: v.optional(v.string()),
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
      `Recently the god punished you${why}: ${own.punishment ?? 'struck with lightning'}. ` +
        `You're shaken and you now take the ` +
        `god's commands very seriously. You still have free will, but defying the god again feels dangerous.`,
    );
  }
  const others = recent.filter((p) => p.playerId !== playerId);
  if (others.length > 0) {
    const known = others.map((p) => `${p.name} (${p.punishment ?? 'struck with lightning'})`);
    lines.push(`Everyone knows the god recently punished ${[...new Set(known)].join(' and ')}.`);
  }
  return lines;
}

// Three punishments written for this character's personality, for the God menu.
export const suggestPunishments = action({
  args: { worldId: v.id('worlds'), playerId, decreeText: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ emoji: string; text: string }[]> => {
    const character = await ctx.runQuery(internal.god.punishment.characterForPunishment, args);
    if (!character) {
      return [];
    }
    const why = args.decreeText ? ` who ignored the decree "${args.decreeText}"` : '';
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            `A god wants to punish ${character.name}${why}.`,
            `About ${character.name}: ${character.identity}`,
            `What ${character.name} wants: ${character.plan}`,
            `Suggest 3 different punishments the god could inflict that would really get to ` +
              `${character.name} because of who they are. Each under 12 words, describing ` +
              `what the god does, e.g. "Turn every tree in his garden to ash for a day".`,
            'Reply with exactly 3 lines, each starting with one fitting emoji, then the punishment.',
          ].join('\n'),
        },
      ],
      max_tokens: 120,
    });
    return content
      .split('\n')
      .map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
      .filter((line) => line.length > 3)
      .slice(0, 3)
      .map((line) => {
        const [first, ...rest] = [...line];
        const isEmoji = /\p{Extended_Pictographic}/u.test(first);
        return isEmoji
          ? {
              emoji: first,
              text: rest
                .join('')
                .replace(/^\uFE0F/, '')
                .trim(),
            }
          : { emoji: '⚡', text: line };
      });
  },
});

export const characterForPunishment = internalQuery({
  args: { worldId: v.id('worlds'), playerId, decreeText: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    const agent = world?.agents.find((a) => a.playerId === args.playerId);
    const player = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    const description =
      agent &&
      (await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
        .first());
    if (!player || !description) {
      return null;
    }
    return { name: player.name, identity: description.identity, plan: description.plan };
  },
});
