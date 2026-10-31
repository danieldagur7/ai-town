import { ObjectType, v } from 'convex/values';
import { Conversation, serializedConversation } from './conversation';
import { Player, serializedPlayer } from './player';
import { Agent, serializedAgent } from './agent';
import { GameId, parseGameId, playerId } from './ids';
import { parseMap } from '../util/object';
import { Clock, serializedClock } from './clock';
import { Gathering, serializedGathering } from './gathering';
import { START_RESOURCES } from '../constants';
import { Project, Structure, serializedProject, serializedStructure } from './project';

export const historicalLocations = v.array(
  v.object({
    playerId,
    location: v.bytes(),
  }),
);

export const serializedWorld = {
  nextId: v.number(),
  conversations: v.array(v.object(serializedConversation)),
  players: v.array(v.object(serializedPlayer)),
  agents: v.array(v.object(serializedAgent)),
  historicalLocations: v.optional(historicalLocations),
  clock: v.optional(serializedClock),
  // The town's shared stockpile.
  resources: v.optional(v.object({ wood: v.number(), stone: v.number(), food: v.number() })),
  // Group conversations and town meetings in progress.
  gatherings: v.optional(v.array(serializedGathering)),
  lastMeetingDay: v.optional(v.number()),
  lastMeetingCheckDay: v.optional(v.number()),
  lastMorningDay: v.optional(v.number()),
  // Someone has found the wild Coca Loca bushes (substances.ts).
  cocaKnown: v.optional(v.boolean()),
  // Mornings in a row without enough food.
  hungryDays: v.optional(v.number()),
  // The town's building project (the statue), in progress or finished.
  project: v.optional(serializedProject),
  // Finished buildings, and the era the town is in (index into ERAS).
  structures: v.optional(v.array(serializedStructure)),
  era: v.optional(v.number()),
  // Where and when the god last struck someone with lightning, for the UI.
  godSmite: v.optional(v.object({ x: v.number(), y: v.number(), time: v.number() })),
  // Where and when the manifested god last spoke to the town, for the UI pulse.
  godSpeech: v.optional(
    v.object({ x: v.number(), y: v.number(), radius: v.number(), time: v.number() }),
  ),
};
export type SerializedWorld = ObjectType<typeof serializedWorld>;

export class World {
  nextId: number;
  conversations: Map<GameId<'conversations'>, Conversation>;
  players: Map<GameId<'players'>, Player>;
  agents: Map<GameId<'agents'>, Agent>;
  historicalLocations?: Map<GameId<'players'>, ArrayBuffer>;
  clock?: Clock;
  godSpeech?: { x: number; y: number; radius: number; time: number };
  godSmite?: { x: number; y: number; time: number };
  gatherings: Gathering[];
  resources: { wood: number; stone: number; food: number };
  lastMeetingDay?: number;
  lastMeetingCheckDay?: number;
  lastMorningDay?: number;
  cocaKnown?: boolean;
  hungryDays?: number;
  project?: Project;
  structures: Structure[];
  era: number;

  constructor(serialized: SerializedWorld) {
    const { nextId, historicalLocations, clock, godSpeech, godSmite } = serialized;

    this.nextId = nextId;
    this.clock = clock;
    this.godSpeech = godSpeech;
    this.godSmite = godSmite;
    this.gatherings = serialized.gatherings ?? [];
    this.resources = serialized.resources ?? { ...START_RESOURCES };
    this.lastMeetingDay = serialized.lastMeetingDay;
    this.lastMeetingCheckDay = serialized.lastMeetingCheckDay;
    this.lastMorningDay = serialized.lastMorningDay;
    this.cocaKnown = serialized.cocaKnown;
    this.hungryDays = serialized.hungryDays;
    this.project = serialized.project;
    this.structures = serialized.structures ?? [];
    this.era = serialized.era ?? 0;
    this.conversations = parseMap(serialized.conversations, Conversation, (c) => c.id);
    this.players = parseMap(serialized.players, Player, (p) => p.id);
    this.agents = parseMap(serialized.agents, Agent, (a) => a.id);

    if (historicalLocations) {
      this.historicalLocations = new Map();
      for (const { playerId, location } of historicalLocations) {
        this.historicalLocations.set(parseGameId('players', playerId), location);
      }
    }
  }

  playerConversation(player: Player): Conversation | undefined {
    return [...this.conversations.values()].find((c) => c.participants.has(player.id));
  }

  // The conversation or gathering a human is talking in right now, if any. The
  // AI model runs on one graphics chip, so while you talk the rest of the town
  // holds its next line and your reply gets the chip to itself.
  humanTalkingIn(): string | undefined {
    const human = (id: string) => !!this.players.get(id as GameId<'players'>)?.human;
    for (const c of this.conversations.values()) {
      const members = [...c.participants.entries()];
      if (
        members.some(([id]) => human(id)) &&
        members.every(([, m]) => m.status.kind === 'participating')
      ) {
        return c.id;
      }
    }
    return this.gatherings.find(
      (g) => g.status === 'talking' && g.participants.some((id) => human(id)),
    )?.id;
  }

  serialize(): SerializedWorld {
    return {
      nextId: this.nextId,
      conversations: [...this.conversations.values()].map((c) => c.serialize()),
      players: [...this.players.values()].map((p) => p.serialize()),
      agents: [...this.agents.values()].map((a) => a.serialize()),
      historicalLocations:
        this.historicalLocations &&
        [...this.historicalLocations.entries()].map(([playerId, location]) => ({
          playerId,
          location,
        })),
      clock: this.clock,
      godSpeech: this.godSpeech,
      godSmite: this.godSmite,
      gatherings: this.gatherings,
      resources: this.resources,
      lastMeetingDay: this.lastMeetingDay,
      lastMeetingCheckDay: this.lastMeetingCheckDay,
      lastMorningDay: this.lastMorningDay,
      cocaKnown: this.cocaKnown,
      hungryDays: this.hungryDays,
      project: this.project,
      structures: this.structures,
      era: this.era,
    };
  }
}
