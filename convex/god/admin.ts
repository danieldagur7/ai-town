import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import {
  action,
  ActionCtx,
  DatabaseReader,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from '../_generated/server';
import { api, internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';
import { chatCompletion, fetchEmbedding } from '../util/llm';
import { adjustFaith } from './faith';
import { adjustWellbeing } from '../life';
import { getRelationship } from '../agent/relationships';
import { ERAS } from '../aiTown/eras';

// The god's admin console: plain-language commands ("give everyone 20% more
// strength", "make the statue glow") turned into world edits by the model.
export const adminTables = {
  // Stats and lasting facts the god gives a character, plus visual effects.
  traits: defineTable({
    worldId: v.id('worlds'),
    playerId: v.string(),
    stats: v.array(v.object({ name: v.string(), value: v.number() })),
    notes: v.array(v.string()),
    effects: v.array(v.string()),
  }).index('player', ['worldId', 'playerId']),
  adminLog: defineTable({
    worldId: v.id('worlds'),
    command: v.string(),
    reply: v.string(),
    applied: v.array(v.string()),
  }).index('worldId', ['worldId']),
};

export const EFFECTS = ['glow', 'sparkle', 'giant', 'tiny'] as const;

export async function traitsOf(db: DatabaseReader, worldId: Id<'worlds'>, playerId: string) {
  return await db
    .query('traits')
    .withIndex('player', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
}

// For prompts: what the god has made of them.
export async function traitsPrompt(db: DatabaseReader, worldId: Id<'worlds'>, playerId: string) {
  const t = await traitsOf(db, worldId, playerId);
  if (!t) return '';
  const stats = t.stats.map((st) => `${st.name} ${st.value} (normal is 100)`);
  const parts = [];
  if (stats.length > 0) parts.push(`Your god-given traits: ${stats.join(', ')}.`);
  if (t.notes.length > 0) parts.push(`About you, by the god's hand: ${t.notes.join(' ')}`);
  if (t.effects.includes('glow')) parts.push('You glow with a soft holy light, and people notice.');
  if (t.effects.includes('giant')) parts.push('The god has made you a giant, twice normal size.');
  if (t.effects.includes('tiny')) parts.push('The god has made you tiny, half normal size.');
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

type Op = Record<string, any>;

export const runCommand = action({
  args: { worldId: v.id('worlds'), command: v.string() },
  handler: async (ctx, { worldId, command }): Promise<{ reply: string; applied: string[] }> =>
    await runAdmin(ctx, worldId, command),
});

// When the god grants a prayer, the model works out what that means in game
// terms (small, believable blessings) and the game applies it.
const PRAYER_OPS = [
  'stat',
  'note',
  'effect',
  'resources',
  'memory',
  'feeling',
  'wellbeing',
  'age',
  'announce',
];
export const grantPrayer = internalAction({
  args: { worldId: v.id('worlds'), name: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await runAdmin(
      ctx,
      args.worldId,
      `The god grants this prayer by ${args.name}: "${args.text}". Make it come true in a small, ` +
        `believable way (a blessing, not a spectacle). Use one or two operations.`,
      PRAYER_OPS,
    );
  },
});

async function runAdmin(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  command: string,
  allowed?: string[],
): Promise<{ reply: string; applied: string[] }> {
  {
    const world = await ctx.runQuery(internal.god.admin.adminContext, { worldId });
    const prompt = [
      "You are the admin console of a life-simulation town game. The player (the town's god) " +
        'types a command; you turn it into a list of operations. Use only these operations:',
      '{"op":"stat","who":"<name or everyone>","stat":"<e.g. strength, health, intelligence, charm, luck>","set":<number>} or with "percent":<+/- number> or "add":<number>. Normal is 100.',
      '{"op":"note","who":"<name or everyone>","text":"<a lasting fact about them, e.g. They can now speak to animals.>"}',
      '{"op":"effect","target":"<character name, everyone, or a building name>","effect":"glow|sparkle|giant|tiny","on":true|false}',
      '{"op":"resources","wood":<n>,"stone":<n>,"food":<n>,"mode":"add|set"} (any subset)',
      '{"op":"memory","who":"<name or everyone>","text":"<something they now remember or believe, first person>"}',
      '{"op":"feeling","who":"<name>","other":"<name>","affinity":<-100..100>} and/or "crush":true|false',
      '{"op":"faith","who":"<name or everyone>","set":<0..100>}',
      '{"op":"wellbeing","who":"<name or everyone>","add":<-50..50>}',
      '{"op":"age","who":"<name>","age":<years>} and/or "lifespan":<age they will die at>',
      '{"op":"die","who":"<name>","cause":"<cause>"}',
      '{"op":"newcomer","name":"<name>","description":"<personality>"}',
      '{"op":"build","name":"<building>","look":"<what it looks like>"}',
      '{"op":"finish_build"}',
      '{"op":"era","era":<0..5>} (eras: ' + ERAS.map((e, i) => `${i} ${e.name}`).join(', ') + ')',
      '{"op":"decree","text":"<a command from the god to the town>"}',
      '{"op":"announce","text":"<news everyone hears>","emoji":"<emoji>"}',
      '',
      'The world right now:',
      `Era: ${ERAS[world.era].name}. Stockpile: wood ${world.resources.wood}, stone ${world.resources.stone}, food ${world.resources.food}.`,
      `Townspeople: ${world.people.map((p) => `${p.name}${p.stats ? ` (${p.stats})` : ''}`).join('; ')}.`,
      `Buildings: ${world.buildings.join(', ') || 'none'}.`,
      world.project ? `Being built: ${world.project}.` : '',
      '',
      `Command: ${command}`,
      'Reply with JSON only: {"reply":"<one short sentence to the god about what happened>","ops":[...]}. ' +
        "If the command can't be done with these operations, use the closest ones (a note or memory " +
        'often works) and say so in the reply.',
    ];
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt.filter((l) => l !== null).join('\n') }],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    } as any);
    let parsed: { reply?: string; ops?: Op[] };
    try {
      parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    } catch {
      return {
        reply: "Sorry, I couldn't understand that. Try saying it differently.",
        applied: [],
      };
    }
    const applied: string[] = [];
    const nameToId = new Map(world.people.map((p) => [p.name.toLowerCase(), p.playerId]));
    const whoIds = (who: unknown) => {
      const w = String(who ?? '')
        .toLowerCase()
        .trim();
      if (w === 'everyone' || w === 'all' || w === 'everybody')
        return world.people.map((p) => p.playerId);
      const id = nameToId.get(w);
      return id ? [id] : [];
    };
    const send = (name: string, args: any) =>
      ctx.runMutation(api.aiTown.main.sendInput, { worldId, name: name as any, args });
    for (const op of (parsed.ops ?? []).filter((o) => !allowed || allowed.includes(o.op))) {
      for (const k of [
        'set',
        'percent',
        'add',
        'affinity',
        'age',
        'lifespan',
        'era',
        'wood',
        'stone',
        'food',
      ]) {
        if (typeof op[k] === 'string' && op[k].trim() !== '' && !isNaN(Number(op[k]))) {
          op[k] = Number(op[k]);
        }
      }
      try {
        switch (op.op) {
          case 'stat':
          case 'note':
          case 'effect':
          case 'faith':
          case 'wellbeing':
          case 'feeling': {
            if (op.op === 'effect' && !whoIds(op.target).length) {
              // Not a person: a building.
              const ok = await send('structureEffect', {
                name: String(op.target),
                effect: String(op.effect),
                on: op.on !== false,
              });
              if (ok)
                applied.push(
                  `${op.on === false ? 'removed' : 'added'} ${op.effect} on ${op.target}`,
                );
              break;
            }
            const ids = whoIds(op.who ?? op.target);
            const otherIds = op.other ? whoIds(op.other) : [];
            if (ids.length === 0) throw new Error(`no one called ${op.who ?? op.target}`);
            await ctx.runMutation(internal.god.admin.applyPersonOp, {
              worldId,
              op: JSON.stringify(op),
              playerIds: ids,
              otherId: otherIds[0],
            });
            applied.push(describe(op));
            break;
          }
          case 'memory': {
            const ids = whoIds(op.who);
            for (const playerId of ids) {
              await ctx.runAction(internal.god.admin.plantMemory, {
                worldId,
                playerId,
                text: String(op.text),
              });
            }
            if (ids.length) applied.push(`${op.who} now remember: ${op.text}`);
            break;
          }
          case 'resources': {
            const r = { ...world.resources };
            for (const k of ['wood', 'stone', 'food'] as const) {
              if (typeof op[k] === 'number') r[k] = op.mode === 'set' ? op[k] : r[k] + op[k];
            }
            await send('setResources', r);
            applied.push(`stockpile: wood ${r.wood}, stone ${r.stone}, food ${r.food}`);
            break;
          }
          case 'age': {
            const [id] = whoIds(op.who);
            if (!id) throw new Error(`no one called ${op.who}`);
            await ctx.runMutation(internal.life.setLife, {
              worldId,
              playerId: id,
              age: typeof op.age === 'number' ? op.age : undefined,
              deathAge: typeof op.lifespan === 'number' ? op.lifespan : undefined,
            });
            applied.push(describe(op));
            break;
          }
          case 'die': {
            const [id] = whoIds(op.who);
            if (!id) throw new Error(`no one called ${op.who}`);
            await ctx.runAction(internal.life.godKills, {
              worldId,
              playerId: id,
              cause: String(op.cause || "the god's will"),
            });
            applied.push(`${op.who} died (${op.cause})`);
            break;
          }
          case 'newcomer': {
            await ctx.runAction(internal.life.addNewcomer, {
              worldId,
              name: op.name ? String(op.name) : undefined,
              description: op.description ? String(op.description) : undefined,
            });
            applied.push(`${op.name ?? 'someone new'} moved to town`);
            break;
          }
          case 'build':
            await send('startProject', {
              name: String(op.name),
              subject: op.look ? String(op.look) : undefined,
            });
            applied.push(`started building ${op.name}`);
            break;
          case 'finish_build':
            await send('addProjectWork', { shifts: 1000 });
            applied.push('finished the current building');
            break;
          case 'era':
            await send('setEra', { era: Number(op.era) });
            applied.push(`era set to ${ERAS[Number(op.era)]?.name ?? op.era}`);
            break;
          case 'decree':
            await ctx.runMutation(api.god.decrees.issueDecree, { worldId, text: String(op.text) });
            applied.push(`decreed: ${op.text}`);
            break;
          case 'announce':
            await ctx.runMutation(internal.society.townEvent, {
              worldId,
              emoji: String(op.emoji || '📢'),
              text: String(op.text),
            });
            await ctx.runAction(internal.life.rememberLifeEvent, {
              worldId,
              text: String(op.text),
              importance: 6,
            });
            applied.push(`announced: ${op.text}`);
            break;
          default:
            applied.push(`skipped unknown operation ${op.op}`);
        }
      } catch (e: any) {
        applied.push(`couldn't ${op.op}: ${e.message ?? e}`);
      }
    }
    const reply = parsed.reply ?? 'Done.';
    await ctx.runMutation(internal.god.admin.logCommand, { worldId, command, reply, applied });
    return { reply, applied };
  }
}

function describe(op: Op) {
  switch (op.op) {
    case 'stat':
      return `${op.who}: ${op.stat} ${op.set ?? (op.percent !== undefined ? `${op.percent > 0 ? '+' : ''}${op.percent}%` : `${op.add > 0 ? '+' : ''}${op.add}`)}`;
    case 'note':
      return `${op.who}: ${op.text}`;
    case 'effect':
      return `${op.on === false ? 'removed' : 'added'} ${op.effect} on ${op.target}`;
    case 'faith':
      return `${op.who}: faith ${op.set}`;
    case 'wellbeing':
      return `${op.who}: wellbeing ${op.add > 0 ? '+' : ''}${op.add}`;
    case 'feeling':
      return `${op.who} → ${op.other}: ${op.affinity !== undefined ? `affinity ${op.affinity}` : ''}${op.crush !== undefined ? ` crush ${op.crush}` : ''}`;
    case 'age':
      return `${op.who}: ${op.age !== undefined ? `age ${op.age}` : ''} ${op.lifespan !== undefined ? `lives to ${op.lifespan}` : ''}`;
    default:
      return op.op;
  }
}

export const applyPersonOp = internalMutation({
  args: {
    worldId: v.id('worlds'),
    op: v.string(),
    playerIds: v.array(v.string()),
    otherId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const op: Op = JSON.parse(args.op);
    // Models often send numbers as strings ("+20").
    for (const k of ['set', 'percent', 'add', 'affinity']) {
      if (typeof op[k] === 'string' && op[k].trim() !== '' && !isNaN(Number(op[k]))) {
        op[k] = Number(op[k]);
      }
    }
    for (const playerId of args.playerIds) {
      if (op.op === 'faith') {
        const row = await ctx.db
          .query('faith')
          .withIndex('playerId', (q) => q.eq('worldId', args.worldId).eq('playerId', playerId))
          .first();
        const target = Math.max(0, Math.min(100, Number(op.set)));
        await adjustFaith(ctx.db, args.worldId, playerId, target - (row?.score ?? 50));
        continue;
      }
      if (op.op === 'wellbeing') {
        await adjustWellbeing(ctx, args.worldId, playerId, Number(op.add) || 0);
        continue;
      }
      if (op.op === 'feeling') {
        if (!args.otherId) throw new Error(`no one called ${op.other}`);
        const rel = await getRelationship(ctx.db, args.worldId, playerId, args.otherId);
        if (!rel) throw new Error('they have not met yet');
        await ctx.db.patch(rel._id, {
          ...(typeof op.affinity === 'number'
            ? { affinity: Math.max(-100, Math.min(100, op.affinity)) }
            : {}),
          ...(typeof op.crush === 'boolean' ? { crush: op.crush } : {}),
        });
        continue;
      }
      let t = await traitsOf(ctx.db, args.worldId, playerId);
      if (!t) {
        const id = await ctx.db.insert('traits', {
          worldId: args.worldId,
          playerId,
          stats: [],
          notes: [],
          effects: [],
        });
        t = (await ctx.db.get(id))!;
      }
      if (op.op === 'stat') {
        const key = String(op.stat).toLowerCase().trim();
        const cur = t.stats.find((st) => st.name === key)?.value ?? 100;
        const next =
          typeof op.set === 'number'
            ? op.set
            : typeof op.percent === 'number'
              ? cur * (1 + op.percent / 100)
              : cur + (Number(op.add) || 0);
        await ctx.db.patch(t._id, {
          stats: [
            ...t.stats.filter((st) => st.name !== key),
            { name: key, value: Math.max(0, Math.round(next)) },
          ],
        });
      } else if (op.op === 'note') {
        await ctx.db.patch(t._id, { notes: [...t.notes, String(op.text)].slice(-5) });
      } else if (op.op === 'effect') {
        const effect = String(op.effect);
        const effects = t.effects.filter((e) => e !== effect);
        if (op.on !== false) effects.push(effect);
        await ctx.db.patch(t._id, { effects });
      }
    }
  },
});

export const plantMemory = internalAction({
  args: { worldId: v.id('worlds'), playerId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const agents = await ctx.runQuery(internal.life.livingAgents, { worldId: args.worldId });
    const agent = agents.find((a) => a.playerId === args.playerId);
    if (!agent) return;
    const { embedding } = await fetchEmbedding(args.text);
    await ctx.runMutation(internal.agent.memory.insertMemory, {
      agentId: agent.agentId,
      playerId: agent.playerId,
      description: args.text,
      importance: 8,
      lastAccess: Date.now(),
      data: { type: 'gathering', gatheringId: 'god' },
      embedding,
    });
  },
});

export const adminContext = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) throw new Error('No world');
    const people = [];
    for (const agent of world.agents) {
      const pd = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', agent.playerId))
        .first();
      const t = await traitsOf(ctx.db, worldId, agent.playerId);
      people.push({
        playerId: agent.playerId,
        name: pd?.name ?? agent.playerId,
        stats: t ? t.stats.map((st) => `${st.name} ${st.value}`).join(', ') : '',
      });
    }
    return {
      era: world.era ?? 0,
      resources: {
        wood: Math.floor(world.resources?.wood ?? 0),
        stone: Math.floor(world.resources?.stone ?? 0),
        food: Math.floor(world.resources?.food ?? 0),
      },
      people,
      buildings: (world.structures ?? []).map((s) => s.name),
      project: world.project?.name,
    };
  },
});

export const logCommand = internalMutation({
  args: {
    worldId: v.id('worlds'),
    command: v.string(),
    reply: v.string(),
    applied: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('adminLog', args);
  },
});

export const recentCommands = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) =>
    await ctx.db
      .query('adminLog')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(8),
});

// Visual effects per character, for the map.
export const characterEffects = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const rows = await ctx.db
      .query('traits')
      .withIndex('player', (q) => q.eq('worldId', worldId))
      .collect();
    const result: Record<string, string[]> = {};
    for (const r of rows) if (r.effects.length > 0) result[r.playerId] = r.effects;
    return result;
  },
});
