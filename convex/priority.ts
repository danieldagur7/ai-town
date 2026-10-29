import { v } from 'convex/values';
import { ActionCtx, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { PLAYER_PRIORITY_MAX_WAIT } from './constants';

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

export async function yieldToPlayer(ctx: ActionCtx, worldId: Id<'worlds'>, ownId?: string) {
  const deadline = Date.now() + PLAYER_PRIORITY_MAX_WAIT;
  while (Date.now() < deadline) {
    const busy = await ctx.runQuery(internal.priority.humanActivity, { worldId });
    if (busy.length === 0 || (ownId && busy.includes(ownId))) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
