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

  // Created the first time the god answers one of a character's prayers.
  faith: defineTable({
    worldId: v.id('worlds'),
    playerId,
    score: v.number(),
  }).index('playerId', ['worldId', 'playerId']),
};
