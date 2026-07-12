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
  (40/54/64). Known remaining data gaps: the 2 Farm Breweries are not
  modelled; industry tile stats in `src/data/industryTiles.ts` are
  unaudited; the income track models levels as a flat number (levels vs
  spaces distinction not implemented); link building does not validate
  against the board graph`connections`.
- Integration tests (`gameStore.integration.test.ts`) drive full games
  through the event surface with a guard-probing policy; if you add
  guards, keep CANCEL paths reachable so the driver can unwind
  (`unwind()` helper).

## Hotseat UI (local pass-and-play, added 2026-07-09)

- The home route `/` (`src/app/page.tsx`) renders `HotseatGame`
  (`src/components/hotseat/`), a fully **client-side** surface that drives
  `gameStore` directly with `@xstate/react`'s `useMachine`. No DB, no tRPC,
  no polling, no per-player URLs — all 2-4 players share one screen. The
  older networked flow (`gameManager` → DB → `GameInterface` →
  `useGamePolling`, and `/game/[gameId]`) is untouched and unused by `/`.
- The action UI is generated from the machine, not hand-coded state:
  `ActionPanel` branches on `snapshot.matches('playing.action.<...>')` and
  gates every choice with `snapshot.can(event)` so illegal picks are
  disabled (cards, industry types, sales, confirms). Board city/link clicks
  are validated with `state.can(...)` in `hotseat-game.tsx` and rejected
  with a sonner toast (the `Board` component does NOT pre-filter link
  legality by the `canBuildLink` guard). Recoverable `context.lastError`
  is toasted then cleared via `CLEAR_ERROR`.
- XState v5 `matches` accepts a dotted path string at runtime, but its
  TYPES only allow the nested-object form — pass `path as never` (see the
  `is()`/`matches()` helpers). Verified both forms return the same result.
- Hotseat hides incoming hands: a "pass the device" gate blocks the panel
  until the new current player taps ready (`revealedFor` state).
- Reusing the existing `Board` (xyflow) is the big win — it already renders
  cities/slots/links and takes `isBuilding`/`isNetworking` +
  `onCitySelect`/`onLinkSelect`. Pass `gameContext={ctx}` for slot checks.
- Dev run needs `DATABASE_URL` (set in `.env`, gitignored) OR
  `SKIP_ENV_VALIDATION=1` because `src/env.js` validates it at boot; the
  hotseat surface itself never touches the DB. `pnpm build` still fails on
  pre-existing type errors in the legacy `Improved*`/`GameInterface`
  components (unrelated to hotseat).

## UI v2 — "The Ironmaster's Atlas" (added 2026-07-12)

- `/v2` (`src/app/v2/` + `src/components/v2/`) is a second, design-first
  hotseat surface driving the same `gameStore` machine; v1 at `/` is
  untouched. All v2 styles are scoped under `.bb2` (`theme.css`) with
  Fraunces + Barlow Semi Condensed via `next/font` in `src/app/v2/layout.tsx`.
- The board is a custom SVG (`v2/board/board-map.tsx`, geometry hand-tuned in
  `board-data.ts`) — NOT React Flow. Legal targets come from `state.can(...)`
  sets computed in `v2-game.tsx`; the map dims illegal plates/routes and
  pulses legal ones. Pan = pointer drag, zoom = wheel/pinch/buttons.
- Boot order in `v2-game.tsx` (client-side, behind a mount gate):
  `?preview=gameover` → `?era=rail` → `?fresh=1` → localStorage save
  (`bb2-save-v1`) → canal demo. Saves persist on every transition, clear on
  game over / new game; a stale save is caught by `SaveRecoveryBoundary`.
- Demo fixtures (`v2/demo/demo-snapshot*.ts`) are REAL engine-driven games;
  regenerate both with
  `GENERATE_DEMO=1 pnpm vitest run src/components/v2/demo/generate-demo.test.ts`
  (guarded so `pnpm test:all` never rewrites them). The rail fixture is
  frozen at a state where the double-link build is reachable.
- Sell is gated in the action dock via a shadow-actor probe
  (`canSellAnything` in `v2-game.tsx`): it walks SELL → SELECT_CARD on a
  copy of the persisted snapshot and asks the machine's own SELECT_SALE
  guards — never replicate merchant/beer logic in the UI by hand.
- The hand tray (`hand-tray.tsx`) doubles as the card selector for every
  discard step; which steps select cards is centralized in
  `getHandSelection()` (`action-dock.tsx`).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
