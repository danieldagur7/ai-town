import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import {
  ActionCtx,
  DatabaseReader,
  internalAction,
  internalMutation,
  internalQuery,
  MutationCtx,
  query,
} from './_generated/server';
import { api, internal } from './_generated/api';
import { Id } from './_generated/dataModel';
import { chatCompletion, fetchEmbedding } from './util/llm';
import { clockState } from './aiTown/clock';
import { characters } from '../data/characters';
import {
  ADULT_AGE,
  BIRTH_CHANCE_AT_TARGET,
  BIRTH_CHANCE_BELOW_TARGET,
  LIFESPAN_MAX,
  LIFESPAN_MIN,
  MAX_CHILDREN,
  MAX_POPULATION,
  PARENT_AGE_MAX,
  PARENT_AGE_MIN,
  POPULATION_TARGET,
  START_AGE_MAX,
  START_AGE_MIN,
  WELLBEING_BASELINE,
  WELLBEING_DRIFT,
  WELLBEING_START,
  YEARS_PER_DAY,
} from './constants';

// Ages and lifespans live outside the engine; the engine only hears about
// births and deaths (residentBorn / residentDies inputs).
export const lifeTables = {
  residents: defineTable({
    worldId: v.id('worlds'),
    playerId: v.string(),
    name: v.string(),
    // Game day of birth (can be negative for the founders).
    bornDay: v.number(),
    deathAge: v.number(),
    parents: v.optional(v.array(v.string())),
    diedDay: v.optional(v.number()),
    cause: v.optional(v.string()),
    // Mental health, 0-100 (WELLBEING_START when missing).
    wellbeing: v.optional(v.number()),
  }).index('player', ['worldId', 'playerId']),
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function ageOf(r: { bornDay: number }, day: number) {
  return Math.max(0, Math.floor((day - r.bornDay) * YEARS_PER_DAY));
}

export async function residentAge(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  playerId: string,
  day: number,
) {
  const r = await db
    .query('residents')
    .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
  return r ? ageOf(r, day) : undefined;
}

async function residentRow(db: DatabaseReader, worldId: Id<'worlds'>, playerId: string) {
  return await db
    .query('residents')
    .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
}

export async function adjustWellbeing(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  playerId: string,
  delta: number,
) {
  const r = await residentRow(ctx.db, worldId, playerId);
  if (!r) return;
  const wellbeing = Math.max(0, Math.min(100, (r.wellbeing ?? WELLBEING_START) + delta));
  await ctx.db.patch(r._id, { wellbeing: Math.round(wellbeing) });
}

// A line for prompts on how they're doing inside. Realistic, not melodramatic.
export function wellbeingLine(w: number | undefined) {
  if (w === undefined) return '';
  if (w < 20)
    return ' Lately you are in a dark place: exhausted, hopeless and short-tempered. Small things hurt, and you push people away.';
  if (w < 40) return ' You have been feeling low and irritable lately, and it shows.';
  if (w > 85) return ' You are in wonderful spirits these days.';
  if (w > 70) return ' You have been feeling good lately.';
  return '';
}

export async function residentMood(db: DatabaseReader, worldId: Id<'worlds'>, playerId: string) {
  const r = await residentRow(db, worldId, playerId);
  return r ? r.wellbeing ?? WELLBEING_START : undefined;
}

export const wellbeingOf = internalQuery({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) =>
    (await residentMood(ctx.db, args.worldId, args.playerId)) ?? WELLBEING_START,
});

export const changeWellbeing = internalMutation({
  args: { worldId: v.id('worlds'), playerId: v.string(), delta: v.number() },
  handler: async (ctx, args) => await adjustWellbeing(ctx, args.worldId, args.playerId, args.delta),
});

// Everyone's wellbeing moves by `delta` (grief, celebrations), except `except`.
export const changeEveryonesWellbeing = internalMutation({
  args: { worldId: v.id('worlds'), delta: v.number(), except: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    for (const a of world?.agents ?? []) {
      if (a.playerId !== args.except)
        await adjustWellbeing(ctx, args.worldId, a.playerId, args.delta);
    }
  },
});

// Admin console: the god ends someone's life.
export const godKills = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), cause: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.life.seedResidents, { worldId: args.worldId });
    const data = await ctx.runQuery(internal.life.lifeData, { worldId: args.worldId });
    const person = data?.people.find((p) => p.playerId === args.playerId);
    if (!data || !person) throw new Error('They are not alive');
    await die(ctx, args.worldId, person, args.cause, data.day);
  },
});

// Admin console: someone new moves to town.
export const addNewcomer = internalAction({
  args: {
    worldId: v.id('worlds'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.life.lifeData, { worldId: args.worldId });
    if (!data) return;
    await birth(ctx, args.worldId, data, data.day, [], args);
  },
});

// The town has gone hungry too long: the frailest (oldest, lowest in spirit) dies.
export const starve = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    await ctx.runMutation(internal.life.seedResidents, { worldId });
    const data = await ctx.runQuery(internal.life.lifeData, { worldId });
    if (!data || data.people.length === 0) return;
    const frailest = [...data.people].sort((a, b) => b.age / b.deathAge - a.age / a.deathAge)[0];
    await die(ctx, worldId, frailest, 'starvation', data.day);
  },
});

// A risky activity went wrong.
export const accident = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), activity: v.string(), fatal: v.boolean() },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.life.lifeData, { worldId: args.worldId });
    const person = data?.people.find((p) => p.playerId === args.playerId);
    if (!data || !person) return;
    if (args.fatal) {
      await die(ctx, args.worldId, person, `an accident while ${args.activity}`, data.day);
      return;
    }
    await ctx.runMutation(internal.life.changeWellbeing, {
      worldId: args.worldId,
      playerId: args.playerId,
      delta: -15,
    });
    await ctx.runMutation(internal.society.townEvent, {
      worldId: args.worldId,
      emoji: '🤕',
      text: `${person.name} got hurt while ${args.activity}.`,
    });
    await ctx.runAction(internal.life.rememberLifeEvent, {
      worldId: args.worldId,
      text: `${person.name} got badly hurt while ${args.activity}.`,
      importance: 6,
    });
  },
});

// A line for prompts: how old they are, said so the model plays the age.
export function ageLine(age: number | undefined) {
  if (age === undefined) return '';
  if (age < 4) return ` You are only ${age}, a toddler: you say just a few simple words.`;
  if (age < ADULT_AGE) return ` You are ${age} years old, a child, and you talk like one.`;
  if (age >= 70) return ` You are ${age} years old, and you feel your age.`;
  return ` You are ${age} years old.`;
}

// Each morning: make sure everyone has an age, then at most one death and maybe one birth.
export const lifeCycle = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    await ctx.runMutation(internal.life.seedResidents, { worldId });
    await ctx.runMutation(internal.life.driftWellbeing, { worldId });
    const data = await ctx.runQuery(internal.life.lifeData, { worldId });
    if (!data) return;
    const { day } = data;
    let alive = data.people;

    // The player's own character ages too, and its death is final.
    const hero = await ctx.runQuery(internal.hero.heroLife, { worldId });
    if (hero && hero.age >= hero.deathAge) {
      await ctx.runMutation(internal.hero.heroDied, { heroId: hero._id, cause: 'old age' });
      const text = `${hero.name} died of old age at the age of ${hero.age}.`;
      await ctx.runMutation(internal.society.townEvent, { worldId, emoji: '🪦', text });
      await ctx.runAction(internal.life.rememberLifeEvent, {
        worldId,
        text: `${text} The whole town mourns.`,
        importance: 8,
      });
    }

    const dying = alive
      .filter((p) => p.age >= p.deathAge)
      .sort((a, b) => b.age - b.deathAge - (a.age - a.deathAge))[0];
    if (dying) {
      await die(ctx, worldId, dying, 'old age', day);
      alive = alive.filter((p) => p.playerId !== dying.playerId);
    }

    const children = alive.filter((p) => p.age < ADULT_AGE);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId,
      name: 'setChildren',
      args: { playerIds: children.map((c) => c.playerId) },
    });
    const adults = alive.filter((p) => p.age >= ADULT_AGE);
    if (alive.length >= MAX_POPULATION || children.length >= MAX_CHILDREN) return;
    const chance =
      alive.length < POPULATION_TARGET ? BIRTH_CHANCE_BELOW_TARGET : BIRTH_CHANCE_AT_TARGET;
    if (Math.random() >= chance) return;

    // Parents: the most fond pair of adults of parenting age.
    const candidates = adults.filter((p) => p.age >= PARENT_AGE_MIN && p.age <= PARENT_AGE_MAX);
    let best: { a: (typeof alive)[0]; b: (typeof alive)[0]; score: number } | undefined;
    // The player's character can start a family too: what counts is how the
    // townsperson feels about them.
    const heroParent =
      hero &&
      hero.inWorld &&
      hero.playerId &&
      hero.age < hero.deathAge &&
      hero.age >= PARENT_AGE_MIN &&
      hero.age <= PARENT_AGE_MAX
        ? {
            playerId: hero.playerId,
            name: hero.name,
            age: hero.age,
            deathAge: hero.deathAge,
            identity: hero.bio,
          }
        : undefined;
    if (heroParent) {
      for (const a of candidates) {
        const f = data.feelings[`${a.playerId}>${heroParent.playerId}`];
        if (!f) continue;
        const score = 2 * f.affinity + (f.crush ? 80 : 0);
        if (score > 100 && (!best || score > best.score)) best = { a, b: heroParent, score };
      }
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const ab = data.feelings[`${a.playerId}>${b.playerId}`];
        const ba = data.feelings[`${b.playerId}>${a.playerId}`];
        if (!ab || !ba) continue;
        const score = ab.affinity + ba.affinity + (ab.crush && ba.crush ? 80 : 0);
        if (score > 40 && (!best || score > best.score)) best = { a, b, score };
      }
    }
    if (best) {
      await birth(ctx, worldId, data, day, [best.a, best.b]);
    } else if (alive.length < POPULATION_TARGET) {
      // Nobody to raise a family: someone new moves to town instead.
      await birth(ctx, worldId, data, day, []);
    }
  },
});

type Person = { playerId: string; name: string; age: number; deathAge: number; identity: string };

async function die(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  person: { playerId: string; name: string; age: number },
  cause: string,
  day: number,
) {
  await ctx.runMutation(api.aiTown.main.sendInput, {
    worldId,
    name: 'residentDies',
    args: { playerId: person.playerId },
  });
  await ctx.runMutation(internal.life.markDead, {
    worldId,
    playerId: person.playerId,
    day,
    cause,
  });
  const text = `${person.name} died of ${cause} at the age of ${person.age}.`;
  await ctx.runMutation(internal.life.changeEveryonesWellbeing, { worldId, delta: -15 });
  await ctx.runMutation(internal.society.townEvent, { worldId, emoji: '🪦', text });
  await ctx.runAction(internal.life.rememberLifeEvent, {
    worldId,
    text: `${text} The whole town mourns.`,
    importance: 8,
  });
  await ctx.runAction(internal.agent.gathering.considerTownMeeting, {
    worldId,
    reason: `${person.name} has died. The town may want to gather to remember them.`,
  });
}

async function birth(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  data: { people: Person[]; names: string[]; usedCharacters: string[] },
  day: number,
  parents: Person[],
  given?: { name?: string; description?: string },
) {
  const taken = data.names.join(', ');
  const prompt =
    parents.length === 2
      ? `${parents[0].name} (${parents[0].identity}) and ${parents[1].name} ` +
        `(${parents[1].identity}) just had a baby in their small town. Invent the baby: a first ` +
        `name (not ${taken}) and a personality they will grow into, mixing traits from both parents.`
      : `A newcomer is moving into a small town. Invent them: a first name (not ${taken}) and ` +
        `a short personality and backstory.`;
  const { content } = await chatCompletion({
    messages: [
      {
        role: 'user',
        content: `${prompt}\nReply with one line: <Name> | <personality in under 30 words, third person>`,
      },
    ],
    max_tokens: 80,
  });
  let [rawName, rawIdentity] = content.trim().split('\n')[0].split('|');
  if (given?.name) rawName = given.name;
  if (given?.description) rawIdentity = given.description;
  const name = rawName
    ?.replace(/[^A-Za-z' -]/g, '')
    .trim()
    .split(' ')[0];
  if (!name || data.names.includes(name)) {
    console.error(`Couldn't use invented resident: ${content}`);
    return;
  }
  const identity =
    (parents.length === 2
      ? `${name} is the child of ${parents[0].name} and ${parents[1].name}. `
      : `${name} recently moved to town. `) + (rawIdentity ?? '').trim();
  const free = characters.map((c) => c.name).filter((c) => !data.usedCharacters.includes(c));
  const pool = free.length > 0 ? free : characters.map((c) => c.name);
  const character = pool[Math.floor(Math.random() * pool.length)];
  const inputId = await ctx.runMutation(api.aiTown.main.sendInput, {
    worldId,
    name: 'residentBorn',
    args: {
      name,
      character,
      identity,
      plan:
        parents.length === 2 ? 'You want to grow up and find your place.' : 'You want to fit in.',
      child: parents.length === 2,
    },
  });
  // Wait for the engine to create them, to learn their player id.
  let playerId: string | undefined;
  for (let i = 0; i < 60 && !playerId; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status: any = await ctx.runQuery(api.aiTown.main.inputStatus, { inputId });
    if (status?.kind === 'ok') playerId = status.value.playerId;
    if (status?.kind === 'error') throw new Error(status.message);
  }
  if (!playerId) return;
  const startAge = parents.length === 2 ? 0 : Math.round(rand(20, 35));
  await ctx.runMutation(internal.life.addResident, {
    worldId,
    playerId,
    name,
    bornDay: day - startAge / YEARS_PER_DAY,
    deathAge: Math.round(rand(LIFESPAN_MIN, LIFESPAN_MAX)),
    parents: parents.map((p) => p.playerId),
  });
  const text =
    parents.length === 2
      ? `${parents[0].name} and ${parents[1].name} had a baby: ${name}!`
      : `${name} moved to town.`;
  await ctx.runMutation(internal.society.townEvent, {
    worldId,
    emoji: parents.length === 2 ? '👶' : '🧳',
    text,
  });
  await ctx.runAction(internal.life.rememberLifeEvent, { worldId, text, importance: 7 });
  await ctx.runMutation(internal.life.changeEveryonesWellbeing, { worldId, delta: 5 });
  await ctx.runMutation(internal.agent.relationships.seedRelationships, { worldId });
}

export const lifeData = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return null;
    const day = world.clock ? clockState(world.clock.elapsed).day : 0;
    const people: Person[] = [];
    const usedCharacters: string[] = [];
    for (const agent of world.agents) {
      const r = await ctx.db
        .query('residents')
        .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      const pd = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      const ad = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', agent.id))
        .first();
      if (!r || !pd) continue;
      usedCharacters.push(pd.character);
      people.push({
        playerId: agent.playerId,
        name: pd.name,
        age: ageOf(r, day),
        deathAge: r.deathAge,
        identity: (ad?.identity ?? '').split('.')[0],
      });
    }
    const feelings: Record<string, { affinity: number; crush: boolean }> = {};
    const rows = await ctx.db
      .query('relationships')
      .filter((q) => q.eq(q.field('worldId'), worldId))
      .collect();
    for (const row of rows) {
      feelings[`${row.playerId}>${row.otherId}`] = { affinity: row.affinity, crush: row.crush };
    }
    // Every name ever used in this world, so nobody is named after the dead.
    const names = (
      await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId))
        .collect()
    ).map((p) => p.name);
    return { day, people, feelings, names, usedCharacters };
  },
});

// Founders get a random age and lifespan the first time.
export const seedResidents = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return;
    const day = world.clock ? clockState(world.clock.elapsed).day : 0;
    for (const agent of world.agents) {
      const existing = await ctx.db
        .query('residents')
        .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      if (existing) continue;
      const pd = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      const age = rand(START_AGE_MIN, START_AGE_MAX);
      await ctx.db.insert('residents', {
        worldId,
        playerId: agent.playerId,
        name: pd?.name ?? agent.playerId,
        bornDay: day - age / YEARS_PER_DAY,
        deathAge: Math.round(rand(LIFESPAN_MIN, LIFESPAN_MAX)),
      });
    }
  },
});

// Each morning moods ease back toward normal.
export const driftWellbeing = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', worldId))
      .collect();
    for (const r of rows) {
      if (r.diedDay !== undefined) continue;
      const w = r.wellbeing ?? WELLBEING_START;
      const next =
        w < WELLBEING_BASELINE
          ? Math.min(WELLBEING_BASELINE, w + WELLBEING_DRIFT)
          : Math.max(WELLBEING_BASELINE, w - WELLBEING_DRIFT);
      await ctx.db.patch(r._id, { wellbeing: next });
    }
  },
});

export const addResident = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    name: v.string(),
    bornDay: v.number(),
    deathAge: v.number(),
    parents: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('residents', args);
  },
});

export const markDead = internalMutation({
  args: { worldId: v.id('worlds'), playerId: v.string(), day: v.number(), cause: v.string() },
  handler: async (ctx, args) => {
    const r = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (r) await ctx.db.patch(r._id, { diedDay: args.day, cause: args.cause });
  },
});

// Admin console: change someone's age or lifespan.
export const setLife = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId: v.string(),
    age: v.optional(v.number()),
    deathAge: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!r) throw new Error('No age on record yet');
    const world = await ctx.db.get(args.worldId);
    const day = world?.clock ? clockState(world.clock.elapsed).day : 0;
    await ctx.db.patch(r._id, {
      ...(args.age !== undefined ? { bornDay: day - args.age / YEARS_PER_DAY } : {}),
      ...(args.deathAge !== undefined ? { deathAge: args.deathAge } : {}),
    });
  },
});

// Everyone alive remembers a birth or death.
export const rememberLifeEvent = internalAction({
  args: { worldId: v.id('worlds'), text: v.string(), importance: v.number() },
  handler: async (ctx, args) => {
    const agents = await ctx.runQuery(internal.life.livingAgents, { worldId: args.worldId });
    const { embedding } = await fetchEmbedding(args.text);
    for (const a of agents) {
      await ctx.runMutation(internal.agent.memory.insertMemory, {
        agentId: a.agentId,
        playerId: a.playerId,
        description: args.text,
        importance: args.importance,
        lastAccess: Date.now(),
        data: { type: 'gathering', gatheringId: 'life' },
        embedding,
      });
    }
  },
});

export const livingAgents = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    return (world?.agents ?? []).map((a) => ({ agentId: a.id, playerId: a.playerId }));
  },
});

// Ages for the UI (People menu, character pop-up).
export const ages = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return {};
    const day = world.clock ? clockState(world.clock.elapsed).day : 0;
    const rows = await ctx.db
      .query('residents')
      .withIndex('player', (q) => q.eq('worldId', worldId))
      .collect();
    const result: Record<
      string,
      { age: number; deathAge: number; parents: string[]; wellbeing: number }
    > = {};
    for (const r of rows) {
      if (r.diedDay !== undefined) continue;
      result[r.playerId] = {
        age: ageOf(r, day),
        deathAge: r.deathAge,
        parents: r.parents ?? [],
        wellbeing: r.wellbeing ?? WELLBEING_START,
      };
    }
    return result;
  },
});
