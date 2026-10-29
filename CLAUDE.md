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
  Crons (`convex/crons.ts`) stop idle worlds (`IDLE_WORLD_TIMEOUT`, 5 min without a
  browser heartbeat) and restart dead ones.
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
  durations are in `convex/constants.ts`; beds are in `data/beds.ts` (looked up by
  `convex/aiTown/beds.ts`). In the evening wind-down agents stop inviting and walk to
  bed; at night `Agent.tickNight` ends conversations, remembers them, and sleeps
  (activity `sleeping` 😴); they wake on the next morning. UI: `ClockBadge`,
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
- **Memory cost**: `rememberConversation` uses one JSON call for summary, importance and
  feeling change (was three).
- **Statue project** (`convex/aiTown/project.ts`): `world.project` holds work done
  out of `workNeeded` shifts and the material bill. God menu → Statue →
  "Build a statue of me" (`startStatue` input) tops the stockpile up to the cost,
  since gathering isn't simulated yet. Free agents in the morning/day walk to
  `STATUE_SITE` with `WORK_CHANCE` (`tickWorker`, called from `Agent.tick`),
  hammer for `WORK_SHIFT`, and each shift spends its share of wood/stone. Prompts
  mention the project via `projectPrompt`. Stage art (`public/assets/projects/
  statue_{0,1,2}.png`) is drawn by `src/components/Project.tsx`.
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
