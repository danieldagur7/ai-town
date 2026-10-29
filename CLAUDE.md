# AI Town (local, Ollama) — god-mode fork

## Starting everything

Order matters: Ollama, then the Convex backend, then the dev server.

1. **Ollama**: the Ollama app must be running (`curl localhost:11434/api/version`).
   Models: `gemma3:12b` (chat), `mxbai-embed-large` (embeddings).
2. **Convex backend** (terminal 1, from this repo root so its data lands here):
   ```bash
   DISABLE_BEACON=1 ../convex-backend-dl/convex-local-backend --interface 127.0.0.1 --instance-name carnitas --instance-secret 4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974
   ```
   The instance name/secret are the old public defaults; they must match the
   hard-coded admin key in `Justfile`. Keep `--interface 127.0.0.1`.
3. **Dev server** (terminal 2): Node 18 is required.
   ```bash
   source /opt/homebrew/opt/nvm/nvm.sh && nvm use 18 && npm run dev
   ```
   App: http://localhost:5173/ai-town. `predev` pushes functions and runs `init`.
4. **Pixel-art server** (terminal 3, optional but needed for new building art):
   `just imagegen` (port 7861, keeps SDXL-Turbo + pixel-art LoRA loaded, ~15 s/image).
   Without it buildings fall back to a generic cottage sprite.

Backend env: `just convex env set LLM_MODEL gemma3:12b` (already set; survives restarts,
not `reset-local-backend`). The repo path contains a space, so `just` prints a harmless
`cd: ... No such file or directory` line on every call.

## Rules

- **Any change to character data (`data/characters.ts`) or to how agents/players are
  created needs a world reset**: `just convex run testing:wipeAllTables`, then restart
  `npm run dev` (its `predev` re-runs `init`). Ask the user before wiping.
- Schema changes to existing tables need either optional fields or a wipe.
- Never block the engine step on LLM calls: LLM work goes in actions started via
  `startOperation` / `scheduler`, and results come back as engine inputs.
- Keep tuning numbers in `convex/constants.ts`.
- Everything stays local: no cloud LLM providers or API keys.

## Architecture notes

- **Engine loop** (`convex/engine/abstractGame.ts`, `convex/aiTown/main.ts`, `convex/aiTown/game.ts`):
  `runStep` is a scheduled action that loads the world, then every `stepDuration` (1s)
  runs up to 600 ticks of `tickDuration` 16ms, feeding queued inputs in by timestamp,
  and saves a diff with `saveWorld`. It reschedules itself every `ENGINE_ACTION_DURATION`
  (30s). A `generationNumber` guarantees only one runner per world. Engine time is
  real wall-clock ms (`Date.now()`).
  Crons (`convex/crons.ts`) stop idle worlds (`IDLE_WORLD_TIMEOUT`, 45 s without a
  browser heartbeat; pages only send heartbeats while their tab is visible, so hiding
  or closing the tab pauses the world) and restart dead ones. With **Autorun** on
  (toolbar button, `worldStatus.autorun`, `world:setAutorun`) a world is never stopped
  for idleness, and while nobody is watching agents don't invite the player's character. `stopEngine` (pause or
  Freeze) also schedules `ollama:unloadModels`, which frees Ollama's model memory
  (the server keeps running so the world can wake by itself). Humans are no longer
  kicked for idleness.
- **Tick order** (`Game.tick`): players `tick` → `tickPathfinding` → `tickPosition` →
  conversations `tick` → agents `tick`. Only the engine writes the `worlds` doc.
- **Inputs**: UI calls `useSendInput(engineId, name)` (`src/hooks/sendInput.ts`) →
  `world.sendWorldInput` mutation → row in `inputs` → handled in the next step by
  `inputs[name].handler` (`convex/aiTown/inputs.ts` merges `player.ts`,
  `conversation.ts`, `agentInputs.ts`) → return value written back; the client waits
  on `aiTown/main:inputStatus`. Actions use `api.aiTown.main.sendInput`.
- **Map** (`data/town.ts`): the original `data/gentle.js` map widened to 86×48 (16:9)
  with an east village. Tile ids >= `MAGE_TILE_OFFSET` come from `magecity.png`
  (rendered by `PixiStaticMap.tsx`); anything in `objmap` blocks walking. `PLAZA`,
  `STATUE_SITE`, `HOUSES` and `FIELDS` are exported for game mechanics. New worlds use
  it via `convex/init.ts`; an existing world is updated in place with
  `testing:stop` → `townMap:applyTownMap` → `testing:resume`.
- **Day/night** (`convex/aiTown/clock.ts`, always on): `world.clock.elapsed` advances in
  `Game.tick` (capped per tick, so stopped worlds don't skip ahead). Phases and
  durations are in `convex/constants.ts` (15 min of daylight, 1 min night). Each agent
  has a `home` (index into `HOUSES`, handed out by `homeOf` in `convex/aiTown/beds.ts`;
  babies get a parent's). In the evening wind-down agents stop inviting; at night
  `Agent.tickNight` ends conversations, remembers them, and `goHome` teleports them to
  their door and they sleep (activity `sleeping` 😴); they wake on the next morning.
  Sleepers by a door are drawn as inside (`Player.tsx` hides them, `Beds.tsx` draws
  snoring over the roof). `data/beds.ts` (old tent beds) only keeps building sites clear.
  **Changing phase lengths shifts the day number** (day = elapsed / day length): stop
  the engine, run `testing:setClockDay '{"day": N}'`, resume. UI: `ClockBadge`,
  `DayNightOverlay`, `Beds`.
- **God mode** (`src/components/GodMenu.tsx`): a pop-up menu in the toolbar.
  - Skip to next phase: engine input in `convex/aiTown/godMode.ts`.
  - Prayers (`convex/god/prayers.ts`, tables in `convex/god/schema.ts`): when an agent
    falls asleep the engine schedules `requestPrayer` (not an agent operation, so it
    never blocks the agent). A single worker (`processQueue`, serialized by
    `claimNext`) writes one prayer at a time; queued prayers from an older night are
    skipped. Answering adjusts `faith` and adds a `prayer` memory via `rememberAnswer`.
  - Faith (`convex/god/faith.ts`): 0–100, starts at 50 on the first answer. Only then
    does a private faith line appear in that character's conversation prompts.
  - Manifest (`convex/god/manifest.ts`, `godSpeaks` input in `convex/aiTown/godMode.ts`): the
    player joins as character `god` (`divineCharacter` in `data/characters.ts`, recolored at
    load by `src/divineTexture.ts`, halo/glow in `Character.tsx`), exempt from the idle
    kick. Conversation prompts flag the god so characters recognize them. Speaking gives
    everyone in radius a `godSpeech` memory, kneeling 🙏 and +faith; `world.godSpeech`
    drives the pulse. The radius preview is shared via `src/godUi.tsx`.
  - Punishment (`punish` input in `convex/aiTown/godMode.ts`, `convex/god/punishment.ts`):
    lightning stuns the target (⚡), ends their conversation and is seen within
    `PUNISH_WITNESS_RADIUS`; target and witnesses get memories, faith drops, and
    `punishmentPrompt` keeps it in conversation/prayer prompts for a couple of game days.
    `world.godSmite` drives the bolt and screen flash.
  - The manifested god can interrupt: `startConversation` from the god pulls both sides
    out of their current conversations.
  - Prayer summaries: `summarizePrayers` action fills `prayers.summary` on demand.
  - Decrees (`convex/god/decrees.ts`): active decrees (newest `MAX_DECREES_IN_PROMPT`)
    are injected straight into conversation and prayer prompts via `decreesPrompt`,
    not left to memory search. After a conversation is remembered,
    `summarizeDecreeTalk` keyword-filters the speaker's lines and asks the LLM what
    they said about each decree, saving it to `decreeOpinions` for the God menu.
    There is no LLM planning step yet; Stage 5d adds one and should reuse the same helper.
- **Relationships** (`convex/agent/relationships.ts`): one row per direction, affinity
  -100..100 plus a `crush` flag (`CRUSH_CHANCE`, mutual with `MUTUAL_CRUSH_CHANCE`). Seeded
  by `seedRelationships` (idempotent, also run daily). Each remembered conversation asks
  the LLM for a -10..10 shift. `relationshipPrompt` adds how they feel to conversation
  prompts; `characterMind` feeds the "On their mind" panel (`src/components/Mind.tsx`).
- **Gatherings** (`convex/aiTown/gathering.ts` engine side, `convex/agent/gathering.ts`
  LLM side): group chats (started from `agentDoSomething` when 2+ free characters are
  near, `GROUP_CHANCE`) and town meetings on the plaza (called by an agent via
  `considerTownMeeting`: daily at the start of day, and after decrees/punishments; at
  most one per game day). Stored in `world.gatherings`; messages use the gathering id as
  `conversationId`. `tickGatherings` picks speakers one at a time; ended gatherings
  give everyone one shared `gathering` memory. UI: `src/components/Gatherings.tsx`.
- **Agents** (`convex/aiTown/agent.ts`): `Agent.tick` is rule-based (wander/activity,
  invite, accept/reject, walk over, talk, leave, remember). Anything slow is an
  operation (`startOperation` → `convex/aiTown/agentOperations.ts` internalAction),
  one in flight per agent, timing out after `ACTION_TIMEOUT`. Operations report back
  through inputs in `agentInputs.ts` (`finishDoSomething`, `agentFinishSendingMessage`, …).
- **Memory** (`convex/agent/memory.ts`, `convex/agent/schema.ts`): after a conversation,
  the LLM summarizes it from each participant's view, rates importance 0–9, embeds
  it (`mxbai-embed-large`, 1024 dims) and stores `memories` + `memoryEmbeddings`.
  Reflections are added when recent importance is high. Retrieval = vector search
  (over-fetch ×10) then rank by relevance + importance + recency.
  Memory `data.type` is `relationship | conversation | reflection`.
- **Prompts** (`convex/agent/conversation.ts`): start/continue/leave messages build a
  plain-text prompt from identity + static `plan` (from `data/characters.ts`), the
  other agent's identity, last conversation time, retrieved memories, and the chat
  history. `startConversationMessage` uses `NUM_MEMORIES_TO_SEARCH`;
  `continueConversationMessage` hard-codes 3. There is no LLM planning step;
  `agentDoSomething` picks activities/wander targets randomly.
- **LLM client** (`convex/util/llm.ts`): OpenAI-compatible calls to Ollama. Chat model =
  `LLM_MODEL` env → `llama3` default. Embedding model/dimension are constants here and
  must match the vector index.
- **Humans** (`convex/world.ts`, `convex/aiTown/player.ts`): auth is disabled; every
  browser joins as the same identity `DEFAULT_NAME` ("Me") with a random sprite
  (`f1`–`f8` in `data/characters.ts`). They click the map to `moveTo`, start/accept/
  reject/leave conversations from the details pop-up, and type messages
  (`src/components/MessageInput.tsx`, `convex/messages.ts`). Max 8 humans; idle 5 min → removed.
- **UI** (`src/`): `App.tsx` (full-screen shell + top toolbar), `components/Game.tsx`
  (Pixi stage + details pop-up), `PixiGame.tsx` / `PixiStaticMap.tsx` / `Player.tsx` /
  `Character.tsx` (rendering), `PlayerDetails.tsx` / `Messages.tsx` (chat).
  Messages live in the regular `messages` table, outside the engine.
- **Society** (`convex/aiTown/project.ts`, `eras.ts`, `economy.ts`; `convex/society.ts`):
  one `world.project` at a time (statue or any building) and finished `world.structures`.
  Townspeople propose the next building each morning (`proposeProject`, era-aware); the
  god commands builds from God menu → Build or the console. God builds come with
  materials; proposals must be gathered for. Workers are plain rules (`tickWorker` /
  `chooseJob`): food first, then missing wood/stone, then building. Every
  `ERA_PROJECTS` buildings → next era (Village → Space Age), and homes are redrawn in
  the era style (`EraHouses`). Each morning `morningMeal` feeds everyone; hunger hurts
  wellbeing and `STARVATION_DAYS` in a row kills the frailest. News feed: `townEvents`.
- **Bird's-eye view** (`convex/aiTown/townView.ts`, plain code): where everything sits
  around the plaza, bare and crowded sides, and a beauty score (lovely vs useful
  buildings, balance across sides, breathing room). Proposals get the full view and
  choose a side (`startProject` `direction`; `findSite` favours it, keeps spacing and
  otherwise fills the emptiest side); conversations get one line on how the town
  looks; the morning nudges wellbeing by beauty; the toolbar shows ✨. Debug:
  `just convex run society:townView`.
- **Art** (`convex/art.ts`, `scripts/imagegen_server.py`): the engine names art by key
  (`structure:<id>`, `house:<era>:<style>`); `requestArt` calls the local server and
  stores PNGs in Convex storage; `artByKey` feeds the map. Redraw from God menu → Build.
- **Life** (`convex/life.ts`, `lifeInputs.ts`): `residents` table holds birth day,
  lifespan and wellbeing (0–100). `YEARS_PER_DAY` ages everyone; each morning
  `lifeCycle` does at most one death and maybe one birth (fond adult couple, or a
  newcomer below `POPULATION_TARGET`, max `MAX_POPULATION`, `MAX_CHILDREN`). Risky
  activities can injure or kill (`accident`). Age, wellbeing and god traits go into
  prompts (`ageLine`, `wellbeingLine`, `traitsPrompt`). Children don't work or get crushes.
- **Admin console** (`convex/god/admin.ts`): plain-language command → JSON ops validated
  and applied (stats, notes, effects, resources, memories, feelings, faith, wellbeing,
  age, death, newcomers, builds, era, decrees, announcements). Granted prayers reuse it
  with a restricted op list (`grantPrayer`).
- **Hero** (`convex/hero.ts`, `heroInputs.ts`, `src/components/HeroMenu.tsx`): the
  player's own persistent character (replaces the old random "Me"). Ages and dies for
  good; then create a new one or `playAsHeir` (take over your child: their agent is
  removed and feelings toward them carry over). Can work (wood/stone/farm/build), pray,
  join and speak in gatherings, and be a parent.
- **LLM budget** (Ollama runs one request at a time, so everything queues): one JSON
  call per remembered conversation (summary + importance + feeling change); one call per
  prayer (prayer + summary, plus the decision and effect when auto-answer is on);
  prayers are claimed (`deciding`) so overlapping runs never judge one twice; decree
  opinions have a cooldown and one call per gathering; at most `MAX_AI_CONVERSATIONS`
  townsperson-only conversations and one group chat at a time; each agent prays with
  `PRAYER_CHANCE`. The image server loads its model on demand and frees it after 60 s
  idle (it shares GPU memory with Ollama). Player conversations come first: background
  LLM work calls `yieldToPlayer` (`convex/priority.ts`), which waits while a human is
  talking to someone and then takes the single background turn (`llmLease` table;
  release it in a `finally`), so Ollama never holds more than one background request
  ahead of the player's. Replies to a human skip both. Remembering a conversation runs
  in the background (not an agent operation), and a conversation ending frees any
  participant still writing a reply for it, so nobody ignores the player's invite. At bedtime nobody leaves a conversation with a human. Diagnose slowness by counting
  `lsof -iTCP:11434 -sTCP:ESTABLISHED` connections and `npx convex logs`.
- **Looks** (`data/looks.ts`): a player's `character` string packs a base sprite and
  feature-wheel picks, e.g. `f3~h2~o5~a:glasses~q:bouncy` (hair colour, outfit colour,
  accessory, idle quirk); plain `f3` still works. `src/lookTexture.ts` recolours the
  sheet once per look; `Character.tsx` draws accessories, the quirk, walk bounce and a
  sun-following shadow (`src/sun.ts`). Newcomers spin the wheel (the LLM picks their
  quirk in the same call that invents them); babies take after their parents. The
  original cast's quirks are in `NAMED_QUIRKS`. Hero creation has the wheel UI.
- **Rendering performance**: only the `Players` layer in `PixiGame.tsx` re-renders each
  frame (interpolated time); everything animated (quirks, shadows, glow, windmill sails,
  snoring) mutates Pixi objects in `useTick`/the shared ticker without React state and
  without allocating. Windmills are a still tower + turning sails
  (`scripts/split_windmill.py`). In dev, `globalThis.__PIXI_APP__` exposes the scene.
- **Lessons** (`lessons` table in `convex/life.ts`): each accident makes that activity
  less likely for everyone (deaths count 3×); kids take more risks.
- **Local pixel-art generation**: `scripts/generate_sprite.py` (SDXL-Turbo +
  pixel-art-xl LoRA on MPS, background keyed out, nearest-neighbour downscale).
  Run with the venv in `../imagegen`:
  `HF_HUB_OFFLINE=1 ../imagegen/.venv/bin/python scripts/generate_sprite.py "<subject>" out.png --size 96 --seed 1`
  (about 45 s per image including model load; try a few seeds).
- **Auto-answer prayers** (`autoAnswerPrayers` in `convex/god/prayers.ts`): the
  model judges each pending prayer against active decrees (helps a decree →
  accept, works against one → decline, otherwise kindness) and answers it with
  a short message; `autoReason` records why. "Auto-answer new prayers" in the
  inbox (`godSettings` table) runs it as each prayer is written.
