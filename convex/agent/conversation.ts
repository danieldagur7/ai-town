import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import * as memory from './memory';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { MESSAGE_MAX_TOKENS, NUM_MEMORIES_TO_SEARCH } from '../constants';
import { DAY_LENGTH, clockState, formatClock } from '../aiTown/clock';
import { faithDescription } from '../god/faith';
import { GOD_CHARACTER } from '../../data/characters';
import { activeDecrees, decreesPrompt } from '../god/decrees';
import { punishmentPrompt } from '../god/punishment';
import { projectPrompt } from '../aiTown/project';
import { getRelationship, relationshipPrompt } from './relationships';

const selfInternal = internal.agent.conversation;

// Keep chat snappy: short spoken lines, no narration.
const CHAT_STYLE =
  'Reply with one or two short sentences (under 25 words), like natural spoken chat. ' +
  'No narration, no actions in asterisks or parentheses, no quotation marks.';

// Strips stage directions and stray formatting the model adds despite CHAT_STYLE.
export function cleanMessage(text: string) {
  const cleaned = text
    .replace(/^\s*[A-Z][\w ]{0,20}:\s*/, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text.trim();
}

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const {
    player,
    otherPlayer,
    agent,
    otherAgent,
    lastConversation,
    decrees,
    punishments,
    relationship,
    timeOfDay,
  } = await ctx.runQuery(selfInternal.queryPromptData, {
    worldId,
    playerId,
    otherPlayerId,
    conversationId,
  });
  const embedding = await embeddingsCache.fetch(
    ctx,
    `${player.name} is talking to ${otherPlayer.name}`,
  );

  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );

  const memoryWithOtherPlayer = memories.find(
    (m) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );
  const prompt = [
    `You are ${player.name}, and you just started a conversation with ${otherPlayer.name}.`,
    timeOfDay,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...decreesPrompt(decrees));
  prompt.push(...punishments);
  prompt.push(...relationshipPrompt(otherPlayer.name, relationship));
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `Be sure to include some detail or question about a previous conversation in your greeting.`,
    );
  }
  prompt.push(CHAT_STYLE);
  prompt.push(`${player.name}:`);

  const { content } = await chatCompletion({
    messages: [
      {
        role: 'user',
        content: prompt.join('\n'),
      },
    ],
    max_tokens: MESSAGE_MAX_TOKENS,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const {
    player,
    otherPlayer,
    conversation,
    agent,
    otherAgent,
    decrees,
    punishments,
    relationship,
    timeOfDay,
  } = await ctx.runQuery(selfInternal.queryPromptData, {
    worldId,
    playerId,
    otherPlayerId,
    conversationId,
  });
  const embedding = await embeddingsCache.fetch(
    ctx,
    `What do you think about ${otherPlayer.name}?`,
  );
  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    timeOfDay,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...decreesPrompt(decrees));
  prompt.push(...punishments);
  prompt.push(...relationshipPrompt(otherPlayer.name, relationship));
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `DO NOT greet them again. Do NOT use the word "Hey" too often.`,
    CHAT_STYLE,
  );

  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: MESSAGE_MAX_TOKENS,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const {
    player,
    otherPlayer,
    conversation,
    agent,
    otherAgent,
    decrees,
    punishments,
    relationship,
    timeOfDay,
  } = await ctx.runQuery(selfInternal.queryPromptData, {
    worldId,
    playerId,
    otherPlayerId,
    conversationId,
  });
  const prompt = [
    `You are ${player.name}, and you're currently in a conversation with ${otherPlayer.name}.`,
    `You've decided to leave the question and would like to politely tell them you're leaving the conversation.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(...decreesPrompt(decrees));
  prompt.push(...punishments);
  prompt.push(...relationshipPrompt(otherPlayer.name, relationship));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `How would you like to tell them that you're leaving?`,
    CHAT_STYLE,
  );
  const llmMessages: LLMMessage[] = [
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'user', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: MESSAGE_MAX_TOKENS,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

function agentPrompts(
  otherPlayer: { name: string; isGod?: boolean },
  agent: { identity: string; plan: string; faith?: number } | null,
  otherAgent: { identity: string; plan: string } | null,
): string[] {
  const prompt = [];
  if (agent) {
    prompt.push(`About you: ${agent.identity}`);
    prompt.push(`Your goals for the conversation: ${agent.plan}`);
    // Only once the god has answered one of their prayers.
    if (agent.faith !== undefined) {
      prompt.push(
        `Privately: ${faithDescription(agent.faith)} Keep it to yourself unless it naturally comes up.`,
      );
    }
  }
  if (otherAgent) {
    prompt.push(`About ${otherPlayer.name}: ${otherAgent.identity}`);
  }
  if (otherPlayer.isGod) {
    prompt.push(
      `${otherPlayer.name} is the unseen god of this town, standing in front of you in person, ` +
        `glowing with a halo. You recognize them at once. React the way you truly would: ` +
        `awe, fear, gratitude, doubt or a grudge, depending on who you are and how the god has treated you. ` +
        `Talk to them as your god, and answer what they actually say.`,
    );
  }
  return prompt;
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    // Real time since then, in game days.
    const days = Math.floor((Date.now() - conversation.created) / DAY_LENGTH);
    const when = days === 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`;
    prompt.push(`You last chatted with ${otherPlayer.name} ${when}.`);
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`Here are some related memories in decreasing relevance order:`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
  }
  return prompt;
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      // Order by conversation end time descending.
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }
    const faith = await ctx.db
      .query('faith')
      .withIndex('playerId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    const decrees = await activeDecrees(ctx.db, args.worldId);
    const punishments = await punishmentPrompt(ctx.db, args.worldId, args.playerId);
    const relationship = await getRelationship(
      ctx.db,
      args.worldId,
      args.playerId,
      args.otherPlayerId,
    );
    const clock = world.clock && clockState(world.clock.elapsed);
    const timeOfDay =
      (clock
        ? `It's ${clock.phase} (${formatClock(clock)}) on day ${clock.day}.`
        : `It's daytime.`) + projectPrompt(world.project);
    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: {
        name: otherPlayerDescription.name,
        isGod: otherPlayerDescription.character === GOD_CHARACTER,
        ...otherPlayer,
      },
      conversation,
      agent: {
        identity: agentDescription.identity,
        plan: agentDescription.plan,
        faith: faith?.score,
        ...agent,
      },
      otherAgent: otherAgent && {
        identity: otherAgentDescription!.identity,
        plan: otherAgentDescription!.plan,
        ...otherAgent,
      },
      lastConversation,
      decrees: decrees.map((d) => d.text),
      punishments,
      relationship: relationship && { affinity: relationship.affinity, crush: relationship.crush },
      timeOfDay,
    };
  },
});

function stopWords(otherPlayer: string, player: string) {
  // These are the words we ask the LLM to stop on. OpenAI only supports 4.
  const variants = [`${otherPlayer} to ${player}`];
  return variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':']);
}
