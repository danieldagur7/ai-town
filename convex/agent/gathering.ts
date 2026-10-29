import { v } from 'convex/values';
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { api, internal } from '../_generated/api';
import { agentId, playerId } from '../aiTown/ids';
import { chatCompletion, fetchEmbedding } from '../util/llm';
import { insertInput } from '../aiTown/insertInput';
import { clockState, formatClock } from '../aiTown/clock';
import { activeDecrees, decreesPrompt } from '../god/decrees';
import { punishmentPrompt } from '../god/punishment';
import { townPrompt } from '../aiTown/project';
import { ageLine, residentAge, residentMood, wellbeingLine } from '../life';
import { traitsPrompt } from '../god/admin';
import { faithDescription } from '../god/faith';
import { cleanMessage } from './conversation';
import { MESSAGE_MAX_TOKENS } from '../constants';

const selfInternal = internal.agent.gathering;

// The next line from `playerId` in a group chat or town meeting.
export async function gatheringMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  gatheringId: string,
  playerId: string,
): Promise<string> {
  const data = await ctx.runQuery(selfInternal.gatheringPromptData, {
    worldId,
    gatheringId,
    playerId,
  });
  if (!data) {
    throw new Error(`Gathering ${gatheringId} is over`);
  }
  const setting =
    data.kind === 'meeting'
      ? `at a town meeting on the plaza that ${data.callerName} called about "${data.topic}"`
      : 'in a casual group chat';
  const prompt = [
    `You are ${data.name}, ${setting}, with ${data.others.join(', ')}.`,
    data.timeOfDay,
    `About you: ${data.identity}`,
  ];
  if (data.faith !== undefined) {
    prompt.push(`Privately: ${faithDescription(data.faith)}`);
  }
  prompt.push(...decreesPrompt(data.decrees), ...data.punishments);
  if (data.transcript.length > 0) {
    prompt.push('What has been said so far:');
    prompt.push(...data.transcript.map((m) => `${m.author}: ${m.text}`));
    prompt.push(
      'Reply to what was just said, or to someone by name. Agree, push back, joke, ' +
        'or bring up something new, like a real person in a group would.',
    );
  } else if (data.kind === 'meeting') {
    prompt.push(`You called this meeting. Open it by saying why everyone is here.`);
  } else {
    prompt.push('Start the conversation with something casual.');
  }
  prompt.push(
    'Reply with one or two short sentences (under 25 words), like natural spoken chat. ' +
      'No narration, no actions in asterisks or parentheses, no quotation marks.',
    `${data.name}:`,
  );
  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: prompt.join('\n') }],
    max_tokens: MESSAGE_MAX_TOKENS,
    stop: data.others.map((name) => `${name}:`),
  });
  return cleanMessage(content);
}

export const gatheringPromptData = internalQuery({
  args: { worldId: v.id('worlds'), gatheringId: v.string(), playerId },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    const gathering = world?.gatherings?.find((g) => g.id === args.gatheringId);
    if (!world || !gathering) {
      return null;
    }
    const nameOf = async (id: string) =>
      (
        await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', id))
          .first()
      )?.name ?? id;
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    const description =
      agent &&
      (await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
        .first());
    const faith = await ctx.db
      .query('faith')
      .withIndex('playerId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) =>
        q.eq('worldId', args.worldId).eq('conversationId', args.gatheringId),
      )
      .order('desc')
      .take(8);
    const transcript = [];
    for (const m of messages.reverse()) {
      transcript.push({ author: await nameOf(m.author), text: m.text });
    }
    const others = [];
    for (const id of gathering.participants) {
      if (id !== args.playerId) others.push(await nameOf(id));
    }
    const clock = world.clock && clockState(world.clock.elapsed);
    return {
      kind: gathering.kind,
      topic: gathering.topic,
      callerName: await nameOf(gathering.caller),
      name: await nameOf(args.playerId),
      identity:
        (description?.identity ?? '') +
        ageLine(await residentAge(ctx.db, args.worldId, args.playerId, clock?.day ?? 0)) +
        wellbeingLine(await residentMood(ctx.db, args.worldId, args.playerId)) +
        (await traitsPrompt(ctx.db, args.worldId, args.playerId)),
      faith: faith?.score,
      others,
      transcript,
      decrees: (await activeDecrees(ctx.db, args.worldId)).map((d) => d.text),
      punishments: await punishmentPrompt(ctx.db, args.worldId, args.playerId),
      timeOfDay: (clock ? `It's ${clock.phase} (${formatClock(clock)}).` : '') + townPrompt(world),
    };
  },
});

export const writeGatheringMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    gatheringId: v.string(),
    playerId,
    agentId,
    operationId: v.string(),
    messageUuid: v.string(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.text) {
      await ctx.db.insert('messages', {
        conversationId: args.gatheringId,
        author: args.playerId,
        text: args.text,
        messageUuid: args.messageUuid,
        worldId: args.worldId,
      });
    }
    // Always report back, so the gathering moves on even if the line failed.
    await insertInput(ctx, args.worldId, 'gatheringMessageSent', {
      gatheringId: args.gatheringId,
      agentId: args.agentId,
      operationId: args.operationId,
      timestamp: Date.now(),
    });
  },
});

// After a gathering ends: one summary, remembered by everyone who was there.
export const rememberGathering = internalAction({
  args: {
    worldId: v.id('worlds'),
    gatheringId: v.string(),
    kind: v.union(v.literal('meeting'), v.literal('group')),
    topic: v.string(),
    participants: v.array(v.object({ playerId, agentId: v.optional(agentId) })),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(api.messages.listMessages, {
      worldId: args.worldId,
      conversationId: args.gatheringId,
    });
    if (messages.length === 0) {
      return;
    }
    const names = [...new Set(messages.map((m) => m.authorName))];
    const what = args.kind === 'meeting' ? `a town meeting about "${args.topic}"` : 'a group chat';
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content:
            `Summarize ${what} in two or three sentences: who said what, and what was decided, if anything.\n` +
            messages.map((m) => `${m.authorName}: ${m.text}`).join('\n'),
        },
      ],
      max_tokens: 150,
    });
    const description = `At ${what} with ${names.join(', ')}: ${content.trim()}`;
    await ctx.runMutation(selfInternal.saveSummary, {
      worldId: args.worldId,
      gatheringId: args.gatheringId,
      kind: args.kind,
      topic: args.topic,
      participants: names,
      summary: content.trim(),
    });
    const { embedding } = await fetchEmbedding(description);
    for (const p of args.participants) {
      if (!p.agentId) continue;
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        agentId: p.agentId,
        playerId: p.playerId,
        description,
        importance: args.kind === 'meeting' ? 6 : 4,
        lastAccess: Date.now(),
        data: { type: 'gathering', gatheringId: args.gatheringId },
        embedding,
      });
    }
    // Let the God menu see what people said about the decrees.
    for (const p of args.participants) {
      const name = messages.find((m) => m.author === p.playerId)?.authorName;
      if (!name) continue;
      await ctx.scheduler.runAfter(0, internal.god.decrees.summarizeDecreeTalk, {
        worldId: args.worldId,
        playerId: p.playerId,
        name,
        otherName: names.filter((n) => n !== name).join(', '),
        transcript: messages.map((m) => ({ author: m.authorName, text: m.text })),
      });
    }
  },
});

// Once a day (and after big events), the town decides whether anyone calls a
// meeting. Usually nobody does unless something important happened.
export const considerTownMeeting = internalAction({
  args: { worldId: v.id('worlds'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(selfInternal.meetingContext, { worldId: args.worldId });
    if (!data || data.alreadyMetToday || data.townspeople.length < 3) {
      return;
    }
    const events = [...data.events];
    if (args.reason) events.push(args.reason);
    if (events.length === 0) {
      return;
    }
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            'Townspeople:',
            ...data.townspeople.map((p) => `- ${p.name}: ${p.identity}`),
            "What's happening in town:",
            ...events.map((e) => `- ${e}`),
            'Would one of these townspeople call a town meeting on the plaza today to talk it ' +
              'over? Only if it really matters to them. Reply NONE, or exactly ' +
              '"<Name>: <topic in under 10 words>".',
          ].join('\n'),
        },
      ],
      max_tokens: 30,
    });
    const match = content.trim().match(/^([A-Za-z]+)\s*:\s*(.+)$/m);
    const caller = match && data.townspeople.find((p) => p.name === match[1]);
    if (!caller) {
      return;
    }
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'callMeeting',
      args: { callerId: caller.playerId, topic: match[2].replace(/["“”]/g, '').trim() },
    });
  },
});

export const meetingContext = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return null;
    const day = world.clock ? clockState(world.clock.elapsed).day : 0;
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
        townspeople.push({
          playerId: agent.playerId,
          name: player.name,
          identity: description.identity.split('.')[0],
        });
      }
    }
    const events = (await activeDecrees(ctx.db, worldId)).map(
      (d) => `The god has decreed: "${d.text}"`,
    );
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const punishments = await ctx.db
      .query('punishments')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).gt('_creationTime', since))
      .collect();
    for (const p of punishments.slice(-3)) {
      events.push(`The god punished ${p.name}: ${p.punishment ?? 'struck with lightning'}`);
    }
    return { alreadyMetToday: world.lastMeetingDay === day, townspeople, events };
  },
});

export const saveSummary = internalMutation({
  args: {
    worldId: v.id('worlds'),
    gatheringId: v.string(),
    kind: v.union(v.literal('meeting'), v.literal('group')),
    topic: v.string(),
    participants: v.array(v.string()),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('gatheringSummaries', args);
  },
});

// Recent town meeting summaries, newest first, for the God menu.
export const meetingSummaries = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('gatheringSummaries')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('kind', 'meeting'))
      .order('desc')
      .take(10);
    return rows.map(({ _id, _creationTime, topic, participants, summary }) => ({
      _id,
      time: _creationTime,
      topic,
      participants,
      summary,
    }));
  },
});
