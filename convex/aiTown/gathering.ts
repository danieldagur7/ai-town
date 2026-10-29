import { Infer, v } from 'convex/values';
import { Game } from './game';
import { GameId, parseGameId, playerId } from './ids';
import { inputHandler } from './inputHandler';
import { Player } from './player';
import { blocked, movePlayer, stopPlayer } from './movement';
import { distance } from '../util/geometry';
import { clockState, isSleepTime } from './clock';
import { PLAZA } from '../../data/town';
import {
  GATHER_ARRIVE_TIMEOUT,
  GATHER_MESSAGE_GAP,
  GROUP_MAX_MESSAGES,
  MEETING_MAX_MESSAGES,
} from '../constants';

// Group conversations and town meetings: 3+ characters talking together, taking
// turns. Kept apart from the engine's 2-person conversations.
export const serializedGathering = v.object({
  // Allocated as a conversation id so messages can live in the messages table.
  id: v.string(),
  kind: v.union(v.literal('meeting'), v.literal('group')),
  topic: v.string(),
  caller: playerId,
  location: v.object({ x: v.number(), y: v.number() }),
  participants: v.array(playerId),
  status: v.union(v.literal('gathering'), v.literal('talking')),
  created: v.number(),
  numMessages: v.number(),
  lastMessage: v.optional(v.object({ author: playerId, timestamp: v.number() })),
  // Whoever is writing the next line right now.
  speaking: v.optional(playerId),
});
export type Gathering = Infer<typeof serializedGathering>;

export function playerGathering(game: Game, id: string) {
  return game.world.gatherings.find((g) => g.participants.includes(id));
}

// A free tile on a ring around the gathering spot, one per participant.
function spotFor(game: Game, gathering: Gathering, player: Player) {
  const i = gathering.participants.indexOf(player.id);
  const n = gathering.participants.length;
  const ring = gathering.kind === 'meeting' ? 2.5 : 1.5;
  for (let extra = 0; extra < 4; extra++) {
    const angle = (2 * Math.PI * i) / n + extra * 0.4;
    const spot = {
      x: Math.round(gathering.location.x + Math.cos(angle) * (ring + extra)),
      y: Math.round(gathering.location.y + Math.sin(angle) * (ring + extra)),
    };
    if (!blocked(game, Date.now(), spot, player.id)) {
      return spot;
    }
  }
  return { x: Math.round(gathering.location.x), y: Math.round(gathering.location.y) };
}

function arrived(gathering: Gathering, player: Player) {
  const ring = gathering.kind === 'meeting' ? 4.5 : 3;
  return !player.pathfinding && distance(player.position, gathering.location) <= ring;
}

// Called from Agent.tick for an agent that's in a gathering and not in a 1:1
// conversation: walk over, then stand still and listen.
export function tickGatheringMember(game: Game, now: number, gathering: Gathering, player: Player) {
  if (!arrived(gathering, player)) {
    const spot = spotFor(game, gathering, player);
    const dest = player.pathfinding?.destination;
    if (!dest || dest.x !== spot.x || dest.y !== spot.y) {
      movePlayer(game, now, player, spot);
    }
  } else if (player.activity && player.activity.until > now) {
    player.activity.until = now;
  }
}

function end(game: Game, gathering: Gathering) {
  console.log(`Gathering ${gathering.id} (${gathering.topic}) ended`);
  game.world.gatherings = game.world.gatherings.filter((g) => g.id !== gathering.id);
  if (gathering.numMessages > 0) {
    game.scheduleOperation('rememberGathering', {
      worldId: game.worldId,
      gatheringId: gathering.id,
      kind: gathering.kind,
      topic: gathering.topic,
      participants: gathering.participants.map((id) => ({
        playerId: id,
        agentId: [...game.world.agents.values()].find((a) => a.playerId === id)?.id,
      })),
    });
  }
}

// Runs every tick: start talking once people have arrived, pick who speaks
// next, and wrap up. Once each day, asks whether anyone wants a town meeting.
export function tickGatherings(game: Game, now: number) {
  const clock = game.world.clock && clockState(game.world.clock.elapsed);
  if (clock && clock.phase === 'day' && game.world.lastMeetingCheckDay !== clock.day) {
    game.world.lastMeetingCheckDay = clock.day;
    game.scheduleOperation('considerTownMeeting', { worldId: game.worldId });
    // Make sure every pair of townspeople has a relationship (new characters, resets).
    game.scheduleOperation('seedRelationships', { worldId: game.worldId });
  }
  for (const gathering of [...game.world.gatherings]) {
    // Drop anyone who has left the world.
    gathering.participants = gathering.participants.filter((id) =>
      game.world.players.has(id as GameId<'players'>),
    );
    const max = gathering.kind === 'meeting' ? MEETING_MAX_MESSAGES : GROUP_MAX_MESSAGES;
    if (
      gathering.participants.length < 2 ||
      isSleepTime(game.world) ||
      (gathering.numMessages >= max && !gathering.speaking)
    ) {
      end(game, gathering);
      continue;
    }
    const here = gathering.participants.filter((id) => {
      const p = game.world.players.get(id as GameId<'players'>)!;
      return arrived(gathering, p) && !game.world.playerConversation(p);
    });
    if (gathering.status === 'gathering') {
      const everyone = here.length === gathering.participants.length;
      if (everyone || (now > gathering.created + GATHER_ARRIVE_TIMEOUT && here.length >= 2)) {
        console.log(`Gathering ${gathering.id} starts talking with ${here.length} people`);
        gathering.status = 'talking';
      }
      continue;
    }
    if (gathering.speaking) {
      // The speaker's operation timed out or failed: let someone else talk.
      const speaker = [...game.world.agents.values()].find(
        (a) => a.playerId === gathering.speaking,
      );
      if (speaker?.inProgressOperation?.name !== 'agentGatheringMessage') {
        delete gathering.speaking;
      }
      continue;
    }
    if (gathering.numMessages >= max) {
      continue;
    }
    if (gathering.lastMessage && now < gathering.lastMessage.timestamp + GATHER_MESSAGE_GAP) {
      continue;
    }
    // The caller opens (waiting for them if they're here but busy); after that,
    // anyone present except whoever spoke last.
    if (gathering.numMessages === 0 && here.includes(gathering.caller)) {
      const caller = [...game.world.agents.values()].find((a) => a.playerId === gathering.caller);
      if (caller?.inProgressOperation) {
        continue;
      }
    }
    const candidates = here.filter((id) => {
      const agent = [...game.world.agents.values()].find((a) => a.playerId === id);
      return agent && !agent.inProgressOperation && id !== gathering.lastMessage?.author;
    });
    const speakerId =
      gathering.numMessages === 0 && candidates.includes(gathering.caller)
        ? gathering.caller
        : candidates[Math.floor(Math.random() * candidates.length)];
    if (!speakerId) {
      continue;
    }
    const agent = [...game.world.agents.values()].find((a) => a.playerId === speakerId)!;
    gathering.speaking = speakerId;
    agent.startOperation(game, now, 'agentGatheringMessage', {
      worldId: game.worldId,
      playerId: speakerId,
      agentId: agent.id,
      gatheringId: gathering.id,
      messageUuid: crypto.randomUUID(),
    });
  }
}

// Starts a gathering, unless someone involved is already busy with one.
export function startGathering(
  game: Game,
  now: number,
  kind: Gathering['kind'],
  caller: Player,
  others: Player[],
  topic: string,
) {
  const people = [caller, ...others].filter(
    (p) => !playerGathering(game, p.id) && !game.world.playerConversation(p),
  );
  if (!people.includes(caller) || people.length < 3) {
    return null;
  }
  const location =
    kind === 'meeting'
      ? { x: PLAZA.x + Math.floor(PLAZA.w / 2), y: PLAZA.y + Math.floor(PLAZA.h / 2) }
      : { x: Math.round(caller.position.x), y: Math.round(caller.position.y) };
  const gathering: Gathering = {
    id: game.allocId('conversations'),
    kind,
    topic,
    caller: caller.id,
    location,
    participants: people.map((p) => p.id),
    status: 'gathering',
    created: now,
    numMessages: 0,
  };
  game.world.gatherings.push(gathering);
  for (const p of people) {
    stopPlayer(p);
  }
  console.log(`${caller.id} started a ${kind} (${gathering.id}) about "${topic}"`);
  return gathering;
}

export const gatheringInputs = {
  // An agent calls a town meeting on the plaza. At most one per game day.
  callMeeting: inputHandler({
    args: { callerId: playerId, topic: v.string() },
    handler: (game, now, args) => {
      const clock = game.world.clock && clockState(game.world.clock.elapsed);
      const day = clock ? clock.day : 0;
      // Meetings happen in the morning or daytime, at most once a day.
      if (
        game.world.lastMeetingDay === day ||
        (clock && clock.phase !== 'morning' && clock.phase !== 'day')
      ) {
        return null;
      }
      if (game.world.gatherings.some((g) => g.kind === 'meeting')) {
        return null;
      }
      const caller = game.world.players.get(parseGameId('players', args.callerId));
      if (!caller) {
        return null;
      }
      const everyone = [...game.world.agents.values()]
        .map((a) => game.world.players.get(a.playerId)!)
        .filter((p) => p && p.id !== caller.id);
      // Characters busy in a 1:1 chat finish it first, then come along.
      for (const p of everyone) {
        const g = playerGathering(game, p.id);
        if (g && g.kind === 'group') {
          g.participants = g.participants.filter((id) => id !== p.id);
        }
      }
      const callerGroup = playerGathering(game, caller.id);
      if (callerGroup) {
        callerGroup.participants = callerGroup.participants.filter((id) => id !== caller.id);
      }
      const location = {
        x: PLAZA.x + Math.floor(PLAZA.w / 2),
        y: PLAZA.y + Math.floor(PLAZA.h / 2),
      };
      const meeting: Gathering = {
        id: game.allocId('conversations'),
        kind: 'meeting',
        topic: args.topic,
        caller: caller.id,
        location,
        participants: [caller.id, ...everyone.map((p) => p.id)],
        status: 'gathering',
        created: now,
        numMessages: 0,
      };
      game.world.gatherings.push(meeting);
      game.world.lastMeetingDay = day;
      console.log(`${caller.id} called a town meeting (${meeting.id}) about "${args.topic}"`);
      return meeting.id;
    },
  }),
  gatheringMessageSent: inputHandler({
    args: {
      gatheringId: v.string(),
      agentId: v.string(),
      operationId: v.string(),
      timestamp: v.number(),
    },
    handler: (game, now, args) => {
      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      if (agent?.inProgressOperation?.operationId === args.operationId) {
        delete agent.inProgressOperation;
      }
      const gathering = game.world.gatherings.find((g) => g.id === args.gatheringId);
      if (!gathering) {
        return null;
      }
      delete gathering.speaking;
      if (agent) {
        gathering.numMessages += 1;
        gathering.lastMessage = { author: agent.playerId, timestamp: args.timestamp };
      }
      return null;
    },
  }),
};
