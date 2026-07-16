# CLAUDE.md

Look at ai-docs for more guidelines and examples.

MOST IMPORTANT IS TO HAVE ai-docs/brass-birmingham-rules.mdc ALWAYS IN YOUR MIND.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always apply TDD for the gameStore.ts First write test and then the implementation. The gameStore should have 100% unit test coverage.

## Project Overview

Digital implementation of the Brass Birmingham board game using Next.js 15, TypeScript, XState for game state management, and Tailwind CSS with Shadcn UI components.

## Development Commands

**Node.js:** pinned in `.nvmrc` / `package.json engines.node` (currently the
latest Active LTS — check https://nodejs.org/en/about/previous-releases for
the current line before bumping; CI's `setup-node` step must match). Vercel's
per-project Node version is a separate dashboard setting (Project Settings →
General) that does NOT read `engines.node` — bump it manually to stay in sync
when the pin changes.

**Build & Development:**
- `pnpm dev` - Start development server with Turbo
- `pnpm build` - Production build
- `pnpm start` - Start production server
- `pnpm preview` - Build and start production server

**Testing:**
- `pnpm test` - Run tests (Vitest)
- `pnpm test:watch` - Run tests in watch mode

**Code Quality:**
- `pnpm lint` - Run Biome linting
- `pnpm lint:fix` - Auto-fix linting issues with Biome
- `pnpm lint:check` - Check with Biome without fixing
- `pnpm typecheck` - TypeScript type checking
- `pnpm check` - Run both lint and typecheck

**Database (Drizzle ORM):**
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:push` - Push schema changes to database
- `pnpm db:studio` - Open Drizzle Studio

**Formatting:**
- `pnpm format:write` - Format files with Prettier
- `pnpm format:check` - Check formatting with Prettier
- GOTCHA: the enforced style is **Biome** (single quotes, no semicolons; `pnpm lint`
  is what CI runs). Prettier's config disagrees (double quotes, semicolons), so
  `pnpm format:write` rewrites the WHOLE repo to a different style — do NOT run it.
  Format touched files with `pnpm exec biome format --write <files>` instead.

## Architecture

**State Management:**
- XState v5 state machines for complex game state (`src/store/claudeMachine.ts`)
- Game state includes players, rounds, eras (Canal/Rail), actions, industry tiles, and board locations
- State machine handles turn progression, action validation, and game phase transitions

**Game Structure:**
- Two-era board game: Canal Era → Rail Era
- Player actions: Build, Network, Develop, Sell, Loan, Scout, Pass
- Industry types: CottonMill, CoalMine, IronWorks, Manufacturer, Pottery, Brewery
- Game data stored in `src/data/` (board layout, cards, industry tiles)

**UI Components:**
- Shadcn UI with "new-york" style variant
- Radix UI primitives for accessibility
- Tailwind CSS with stone base color
- Path aliases: `~/components`, `~/lib`, `~/hooks`
- Component structure: main component + subcomponents + helpers + types

**Data Layer:**
- Drizzle ORM with SQLite database
- Database schema in `src/server/db/schema.ts` (mostly commented out template)
- Environment configuration with `@t3-oss/env-nextjs`

## Code Style

**TypeScript:**
- Functional components with interfaces (avoid classes and enums)
- Prefer interfaces over types
- Strict typing enforced by Biome

**Formatting (Biome):**
- Single quotes, semicolons as needed
- 2-space indentation, 80 character line width
- Trailing commas, arrow parentheses
- JSX double quotes

**File Organization:**
- Lowercase directories with dashes
- Descriptive variable names with auxiliary verbs
- Export main component, then subcomponents, helpers, types
- Favor React Server Components, minimize 'use client'

**Game-Specific Patterns:**
- Game state types defined in state machine file
- Industry and location data as constant objects
- Board connections as arrays of relationship objects
- Immutable state updates using XState assign actions


### Shadcn MCP Server
When a task requires building or modifying a user interface, you must use the tools available in the shadcn-ui MCP server.

#### Planning Rule
When planning a UI build using shadcn:

Discover Assets: First, use list_components() and list_blocks() to see all available assets in the MCP server.
Map Request to Assets: Analyze the user's request and map the required UI elements to the available components and blocks.
Prioritize Blocks: You should prioritize using blocks (get_block) wherever possible for common, complex UI patterns (e.g., login pages, calendars, dashboards). Blocks provide more structure and accelerate development. Use individual components (get_component) for smaller, more specific needs.

### #Implementation Rule
When implementing the UI:

Get a Demo First: Before using a component, you must call the get_component_demo(component_name) tool. This is critical for understanding how the component is used, its required props, and its structure.
Retrieve the Code:

For a single component, call get_component(component_name).
For a composite block, call get_block(block_name).


Implement Correctly: Integrate the retrieved code into the application, customizing it with the necessary props and logic to fulfill the user's request.

## Important Notes
- You have ai-docs/brass-birmingham-rules.mdc the rules, but you can search the web for clarifications, if needed
## Engine Notes (game loop, added 2026-07-08)

- The XState machine (`src/store/gameStore.ts`) now runs a full game
  end-to-end: eras end automatically when the draw deck and all hands are
  exhausted (flag `eraEndPending`, set by the `nextPlayer` action when a
  round completes; consumed by the `isCanalEraEnd`/`isRailEraEnd` guards).
  Rail-era end computes `context.winners` (VP, then income, then money
  tiebreaks) and lands in the top-level final state `gameOver`.
  `TRIGGER_ERA_SCORING`/`TRIGGER_CANAL_ERA_END`/`TRIGGER_RAIL_ERA_END`
  remain wired for tests only - real play never needs them.
- Turn order: `turnOrder` (player ids) is the source of truth;
  `nextPlayer` walks it and rebuilds it each round (least spender first,
  ties keep relative order). Do not rotate `currentPlayerIndex` directly.
- Hands refill at END of turn (entry of the `nextPlayer` state), not per
  action. A player whose hand is empty takes fewer actions
  (`canContinueTurn` guard) and is skipped between turns.
- Actions must NEVER throw inside `assign` (it kills the actor and, on the
  server, strands the persisted snapshot). Use the `lastError`/
  `errorContext` pattern; a failed execution returns without consuming the
  action.
- Sell: `SELECT_SALE {location, industryType, merchant}` flips one
  industry per event (repeatable = multi-sell), `CONFIRM` discards the
  card and consumes the action. Merchant beer comes only from the merchant
  being sold to. Merchants are per-slot entries (a location can appear
  twice), shuffled from the official tile pool at setup; blanks buy
  nothing and hold no beer.
- Link scoring: 1 VP per •-• icon on built industry tiles in the two
  adjacent locations, plus `GAME_CONSTANTS.MERCHANT_LINK_ICONS` (2) at
  merchant locations.
- Wild cards always return to `wildLocationPile`/`wildIndustryPile` via
  `routeCardsToDiscard` - never spread `discardPile` manually when
  discarding played cards.
- Board/deck data (`src/data/board.ts`, `src/data/cards.ts`) was corrected
  against the physical board (photo-verified) and the official deck counts
  (40/54/64). Farm Breweries are modelled (2026-07-13): two brewery-only
  locations `farmBrewery1`/`farmBrewery2` in `src/data/board.ts` with a
  buildable cannock link for the northern one; the southern one has NO
  connection of its own — `linkConnectedLocations()` makes the
  kidderminster-worcester link a 3-way (network, beer reach and link VP all
  route through it; regression tests in `gameStore.farmbrewery.test.ts`).
  Location/wild-location cards are guard-blocked there (rules p.5).
  Industry tile stats in `src/data/industryTiles.ts` were AUDITED 2026-07-14
  against the retail player board (photos + provenance in
  `ai-docs/reference/`; every value pinned by `src/data/industryTiles.test.ts`
  — do not change a stat without re-verifying against the component; the
  rulebook PDF's mat photos are a PROTOTYPE and deviate on Manufacturer IV).
  The income track was AUDITED 2026-07-15 (photos in `ai-docs/reference/`):
  the marker lives on Progress Track SPACES (0-99, `src/data/incomeTrack.ts`,
  `Player.incomeSpace`); flips/Oxford advance SPACES, loans drop 3 LEVELS to
  the highest space of the new level, setup = space 10 = level 0 (NOT level
  10). Mapping + engine behaviour pinned in incomeTrack tests. Known
  remaining data gap: link building does not validate against the board
  graph `connections` (the UI enforces era + graph).
- Build slot semantics are FREE-SLOT-FIRST (2026-07-13 bug hunt): a build
  goes into a free compatible slot when one exists — overbuild (replace,
  via `performOverbuild`) happens ONLY when no compatible slot is free.
  EXCEPTION (canal one-tile rule, fixed 2026-07-15): in the Canal Era each
  player may hold only ONE tile per location (rules p.4/p.7) — if the
  builder already has a tile there, the build MUST replace it (own
  overbuild) even when another slot is free; enforced in
  `canPlaceOrOverbuildIndustry` + `buildIndustryTile`, pinned by
  `gameStore.canalrule.test.ts`. Known adjacent gap: in the Rail Era the
  guard auto-SKIPS unbuildable canal-only L1 mat tiles to the next level,
  but rules p.7 say those tiles must be removed via Develop first (and the
  era-ignorant `selectIndustryType` action can disagree with the guard).
  Wild cards route through the full build flow: wild location picks
  industry then ANY city; wild industry picks industry then a network
  city. Regression tests: `gameStore.bugfixes.test.ts`, `e2e/bugfixes.spec.ts`.
- ENGINE-TEST GOTCHA: never call TEST_SET_PLAYER_HAND repeatedly in a
  scripted scenario — every end-of-turn refill then draws a full hand from
  the draw pile, burning the deck in ~3 rounds and ending the era mid-test
  (links removed, level-1 tiles wiped, merchant beer reset). Script hands
  ONCE up front, ordered so hand[0] is always the next planned card.
- Integration tests (`gameStore.integration.test.ts`) drive full games
  through the event surface with a guard-probing policy; if you add
  guards, keep CANCEL paths reachable so the driver can unwind
  (`unwind()` helper).
- `src/store/build`, `src/store/market`, `src/store/network` hold the
  real split-out action modules (`buildActions.ts`, `marketActions.ts`);
  network logic itself actually lives in `shared/gameUtils.ts`
  (`calculateNetworkDistance`, `linkConnectedLocations`) — a
  `src/store/network/` module was dead placeholder scaffolding and was
  removed 2026-07-15 along with unused `buildTypes.ts`/`marketTypes.ts`
  and the whole pre-XState `src/legacyStores/` prototype dir. Before
  adding a new file under `src/store/*`, grep that it's actually
  imported somewhere — this codebase has a history of scaffold files
  left unwired.

## UI — "The Ironmaster's Atlas" (the game surface, promoted to `/` on 2026-07-12)

- The home route `/` (`src/app/page.tsx`) renders `Game`
  (`src/components/game.tsx`), a fully **client-side** hotseat surface driving
  `gameStore` directly with `@xstate/react`'s `useMachine`. No DB, no
  polling — all 2-4 players share one screen. (Flattened out of the former
  `src/components/v2/` tree on 2026-07-15; the old `/v2` redirect route was
  removed then, so `/v2` no longer resolves.) The former v1 hotseat surface
  and the legacy networked flow (`gameManager`/`GameInterface`/`/game/[gameId]`)
  were deleted when this surface replaced them; `pnpm build` passes cleanly.
- The action UI is generated from the machine, not hand-coded state:
  `ActionDock` branches on `snapshot.matches('playing.action.<...>')` and
  gates every choice with `snapshot.can(event)`. Board city/link clicks are
  validated with `state.can(...)` in `game.tsx` and rejected with a
  sonner toast. Recoverable `context.lastError` is toasted then cleared via
  `CLEAR_ERROR`.
- XState v5 `matches` accepts a dotted path string at runtime, but its
  TYPES only allow the nested-object form — pass `path as never` (see the
  `is()` helpers). Verified both forms return the same result.
- Incoming hands stay hidden: a "pass the device" gate blocks the dock
  until the new current player taps ready (`revealedFor` state).
- Dev run needs `DATABASE_URL` (set in `.env`, gitignored) OR
  `SKIP_ENV_VALIDATION=1` because `src/env.js` validates it at boot; the
  game itself never touches the DB.
- All styles are scoped under `.bb2` (`theme.css`) with Fraunces + Barlow
  Semi Condensed via `next/font` in `src/app/page.tsx`.
- The board is a custom SVG (`board/board-map.tsx`, geometry hand-tuned in
  `board-data.ts`) — NOT React Flow. Legal targets come from `state.can(...)`
  sets computed in `game.tsx`; the map dims illegal plates/routes and
  pulses legal ones. Pan = pointer drag, zoom = wheel/pinch/buttons.
  GOTCHA: never `setPointerCapture` on pointerdown — capture retargets the
  browser's `click` to the svg, silently killing every city/route onClick
  for REAL pointers while synthetic `dispatchEvent` clicks still pass (so
  automated tests won't catch it). Capture only after drag movement starts.
  When browser-verifying board clicks, use trusted input (axi `click @ref`),
  not `dispatchEvent`.
- The engine's `canBuildLink` guard does NOT check era or the board graph
  (documented rules gap) — the UI enforces era in `legalLinks`/`onLinkClick`
  (`game.tsx`), so keep that filter if the guard ever changes.
- Boot order in `game.tsx` (client-side, behind a mount gate):
  `/?preview=gameover` → `/?era=rail` (rail fixture) → `/?demo` (canal
  fixture) → `/?fresh=1` → localStorage save (`bb2-save-v1`) → setup
  charter. Saves persist on every transition, clear on game over / new
  game; a stale save is caught by `SaveRecoveryBoundary`. Snapshots MUST
  pass through `rehydrateSnapshot` before `createActor` — JSON turns the
  markets' `maxCubes: Infinity` into `null`, which breaks both rendering
  and the engine's refill checks.
- Demo fixtures (`demo/demo-snapshot*.ts`) are REAL engine-driven games;
  regenerate both with
  `GENERATE_DEMO=1 pnpm vitest run src/components/demo/generate-demo.test.ts`
  (guarded so `pnpm test:all` never rewrites them). The rail fixture is
  frozen at a state where the double-link build is reachable.
- Legality/preview signals come from shadow-actor probes in `game.tsx`
  (`canSellAnything`, `viableIndustries`, `confirmOutcome`) — never
  replicate rules in the UI by hand. Probe GOTCHAS: (1) always spin probes
  through `createProbeActor` (deep clone via `rehydrateSnapshot`) —
  `getPersistedSnapshot()` shares nested refs with the live context and
  the engine mutates in place on some paths; (2) a probed CONFIRM that
  closes a round cascades through income collection, so money-diff
  previews must be suppressed when `round`/`era` changed (2026-07-14 UX
  batch). Build slot-compatibility for REAL location cards is validated
  only inside `executeBuildAction` (guard order skips
  `canSelectIndustryType`), which is why the industry step needs the
  execution probe.
- Pass-the-turn is TWO-TAP (arm, confirm ≤4s) — e2e must click
  `action-pass` twice. City plates and route hit-areas are labelled a11y
  buttons (keyboard-activatable when legal); the board svg must NOT get
  `role="img"` back, that flattens them out of the a11y tree.
- The hand tray (`hand-tray.tsx`) doubles as the card selector for every
  discard step; which steps select cards is centralized in
  `getHandSelection()` (`action-dock.tsx`).

## AI opponents (added 2026-07-15)

- The charter's "Versus AI" mode seats server-driven LLM opponents through
  the SAME mp service — `kickAiTurns()` in `src/server/mp/game.ts` runs a
  per-game turn loop; AI seats have `secretHash: null` so they can never be
  driven off the wire or released. Per decision, `src/server/ai/driver.ts`
  serializes the state (`serialize.ts`), enumerates the machine's legal
  events (`legal-moves.ts` — faithful to `can()`, era-filters links), asks
  the model for one numbered choice, validates BY EXECUTING on a scratch
  actor (plus a one-step-lookahead dead-end probe: doomed build/link/sell
  flows are refused at the pick with the engine’s real reason), retries ≤3 with the exact refusal
  appended, then falls back deterministically — a turn can never stall
  (step + model-call budgets force PASS/CANCEL as the last resort).
  Single-legal-move and pure CONFIRM/CANCEL steps skip the model. Each
  decision is a FRESH conversation — the runner passes turn-local notes
  (steps + rationales incl. cancels) or the model forgets a plan it just
  abandoned and loops (captain playtest finding).
- Tiers live in `src/server/ai/types.ts` (model, wire, prices, strategy
  prompt). Two wire formats behind the pluggable provider
  (`provider.ts`): 'anthropic' (SDK; honours ANTHROPIC_BASE_URL for
  compatible gateways like opencode zen — model ALIASES only, dated ids
  400 there) and 'openai' (chat/completions on the same gateway, for
  gateway-only models like the clerk tier). Gateways report exact per-call
  cost; it lands in `GameRecord.ai.usage` and the UI spend meter.
- BB_AI_MOCK=1 swaps a deterministic offline mock (set in the playwright
  webServer and the unit tests) — never needs a key. Creating an AI game
  without ANTHROPIC_API_KEY (or without a gateway for openai-wire tiers)
  refuses with a clear error. Rationales + cost are PUBLIC in
  `GameView.ai`; the AI's hand stays as hidden as any other seat's.
- Versus AI is hidden in production (2026-07-16, not ready for prod yet):
  `aiOpponentsEnabled(vercelEnv)` in `src/lib/features.ts` is the single
  flag — `false` when `VERCEL_ENV`/`NEXT_PUBLIC_VERCEL_ENV === 'production'`,
  `true` everywhere else (dev, preview, unset). Gated in two places: the
  setup screen hides the "Versus AI" charter option, and
  `POST /api/mp/create` refuses (403) any request for AI opponent seats —
  the server check exists so a client bypassing the hidden UI still can't
  create AI seats in prod. Flip the one function to re-enable.

## CI (GitHub Actions, Neon-per-run added 2026-07-15)

- `.github/workflows/ci.yml` (`test` job) runs `pnpm test` + lint + typecheck.
  The DB-backed suites (`gameStore.multiplayer.test.ts`, `mp-ai.test.ts`) need a
  real Postgres, so CI provisions an ISOLATED Neon branch per run via
  `neondatabase/create-branch-action@v6` off the long-lived, pre-migrated `ci`
  parent branch (project `muddy-night-85782525`), exports its `db_url` output as
  `DATABASE_URL`, then removes it with `delete-branch-action@v3` in an
  `if: always()` step (plus a 2h `expires_at` TTL as orphan backstop). Schema
  comes free via copy-on-write from `ci`; `ensureTestSchema()` re-applies
  `drizzle/*.sql` idempotently so a new PR migration works before `ci` is
  re-migrated. Re-migrate the `ci` parent after schema changes:
  `neonctl connection-string ci --project-id muddy-night-85782525` → `pnpm db:migrate`.
- REQUIRED repo secrets: `NEON_API_KEY` (Neon Console → Account → API keys) and
  `NEON_PROJECT_ID` (= `muddy-night-85782525`). Without them the create-branch
  step fails.
- `claude.yml` / `claude-code-review.yml` (anthropics/claude-code-action@beta,
  auth via `CLAUDE_CODE_OAUTH_TOKEN` secret) pin `model: claude-sonnet-5` — the
  action's built-in default `claude-sonnet-4-20250514` 404s (id no longer
  served). Bump this when the model id changes.

## NEVER `git stash` here (2026-07-16)

This repo is worked by CONCURRENT agent worktrees sharing ONE `.git`, and
the stash stack is shared with it — `git stash` is global, not per-worktree.
A `stash`/`stash pop` pair that looks atomic in your worktree will silently
hand your work to another lane and pop THEIRS into your tree (observed: a
lane popped a foreign `action-dock.tsx` and lost its own 5 files).
To compare against a clean tree, use a throwaway worktree
(`git worktree add`), `git diff > /tmp/x.patch` + `git checkout --`, or
`git stash create` (writes a dangling commit WITHOUT touching the shared
stack). Recovery if it happens: your work is a dangling commit — find the
`WIP on <your-branch>` one via `git fsck --unreachable | grep commit`, then
`git checkout <sha> -- <your files>`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

## E2E suite (Playwright, added 2026-07-12)

- `pnpm exec playwright test` — `webServer` boots the dev server on :3199
  with `SKIP_ENV_VALIDATION=1`. 13 journey tests in `e2e/`, ~13s,
  `retries: 0` — if a test needs retries, fix or delete it. All specs are
  offline EXCEPT `multiplayer.spec.ts` + `ai-opponent.spec.ts`, which drive
  the real DB-backed mp service and need a live DATABASE_URL in `.env`
  (they skip, visibly, when none is present — guard in `e2e/db-available.ts`).
- Selector policy: `data-testid` spine for structure (action-*, confirm-
  action, cancel-action, mat-<id>/treasury, journal-entry, pass-curtain,
  reveal-hand, card-<id>, era-plate, round-chip, sale-option; map uses
  data-city / data-conn with data-legal) — journal-text assertions
  intentionally pin engine log strings and fixture arithmetic.
- GOTCHA: map routes are CURVED — Playwright's default bbox-centre click
  misses the fat hit-stroke on bowed paths. Use the `clickRoute` helper in
  `e2e/coverage.spec.ts` (getPointAtLength midpoint + mouse click).
- Fixtures: e2e boots `?demo` / `?demo=sell` / `?demo=eraend` /
  `?demo=gameend` / `?demo=wilds` / `?era=rail`. Regenerating ANY fixture invalidates
  pinned test literals — regenerate ONE at a time with
  `GENERATE_DEMO=1 pnpm vitest run src/components/demo/generate-demo.test.ts -t "<name> fixture"`
  and re-pin the affected spec (£ values, card ids, route pairs, winner).
- The new-fixture pattern: probe a CLONED actor (see cloneActor /
  passesToGameOver in generate-demo.test.ts) so a freeze condition is
  asserted by the machine's own guards, never re-implemented.

- UNDO (2026-07-15) is HOTSEAT-ONLY and shell-level: `game.tsx` snapshots the
  machine at turn start (`turnAnchor`) and remounts from it; one action
  undoable while the same player still has an action left. Multiplayer undo
  needs a server intent + rebroadcast — deliberately out of scope
  (`gameStore.undo.test.ts` pins restore atomicity).

## Networked multiplayer (added 2026-07-13)

- `/g/<token>` (`src/components/mp/mp-game.tsx` + `src/server/mp/`) is
  token-URL multiplayer: no accounts; token (128-bit) identifies the game,
  token + per-seat secret (localStorage `bb-mp-<token>`) identifies the
  player. Created from the charter's "Play online" mode.
- SERVER-AUTHORITATIVE: clients POST machine events to `/api/mp/act`; the
  server validates seat + turn + an event whitelist (never TEST_*/TRIGGER_*),
  executes on the real engine, persists, broadcasts. The client's local
  actor is READ-ONLY (rebuilt per SSE broadcast just for matches/can).
- HIDDEN INFO IS FILTERED SERVER-SIDE in `filterSnapshotForSeat`: foreign
  hands, the draw pile, and foreign in-flight selections become `hidden-*`
  placeholders (lengths preserved — guards need counts). Wire-level tests:
  `gameStore.multiplayer.test.ts` + `e2e/multiplayer.spec.ts` (reads raw
  SSE bytes). NEVER add a field to the snapshot without deciding its
  filtering here.
- Transport = SSE (`/api/mp/stream`) + POST intents: first-class in Next
  route handlers, EventSource auto-reconnects across dev restarts.
  WebSockets would need a custom server. Store = the `games` table (Drizzle,
  Neon/Postgres), one row per game keyed by token: jsonb `snapshot`/`seats`/
  `messages`/`ai`, atomic upsert, 7-day TTL sweep (a DELETE) — so game state
  and chat SURVIVE a redeploy (`.bb-games/` files, or any ephemeral-disk file,
  did not). `saveGame` is version-guarded (upsert applies only when the stored
  `version` is lower; a stale writer throws 'Concurrent write').
- REALTIME SYNC IS DB-AS-BUS (2026-07-15, decision doc
  `brass-realtime-arch-d6`): the `games.version` column IS the event bus —
  the app is NOT assumed single-instance. The stream (`stream/route.ts`,
  `maxDuration=300`, needs Fluid compute) is a server-side poll loop: it
  `loadVersion(token)` every ~1.2s and re-derives the full per-seat view on
  change, deduped by version; it opens with a `retry: 1500` hint and closes
  cleanly at ~290s so EventSource reconnects on our terms. The in-process
  `subscribe`/`broadcast` bus in `game.ts` is now ONLY a same-instance FAST
  PATH (zero-latency when writer + stream share a Fluid-reused instance), not
  the delivery guarantee. `act`/`chat` routes return `{ok, view, version}`
  (the actor's own `viewFor` — server-authoritative, NOT optimistic) so the
  actor applies its result in POST time (~1s); opponents converge ≤~2s via
  the poll. The client applies act/chat responses and SSE frames through ONE
  version-guarded path (`applyView` in `mp-game.tsx`). `kickAiTurns` returns
  its runner promise; the act/chat routes `waitUntil()` it (`@vercel/functions`)
  so a serverless instance isn't frozen out from under a multi-step AI turn,
  and the stream poll re-kicks a stalled AI each tick. EGRESS (fixed
  2026-07-16): the per-tick `kickAiTurns` must NOT read the full game row — it
  used to `loadGame` (incl. the 28–65KB snapshot jsonb) on EVERY poll tick, even
  for human-turn/finished/no-AI games, which burned ~4GB of Neon egress in ~2
  days. It now gates on the cheap `loadAiPeek` (phase + seats + a jsonb-extracted
  `currentPlayerIndex`, <1KB) via `isAiSeatTurn`, and only falls through to the
  full `loadGame` in `runAiTurns` when it is genuinely an AI's turn (pinned by
  `src/server/mp/egress.test.ts`, ~98% smaller per tick). The client also pauses
  its EventSource after 60s hidden (`mp-game.tsx`). Do NOT add
  WebSockets/LISTEN-NOTIFY/an external pub-sub (decision doc §5). Wire tests:
  `gameStore.multiplayer.test.ts` (act/chat view shape + hidden-info + chat
  seq delivery / bounded tail / `getChatDelta`) + `e2e/multiplayer.spec.ts`
  (raw SSE `retry:` line + the `event: chat` increment frame).
- `store.ts` is the single seam (load/save/sweep + chat append/tail + the
  cheap `(version, maxSeq)` poll `loadVersionAndSeq`, by token); the
  DB engine is a config swap in `drizzle.config.ts` + `src/server/db/index.ts`.
  DATABASE_URL is now REQUIRED (a libsql `file:` URL will NOT connect through
  neon-http). Migrations in `./drizzle`; apply with `pnpm db:migrate`/`db:push`.
  Store-touching tests need a live DB — they self-provision the schema via
  `src/test/db-schema.ts`; the engine suite still runs offline.
  Neon project `muddy-night-85782525` (name "brass"); branches: `main`=prod,
  `dev`, `preview`, and the long-lived pre-migrated `ci` parent. Those
  DB-backed suites run ~30s over the network (vs instant files), so they set a
  30s per-file timeout via `vi.setConfig`; leave the global 5s for the
  in-memory engine suite.
- LOCAL TEST DB ISOLATION (added 2026-07-16): every local test run gets its
  OWN throwaway Neon branch — no more sharing `dev`, and parallel runs can't
  collide. Wired via vitest `globalSetup` (`src/test/global-db-branch.ts` +
  `src/test/neon-branch.ts`), driven by the official Neon TS SDK
  (`@neondatabase/api-client`, `createProjectBranch`/`deleteProjectBranch`
  against project `muddy-night-85782525`): before the run it branches off the
  pre-migrated `ci` parent (copy-on-write → schema inherited instantly), names
  it `local-test-<rand>` with a 2h `expires_at` TTL (orphan backstop), exports
  its connection string as `DATABASE_URL` (set in the main process BEFORE
  workers spawn, so it propagates), and DELETES the branch in teardown (pass or
  fail). This mirrors the CI workflow (`.github/workflows/ci.yml`, per-run
  branch off `ci`). Credential `NEON_API_KEY` (brass-project-scoped Neon key):
  LOCAL — put it in `.env.local` (gitignored via `.env*.local`; never committed
  / printed); CI — the `NEON_API_KEY` repo secret (a plain env var, which also
  overrides `.env.local` in disposable worktrees). `NEON_PROJECT_ID` is likewise
  overridable but defaults to the brass project. FALLBACK PRECEDENCE (offline
  never hard-fails, and tests must NEVER hit `dev`): (1) `NEON_API_KEY` present
  → ephemeral per-run branch (above); (2) else — `TEST_DB_BRANCH=0`, no key, or
  a create failure — use `TEST_DATABASE_URL` when set, the dedicated long-lived
  Neon `test` branch (`br-sparkling-truth-adswa45j`; put it in `.env.local`);
  (3) else fall back to the existing `DATABASE_URL` but print a LOUD multi-line
  `[test-db] ⚠` warning that tests are about to hit a non-test database.
  Whichever branch DATABASE_URL lands on, the DB suites' `ensureTestSchema()`
  (beforeAll, `src/test/db-schema.ts`) migrates it idempotently — so a stale
  `test` branch is brought current by the same harness step the ephemeral path
  uses. Keep `TEST_DATABASE_URL` (not the plain `DATABASE_URL`) pointed at the
  `test` branch for the no-key / `TEST_DB_BRANCH=0` path.
- DEPLOY (Vercel, wired 2026-07-15): ship is direct-PR → Vercel Git
  integration (project `brass-birmingham`, prod branch = `main`, PR previews
  on). The Neon<->Vercel native integration (store "brass") manages the
  `DATABASE_URL`/`POSTGRES_*`/`STACK_*` env vars. Per-environment DB
  isolation is by Neon BRANCH, all in project `muddy-night-85782525`:
  Vercel `production` → `main`, `preview` → the long-lived `preview` branch,
  `development` → still `main`; local `.env` → `dev`. The preview isolation
  is a manual preview-scoped `DATABASE_URL` override in Vercel (the shared
  integration entry was narrowed to production+development) — a future
  integration re-sync can clobber it. DURABLE FIX (needs a Neon-console
  click, not in neonctl): project brass → Integrations → Vercel → enable
  "create a branch per preview deployment". Previews sit behind Vercel
  Deployment Protection (SSO) — viewable only when logged into the Vercel
  account.
- Chat (normalized out 2026-07-16): chat lives in its OWN append-only
  `chat_messages` table (PK = game token + monotonic per-game `seq`, which is
  the wire `id`), NOT the game jsonb row. A POST /api/mp/chat appends ONE row
  and does NOT rewrite the game row or bump the engine `version`, so a chat
  line never fans a full ~26KB per-seat state frame (the DB-as-bus reason).
  Delivery: the stream poll watches the pair `(version, maxSeq)` in one round
  trip (`loadVersionAndSeq`) — a `version` bump → full `data:` view frame (now
  also carrying the recent chat tail, `CHAT_TAIL_LIMIT`=50); only `maxSeq`
  moved → a bounded `event: chat` increment (`getChatDelta`, authed-only,
  no snapshot). The client merges chat by `id`==seq (idempotent) via
  `applyView`/`applyChatDelta` in `mp-game.tsx`; full history stays in the
  table (swept when the game is), the view only ever ships the tail.
  Migration 0001 backfills the old jsonb `games.messages` (now vestigial —
  kept only so the backfill stays re-runnable; drop once pre-migration games
  age out under the 7-day TTL). Chat is public to seated players; there is no
  seat-private channel. POST /api/mp/chat auths like act; spectators get no
  chat in `viewFor`. Turn notifications derive from SSE frames via
  `mp/turnNotify.ts` (`didBecomeMyTurn` — never fires on the first frame);
  permission is asked only from the header bell.
- Seat reclaim: refresh re-authenticates from localStorage; a LOST secret
  is recovered via the host-only "Seats" → Release, then re-claim from the
  invite link. GOTCHA: only the credentialed SSE stream may clear creds on
  `you: null` — a late frame from the previous unauthenticated stream must
  not wipe freshly-claimed credentials (race fixed 2026-07-13).
- In-flight "syncing" indicator (2026-07-15): because there is NO optimistic
  UI, `mp/use-in-flight.ts` tracks each intent from `send()`'s POST until its
  settling SSE frame. An intent is settled when a frame arrives with a
  server `version` PAST the one captured at send time (never a fixed
  timeout) — or immediately on a `body.ok === false` / network error. A
  12s per-intent timeout is a VISUAL-only backstop for a dropped stream.
  While `inFlight`, `mp-game.tsx` shows the `.bb2-syncbar` top bar + masthead
  pill (`theme.css`), an `sr-only` `role=status` live region, dims the dock
  (`.bb2-busy`, `aria-busy`), and gates board-click / hand-select handlers so
  a move can't be double-fired. Do NOT drive any game state off this signal.
