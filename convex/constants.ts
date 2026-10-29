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

// Don't talk to anyone for 45s after having a conversation (keeps the LLM queue short).
export const CONVERSATION_COOLDOWN = 45_000;

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

// Leave a conversation if it has more than 6 messages;
export const MAX_CONVERSATION_MESSAGES = 6;

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

// `risk` is the chance one go at it kills them; injuries are INJURY_FACTOR
// times as likely. Risky ones are picked RISKY_ACTIVITY_CHANCE of the time, more
// often by people whose wellbeing is low.
export const ACTIVITIES = [
  { description: 'reading a book', emoji: '📖', duration: 60_000, risk: 0 },
  { description: 'daydreaming', emoji: '🤔', duration: 60_000, risk: 0 },
  { description: 'gardening', emoji: '🥕', duration: 60_000, risk: 0 },
  { description: 'fishing', emoji: '🎣', duration: 60_000, risk: 0 },
  { description: 'hunting in the woods', emoji: '🏹', duration: 60_000, risk: 0.006 },
  { description: 'climbing the cliffs', emoji: '🧗', duration: 60_000, risk: 0.008 },
  { description: 'swimming in the cold lake', emoji: '🏊', duration: 60_000, risk: 0.004 },
  { description: 'drinking alone', emoji: '🍺', duration: 60_000, risk: 0.002 },
];
export const RISKY_ACTIVITY_CHANCE = 0.2;
export const INJURY_FACTOR = 6;

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
export const PRAYER_RECENT_MEMORIES = 2;
export const PRAYER_MEMORY_CHARS = 160;
// Importance of the memory a character gets when its prayer is answered or not.
export const PRAYER_ANSWERED_IMPORTANCE = 8;
export const PRAYER_DECLINED_IMPORTANCE = 6;

// God mode: decrees. At most this many active decrees (newest first) go into prompts.
export const MAX_DECREES_IN_PROMPT = 3;

// Conversation messages: token cap per line (the prompt also asks for 1-2 short sentences).
export const MESSAGE_MAX_TOKENS = 80;

// God mode: manifesting. Speaking to the town reaches characters within this
// many tiles (adjustable in the God menu up to the max).
export const GOD_SPEECH_DEFAULT_RADIUS = 6;
export const GOD_SPEECH_MAX_RADIUS = 20;
// Witnesses kneel (🙏) for this long, remember it at this importance, and gain faith.
export const GOD_SPEECH_AWE_DURATION = 30_000;
export const GOD_SPEECH_IMPORTANCE = 9;
export const FAITH_WITNESS = 5;

// God mode: punishment. A struck character is stunned (⚡) for this long; anyone
// within the radius sees it. Faith drops, and the punishment stays in their
// prompts for this many game days.
export const PUNISH_STUN_DURATION = 60_000;
export const PUNISH_WITNESS_RADIUS = 8;
export const PUNISH_FAITH = -5;
export const PUNISH_IMPORTANCE = 9;
export const PUNISH_WITNESS_IMPORTANCE = 8;
export const PUNISHMENT_PROMPT_DAYS = 2;

// Group conversations and town meetings.
// Talking starts once everyone arrives, or after this long with at least two there.
export const GATHER_ARRIVE_TIMEOUT = 90_000;
// Pause between lines so it reads like a conversation.
export const GATHER_MESSAGE_GAP = 1500;
export const MEETING_MAX_MESSAGES = 12;
export const GROUP_MAX_MESSAGES = 6;
// An agent looking for company starts a group chat instead of a 1:1 with this
// chance, when at least two other free characters are within GROUP_RADIUS tiles.
export const GROUP_RADIUS = 6;
export const GROUP_CHANCE = 0.2;

// Town resources: what the town starts with.
export const START_RESOURCES = { wood: 0, stone: 0, food: 20 };

// Relationships between characters: affinity runs -100 (enemy) to 100 (close
// friend). New pairs start somewhere in +-STARTING_AFFINITY. Each character has
// a CRUSH_CHANCE of a crush on someone, mutual with MUTUAL_CRUSH_CHANCE.
export const STARTING_AFFINITY = 40;
export const CRUSH_CHANCE = 0.1;
export const MUTUAL_CRUSH_CHANCE = 0.6;
// How far one conversation can move affinity either way.
export const MAX_AFFINITY_CHANGE = 10;

// Building projects (the statue). Free agents in the morning and day go to work
// with WORK_CHANCE each time they decide what to do, and rest WORK_REST between
// shifts. A shift is WORK_SHIFT of hammering; WORK_NEEDED full shifts finish the
// statue (about two game days with five townspeople). Materials are used per shift.
export const WORK_CHANCE = 0.5;
export const WORK_REST = 30_000;
export const WORK_SHIFT = 40_000;
export const STATUE_WORK_NEEDED = 30;
export const STATUE_COST = { wood: 30, stone: 60 };

// Society progress. A regular building takes BUILDING_WORK_NEEDED shifts and
// BUILDING_COST materials. After ERA_PROJECTS finished buildings in an era, the
// town advances to the next one (see convex/aiTown/eras.ts).
export const BUILDING_WORK_NEEDED = 12;
export const BUILDING_COST = { wood: 15, stone: 20 };
export const ERA_PROJECTS = 2;

// Life and death. A game day ages everyone YEARS_PER_DAY years. Existing
// townspeople start between START_AGE_MIN/MAX; everyone gets a lifespan between
// LIFESPAN_MIN/MAX. Each morning: at most one death, and maybe one birth. The
// town aims for POPULATION_TARGET people (births are likely below it, rare above)
// and never exceeds MAX_POPULATION, with at most MAX_CHILDREN under ADULT_AGE.
export const YEARS_PER_DAY = 2;
export const START_AGE_MIN = 18;
export const START_AGE_MAX = 50;
export const LIFESPAN_MIN = 62;
export const LIFESPAN_MAX = 98;
export const POPULATION_TARGET = 6;
export const MAX_POPULATION = 8;
export const MAX_CHILDREN = 2;
export const ADULT_AGE = 16;
export const PARENT_AGE_MIN = 18;
export const PARENT_AGE_MAX = 50;
export const BIRTH_CHANCE_BELOW_TARGET = 0.7;
export const BIRTH_CHANCE_AT_TARGET = 0.1;

// Wellbeing (mental health) 0-100 per person. Conversations move it by half the
// change in how they feel about the other person; life events move it more. It
// drifts back toward WELLBEING_BASELINE by WELLBEING_DRIFT each morning.
export const WELLBEING_START = 60;
export const WELLBEING_BASELINE = 55;
export const WELLBEING_DRIFT = 5;

// Playing as yourself. A hero starts at HERO_START_AGE. Gathering takes
// HERO_WORK_DURATION and brings in HERO_GATHER_AMOUNT; helping build adds
// HERO_BUILD_WORK shifts of work.
export const HERO_START_AGE = 20;
export const HERO_WORK_DURATION = 15_000;
export const HERO_GATHER_AMOUNT = 3;
export const HERO_BUILD_WORK = 0.5;

// When someone's affinity reaches CRUSH_DEVELOP_AFFINITY, each further warm
// conversation has CRUSH_DEVELOP_CHANCE of turning it into a crush.
export const CRUSH_DEVELOP_AFFINITY = 70;
export const CRUSH_DEVELOP_CHANCE = 0.25;

// Economy (plain game logic, no LLM). Each morning everyone eats FOOD_PER_PERSON
// and the fields yield FIELD_YIELD each. A worker's shift brings in FARM_YIELD
// food or GATHER_YIELD wood/stone. After STARVATION_DAYS hungry mornings in a
// row, the weakest person dies.
export const FOOD_PER_PERSON = 1;
export const FIELD_YIELD = 1;
export const FARM_YIELD = 3;
export const GATHER_YIELD = 4;
export const STARVATION_DAYS = 3;

// Performance: at most MAX_AI_CONVERSATIONS conversations between townspeople at
// once (ones with the player don't count), each agent prays on a given night
// with PRAYER_CHANCE, and a person's opinion of a decree is re-summarized at
// most once per DECREE_OPINION_COOLDOWN.
export const MAX_AI_CONVERSATIONS = 2;
export const PRAYER_CHANCE = 0.5;
export const DECREE_OPINION_COOLDOWN = 8 * 60_000;

// Background LLM work waits up to this long while the player is talking to
// someone, so their replies come first (see convex/priority.ts).
export const PLAYER_PRIORITY_MAX_WAIT = 45_000;
