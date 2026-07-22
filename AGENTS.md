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

## TypeScript 7 (native `tsc`, upgraded 2026-07-16)

TWO packages, and the split is deliberate — do not "fix" it back to one:
- `@typescript/native` (= `npm:typescript@7`) supplies the **`tsc` binary**.
  TS7 is the native (Go) compiler; `pnpm typecheck` runs it.
- `typescript` is ALIASED to `npm:@typescript/typescript6` — the sanctioned
  6.0 **compiler-API** compat shim. TS7 ships no classic API
  (`require('typescript')` on real TS7 yields 2 keys: `version` + `unstable/*`),
  so anything calling `ts.createProgram` needs this. Here that is **Next's own
  TS integration** (`next build`'s "checking validity of types", `next dev`).
  Nothing else does: eslint is unwired (no config/script — Biome lints), and
  vitest transpiles via esbuild.
No bin collision: typescript@7 ships `tsc`, typescript6 ships `tsc6`.
`pnpm exec tsc --version` must say 7.x — if it says 6.x the alias is inverted.

TS7 constraints that bit this repo (see `tsconfig.json`):
- **`baseUrl` is REMOVED** (TS5102). Every `paths` mapping must be
  `./`-prefixed and resolves relative to the tsconfig.
- Side-effect imports of undeclared modules are now an error (TS2882). Next
  only declares `*.module.css`, so global `import './globals.css'` needs the
  ambient `declare module '*.css'` in `css.d.ts` — deleting that file breaks
  `pnpm typecheck`.
- TS6/7 default `types` to `[]`. No explicit array is needed here (node/react
  types arrive via next-env.d.ts's `/// <reference types="next" />`, and every
  test imports `vitest` explicitly rather than using bare globals) — but add
  one if you introduce a dependency on ambient `@types/*` globals.

GOTCHA: `pnpm check` (`biome check && tsc --noEmit`) fails on PRE-EXISTING
formatter complaints in files nobody touched (demo snapshots, `gameUtils.ts`,
`mp/game.ts`). CI runs `pnpm lint` + `pnpm typecheck`, which are green; don't
chase `check` failures you didn't cause, and don't `pnpm format:write` (see
the Formatting gotcha above).

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

- XSTATE IS PINNED AT 5.32.x (upgraded 2026-07-17). Graph traversal lives in
  CORE since 5.20 — import from `xstate/graph`; do NOT add `@xstate/graph`,
  it would only drift out of version-match. `@xstate/react` 6.x is a major on
  its own versioning but peers on xstate ^5.28 (no v6 engine involved). The
  machine sets `options: { maxIterations: 1000 }` — a defensive cap on the
  `always` chains that surfaces a regressed guard's infinite loop as an actor
  error instead of a hung request. It can only fire on a bug; do not raise it
  to silence one.
- PROBES ARE PURE (2026-07-17). Anything asking the engine a hypothetical
  ("if I picked this city, would the build still complete?") uses
  `transition(gameStore, snapshot, event)` — no actor, no side effects,
  `always` chains resolved, and the unexecuted-actions half of the tuple is
  always empty because this machine is assign-only. The pattern is ONE restore
  at the boundary then pure chains: `transition()` rejects raw persisted JSON
  (no resolved state nodes), so `createActor(...,{snapshot}).getSnapshot()`
  is still needed once — and it must still go through `rehydrateSnapshot`'s
  deep clone, because `getPersistedSnapshot()` shares nested refs with the
  live context. One restored snapshot may be REUSED as the base for many
  probes: transitions never mutate the snapshot they start from (verified
  against executed CONFIRMs that spend money and place tiles). Sites:
  `driver.ts` (`applyPure`/`tryApplyEvent`/`flowDeadEnd`), `game.tsx`
  (`probeSnapshot`/`probeStep`). `applyIntent` stays actor-based on purpose —
  it needs the restore anyway and persists the result.
- STATECHART SHAPE is pinned by `gameStore.graph.test.ts` — a `xstate/graph`
  sweep asserting invariants over every reachable wizard state (CANCEL always
  unwinds to the chooser without consuming the action; no dead ends; the
  source-choice steps never settle with nothing to pick). A new action flow is
  covered the day it lands, so prefer extending the invariants over
  hand-writing another CANCEL case. TWO gotchas: (1) nodes MUST be keyed on
  state VALUE via `serializeState` — context (money, hands, board) makes a
  default context-keyed traversal non-terminating and it blows the limit
  outright; (2) the alphabet is `candidateMoves` (`legal-moves.ts`), split from
  `enumerateLegalMoves` so payloads stay fixture-real and the sweep cannot
  drift from what the AI sees. `enumerateLegalMoves` = `candidateMoves` minus
  the AI-only card-first suppression, then `can()`.
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
- RESOURCE SOURCE CHOICE (beer + iron, added 2026-07-16) is a FIRST-CLASS
  MACHINE STATE, engine-owned. `src/store/shared/resourceSources.ts` is the
  single place that knows which sources are legal, what a step needs and what
  taking each one does (`getBeer/IronSourceOptions`; step selectors
  `pendingBeerChoice`/`pendingIronChoice` → `{required, options, hasChoice}`;
  `beer/ironChoiceSatisfied`; `canChoose{Beer,Iron}Source`). UI and the AI
  driver only RENDER those and send the pick — never re-derive legality or
  unit counts (captain's rule).
  - The machine has explicit choosing steps entered like the card step:
    `selling.choosingBeerSource` (executes the staged sale on exit),
    `networking.choosingDoubleLinkBeer`, and `building`/`developing`.
    `choosingIronSource`. Each has an `always` transition guarded by
    `{beer,iron}ChoiceSatisfied` that AUTO-SKIPS it when <2 materially
    distinct sources exist — so a single-source action never stops, and the
    ~54 existing pins (which pass no source) stay green because the skip is
    transparent. The staged sale + picks live in CONTEXT
    (`pendingSale`, `chosenBeerSources`, `chosenIronSources`), set by
    `stageSale`/`choose{Beer,Iron}Source`, cleared by `clearSelections`.
    Events: `SELECT_BEER_SOURCE`/`SELECT_IRON_SOURCE` (one unit each, guarded
    by `canChoose*`); the last unit satisfies the guard and the `always`
    advances. No `beerSources`/`ironSources` params on the intents anymore.
  - Merchant beer is only offered on a sale (never a network action, rules
    p.9); the IRON MARKET is a FALLBACK not an alternative (rules p.5) — it is
    never offered as a choice while any unflipped works has iron, though
    consumption still falls back to it for cubes the works can't cover. Both
    layers enforce it off ONE flag — `fallbackOnly` on the option
    (`getIronSourceOptions`): the choice filters it out, and the planner
    refuses an EXPLICIT fallback-only preference at execution too. Both
    layers enforce it off ONE flag — `fallbackOnly` on the option
    (`getIronSourceOptions`): the choice filters it out, and the planner
    refuses an EXPLICIT fallback-only preference at execution too.
  - These context fields are backfilled in `rehydrateSnapshot`
    (`src/server/ai/driver.ts`) AND read defensively (`?? []`) everywhere,
    because demo fixtures and pre-deploy saved/MP games were frozen without
    them — a missing field must never crash the actor (it did: the picker's
    `.filter` on `undefined` tripped the SaveRecoveryBoundary).
  - `SELECT_BEER_SOURCE`/`SELECT_IRON_SOURCE` MUST be in the mp `ALLOWED_EVENTS`
    whitelist (`src/server/mp/intent.ts`) or networked humans get hard-stuck in
    every choosing state (the server enters it via the whitelisted SELECT_SALE
    but then refuses the pick). `explainRefusal` names an off-offer pick; pinned
    by `src/server/mp/intent.test.ts`.
  - Double-link beer reachability is judged against the POST-placement network
    (both rails on the board) via `withProvisionalDoubleLink` — enumeration,
    the `canCompleteDoubleLink` guard and execution must all use it or they
    disagree. `choosingDoubleLinkBeer` resets `chosenBeerSources` on entry (and
    `clearSecondLink`/the success return clear it) so a cancelled-and-reselected
    double link re-asks instead of inheriting a stale pick.
  - Coal now flows through the SAME machinery for equal-distance ties ONLY
    (2026-07-22, supersedes its earlier exclusion): coal must come from the
    CLOSEST connected mine, so the only choice it ever offers is the tie-break
    between mines at the same nearest distance (rules L119-121) — distinct
    distances still auto-pick, no prompt. `SELECT_COAL_SOURCE` +
    `pendingCoalChoice`/`coalChoiceSatisfied`/`canChooseCoalSource`; picks in
    `chosenCoalSources`, step in `pendingCoalStep`
    (`build`|`link`|`doubleLink`). The tie logic is ONE shared allocator,
    `runCoalAllocation` (`resourceSources.ts`), used by BOTH the choice
    selector and `consumeCoalFromSources` (which gained a `preferredSources`
    param + a `picksUsed` return so a double link slices its two demands) — a
    tie is a cube where the nearest tier holds 2+ stocked mines AND more cubes
    than the demand still needs, matching beer/iron's `hasSourceChoice`.
    Machine steps `building.choosingCoalSource`,
    `networking.choosingLinkCoal`, `networking.choosingDoubleLinkCoal`, each
    auto-skipping via `always`+`coalChoiceSatisfied` (so the common
    single-mine case and every existing pin stay transparent). The AI's
    deterministic fallback picks the first-offered (nearest, discovery order) =
    the historic auto-pick, so AI games never stall. Coal picks reference only
    public board state, so `filterSnapshotForSeat` needs nothing; a forged MP
    pick is refused by the same guard/`explainRefusal`. Pinned by
    `gameStore.coaltiechoice.test.ts` + `intent.test.ts`; UI picker in
    `action-dock.tsx` (`CoalSourcePicker`) + board spotlight in `game.tsx`.
  - Beer/iron are a free "any source" pick. The staged sale/picks reference
    only public board state, so `filterSnapshotForSeat` needs nothing; a forged
    MP pick is refused by the same guard. Pinned by
    `gameStore.sourcechoice.test.ts`, `legal-moves.test.ts`, `intent.test.ts`,
    `e2e/beer-source.spec.ts` + `?demo=beerchoice`.
- COAL "NEAREST MINE" CONSUMPTION (`consumeCoalFromSources` +
  `findConnectedCoalMines`, `market/marketActions.ts` + `shared/gameUtils.ts`):
  `findConnectedCoalMines` returns EVERY connected stocked mine ordered
  nearest-first (not just the closest tier), so a shortfall in the nearest mine
  rolls to the next-closest — free — and the coal MARKET is charged only once
  ALL connected mines are exhausted (rules L119-121). Rail-link coal is judged
  AFTER the link is placed (rules L116/L308): the exec, the `hasSelectedLink`
  guard, the double-link guard's first coal, and `refusal.ts` all source coal
  against `withProvisionalLink(context)` (`shared/resourceSources.ts`), anchored
  over BOTH endpoints `[from, to]` so the pick is orientation-independent
  (`consumeCoalFromSources`/`findConnectedCoalMines`/`isLocationConnectedToMerchant`
  accept a `CityId | CityId[]` anchor). Keep guard/exec/double-first-coal/refusal
  in lockstep. Pinned by `gameStore.coalnearestmine.test.ts`. Equidistant-mine
  ties are a PLAYER CHOICE (2026-07-22, `gameStore.coaltiechoice.test.ts`) — see
  the coal note under RESOURCE SOURCE CHOICE above; omitting a preference still
  auto-picks discovery order.
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
  `gameStore.canalrule.test.ts`.
  EXECUTION BACKSTOP (slot-type, fixed 2026-07-21): the placement primitive
  `buildIndustryTile` now gates on `canPlaceOrOverbuildIndustry` before
  placing — it previously validated era/overbuild/resources/funds but NOT
  slot-type compatibility, so a caller reaching it could drop e.g. a Brewery
  at Birmingham (no brewery slot). The machine guards already reject this; the
  primitive check is defense-in-depth (a strict no-op for legal builds, which
  `executeBuildAction` pre-validates identically). The "backstop" that
  `gameStore.slotguard.test.ts` documented did not actually exist until this;
  it is now pinned there.
  ONLY THE MAT'S LOWEST TILE IS EVER BUILDABLE (era rule, fixed 2026-07-16):
  rules p.4 step 2 takes the lowest tile, p.7 bars tiles showing the era's
  half-circle — so a barred tile BLOCKS its industry until Develop removes
  it; never fall through to the next level (that is a free Develop). Ask
  `getBuildableTileInEra` (`src/data/industryTiles.ts`) rather than
  filtering a mat by era and taking the lowest of the remainder — that
  inversion was the bug, in `selectCard` + `canSelectIndustryType` + the
  mat UI's "next tile" highlight alike. Which tiles are barred is tile
  data (`canBuildInCanalEra`/`canBuildInRailEra`, incl. the L1-Pottery
  rail exception), never a level check. Pinned by
  `gameStore.railera.test.ts`.
  Wild cards route through the full build flow: wild location picks
  industry then ANY city; wild industry picks industry then a network
  city. Regression tests: `gameStore.bugfixes.test.ts`, `e2e/bugfixes.spec.ts`.
- CARD-FIRST entry (2026-07-16): `playing.action.cardSelected` — SELECT_CARD
  from idle holds a hand card and offers its actions; each action event then
  jumps PAST that action's own selectingCard step (BUILD routes by the HELD
  card's type exactly like the action-first SELECT_CARD split; SCOUT seeds
  `selectedCardsForScout` via `seedScoutFromSelectedCard`). Re-click/CANCEL
  returns to idle; PASS stays idle-only. Machine-owned — the UI only renders
  the state (`getHandSelection` + the dock's cardSelected branch). The AI's
  `legal-moves.ts` deliberately does NOT offer the entry (redundant surface;
  the deterministic fallback would loop through it). Pinned by
  `gameStore.cardfirst.test.ts` + `e2e/card-first.spec.ts`. GOTCHA: a stray
  SELECT_CARD in idle is no longer a silent no-op — scripted tests must not
  send one unless they mean it (two old suites did, after PASS; fixed).
- ENGINE-TEST GOTCHA: never call TEST_SET_PLAYER_HAND repeatedly in a
  scripted scenario — every end-of-turn refill then draws a full hand from
  the draw pile, burning the deck in ~3 rounds and ending the era mid-test
  (links removed, level-1 tiles wiped, merchant beer reset). Script hands
  ONCE up front, ordered so hand[0] is always the next planned card.
- Integration tests (`gameStore.integration.test.ts`) drive full games
  through the event surface with a guard-probing policy; if you add
  guards, keep CANCEL paths reachable so the driver can unwind
  (`unwind()` helper). The greedy policy's organic games NEVER hit the
  source-choice states (measured beer=0 iron=0) — that coverage comes from
  the steered `sourceChoicePolicy` full-game test, which counts accepted
  picks in `answerSourceSteps` (`sourcePicks`) and asserts beer>0 AND
  iron>0; don't weaken that assert, it is the only full-game pin on the
  choosing states.
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
- DEV-ONLY machine visualisation: `NEXT_PUBLIC_XSTATE_INSPECT=1 pnpm dev`
  pops the Stately Inspector on the live `gameStore` actor. Hard-gated off
  production and dynamically imported (`src/lib/xstate-inspector.ts`, fed into
  `useMachine` in `game.tsx`); disabled default is a zero-behaviour no-op. See
  the README "Debugging the game state machine" section.
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
  not `dispatchEvent`. For ROUTES specifically, axi `click @ref` also misses:
  it aims at the a11y node's bbox centre, which on a bowed path lies off the
  hit-stroke (same root cause as the Playwright `clickRoute` helper). Routes
  are keyboard-activatable when legal, so focus + Enter is the reliable
  manual path:
  `axi eval 'document.querySelector("[data-conn=\"belper|leek\"]").focus()'`
  then `axi press Enter`.
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
  discard step. `getHandSelection()` (`action-dock.tsx`) returns
  `{hint, selectedIds}` for EVERY `playing.action.*` state: the card-picking
  steps name the action; once a card is committed a catch-all keeps the held
  `context.selectedCard` in `selectedIds` with a `Holding <name>` hint — so the
  fan keeps the card lifted (persistent `LENS_SELECTED`) and the pill keeps
  naming it for the WHOLE flow (put-back is CANCEL in the dock). It does NOT
  decide which cards are clickable — the shell asks the machine per card
  (`state.can({SELECT_CARD, cardId})`), the single source of truth, so it
  survives the MP intent→broadcast→rebuild round-trip.
- HELD-CARD BANNER (2026-07-17): the DOCK also names the held card — a shared
  `HeldCard` (`Holding <CardChip>`) rendered by the `Flow` wrapper (via a
  `held` prop on every `<Flow>` / `DevelopTilePicker`) AND the `cardSelected`
  chooser, so both entry orders (card-first and action-first) show the
  IDENTICAL "Holding <card>" the instant `context.selectedCard` is set, for the
  whole flow. Keyed on state + `selectedCard` only, so it's order-independent.
  Don't reintroduce the old per-step "Playing"/"Card" chips — they duplicated
  it. `data-testid="held-card"`; pinned by the action-first + card-first dock
  tests in `card-first.spec.ts`.
- CLICK-TO-SWITCH (2026-07-17): clicking a DIFFERENT hand card switches the
  play. On a pick step that's `cardSelected`'s own SELECT_CARD; mid-action it's
  a parent-level SELECT_CARD on `playing.action` → `cardSelected` that reuses
  `clearSelections` (the top-level CANCEL cleanup) then re-holds the new card.
  Guard `canSwitchHeldCard` gates it: different in-hand card only, and NEVER
  once a Sell has flipped an industry (`salesMadeThisAction > 0`) — that
  half-done sale can only be closed. Child pick steps' own SELECT_CARD takes
  precedence over the parent. The AI never uses it (`enumerateLegalMoves`
  suppresses SELECT_CARD once a card is held — human ergonomics only). Pinned
  by `gameStore.cardfirst.test.ts` + `gameStore.sell.test.ts` +
  `hand-selection.test.ts`, e2e in `card-first.spec.ts` / `hand-tray.spec.ts`.
- The active-action panel is the turn's primary focus: `.bb2-panel-active`
  (`theme.css`, brass border + left accent rail + elevation, applied alongside
  `.bb2-panel` on the dock wrapper in `game.tsx`/`mp-game.tsx`) plus larger
  dock type. The right column is `lg:w-[416px]` and the hand tray clears it
  with `lg:right-[428px]` — keep those in sync; both are lg-gated so phone
  (w-full / right-0) is untouched.
- HOVER-TO-LOCATE (2026-07-17): hovering/focusing any city NAME (journal,
  source pickers, sale list, dock steps, ledger, card chips) spotlights its
  plate on the map. The name reads as interactive (`.bb2-locate-name` in
  `theme.css`: dotted underline + `cursor:pointer`). Shared plumbing is
  `src/components/locate.tsx` (context +
  `CityName` + `useLocateCity`); each surface owns the state and feeds
  BoardMap's `locatedCity` prop (`data-located` on the `g[data-city]`, teal
  `LocateMark`, deliberately distinct from the brass legal pulse;
  reduced-motion drops the ping). Journal names resolve via `segmentPlaces`
  (journal-model.ts) — by raw city ID, never display-name matching. The state
  is ONE `cityId|null` on purpose.
- CARD-MAP-SYNC (2026-07-21): hovering a LOCATION card in the hand tray
  auto-pans the map (slight zoom-out, animated, debounced) when its city is
  off-viewport — BoardMap's `focusCity` prop, fed by `focusCityFor`
  (`hover-highlight.ts`) on both surfaces. DELIBERATE: separate from
  `locatedCity` (name hover must never move the map); industry/wild cards
  never pan; no snap-back on hover end; user gestures + board pick steps
  suppress it. Decision logic is pure in `board/pan-into-view.ts`
  (trigger/settle hysteresis — pinned by `pan-into-view.test.ts`); the
  animated application (rAF + reduced-motion instant jump) lives in
  `board-map.tsx`.

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

## Analytics (added 2026-07-17)

- TRAFFIC = Vercel Web Analytics: `<Analytics/>` from `@vercel/analytics/next`
  in `src/app/layout.tsx`. Off Vercel it self-disables (logs "Debug mode …
  no requests will be sent"), so offline dev/test/e2e are unaffected and it
  needs no env var. The package is INERT until Web Analytics is switched on in
  the Vercel dashboard (Project → Analytics → Enable) — code alone collects
  nothing.
- LIVE COUNTS = `loadActivityStats` (`src/server/mp/store.ts`, the single DB
  owner) → `GET /api/stats` → `<ActivityLine/>` on the charter. Aggregate
  COUNTS ONLY (no tokens/names), so it needs no auth and `filterSnapshotForSeat`
  is not involved. Egress discipline as per `loadAiPeek`: ONE aggregate round
  trip, seats counted server-side with `jsonb_array_elements`, `snapshot` never
  touched — it is a public endpoint refresh-spam can hit (`s-maxage=30` in front
  of it). Liveness = `games.updatedAt` (bumped by every `saveGame`); finished
  games excluded.
- The UI half is deliberately split: pure `activity.ts` (fetch-and-swallow +
  wording, unit-tested) vs the thin `activity-line.tsx` shell — same reason as
  `mp/refusal.ts`/`turnNotify.ts`, since vitest runs `environment: 'node'` with
  no testing-library. `/api/stats` failing must never break the page: an
  unreachable endpoint and zero games both render NOTHING (never "0 games").
- TEST GOTCHA (`store.stats.test.ts`): the stats query is GLOBAL and its window
  has only a LOWER bound, over a DB shared with the other DB suites in parallel
  workers — so past-stamped fixtures isolate NOTHING (every real 2026 row sorts
  above a year-2000 cutoff and gets counted; this was a red run). Fixtures are
  stamped in the FAR FUTURE with `now` injected to match, and deleted by token
  after each test. Never blanket-wipe `games` there.

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
  with `SKIP_ENV_VALIDATION=1`. 31 journey tests in `e2e/`, ~3.5m (offline
  subset stays under a minute), `retries: 0` — if a test needs retries, fix
  or delete it. All specs are offline EXCEPT `multiplayer.spec.ts` +
  `ai-opponent.spec.ts` + `mp-playthrough.spec.ts`, which drive the real
  DB-backed mp service and need a live DATABASE_URL in `.env` (they skip,
  visibly, when none is present — guard in `e2e/db-available.ts`). Those DB
  specs widen their per-expect timeout to 15s (`expect.configure`) and set
  long test timeouts — every assertion is a POST + SSE round trip against a
  network database; do NOT read a slow run as a product bug before checking
  DB contention.
- `mp-playthrough.spec.ts` (2026-07-17) is the capstone: two real browsers
  play a scripted-but-adaptive canal opening through the UI — network, loan,
  scout, wild-card builds, a SELL that stops at the beer-source picker (own
  brewery vs merchant barrel), a DEVELOP that stops at the iron-source
  picker (two rival works, market not offered), a mid-flow CANCEL, and a
  forged off-offer SELECT_BEER_SOURCE POSTed raw and refused by name. The
  SAME opening runs offline (no DB) through `applyIntent` in
  `src/server/mp/playthrough.test.ts`, with the shared site-planning in
  `src/test/mp-opening-plan.ts` — when the e2e breaks but the offline twin
  passes, suspect UI/transport, not the engine. GOTCHA the pair encodes:
  in MP EVERY click posts an intent and the dock swallows clicks while one
  is in flight — anchor each click on the NEXT step's UI, and take whose
  turn it is from the wire's `currentPlayerIndex`, never from a page's
  possibly-stale dock.
- Selector policy: `data-testid` spine for structure (action-*, confirm-
  action, cancel-action, mat-<id>/treasury, journal-entry, pass-curtain,
  reveal-hand, card-<id>, era-plate, round-chip, sale-option; map uses
  data-city / data-conn with data-legal) — journal-text assertions
  intentionally pin engine log strings and fixture arithmetic. GOTCHA
  (2026-07-17): the journal RESTRUCTURES those strings for skimmability —
  `journal-model.ts` parses each engine message into headline + chips +
  demoted detail (all words survive, parens dropped, order can change:
  chips before details), so a journal-text pin must match the RENDERED
  order, not the raw `logs[].message`. `parseJournalEntry` is unit-tested
  per template (`journal-model.test.ts`); teach it about any NEW log
  message shape in the same commit, or the fallback shows the line
  unstyled (never lost).
- GOTCHA: map routes are CURVED — Playwright's default bbox-centre click
  misses the fat hit-stroke on bowed paths. Use the `clickRoute` helper in
  `e2e/coverage.spec.ts` (getPointAtLength midpoint + mouse click).
- Fixtures: e2e boots `?demo` / `?demo=sell` / `?demo=eraend` /
  `?demo=gameend` / `?demo=wilds` / `?demo=beerchoice` / `?demo=ironchoice`
  (a Develop facing 2+ unflipped works — the iron picker, `iron-source.spec`)
  / `?demo=doublebeer` (a double rail whose beer has 2+ sources —
  `double-link-beer.spec`) / `?era=rail`. Regenerating ANY fixture invalidates
  pinned test literals — regenerate ONE at a time with
  `GENERATE_DEMO=1 pnpm vitest run src/components/demo/generate-demo.test.ts -t "<name> fixture"`
  and re-pin the affected spec (£ values, card ids, route pairs, winner).
- The new-fixture pattern: probe a CLONED actor (see cloneActor /
  passesToGameOver in generate-demo.test.ts) so a freeze condition is
  asserted by the machine's own guards, never re-implemented.

- ROUND CURTAIN (2026-07-16): `nextPlayer` records a `RoundSummary` in context
  (`context.roundSummary`) when a round completes — the round that ended, its
  spends, the previous + installed turn orders, the income settlement as a real
  money delta, and `eraEnded`. It exists because `nextPlayer` overwrites
  `playerSpending`/`turnOrder` in the SAME assign that reorders, so nothing
  downstream could otherwise see what a round did; never recompute the order
  switch in the UI, render from the summary. `RoundCurtain` (`overlays.tsx`) is
  shared by both surfaces: hotseat (`game.tsx`, z-60, sits ABOVE the pass gate —
  any e2e loop that passes turns must dismiss it, see `coverage.spec.ts`) and
  multiplayer (`mp-game.tsx`, `MP_CURTAIN_MS` auto-lift, since nobody hands the
  device on). Both seed "already seen" from the booted snapshot so a resume/join
  never replays an old round. The summary is PUBLIC (spends and turn order are
  visible at any table) and passes `filterSnapshotForSeat` unfiltered.
- END-OF-ROUND JOURNAL (2026-07-22): the same `nextPlayer` round-complete
  branch also LOGS the transition — one `Turn order set by spending, least
  first: <name £spent>, …` line, then the per-player income lines, both listed
  in the NEW turn order (settlement iterates `newTurnOrder`; the players array
  keeps its index order). Each income line carries the level as an `(income
  level N)` fragment that `journal-model.ts` lifts into a chip (`chipFor`); both
  lines are SKIPPED on the game's final round (no income, no next turn). Shapes
  are additive, so pre-existing journals still render. Pinned by
  `gameStore.endroundlog.test.ts`; teach `journal-model.ts` + its test about any
  new round-end line shape in the same commit.
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
  `actInGame` owns only the I/O — the whitelist/turn/guard/execute DECISION
  lives in `mp/intent.ts` (`applyIntent`), which imports no DB and is
  therefore tested offline (`intent.test.ts`) while the rest of the mp suite
  needs Neon. `game.ts` imports `rehydrate` from there; don't re-fork it.
- REFUSALS NAME WHAT IS MISSING (2026-07-16, captain's requirement): a
  refused intent answers with the exact reason ("Not enough money: you have
  £2, a canal link costs £3.", "Needs 1 beer — no connected brewery has
  beer."), never a generic failure. Two paths, both in `applyIntent`: a
  guard rejection (`can()` false) is explained by `src/store/refusal.ts`
  (`explainRefusal`), which re-derives the cause by calling the SAME
  validators the guards call (`validateSale`, `consumeCoalFromSources`,
  `GAME_CONSTANTS` costs) — NEVER re-implement a rule there, and return null
  to fall back to the generic string rather than guess; an execution failure
  reports `context.lastError` verbatim. A refusal is NEVER persisted, so the
  reason reaches only the acting player's POST response (`filterSnapshotForSeat`
  also nulls `lastError` for foreign seats as defence in depth). The client
  renders it via `mp/refusal.ts` (`refusalToShow`, pure — pinned without a
  DOM, like `turnNotify.ts`). If a guard starts refusing something new, teach
  `explainRefusal` about it in the same commit.
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
  `messages`/`ai`, atomic upsert — so game state
  and chat SURVIVE a redeploy (`.bb-games/` files, or any ephemeral-disk file,
  did not). The 7-day TTL sweep (`sweepStaleGames`, a DELETE) is DISABLED by
  default (2026-07-22): we keep every game for analytics. It is a no-op unless
  `BB_ENABLE_TTL_SWEEP=1`; the lazy call sites in `game.ts`
  (`createGame`/`listLobbies`) stay wired so flipping the flag re-enables it. `saveGame` is version-guarded (upsert applies only when the stored
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
- LOCAL TEST DB IS DOCKER (added 2026-07-17, supersedes the Neon-branch default
  below for laptops): `compose.yaml` runs Postgres + the Neon HTTP proxy;
  `pnpm db:local` starts it and both `pnpm test` and `pnpm exec playwright test`
  then use it with no flags/key/network (~15ms/query vs ~100ms+ to us-east-1 —
  the multiplayer suite goes ~43s → ~6s). Per-run isolation = one DATABASE per
  run (`src/test/local-db.ts`), so concurrent worktrees don't collide. README
  "Local test database (Docker)" documents the precedence; the `[test-db]` line
  each run prints says which path it took. NON-OBVIOUS, all learned the hard way:
  (1) the proxy is MANDATORY — the app's `neon-http` driver speaks Neon's HTTP
  protocol, so a bare Postgres container is unreachable; `neondatabase/neon_local`
  is NOT the answer (it proxies to a CLOUD branch: needs an API key, still
  us-east-1). (2) `scram_iterations=1` (compose `command:` + `docker/postgres-init.sql`,
  which re-hashes the password initdb already wrote at 4096) is a LOAD-BEARING
  8x speedup, not a tweak: the proxy redoes the full SCRAM handshake on EVERY
  HTTP request and default PBKDF2 costs ~115ms of a ~120ms round trip. (3) drop
  needs `WITH (FORCE)` — the proxy holds pooled backends open. (4) playwright's
  webServer starts BEFORE globalSetup, so the DB is chosen in
  `playwright.config.ts` (memoised via `BB_E2E_DB` because every worker re-loads
  the config) and only created in `e2e/global-db.ts`. (5) `configureLocalProxy`
  (`src/server/db/local-proxy.ts`) must stay a no-op for cloud urls —
  `neonConfig.fetchEndpoint` is global and the cloud default rewrites the host
  (pinned by `local-proxy.test.ts`). (6) if the postgres container is RECREATED
  under a long-running proxy, the proxy keeps its dead pooled backends and every
  query 500s ("Control plane request failed") — the detection probe then reads
  as "no local DB" and the suites quietly fall through to the
  `[test-db] no NEON_API_KEY` path rather than failing loudly.
  `docker compose restart neon-proxy` fixes it.
- LOCAL TEST DB ISOLATION (added 2026-07-16; now the FALLBACK when Docker isn't
  running — CI still uses this path): every local test run gets its
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
  / printed), which `.worktreeinclude` copies into pooled worktrees ALONGSIDE
  `.env` (without it a worktree silently degrades to `.env`'s shared `dev`
  branch — the exact interference this whole mechanism prevents; mint a
  project-scoped key via `neonctl api /organizations/<org>/api_keys -X POST -d
  '{"key_name":...,"project_id":"muddy-night-85782525"}'`); CI — the
  `NEON_API_KEY` repo secret (a plain env var, which also
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
  `test` branch for the no-key / `TEST_DB_BRANCH=0` path. That idempotent apply
  must swallow BOTH "already exists" (re-run over a populated branch) AND the
  parallel-CREATE race: two DB suites run in separate vitest workers against ONE
  branch, so when a table is absent (a fresh migration not yet on the `ci`
  parent) both issue the same `CREATE TABLE` at once and the loser gets a
  `23505` on `pg_catalog` (NOT a polite `42P07`). `isBenignSchemaRace`
  (`src/test/db-schema.ts`, unit-tested in `db-schema.test.ts`) accepts exactly
  those; a `23505` on an application table still throws. Re-migrate the `ci`
  parent after adding a table (`neonctl connection-string ci --project-id
  muddy-night-85782525` → `pnpm db:migrate`) so ephemeral branches inherit it —
  but the race handler is the safety net for the window before that.
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
  account (for automated repro, append
  `?x-vercel-protection-bypass=<automation-secret>&x-vercel-set-bypass-cookie=true`
  — the secret is in Vercel project → Deployment Protection → Protection
  Bypass for Automation).
- DEPLOY MIGRATIONS (2026-07-21): the Vercel `build` script is
  `node scripts/vercel-migrate.mjs && next build` — it runs drizzle-orm's
  `migrate()` (pending-only, forward-only, idempotent) for ALL Vercel envs
  (`production`/`preview`/`development`, gated on `VERCEL_ENV`; no-op locally).
  Prod auto-migrate was captain-approved 2026-07-21 (it used to be hand-run and
  broke deploys when a migration lagged). MIGRATION HARDENING (2026-07-21,
  follow-up to the prod journal-drift incident a `drizzle-kit push` caused):
  (1) migrations run on the DIRECT/UNPOOLED Neon connection — DDL + session
  advisory locks are unreliable through the `-pooler` endpoint;
  `pickMigrationDatabaseUrl`/`toDirectConnectionUrl` (`vercel-migrate.mjs`)
  prefer `DATABASE_URL_UNPOOLED` (Neon-Vercel injects it) else derive it from
  `DATABASE_URL` by stripping `-pooler`. `drizzle.config.ts` (what `pnpm
  db:migrate` reads) does the same and pins `migrations:{table,schema}`. Runtime
  app keeps the pooled URL. (2) CI `migrations` job (no DB, SKIP_ENV_VALIDATION)
  runs `drizzle-kit check` + a generate-produces-no-file gate — a schema.ts
  change without a committed migration fails the PR. (3) `db:push` is now
  `node scripts/guarded-push.mjs` (`decidePush`): allowed only against
  localhost, or a remote host with explicit `BB_ALLOW_REMOTE_PUSH=1` — NEVER
  long-lived DBs; roll them forward with generate+migrate. `.env.example` holds
  only a placeholder URL (no prod creds); prod unpooled URL lives only in
  Vercel/CI. All gates pure + pinned by `scripts/vercel-migrate.test.ts` +
  `scripts/guarded-push.test.ts` (now in the `pnpm test` glob).
- INTENT LOG (2026-07-17): every ACCEPTED state-mutating engine write appends
  one row to the append-only `game_intents` table (PK token+seq, chat pattern;
  swept with the game) — the machine-replayable record for bug reproduction,
  independent of the human-readable journal. Written ATOMICALLY with the
  snapshot via `saveGame(game, intentLog)` (store.ts): ONE data-modifying-CTE
  statement whose log INSERT selects FROM the version-guarded upsert's
  RETURNING, so a lost concurrent write inserts NO phantom row. `kind='setup'`
  rows carry the full initial snapshot (setup shuffles are random); refusals
  are never logged (they don't mutate state). GOTCHA — the engine is
  replay-deterministic EXCEPT the canal→rail transition (deck reshuffle,
  `Math.random` in `eraTransitionToRail`): the intent crossing it must carry
  `snapshot_after` (`eraCheckpoint` in intent.ts, called by actInGame AND the
  AI runner) and `replayIntentLog` (replay.ts, pure/offline) re-bases there.
  Server-side only: never in any client view, never read on the stream poll.
  Reconstruct a bug-report game: `BB_REPLAY_TOKEN=<token> pnpm vitest run
  src/server/mp/intentlog.test.ts -t 'BB_REPLAY_TOKEN'` (DATABASE_URL at the
  branch holding it). Pinned by replay.test.ts (offline FULL mock-AI game,
  both eras) + intentlog.test.ts (DB round-trip, concurrency, sweep).
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
  kept only so the backfill stays re-runnable; drop it explicitly once
  pre-migration games are gone — the TTL sweep no longer ages them out by
  default, see the store note above). Chat is public to seated players; there is no
  seat-private channel. POST /api/mp/chat auths like act; spectators get no
  chat in `viewFor`. Turn notifications derive from SSE frames via
  `mp/turnNotify.ts` (`didBecomeMyTurn` — never fires on the first frame);
  permission is asked only from the header bell.
- LOBBY (ready-up, added 2026-07-21): a filled table NO LONGER auto-starts.
  The lobby waits for every human seat to ready up (`SeatRecord.ready`, a jsonb
  field — no migration; AI seats are implicitly ready via `seatIsReady`) and
  the HOST to press start. `setSeatReady`/`startGame` (`mp/game.ts`, routes
  `/api/mp/ready` + `/api/mp/start`) — start is host-only and gated on ALL
  seats claimed + ALL ready (Brass 2–4 enforced at create). `joinGame` guards
  on SEAT AVAILABILITY, not phase, so host-release + reclaim mid-game still
  works; a started game is unjoinable only because it is full ('No open
  seats'). All-AI-opponent games still auto-start in `createGame` (nothing to
  wait for). Public DISCOVERY: `/lobbies` (`mp/lobby-browser.tsx`) polls
  `/api/mp/lobbies` (`loadOpenLobbies` — token + counts only, no snapshot/
  secrets, full lobbies excluded). Pinned: lobby lifecycle + race/capacity
  guards in `gameStore.multiplayer.test.ts`; e2e `lobby-browser.spec.ts` +
  the ready/start steps in `multiplayer.spec.ts`/`mp-playthrough.spec.ts`.
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
