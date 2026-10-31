import { v } from 'convex/values';
import { ActionCtx, internalQuery } from './_generated/server';
import { defineTable } from 'convex/server';
import { Id } from './_generated/dataModel';

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

// No longer used: kept so data from the old one-at-a-time queue still validates.
export const llmLeaseTables = {
  llmLease: defineTable({ holder: v.string(), expires: v.number() }),
};

// Background LLM work used to wait here (for the player to finish talking, then
// for a single shared turn). Waiting inside an action holds one of the
// backend's few action slots, and enough waiters starved the engine's own
// runStep: the town froze and nobody answered. Ollama now serves several
// requests at once (OLLAMA_NUM_PARALLEL in scripts/backend.mjs), so the
// player's replies don't queue behind the town. Kept as a no-op so callers can
// stay as they are.
export async function yieldToPlayer(
  _ctx: ActionCtx,
  _worldId: Id<'worlds'>,
  _ownId?: string,
  _maxWait?: number,
): Promise<() => Promise<void>> {
  return async () => {};
}
