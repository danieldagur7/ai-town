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
    // Missing for prayers the player's own character writes.
    agentId: v.optional(agentId),
    name: v.string(),
    night: v.number(),
    status: prayerStatus,
    text: v.optional(v.string()),
    // One-line "X wants Y because Z", made on demand from the inbox.
    summary: v.optional(v.string()),
    requested: v.number(),
    generationStarted: v.optional(v.number()),
    godResponse: v.optional(v.string()),
    answered: v.optional(v.number()),
    // Set when the auto-answer decided: why it accepted or declined.
    autoReason: v.optional(v.string()),
    // Set while auto-answer is judging it, so overlapping runs skip it.
    deciding: v.optional(v.number()),
  })
    .index('player_night', ['worldId', 'playerId', 'night'])
    .index('status', ['worldId', 'status'])
    .index('worldId_answered', ['worldId', 'answered']),

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

  // What was said and decided at each town meeting or group chat, for the God menu.
  gatheringSummaries: defineTable({
    worldId: v.id('worlds'),
    gatheringId: v.string(),
    kind: v.union(v.literal('meeting'), v.literal('group')),
    topic: v.string(),
    participants: v.array(v.string()),
    summary: v.string(),
  }).index('worldId', ['worldId', 'kind']),

  // Every time the god struck someone down.
  punishments: defineTable({
    worldId: v.id('worlds'),
    playerId,
    name: v.string(),
    decreeId: v.optional(v.id('decrees')),
    decreeText: v.optional(v.string()),
    message: v.optional(v.string()),
    // What the god did to them, in the god's own words (default: lightning).
    punishment: v.optional(v.string()),
  }).index('worldId', ['worldId']),

  // Created the first time the god answers one of a character's prayers.
  // Per-world god settings.
  godSettings: defineTable({
    worldId: v.id('worlds'),
    // Answer each new prayer automatically as soon as it's written.
    autoAnswerPrayers: v.boolean(),
  }).index('worldId', ['worldId']),

  faith: defineTable({
    worldId: v.id('worlds'),
    playerId,
    score: v.number(),
  }).index('playerId', ['worldId', 'playerId']),
};
