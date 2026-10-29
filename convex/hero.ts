import { ConvexError, v } from 'convex/values';
import { defineTable } from 'convex/server';
import {
  DatabaseReader,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { api, internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { insertInput } from './aiTown/insertInput';
import { clockState } from './aiTown/clock';
import { characters } from '../data/characters';
import {
  DEFAULT_NAME,
  HERO_START_AGE,
  LIFESPAN_MAX,
  LIFESPAN_MIN,
  YEARS_PER_DAY,
} from './constants';
import { ageOf } from './life';

// The player's own character. You make one, it is the same every time you
// join, and it ages like everyone else. When it dies it's gone for good: make
// a new one, or carry on as one of your children.
export const heroTables = {
  heroes: defineTable({
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    bio: v.string(),
    interests: v.string(),
    bornDay: v.number(),
    deathAge: v.number(),
    status: v.union(v.literal('alive'), v.literal('dead')),
    // The player id while in the world, and every one it has had (children
    // record parents by player id).
    playerId: v.optional(v.string()),
    playerIds: v.array(v.string()),
    // Set when this hero is a townsperson the player took over.
    inheritFrom: v.optional(v.string()),
    diedDay: v.optional(v.number()),
    cause: v.optional(v.string()),
  }).index('worldId', ['worldId', 'status']),
};

const dayOf = (world: { clock?: { elapsed: number } } | null) =>
  world?.clock ? clockState(world.clock.elapsed).day : 0;

export async function aliveHero(db: DatabaseReader, worldId: Id<'worlds'>) {
  return await db
    .query('heroes')
    .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('status', 'alive'))
    .first();
}

export function heroDescription(h: { name: string; bio: string; interests: string }) {
  return `${h.name} is ${h.bio.replace(/^\s*(is\s+)?/i, '')}${h.interests ? ` Interests: ${h.interests}.` : ''}`;
}

export const myHero = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    const day = dayOf(world);
    const all = await ctx.db
      .query('heroes')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const hero = all.find((h) => h.status === 'alive');
    const fallen = all.filter((h) => h.status === 'dead');
    // Children of any of my characters who are still alive (and not me).
    const myIds = new Set(all.flatMap((h) => h.playerIds));
    const residents = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', worldId))
      .collect();
    const living = new Set((world?.agents ?? []).map((a) => a.playerId));
    const heirs = residents
      .filter(
        (r) =>
          r.diedDay === undefined &&
          living.has(r.playerId) &&
          (r.parents ?? []).some((p) => myIds.has(p)),
      )
      .map((r) => ({ playerId: r.playerId, name: r.name, age: ageOf(r, day) }));
    // How the townspeople feel about me.
    const feelings = [];
    if (hero?.playerId) {
      const rows = await ctx.db
        .query('relationships')
        .withIndex('pair', (q) => q.eq('worldId', worldId))
        .filter((q) => q.eq(q.field('otherId'), hero.playerId))
        .collect();
      for (const r of rows) {
        if (!living.has(r.playerId)) continue;
        const pd = await ctx.db
          .query('playerDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', r.playerId))
          .first();
        feelings.push({ name: pd?.name ?? r.playerId, affinity: r.affinity, crush: r.crush });
      }
    }
    return {
      hero: hero && {
        _id: hero._id,
        name: hero.name,
        character: hero.character,
        bio: hero.bio,
        interests: hero.interests,
        age: ageOf(hero, day),
        playerId: hero.playerId,
      },
      fallen: fallen.map((h) => ({ name: h.name, diedDay: h.diedDay, cause: h.cause })),
      heirs,
      feelings: feelings.sort((a, b) => b.affinity - a.affinity),
    };
  },
});

export const createHero = mutation({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    bio: v.string(),
    interests: v.string(),
  },
  handler: async (ctx, args) => {
    if (await aliveHero(ctx.db, args.worldId)) {
      throw new ConvexError('You already have a living character');
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError('Give your character a name');
    if (!characters.find((c) => c.name === args.character)) {
      throw new ConvexError('Pick a look');
    }
    const taken = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .filter((q) => q.eq(q.field('name'), name))
      .first();
    if (taken) throw new ConvexError(`Someone in this world is already called ${name}`);
    const world = await ctx.db.get(args.worldId);
    await ctx.db.insert('heroes', {
      worldId: args.worldId,
      name,
      character: args.character,
      bio: args.bio.trim() || 'a newcomer to town.',
      interests: args.interests.trim(),
      bornDay: dayOf(world) - HERO_START_AGE / YEARS_PER_DAY,
      deathAge: Math.round(LIFESPAN_MIN + Math.random() * (LIFESPAN_MAX - LIFESPAN_MIN)),
      status: 'alive',
      playerIds: [],
    });
  },
});

// Join the world as my character.
export const joinAsHero = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const hero = await aliveHero(ctx.db, worldId);
    if (!hero) throw new ConvexError('Create your character first');
    return await insertInput(ctx, worldId, 'join', {
      name: hero.name,
      character: hero.character,
      description: heroDescription(hero),
      tokenIdentifier: DEFAULT_NAME,
      heroId: hero._id,
    });
  },
});

// Carry on as one of my children: they leave the AI's hands and become my character.
export const playAsHeir = mutation({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, { worldId, playerId }) => {
    if (await aliveHero(ctx.db, worldId)) {
      throw new ConvexError('Your character is still alive');
    }
    const world = await ctx.db.get(worldId);
    const agent = world?.agents.find((a) => a.playerId === playerId);
    const resident = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
      .first();
    const pd = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
      .first();
    const ad =
      agent &&
      (await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', agent.id))
        .first());
    if (!agent || !resident || !pd) throw new ConvexError('They are not alive');
    const mine = await ctx.db
      .query('heroes')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const myIds = new Set(mine.flatMap((h) => h.playerIds));
    if (!(resident.parents ?? []).some((p) => myIds.has(p))) {
      throw new ConvexError('That is not your child');
    }
    await ctx.db.insert('heroes', {
      worldId,
      name: pd.name,
      character: pd.character,
      bio: (ad?.identity ?? '').replace(new RegExp(`^${pd.name}\\s+(is\\s+)?`), ''),
      interests: '',
      bornDay: resident.bornDay,
      deathAge: resident.deathAge,
      status: 'alive',
      playerIds: [],
      inheritFrom: playerId,
    });
    await ctx.db.patch(resident._id, { diedDay: dayOf(world), cause: 'now played by you' });
    // Take them out of the AI's hands quietly (no death).
    await insertInput(ctx, worldId, 'residentDies', { playerId });
  },
});

// The engine created the hero's player: remember the id, and if they were a
// townsperson before, carry over how everyone feels about them.
export const heroEntered = internalMutation({
  args: { worldId: v.id('worlds'), heroId: v.id('heroes'), playerId: v.string() },
  handler: async (ctx, { worldId, heroId, playerId }) => {
    const hero = await ctx.db.get(heroId);
    if (!hero) return;
    await ctx.db.patch(heroId, {
      playerId,
      playerIds: [...new Set([...hero.playerIds, playerId])],
    });
    const previous = hero.inheritFrom ?? hero.playerIds[hero.playerIds.length - 1];
    if (previous && previous !== playerId) {
      const rows = await ctx.db
        .query('relationships')
        .withIndex('pair', (q) => q.eq('worldId', worldId))
        .collect();
      for (const r of rows) {
        if (r.otherId === previous) await ctx.db.patch(r._id, { otherId: playerId });
        if (r.playerId === previous) await ctx.db.patch(r._id, { playerId });
      }
    }
    await ctx.scheduler.runAfter(0, internal.agent.relationships.seedRelationships, { worldId });
  },
});

// My character prays. The god (also me) answers from the inbox, or auto-answer does.
export const heroPrays = mutation({
  args: { worldId: v.id('worlds'), text: v.string() },
  handler: async (ctx, { worldId, text }) => {
    const hero = await aliveHero(ctx.db, worldId);
    if (!hero?.playerId) throw new ConvexError('Join the world as your character first');
    if (!text.trim()) throw new ConvexError('Say a prayer first');
    const world = await ctx.db.get(worldId);
    const prayerId = await ctx.db.insert('prayers', {
      worldId,
      playerId: hero.playerId,
      name: hero.name,
      night: dayOf(world),
      status: 'pending',
      text: text.trim(),
      requested: Date.now(),
    });
    const settings = await ctx.db
      .query('godSettings')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .first();
    if (settings?.autoAnswerPrayers) {
      await ctx.scheduler.runAfter(0, api.god.prayers.autoAnswerPrayers, { worldId, prayerId });
    }
  },
});

// For the life cycle: the living hero, if any, and its death.
export const heroLife = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const hero = await aliveHero(ctx.db, worldId);
    const world = await ctx.db.get(worldId);
    if (!hero) return null;
    return {
      _id: hero._id,
      name: hero.name,
      age: ageOf(hero, dayOf(world)),
      deathAge: hero.deathAge,
      bio: hero.bio,
      playerId: hero.playerId,
      inWorld: !!hero.playerId && !!world?.players.some((p) => p.id === hero.playerId),
    };
  },
});

export const heroDied = internalMutation({
  args: { heroId: v.id('heroes'), cause: v.string() },
  handler: async (ctx, { heroId, cause }) => {
    const hero = await ctx.db.get(heroId);
    if (!hero) return;
    const world = await ctx.db.get(hero.worldId);
    await ctx.db.patch(heroId, { status: 'dead', diedDay: dayOf(world), cause });
    if (hero.playerId && world?.players.some((p) => p.id === hero.playerId)) {
      await insertInput(ctx, hero.worldId, 'leave', { playerId: hero.playerId });
    }
  },
});

// My character says something in a group chat or town meeting.
export const sayInGathering = mutation({
  args: { worldId: v.id('worlds'), gatheringId: v.string(), text: v.string() },
  handler: async (ctx, { worldId, gatheringId, text }) => {
    const hero = await aliveHero(ctx.db, worldId);
    const world = await ctx.db.get(worldId);
    const gathering = world?.gatherings?.find((g) => g.id === gatheringId);
    if (!hero?.playerId || !gathering?.participants.includes(hero.playerId)) {
      throw new ConvexError('Join the gathering first');
    }
    if (!text.trim()) return;
    await ctx.db.insert('messages', {
      conversationId: gatheringId,
      author: hero.playerId,
      text: text.trim(),
      messageUuid: crypto.randomUUID(),
      worldId,
    });
    await insertInput(ctx, worldId, 'gatheringHumanSaid', { playerId: hero.playerId, gatheringId });
  },
});
