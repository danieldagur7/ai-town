export const ACTION_TIMEOUT = 120_000; // more time for local dev
// export const ACTION_TIMEOUT = 60_000;// normally fine

export const IDLE_WORLD_TIMEOUT = 5 * 60 * 1000;
export const WORLD_HEARTBEAT_INTERVAL = 60 * 1000;

export const MAX_STEP = 10 * 60 * 1000;
export const TICK = 16;
export const STEP_INTERVAL = 1000;

export const PATHFINDING_TIMEOUT = 60 * 1000;
export const PATHFINDING_BACKOFF = 1000;
export const CONVERSATION_DISTANCE = 1.3;
export const MIDPOINT_THRESHOLD = 4;
export const TYPING_TIMEOUT = 15 * 1000;
export const COLLISION_THRESHOLD = 0.75;

// How many human players can be in a world at once.
export const MAX_HUMAN_PLAYERS = 8;

// Don't talk to anyone for 15s after having a conversation.
export const CONVERSATION_COOLDOWN = 15000;

// Don't do another activity for 10s after doing one.
export const ACTIVITY_COOLDOWN = 10_000;

// Don't talk to a player within 60s of talking to them.
export const PLAYER_CONVERSATION_COOLDOWN = 60000;

// Invite 80% of invites that come from other agents.
export const INVITE_ACCEPT_PROBABILITY = 0.8;

// Wait for 1m for invites to be accepted.
export const INVITE_TIMEOUT = 60000;

// Wait for another player to say something before jumping in.
export const AWKWARD_CONVERSATION_TIMEOUT = 60_000; // more time locally
// export const AWKWARD_CONVERSATION_TIMEOUT = 20_000;

// Leave a conversation after participating too long.
export const MAX_CONVERSATION_DURATION = 10 * 60_000; // more time locally
// export const MAX_CONVERSATION_DURATION = 2 * 60_000;

// Leave a conversation if it has more than 8 messages;
export const MAX_CONVERSATION_MESSAGES = 8;

// Wait for 1s after sending an input to the engine. We can remove this
// once we can await on an input being processed.
export const INPUT_DELAY = 1000;

// How many memories to get from the agent's memory.
// This is over-fetched by 10x so we can prioritize memories by more than relevance.
export const NUM_MEMORIES_TO_SEARCH = 1;

// Wait for at least two seconds before sending another message.
export const MESSAGE_COOLDOWN = 2000;

// Don't run a turn of the agent more than once a second.
export const AGENT_WAKEUP_THRESHOLD = 1000;

// How old we let memories be before we vacuum them
export const VACUUM_MAX_AGE = 2 * 7 * 24 * 60 * 60 * 1000;
export const DELETE_BATCH_SIZE = 64;

export const HUMAN_IDLE_TOO_LONG = 5 * 60 * 1000;

export const ACTIVITIES = [
  { description: 'reading a book', emoji: '📖', duration: 60_000 },
  { description: 'daydreaming', emoji: '🤔', duration: 60_000 },
  { description: 'gardening', emoji: '🥕', duration: 60_000 },
];

export const ENGINE_ACTION_DURATION = 30000;

// Bound the number of pathfinding searches we do per game step.
export const MAX_PATHFINDS_PER_STEP = 16;

export const DEFAULT_NAME = 'Me';

// Day/night clock. Real milliseconds spent in each phase; a full day
// is their sum (8 minutes by default). The clock only runs while the engine does.
export const MORNING_DURATION = 90_000;
export const DAY_DURATION = 180_000;
export const EVENING_DURATION = 90_000;
export const NIGHT_DURATION = 120_000;

// Agents stop starting new conversations for the last part of the evening.
export const EVENING_WIND_DOWN = 45_000;

// Agents start walking to bed at the wind-down. If one hasn't arrived this long
// after setting off, it sleeps where it stands.
export const BED_WALK_TIMEOUT = 90_000;

// Cap on how far the clock moves in one tick, so restarting a stopped world
// doesn't skip ahead.
export const MAX_CLOCK_TICK = 1000;

// God mode: prayers and faith. Faith runs from 0 to FAITH_MAX per character.
export const FAITH_MAX = 100;
export const FAITH_START = 50;
export const FAITH_ANSWERED = 10;
export const FAITH_IGNORED = -10;
// A prayer stuck generating this long (e.g. its action crashed) is given up on.
export const PRAYER_GENERATION_TIMEOUT = 5 * 60_000;
// How many recent memories a prayer draws on, and how much of each.
export const PRAYER_RECENT_MEMORIES = 5;
export const PRAYER_MEMORY_CHARS = 300;
// Importance of the memory a character gets when its prayer is answered or not.
export const PRAYER_ANSWERED_IMPORTANCE = 8;
export const PRAYER_DECLINED_IMPORTANCE = 6;
