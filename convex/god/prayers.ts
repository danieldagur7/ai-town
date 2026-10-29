import { ConvexError, v } from 'convex/values';
import {
  action,
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
} from '../_generated/server';
import { Doc } from '../_generated/dataModel';
import { api, internal } from '../_generated/api';
import { agentId, playerId } from '../aiTown/ids';
import { chatCompletion, fetchEmbedding } from '../util/llm';
import { adjustFaith, faithDescription } from './faith';
import { activeDecrees } from './decrees';
import { punishmentPrompt } from './punishment';
import {
  FAITH_ANSWERED,
  FAITH_IGNORED,
  FAITH_MAX,
  FAITH_START,
  PRAYER_ANSWERED_IMPORTANCE,
  PRAYER_DECLINED_IMPORTANCE,
  PRAYER_GENERATION_TIMEOUT,
  PRAYER_MEMORY_CHARS,
  PRAYER_RECENT_MEMORIES,
} from '../constants';

const selfInternal = internal.god.prayers;

// Scheduled by the engine when an agent falls asleep. Queues at most one prayer
// per character per night and wakes the worker.
export const requestPrayer = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    night: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('prayers')
      .withIndex('player_night', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId).eq('night', args.night),
      )
      .first();
    if (existing) {
      return;
    }
    // Don't let a backlog build up: anything still queued from an earlier night is dropped.
    const queued = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', args.worldId).eq('status', 'queued'))
      .collect();
    for (const prayer of queued) {
      if (prayer.night < args.night) {
        await ctx.db.patch(prayer._id, { status: 'skipped' });
      }
    }
    const description = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    await ctx.db.insert('prayers', {
      ...args,
      name: description?.name ?? args.playerId,
      status: 'queued',
      requested: Date.now(),
    });
    await ctx.scheduler.runAfter(0, selfInternal.processQueue, { worldId: args.worldId });
  },
});

// Takes the next queued prayer, unless one is already generating. Mutations are
// serialized, so this is what guarantees prayers generate one at a time.
export const claimNext = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const generating = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'generating'))
      .first();
    if (generating) {
      if (generating.generationStarted! + PRAYER_GENERATION_TIMEOUT > Date.now()) {
        // The worker that owns it will pick up the rest of the queue.
        return null;
      }
      console.warn(`Prayer ${generating._id} timed out generating, skipping it`);
      await ctx.db.patch(generating._id, { status: 'skipped' });
    }
    const next = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'queued'))
      .order('asc')
      .first();
    if (!next) {
      return null;
    }
    await ctx.db.patch(next._id, { status: 'generating', generationStarted: Date.now() });
    return next;
  },
});

export const finishPrayer = internalMutation({
  args: { prayerId: v.id('prayers'), text: v.optional(v.string()) },
  handler: async (ctx, { prayerId, text }) => {
    await ctx.db.patch(prayerId, text ? { status: 'pending', text } : { status: 'skipped' });
    const prayer = await ctx.db.get(prayerId);
    const settings =
      text &&
      prayer &&
      (await ctx.db
        .query('godSettings')
        .withIndex('worldId', (q) => q.eq('worldId', prayer.worldId))
        .first());
    if (settings && settings.autoAnswerPrayers) {
      await ctx.scheduler.runAfter(0, api.god.prayers.autoAnswerPrayers, {
        worldId: prayer!.worldId,
        prayerId,
      });
    }
  },
});

export const processQueue = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    for (;;) {
      const prayer = await ctx.runMutation(selfInternal.claimNext, { worldId });
      if (!prayer) {
        return;
      }
      let text;
      try {
        text = await generatePrayer(ctx, prayer);
      } catch (e: any) {
        console.error(`Prayer for ${prayer.name} failed: ${e.message ?? e}`);
      }
      console.log(`${prayer.name} prayed on night ${prayer.night}: ${text}`);
      await ctx.runMutation(selfInternal.finishPrayer, { prayerId: prayer._id, text });
    }
  },
});

async function generatePrayer(ctx: ActionCtx, prayer: Doc<'prayers'>) {
  const data = await ctx.runQuery(selfInternal.prayerPromptData, {
    worldId: prayer.worldId,
    playerId: prayer.playerId,
    agentId: prayer.agentId,
  });
  const prompt = [
    `You are ${prayer.name}. ${data.identity}`,
    `What you want lately: ${data.plan}`,
    `It's night ${prayer.night}. You're lying in bed in the dark, and before you fall asleep ` +
      `you say a short private prayer to the unseen god who watches over the town.`,
    faithDescription(data.faith ?? FAITH_START),
  ];
  if (data.lastAnswer) {
    prompt.push(data.lastAnswer);
  }
  if (data.decrees.length > 0) {
    prompt.push('The god has decreed:', ...data.decrees.map((d) => ` - "${d}"`));
  }
  prompt.push(...data.punishments);
  if (data.memories.length > 0) {
    prompt.push('Things on your mind from recently:');
    prompt.push(...data.memories.map((m) => ` - ${m}`));
  }
  prompt.push(
    'Write the prayer in your own voice, 2 to 4 sentences, first person. Talk to the god ' +
      'plainly, like a real person would: mention one or two specific things from your day, ' +
      'someone you care or worry about, and what you hope for or fear. No title, no quotes, ' +
      'no stage directions.',
  );
  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: prompt.join('\n') }],
    max_tokens: 200,
  });
  const text = content
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .trim();
  if (!text) {
    throw new Error('Empty prayer');
  }
  return text;
}

export const prayerPromptData = internalQuery({
  args: { worldId: v.id('worlds'), playerId, agentId },
  handler: async (ctx, args) => {
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
      .first();
    const memories = await ctx.db
      .query('memories')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .order('desc')
      .take(PRAYER_RECENT_MEMORIES);
    const faith = await ctx.db
      .query('faith')
      .withIndex('playerId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    const answered = await ctx.db
      .query('prayers')
      .withIndex('player_night', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .order('desc')
      .filter((q) => q.or(q.eq(q.field('status'), 'accepted'), q.eq(q.field('status'), 'declined')))
      .first();
    const decrees = await activeDecrees(ctx.db, args.worldId);
    const punishments = await punishmentPrompt(ctx.db, args.worldId, args.playerId);
    let lastAnswer;
    if (answered) {
      lastAnswer =
        answered.status === 'accepted'
          ? `The last time you prayed, on night ${answered.night}, your prayer was answered.`
          : `The last time you prayed, on night ${answered.night}, the god didn't answer.`;
    }
    return {
      identity: agentDescription?.identity ?? '',
      plan: agentDescription?.plan ?? '',
      faith: faith?.score,
      lastAnswer,
      decrees: decrees.map((d) => d.text),
      punishments,
      memories: memories.map((m) => m.description.slice(0, PRAYER_MEMORY_CHARS)),
    };
  },
});

// The god answers a pending prayer from the inbox.
export const answerPrayer = mutation({
  args: {
    prayerId: v.id('prayers'),
    accept: v.boolean(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prayer = await ctx.db.get(args.prayerId);
    if (!prayer) {
      throw new ConvexError('Prayer not found');
    }
    if (prayer.status !== 'pending') {
      throw new ConvexError(`This prayer was already ${prayer.status}`);
    }
    await applyAnswer(ctx, prayer, args.accept, args.message);
  },
});

async function applyAnswer(
  ctx: MutationCtx,
  prayer: Doc<'prayers'>,
  accept: boolean,
  message?: string,
  autoReason?: string,
) {
  await ctx.db.patch(prayer._id, {
    status: accept ? 'accepted' : 'declined',
    godResponse: message?.trim() || undefined,
    answered: Date.now(),
    autoReason,
  });
  await adjustFaith(
    ctx.db,
    prayer.worldId,
    prayer.playerId,
    accept ? FAITH_ANSWERED : FAITH_IGNORED,
  );
  await ctx.scheduler.runAfter(0, selfInternal.rememberAnswer, { prayerId: prayer._id });
}

// "Decide for me": the model judges each pending prayer (or just one) the way
// the god would. Active decrees are the god's will, so a prayer asking for help
// with one is granted and one working against it is refused; otherwise it
// weighs whether granting it is good for the person and the town.
export const autoAnswerPrayers = action({
  args: { worldId: v.id('worlds'), prayerId: v.optional(v.id('prayers')) },
  handler: async (ctx, args): Promise<{ name: string; accept: boolean; reason: string }[]> => {
    const data = await ctx.runQuery(selfInternal.autoAnswerData, args);
    const results = [];
    for (const prayer of data.prayers) {
      const decision = await judgePrayer(prayer, data.decrees);
      if (!decision) continue;
      const applied = await ctx.runMutation(selfInternal.applyAutoAnswer, {
        prayerId: prayer._id,
        ...decision,
      });
      if (applied)
        results.push({ name: prayer.name, accept: decision.accept, reason: decision.reason });
    }
    return results;
  },
});

async function judgePrayer(prayer: Doc<'prayers'>, decrees: string[]) {
  const prompt = [
    'You are deciding, on behalf of the god who watches over a small town, whether to grant ' +
      'a prayer.',
    decrees.length > 0
      ? "The god's active decrees, which are its will:\n" +
        decrees.map((d) => ` - "${d}"`).join('\n')
      : 'The god has made no decrees.',
    `${prayer.name} prayed: "${prayer.text}"`,
    'Rules: if the prayer asks for help with or supports a decree, ACCEPT. If it asks for ' +
      'something that goes against a decree, DECLINE. Otherwise ACCEPT if granting it is kind and ' +
      'good for them and the town, and DECLINE if it is selfish, harmful or petty.',
    'Reply in exactly this format, three lines:',
    'DECISION: ACCEPT or DECLINE',
    'REASON: <under 15 words, mention the decree if one decided it>',
    'MESSAGE: <one short sentence the god says to them, warm if accepted, firm if declined>',
  ];
  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: prompt.join('\n') }],
    max_tokens: 90,
  });
  const decision = content.match(/DECISION:\s*\**\s*(ACCEPT|DECLINE)/i);
  if (!decision) {
    console.error(`Couldn't read auto-answer for ${prayer.name}: ${content}`);
    return null;
  }
  const line = (key: string) =>
    content
      .match(new RegExp(`${key}:\\s*(.+)`, 'i'))?.[1]
      .replace(/^[*"“\s]+|[*"”\s]+$/g, '')
      .trim() ?? '';
  return {
    accept: decision[1].toUpperCase() === 'ACCEPT',
    reason: line('REASON'),
    message: line('MESSAGE'),
  };
}

export const autoAnswerData = internalQuery({
  args: { worldId: v.id('worlds'), prayerId: v.optional(v.id('prayers')) },
  handler: async (ctx, args) => {
    let prayers = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', args.worldId).eq('status', 'pending'))
      .collect();
    if (args.prayerId) prayers = prayers.filter((p) => p._id === args.prayerId);
    return {
      prayers: prayers.filter((p) => p.text),
      decrees: (await activeDecrees(ctx.db, args.worldId)).map((d) => d.text),
    };
  },
});

export const applyAutoAnswer = internalMutation({
  args: {
    prayerId: v.id('prayers'),
    accept: v.boolean(),
    reason: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const prayer = await ctx.db.get(args.prayerId);
    // The god may have answered it by hand meanwhile.
    if (!prayer || prayer.status !== 'pending') return false;
    await applyAnswer(ctx, prayer, args.accept, args.message, args.reason || 'decided for you');
    return true;
  },
});

export const godSettings = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const row = await ctx.db
      .query('godSettings')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .first();
    return { autoAnswerPrayers: row?.autoAnswerPrayers ?? false };
  },
});

export const setAutoAnswer = mutation({
  args: { worldId: v.id('worlds'), enabled: v.boolean() },
  handler: async (ctx, { worldId, enabled }) => {
    const row = await ctx.db
      .query('godSettings')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .first();
    if (row) {
      await ctx.db.patch(row._id, { autoAnswerPrayers: enabled });
    } else {
      await ctx.db.insert('godSettings', { worldId, autoAnswerPrayers: enabled });
    }
    if (enabled) {
      // Clear what's already waiting.
      await ctx.scheduler.runAfter(0, api.god.prayers.autoAnswerPrayers, { worldId });
    }
  },
});

// Gives the character a memory of how its prayer was answered.
export const rememberAnswer = internalAction({
  args: { prayerId: v.id('prayers') },
  handler: async (ctx, { prayerId }) => {
    const prayer = await ctx.runQuery(selfInternal.getPrayer, { prayerId });
    if (!prayer || (prayer.status !== 'accepted' && prayer.status !== 'declined')) {
      return;
    }
    const prayed = `On night ${prayer.night} I prayed to the god: "${prayer.text}"`;
    let description;
    if (prayer.status === 'accepted') {
      description = prayer.godResponse
        ? `${prayed} My prayer was answered. The god spoke to me: "${prayer.godResponse}"`
        : `${prayed} My prayer was answered.`;
    } else {
      description = prayer.godResponse
        ? `${prayed} The god refused me, saying: "${prayer.godResponse}"`
        : `${prayed} I heard nothing back. Only silence.`;
    }
    const { embedding } = await fetchEmbedding(description);
    await ctx.runMutation(internal.agent.memory.insertMemory, {
      agentId: prayer.agentId,
      playerId: prayer.playerId,
      description,
      importance:
        prayer.status === 'accepted' ? PRAYER_ANSWERED_IMPORTANCE : PRAYER_DECLINED_IMPORTANCE,
      lastAccess: Date.now(),
      data: { type: 'prayer', prayerId },
      embedding,
    });
  },
});

export const getPrayer = internalQuery({
  args: { prayerId: v.id('prayers') },
  handler: async (ctx, { prayerId }) => await ctx.db.get(prayerId),
});

// For the god's inbox.
export const prayerInbox = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const pending = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'pending'))
      .order('asc')
      .collect();
    const inProgress = [
      ...(await ctx.db
        .query('prayers')
        .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'generating'))
        .collect()),
      ...(await ctx.db
        .query('prayers')
        .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'queued'))
        .collect()),
    ];
    const recentAuto = (
      await ctx.db
        .query('prayers')
        .withIndex('worldId_answered', (q) => q.eq('worldId', worldId))
        .order('desc')
        .take(20)
    )
      .filter((p) => p.autoReason)
      .slice(0, 5);
    return {
      pending: pending.map(({ _id, name, night, text, summary }) => ({
        _id,
        name,
        night,
        text,
        summary,
      })),
      praying: inProgress.map((p) => p.name),
      // The last few decided by auto-answer, so the god can see what it did.
      autoAnswered: recentAuto.map(({ _id, name, night, status, autoReason, godResponse }) => ({
        _id,
        name,
        night,
        accepted: status === 'accepted',
        reason: autoReason!,
        message: godResponse,
      })),
    };
  },
});

export const faithScores = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('faith')
      .withIndex('playerId', (q) => q.eq('worldId', worldId))
      .collect();
    const scores = [];
    for (const row of rows) {
      const description = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', row.playerId))
        .first();
      scores.push({ name: description?.name ?? row.playerId, score: row.score });
    }
    return { max: FAITH_MAX, start: FAITH_START, scores };
  },
});

// Inbox button: boils each pending prayer down to one line, one prayer at a time.
export const summarizePrayers = action({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }): Promise<number> => {
    const prayers = await ctx.runQuery(selfInternal.unsummarizedPrayers, { worldId });
    for (const prayer of prayers) {
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'user',
            content:
              `Summarize this prayer by ${prayer.name} in one short line, in the form ` +
              `"${prayer.name} wants <what> because <why>." Reply with only that line.\n` +
              `Prayer: "${prayer.text}"`,
          },
        ],
        max_tokens: 40,
      });
      const summary = content
        .trim()
        .replace(/^["“]|["”]$/g, '')
        .split('\n')[0]
        .trim();
      if (summary) {
        await ctx.runMutation(selfInternal.setSummary, { prayerId: prayer._id, summary });
      }
    }
    return prayers.length;
  },
});

export const unsummarizedPrayers = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const pending = await ctx.db
      .query('prayers')
      .withIndex('status', (q) => q.eq('worldId', worldId).eq('status', 'pending'))
      .collect();
    return pending.filter((p) => !p.summary && p.text);
  },
});

export const setSummary = internalMutation({
  args: { prayerId: v.id('prayers'), summary: v.string() },
  handler: async (ctx, { prayerId, summary }) => {
    await ctx.db.patch(prayerId, { summary });
  },
});
