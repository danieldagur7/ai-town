import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

// Pixel art made on demand by the local image server (scripts/imagegen_server.py).
// The engine refers to art by a deterministic `key` (e.g. "project:3",
// "house:2:0"), so it never has to wait for an id to come back.
export const artTables = {
  artworks: defineTable({
    worldId: v.id('worlds'),
    key: v.string(),
    subject: v.string(),
    size: v.number(),
    status: v.union(v.literal('generating'), v.literal('ready'), v.literal('failed')),
    storageId: v.optional(v.id('_storage')),
    error: v.optional(v.string()),
  }).index('key', ['worldId', 'key']),
};

const IMAGEGEN_URL = () => process.env.IMAGEGEN_URL ?? 'http://127.0.0.1:7861';

// Ask for art under `key`. Replaces whatever was there (so it doubles as "redraw").
export async function startArt(
  ctx: MutationCtx,
  args: { worldId: Id<'worlds'>; key: string; subject: string; size?: number; seed?: number },
) {
  const existing = await ctx.db
    .query('artworks')
    .withIndex('key', (q) => q.eq('worldId', args.worldId).eq('key', args.key))
    .first();
  const fields = {
    subject: args.subject,
    size: args.size ?? 96,
    status: 'generating' as const,
    error: undefined,
  };
  let artId;
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    artId = existing._id;
  } else {
    artId = await ctx.db.insert('artworks', { worldId: args.worldId, key: args.key, ...fields });
  }
  await ctx.scheduler.runAfter(0, internal.art.generateArt, {
    artId,
    seed: args.seed ?? Math.floor(Math.random() * 100000),
  });
}

export const requestArt = internalMutation({
  args: {
    worldId: v.id('worlds'),
    key: v.string(),
    subject: v.string(),
    size: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => await startArt(ctx, args),
});

export const generateArt = internalAction({
  args: { artId: v.id('artworks'), seed: v.number() },
  handler: async (ctx, { artId, seed }) => {
    const art = await ctx.runQuery(internal.art.getArt, { artId });
    if (!art) return;
    try {
      const resp = await fetch(`${IMAGEGEN_URL()}/generate`, {
        method: 'POST',
        body: JSON.stringify({ subject: art.subject, size: art.size, seed }),
      });
      if (!resp.ok) throw new Error(`Image server: ${resp.status} ${await resp.text()}`);
      const storageId = await ctx.storage.store(await resp.blob());
      await ctx.runMutation(internal.art.finishArt, { artId, storageId });
    } catch (e: any) {
      console.error(`Art for "${art.subject}" failed: ${e.message ?? e}`);
      await ctx.runMutation(internal.art.finishArt, {
        artId,
        error: `${e.message ?? e}`.slice(0, 300),
      });
    }
  },
});

export const getArt = internalQuery({
  args: { artId: v.id('artworks') },
  handler: async (ctx, { artId }) => await ctx.db.get(artId),
});

export const finishArt = internalMutation({
  args: {
    artId: v.id('artworks'),
    storageId: v.optional(v.id('_storage')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { artId, storageId, error }) => {
    const art = await ctx.db.get(artId);
    if (!art) return;
    // A redraw replaced this; drop the old file.
    if (storageId && art.storageId && art.storageId !== storageId) {
      await ctx.storage.delete(art.storageId);
    }
    await ctx.db.patch(
      artId,
      storageId ? { status: 'ready', storageId } : { status: 'failed', error },
    );
  },
});

// Every artwork in the world by key, for the map.
export const artByKey = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('artworks')
      .withIndex('key', (q) => q.eq('worldId', worldId))
      .collect();
    const result: Record<string, { status: string; url: string | null; subject: string }> = {};
    for (const r of rows) {
      result[r.key] = {
        status: r.status,
        subject: r.subject,
        url: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
      };
    }
    return result;
  },
});

// God menu: redraw a piece of art, optionally with a new description.
export const redrawArt = mutation({
  args: { worldId: v.id('worlds'), key: v.string(), subject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const art = await ctx.db
      .query('artworks')
      .withIndex('key', (q) => q.eq('worldId', args.worldId).eq('key', args.key))
      .first();
    const subject = args.subject?.trim() || art?.subject;
    if (!subject) throw new Error('Nothing to redraw');
    await startArt(ctx, {
      worldId: args.worldId,
      key: args.key,
      subject,
      size: art?.size,
    });
  },
});
