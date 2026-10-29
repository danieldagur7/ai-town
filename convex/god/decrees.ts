import { ConvexError, v } from 'convex/values';
import {
  DatabaseReader,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { playerId } from '../aiTown/ids';
import { chatCompletion } from '../util/llm';
import { MAX_DECREES_IN_PROMPT } from '../constants';

const selfInternal = internal.god.decrees;

export async function activeDecrees(db: DatabaseReader, worldId: Id<'worlds'>) {
  return await db
    .query('decrees')
    .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'active'))
    .order('desc')
    .take(MAX_DECREES_IN_PROMPT);
}

// Prompt lines that tell a character what the god currently wants. They go
// directly into prompts (not just memory) so every character always knows.
export function decreesPrompt(decrees: string[]): string[] {
  if (decrees.length === 0) {
    return [];
  }
  return [
    'Your god has commanded the following, and everyone in town knows it:',
    ...decrees.map((d) => ` - "${d}"`),
    'These commands matter: people talk about them, plan around them and feel the god ' +
      'watching. You have free will and your own opinion of them, but ignoring the god can ' +
      "bring punishment. Mention them when it fits, but don't force them into every line.",
  ];
}

export const issueDecree = mutation({
  args: { worldId: v.id('worlds'), text: v.string() },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) {
      throw new ConvexError('A decree needs some words');
    }
    await ctx.db.insert('decrees', {
      worldId: args.worldId,
      text,
      status: 'active',
      created: Date.now(),
    });
    // A new command from the god may be worth a town meeting.
    await ctx.scheduler.runAfter(0, internal.agent.gathering.considerTownMeeting, {
      worldId: args.worldId,
      reason: `The god just issued a new decree: "${text}"`,
    });
  },
});

export const endDecree = mutation({
  args: {
    decreeId: v.id('decrees'),
    status: v.union(v.literal('completed'), v.literal('cancelled')),
  },
  handler: async (ctx, args) => {
    const decree = await ctx.db.get(args.decreeId);
    if (!decree) {
      throw new ConvexError('Decree not found');
    }
    if (decree.status !== 'active') {
      throw new ConvexError(`This decree is already ${decree.status}`);
    }
    await ctx.db.patch(decree._id, { status: args.status, ended: Date.now() });
  },
});

// Active decrees with each character's latest opinion, plus recently ended ones.
export const listDecrees = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const active = await ctx.db
      .query('decrees')
      .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'active'))
      .order('desc')
      .collect();
    const withOpinions = [];
    for (const decree of active) {
      const opinions = await ctx.db
        .query('decreeOpinions')
        .withIndex('decreeId', (q) => q.eq('decreeId', decree._id))
        .order('desc')
        .collect();
      const latest = new Map<string, { name: string; text: string }>();
      for (const o of opinions) {
        if (!latest.has(o.playerId)) {
          latest.set(o.playerId, { name: o.name, text: o.text });
        }
      }
      withOpinions.push({ _id: decree._id, text: decree.text, opinions: [...latest.values()] });
    }
    const ended = [];
    for (const status of ['completed', 'cancelled'] as const) {
      const rows = await ctx.db
        .query('decrees')
        .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', status))
        .order('desc')
        .take(5);
      ended.push(...rows.map(({ _id, text, ended }) => ({ _id, text, status, ended })));
    }
    ended.sort((a, b) => (b.ended ?? 0) - (a.ended ?? 0));
    return { active: withOpinions, ended: ended.slice(0, 5) };
  },
});

export const activeDecreesQuery = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => await activeDecrees(ctx.db, worldId),
});

const STOPWORDS = new Set(
  'that this with more from your have will they them their what when where which there these those into about should would could every'.split(
    ' ',
  ),
);

function keywords(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// Scheduled after a conversation is remembered. If the player's own lines touch
// on an active decree, asks the LLM what they said about it.
export const summarizeDecreeTalk = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    name: v.string(),
    otherName: v.string(),
    transcript: v.array(v.object({ author: v.string(), text: v.string() })),
  },
  handler: async (ctx, args) => {
    const decrees = await ctx.runQuery(selfInternal.activeDecreesQuery, {
      worldId: args.worldId,
    });
    const ownLines = args.transcript
      .filter((m) => m.author === args.name)
      .map((m) => m.text.toLowerCase())
      .join(' ');
    const lines = args.transcript.map((m) => `${m.author}: ${m.text}`).join('\n');
    for (const decree of decrees) {
      const words = [...keywords(decree.text), 'decree'];
      if (!words.some((w) => ownLines.includes(w))) {
        continue;
      }
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'user',
            content: [
              `Here is a conversation between ${args.name} and ${args.otherName}:`,
              lines,
              `The unseen god of the town has decreed: "${decree.text}"`,
              `Did ${args.name} say anything about this decree or what it asks for? If yes, ` +
                `reply with one short sentence in third person, starting with "${args.name}", ` +
                `summing up what ${args.name} said or feels about it. If not, reply exactly NONE.`,
            ].join('\n'),
          },
        ],
        max_tokens: 80,
      });
      const text = content.trim();
      if (!text || /^none\b/i.test(text)) {
        continue;
      }
      await ctx.runMutation(selfInternal.insertOpinion, {
        worldId: args.worldId,
        decreeId: decree._id,
        playerId: args.playerId,
        name: args.name,
        text,
      });
    }
  },
});

export const insertOpinion = internalMutation({
  args: {
    worldId: v.id('worlds'),
    decreeId: v.id('decrees'),
    playerId,
    name: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('decreeOpinions', args);
  },
});
