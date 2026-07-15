# CLAUDE.md

Look at ai-docs for more guidelines and examples.

MOST IMPORTANT IS TO HAVE ai-docs/brass-birmingham-rules.mdc ALWAYS IN YOUR MIND.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always apply TDD for the gameStore.ts First write test and then the implementation. The gameStore should have 100% unit test coverage.

## Project Overview

Digital implementation of the Brass Birmingham board game using Next.js 15, TypeScript, XState for game state management, and Tailwind CSS with Shadcn UI components.

## Development Commands

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

## UI — "The Ironmaster's Atlas" (v2, promoted to `/` on 2026-07-12)

- The home route `/` (`src/app/page.tsx`) renders `V2Game`
  (`src/components/v2/`), a fully **client-side** hotseat surface driving
  `gameStore` directly with `@xstate/react`'s `useMachine`. No DB, no
  polling — all 2-4 players share one screen. `/v2` is a redirect kept for
  old links (query params forwarded). The former v1 hotseat surface and the
  legacy networked flow (`gameManager`/`GameInterface`/`/game/[gameId]`)
  were deleted when v2 replaced them; `pnpm build` passes cleanly.
- The action UI is generated from the machine, not hand-coded state:
  `ActionDock` branches on `snapshot.matches('playing.action.<...>')` and
  gates every choice with `snapshot.can(event)`. Board city/link clicks are
  validated with `state.can(...)` in `v2-game.tsx` and rejected with a
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
- The board is a custom SVG (`v2/board/board-map.tsx`, geometry hand-tuned in
  `board-data.ts`) — NOT React Flow. Legal targets come from `state.can(...)`
  sets computed in `v2-game.tsx`; the map dims illegal plates/routes and
  pulses legal ones. Pan = pointer drag, zoom = wheel/pinch/buttons.
  GOTCHA: never `setPointerCapture` on pointerdown — capture retargets the
  browser's `click` to the svg, silently killing every city/route onClick
  for REAL pointers while synthetic `dispatchEvent` clicks still pass (so
  automated tests won't catch it). Capture only after drag movement starts.
  When browser-verifying board clicks, use trusted input (axi `click @ref`),
  not `dispatchEvent`.
- The engine's `canBuildLink` guard does NOT check era or the board graph
  (documented rules gap) — the UI enforces era in `legalLinks`/`onLinkClick`
  (`v2-game.tsx`), so keep that filter if the guard ever changes.
- Boot order in `v2-game.tsx` (client-side, behind a mount gate):
  `/?preview=gameover` → `/?era=rail` (rail fixture) → `/?demo` (canal
  fixture) → `/?fresh=1` → localStorage save (`bb2-save-v1`) → setup
  charter. Saves persist on every transition, clear on game over / new
  game; a stale save is caught by `SaveRecoveryBoundary`. Snapshots MUST
  pass through `rehydrateSnapshot` before `createActor` — JSON turns the
  markets' `maxCubes: Infinity` into `null`, which breaks both rendering
  and the engine's refill checks.
- Demo fixtures (`v2/demo/demo-snapshot*.ts`) are REAL engine-driven games;
  regenerate both with
  `GENERATE_DEMO=1 pnpm vitest run src/components/v2/demo/generate-demo.test.ts`
  (guarded so `pnpm test:all` never rewrites them). The rail fixture is
  frozen at a state where the double-link build is reachable.
- Legality/preview signals come from shadow-actor probes in `v2-game.tsx`
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

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

## E2E suite (Playwright, added 2026-07-12)

- `pnpm exec playwright test` — self-contained: `webServer` boots the dev
  server on :3199 with `SKIP_ENV_VALIDATION=1`. 13 journey tests in `e2e/`,
  ~13s, `retries: 0` — if a test needs retries, fix or delete it.
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
  `GENERATE_DEMO=1 pnpm vitest run src/components/v2/demo/generate-demo.test.ts -t "<name> fixture"`
  and re-pin the affected spec (£ values, card ids, route pairs, winner).
- The new-fixture pattern: probe a CLONED actor (see cloneActor /
  passesToGameOver in generate-demo.test.ts) so a freeze condition is
  asserted by the machine's own guards, never re-implemented.

- UNDO (2026-07-15) is HOTSEAT-ONLY and shell-level: v2-game snapshots the
  machine at turn start (`turnAnchor`) and remounts from it; one action
  undoable while the same player still has an action left. Multiplayer undo
  needs a server intent + rebroadcast — deliberately out of scope
  (`gameStore.undo.test.ts` pins restore atomicity).

## Networked multiplayer (added 2026-07-13)

- `/g/<token>` (`src/components/v2/mp/mp-game.tsx` + `src/server/mp/`) is
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
  WebSockets would need a custom server. Store = one JSON file per game in
  `.bb-games/` (gitignored), atomic tmp+rename, 7-day TTL sweep — durable
  across restarts with zero env coupling (the Drizzle schema is a template
  and dev runs without DATABASE_URL); swap to SQLite = replace store.ts.
- Chat + turn notifications (2026-07-15): messages live ON the game record
  (`store.ts ChatMessage`, capped 200×500 chars; POST /api/mp/chat auths
  like act; only authed seats receive them in `viewFor`). Turn notifications
  derive from SSE frames via `mp/turnNotify.ts` (`didBecomeMyTurn` — never
  fires on the first frame); permission is asked only from the header bell.
- Seat reclaim: refresh re-authenticates from localStorage; a LOST secret
  is recovered via the host-only "Seats" → Release, then re-claim from the
  invite link. GOTCHA: only the credentialed SSE stream may clear creds on
  `you: null` — a late frame from the previous unauthenticated stream must
  not wipe freshly-claimed credentials (race fixed 2026-07-13).
