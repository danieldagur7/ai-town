import { v } from 'convex/values';
import { DatabaseReader, internalMutation, query } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { playerId } from '../aiTown/ids';
import {
  CRUSH_CHANCE,
  MAX_AFFINITY_CHANGE,
  MUTUAL_CRUSH_CHANCE,
  STARTING_AFFINITY,
} from '../constants';

// Gives every pair of townspeople a starting relationship, plus the occasional
// crush. Safe to run again: existing rows are kept.
export const seedRelationships = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const ids = world.agents.map((a) => a.playerId);
    const existing = await ctx.db
      .query('relationships')
      .withIndex('pair', (q) => q.eq('worldId', worldId))
      .collect();
    const has = (a: string, b: string) => existing.some((r) => r.playerId === a && r.otherId === b);
    const crushOf = new Map(existing.filter((r) => r.crush).map((r) => [r.playerId, r.otherId]));
    const rows = new Map<string, { affinity: number; crush: boolean }>();
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b && !has(a, b)) {
          rows.set(`${a}|${b}`, {
            affinity: Math.round((Math.random() * 2 - 1) * STARTING_AFFINITY),
            crush: false,
          });
        }
      }
    }
    for (const a of ids) {
      if (crushOf.has(a) || Math.random() >= CRUSH_CHANCE) continue;
      const others = ids.filter((b) => b !== a && rows.has(`${a}|${b}`));
      const b = others[Math.floor(Math.random() * others.length)];
      if (!b) continue;
      rows.set(`${a}|${b}`, { affinity: 50, crush: true });
      crushOf.set(a, b);
      if (!crushOf.has(b) && rows.has(`${b}|${a}`) && Math.random() < MUTUAL_CRUSH_CHANCE) {
        rows.set(`${b}|${a}`, { affinity: 50, crush: true });
        crushOf.set(b, a);
      }
    }
    for (const [key, row] of rows) {
      const [a, b] = key.split('|');
      await ctx.db.insert('relationships', { worldId, playerId: a, otherId: b, ...row });
    }
  },
});

export async function getRelationship(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  from: string,
  to: string,
) {
  return await db
    .query('relationships')
    .withIndex('pair', (q) => q.eq('worldId', worldId).eq('playerId', from).eq('otherId', to))
    .first();
}

// A prompt line for how `from` feels about `name`.
export function relationshipPrompt(
  name: string,
  rel: { affinity: number; crush: boolean } | null,
): string[] {
  if (!rel) return [];
  if (rel.crush) {
    return [
      `You secretly have a crush on ${name}. You get a little flustered around them, but you don't say it outright.`,
    ];
  }
  const a = rel.affinity;
  const feeling =
    a >= 60
      ? `${name} is one of your closest friends.`
      : a >= 25
        ? `You like ${name}.`
        : a > -25
          ? `You don't know ${name} that well; you feel neutral about them.`
          : a > -60
            ? `You don't like ${name} much, and it shows a little.`
            : `You can't stand ${name}.`;
  return [feeling];
}

// After a conversation: nudge how `from` feels about `to`.
export const adjustAffinity = internalMutation({
  args: { worldId: v.id('worlds'), from: playerId, to: playerId, delta: v.number() },
  handler: async (ctx, args) => {
    const rel = await getRelationship(ctx.db, args.worldId, args.from, args.to);
    if (!rel) return;
    const delta = Math.max(-MAX_AFFINITY_CHANGE, Math.min(MAX_AFFINITY_CHANGE, args.delta));
    await ctx.db.patch(rel._id, {
      affinity: Math.max(-100, Math.min(100, rel.affinity + delta)),
    });
  },
});

// For the character pop-up: what's been on their mind and how they feel about people.
export const characterMind = query({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query('memories')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .order('desc')
      .take(6);
    const rels = await ctx.db
      .query('relationships')
      .withIndex('pair', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .collect();
    const feelings = [];
    for (const r of rels) {
      const other = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', r.otherId))
        .first();
      feelings.push({ name: other?.name ?? r.otherId, affinity: r.affinity, crush: r.crush });
    }
    feelings.sort((a, b) => b.affinity - a.affinity);
    return {
      thoughts: memories.map((m) => ({
        id: m._id,
        time: m._creationTime,
        type: m.data.type,
        text: m.description,
      })),
      feelings,
    };
  },
});
