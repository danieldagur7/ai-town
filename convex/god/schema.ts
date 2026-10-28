import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import { agentId, playerId } from '../aiTown/ids';

export const prayerStatus = v.union(
  // Waiting for the prayer worker; only one prayer generates at a time.
  v.literal('queued'),
  v.literal('generating'),
  // Written and waiting for the god's answer.
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('declined'),
  // Dropped: generation failed, or a newer night came before it ran.
  v.literal('skipped'),
);

export const godTables = {
  prayers: defineTable({
    worldId: v.id('worlds'),
    playerId,
    agentId,
    name: v.string(),
    night: v.number(),
    status: prayerStatus,
    text: v.optional(v.string()),
    requested: v.number(),
    generationStarted: v.optional(v.number()),
    godResponse: v.optional(v.string()),
    answered: v.optional(v.number()),
  })
    .index('player_night', ['worldId', 'playerId', 'night'])
    .index('status', ['worldId', 'status']),

  // The god's mission statements for the town. Active ones go into every
  // character's prompts.
  decrees: defineTable({
    worldId: v.id('worlds'),
    text: v.string(),
    status: v.union(v.literal('active'), v.literal('completed'), v.literal('cancelled')),
    created: v.number(),
    ended: v.optional(v.number()),
  }).index('status', ['worldId', 'status']),

  // What a character said about a decree in a conversation, summarized by the LLM.
  decreeOpinions: defineTable({
    worldId: v.id('worlds'),
    decreeId: v.id('decrees'),
    playerId,
    name: v.string(),
    text: v.string(),
  }).index('decreeId', ['decreeId']),

  // Created the first time the god answers one of a character's prayers.
  faith: defineTable({
    worldId: v.id('worlds'),
    playerId,
    score: v.number(),
  }).index('playerId', ['worldId', 'playerId']),
};
