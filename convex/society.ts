import { yieldToPlayer } from './priority';
import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { api, internal } from './_generated/api';
import { chatCompletion } from './util/llm';
import { activeDecrees } from './god/decrees';
import { clockState } from './aiTown/clock';
import { ERAS, eraOf } from './aiTown/eras';

// Town news: buildings, eras, births and deaths, shown as a feed in the UI.
export const societyTables = {
  townEvents: defineTable({
    worldId: v.id('worlds'),
    emoji: v.string(),
    text: v.string(),
    day: v.optional(v.number()),
  }).index('worldId', ['worldId']),
};

export const townEvent = internalMutation({
  args: { worldId: v.id('worlds'), emoji: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    const day = world?.clock ? clockState(world.clock.elapsed).day : undefined;
    await ctx.db.insert('townEvents', { ...args, day });
  },
});

export const recentEvents = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('townEvents')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(15);
    return rows.map(({ _id, _creationTime, emoji, text, day }) => ({
      _id,
      time: _creationTime,
      emoji,
      text,
      day,
    }));
  },
});

// When the town has nothing to build, a townsperson suggests the next thing,
// fitting the era they live in.
export const proposeProject = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const release = await yieldToPlayer(ctx, worldId);
    try {
      const data = await ctx.runQuery(internal.society.proposalContext, { worldId });
      if (!data || data.busy || data.townspeople.length === 0) return;
      const era = eraOf(data.era);
      const next = ERAS[data.era + 1];
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'user',
            content: [
              `A small town is in its ${era.name} era: ${era.blurb}.`,
              data.built.length > 0
                ? `Already built: ${data.built.join(', ')}.`
                : 'Nothing has been built yet.',
              data.decrees.length > 0
                ? `Their god has decreed: ${data.decrees.map((d) => `"${d}"`).join('; ')}.`
                : '',
              'Townspeople:',
              ...data.townspeople.map((p) => `- ${p.name}: ${p.identity}`),
              `Which townsperson proposes building something new, and what? It must fit the ` +
                `${era.name} era (ideas: ${era.ideas})` +
                (next
                  ? `, ideally something that helps the town progress toward the ${next.name} era`
                  : '') +
                ", and not repeat what's built. Obey the god's decrees if they ask for a building.",
              'Reply with exactly one line: <Name> | <building name, 2-5 words> | <what the outside of the building looks like, under 15 words>',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        max_tokens: 60,
      });
      const parts = content
        .trim()
        .split('\n')[0]
        .split('|')
        .map((s) => s.replace(/[*"“”]/g, '').trim());
      if (parts.length < 3) {
        console.error(`Couldn't read project proposal: ${content}`);
        return;
      }
      const proposer = data.townspeople.find((p) => p.name === parts[0])?.name;
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId,
        name: 'startProject',
        args: { name: parts[1].replace(/^(a|an|the)\s+/i, 'a '), subject: parts[2], proposer },
      });
    } finally {
      await release();
    }
  },
});

export const proposalContext = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return null;
    const townspeople = [];
    for (const agent of world.agents) {
      const player = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      const description = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', agent.id))
        .first();
      if (player && description) {
        townspeople.push({ name: player.name, identity: description.identity.split('.')[0] });
      }
    }
    return {
      busy: !!world.project,
      era: world.era ?? 0,
      built: (world.structures ?? []).map((s) => s.name),
      decrees: (await activeDecrees(ctx.db, worldId)).map((d) => d.text),
      townspeople,
    };
  },
});
