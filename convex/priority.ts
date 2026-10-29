import { v } from 'convex/values';
import { ActionCtx, internalMutation, internalQuery } from './_generated/server';
import { defineTable } from 'convex/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { LLM_LEASE_MAX_WAIT, LLM_LEASE_MS, PLAYER_PRIORITY_MAX_WAIT } from './constants';

// Ollama answers one request at a time, first come first served. So that a
// player never waits behind the town's background chatter, background LLM work
// calls yieldToPlayer first: it waits (up to PLAYER_PRIORITY_MAX_WAIT) while a
// human is in a conversation or gathering, unless that's the work's own.
export const humanActivity = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return [];
    const humans = new Set(world.players.filter((p) => p.human).map((p) => p.id));
    return [
      ...world.conversations
        .filter((c) => c.participants.some((m) => humans.has(m.playerId)))
        .map((c) => c.id),
      ...(world.gatherings ?? [])
        .filter((g) => g.participants.some((id) => humans.has(id)))
        .map((g) => g.id),
    ];
  },
});

// Whether a conversation is still going, and whether a human is in it.
export const conversationStatus = internalQuery({
  args: { worldId: v.id('worlds'), conversationId: v.string() },
  handler: async (ctx, { worldId, conversationId }) => {
    const world = await ctx.db.get(worldId);
    const conversation = world?.conversations.find((c) => c.id === conversationId);
    if (!world || !conversation) return { active: false, withHuman: false };
    const humans = new Set(world.players.filter((p) => p.human).map((p) => p.id));
    return {
      active: true,
      withHuman: conversation.participants.some((m) => humans.has(m.playerId)),
    };
  },
});

// Only one piece of background work talks to Ollama at a time. Without this,
// bursts (everyone remembering a meeting, prayers at bedtime) put a dozen
// requests in Ollama's queue at once and a player's reply waits minutes
// behind them. With it, a player's request waits for one at most.
export const llmLeaseTables = {
  llmLease: defineTable({ holder: v.string(), expires: v.number() }),
};

export const acquireLease = internalMutation({
  args: { holder: v.string(), ms: v.number() },
  handler: async (ctx, { holder, ms }) => {
    const now = Date.now();
    const lease = await ctx.db.query('llmLease').first();
    if (lease && lease.expires > now && lease.holder !== holder) return false;
    if (lease) await ctx.db.patch(lease._id, { holder, expires: now + ms });
    else await ctx.db.insert('llmLease', { holder, expires: now + ms });
    return true;
  },
});

export const releaseLease = internalMutation({
  args: { holder: v.string() },
  handler: async (ctx, { holder }) => {
    const lease = await ctx.db.query('llmLease').first();
    if (lease?.holder === holder) await ctx.db.patch(lease._id, { expires: 0 });
  },
});

// Call before background LLM work, and call what it returns when done (in a
// `finally`). It waits while a human is in a conversation or gathering (up to
// PLAYER_PRIORITY_MAX_WAIT), then for the background turn (up to `maxWait`;
// a turn left unreleased expires after LLM_LEASE_MS). Work for the human's own
// conversation or gathering (`ownId`) goes straight through.
export async function yieldToPlayer(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  ownId?: string,
  maxWait = LLM_LEASE_MAX_WAIT,
): Promise<() => Promise<void>> {
  const noop = async () => {};
  const humanDeadline = Date.now() + PLAYER_PRIORITY_MAX_WAIT;
  while (Date.now() < humanDeadline) {
    const busy = await ctx.runQuery(internal.priority.humanActivity, { worldId });
    if (ownId && busy.includes(ownId)) return noop;
    if (busy.length === 0) break;
    await sleep(1500);
  }
  const holder = `${Date.now()}-${Math.random()}`;
  const leaseDeadline = Date.now() + maxWait;
  while (Date.now() < leaseDeadline) {
    if (await ctx.runMutation(internal.priority.acquireLease, { holder, ms: LLM_LEASE_MS })) {
      return async () => {
        await ctx.runMutation(internal.priority.releaseLease, { holder });
      };
    }
    await sleep(1000 + Math.random() * 1000);
  }
  // Waited long enough: go ahead rather than starve.
  return noop;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
