# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** State machine-driven multiplayer game with client-server architecture using Next.js App Router and XState for complex game state management.

**Key Characteristics:**
- XState v5 state machines for deterministic game state transitions
- Persisted snapshots stored in database, reconstructed on client
- Server-side game event processing with state filtering for information hiding
- Real-time polling for multiplayer synchronization
- Separation of concerns: game logic (state machine), validation (helpers), UI (components)

## Layers

**State Management (XState State Machine):**
- Purpose: Centralized game state and event handling
- Location: `src/store/gameStore.ts`
- Contains: Game state interfaces, state machine definition, context type definitions
- Depends on: Game data (cards, industry tiles, board), validation helpers, market/build/network actions
- Used by: Server (GameManager), Client (GameInterface, components)

**Validation & Business Logic:**
- Purpose: Pure functions for action validation and game rule enforcement
- Locations: `src/store/build/buildActions.ts`, `src/store/market/marketActions.ts`, `src/store/network/networkActions.ts`, `src/store/shared/gameUtils.ts`
- Contains: Throwing validators, non-throwing validators, utility functions
- Depends on: Game state, game data (board, cards, industry tiles)
- Used by: State machine, tests

**Server Layer (Game Manager):**
- Purpose: Persists game state to database, processes events, filters state for players
- Location: `src/server/gameManager.ts`
- Contains: Game creation, event processing, state filtering/reconstruction
- Depends on: XState, Drizzle ORM, stateFilter
- Used by: API routes, Server actions

**State Filtering (Privacy/Information Hiding):**
- Purpose: Filters game state to hide opponent hands and deck information
- Location: `src/server/stateFilter.ts`
- Contains: `filterGameStateForPlayer()`, `reconstructGameStateFromFiltered()`
- Depends on: Game state types
- Used by: GameManager, GameInterface

**Data Layer:**
- Purpose: Static game data and ORM schema
- Locations: `src/data/` (board, cards, industry tiles, merchants), `src/server/db/schema.ts`
- Contains: Board layout, card definitions, industry tile data, database schema
- Depends on: Nothing (pure data)
- Used by: State machine, validation, game logic

**Server Actions (Next.js):**
- Purpose: Bridge between client and server for game event handling
- Location: `src/app/actions.ts`
- Contains: `createGameAction()`, `joinGameAction()`, `sendEventAction()`
- Depends on: GameManager
- Used by: Client components via startTransition

**API Routes:**
- Purpose: HTTP endpoints for game status polling
- Location: `src/app/api/game/[gameId]/status/route.ts`
- Contains: GET endpoints for game state retrieval
- Depends on: GameManager
- Used by: useGamePolling hook

**UI Components:**
- Purpose: React components for rendering game state
- Locations: `src/components/`, `src/components/game/`
- Contains: Page components, game UI components, subcomponents
- Depends on: Game state, hooks, UI libraries (shadcn, Radix)
- Used by: Next.js pages

**Hooks:**
- Purpose: React custom hooks for stateful logic
- Location: `src/hooks/`
- Contains: `useGamePolling()`, `useGameState()`, `useKeyboardShortcuts()`, `use-mobile()`
- Depends on: XState actors, React
- Used by: Components

## Data Flow

**Game Creation Flow:**

1. User submits form on home page → `createGameAction()` (server action)
2. Server action calls `gameManager.createGame(player1Name)`
3. GameManager creates XState actor, sends `START_GAME` event
4. Actor initializes game state with 2 players, 8-card hands, resources
5. `getPersistedSnapshot()` serializes actor state to JSON
6. JSON snapshot stored in database (games table)
7. GameManager stops actor, returns gameId
8. Redirect to `/game/[gameId]/created` page

**Game Join Flow:**

1. Player 2 navigates to game link, submits join form
2. `joinGameAction()` calls `gameManager.joinGame(gameId, player2Name)`
3. GameManager loads game snapshot from database
4. Creates new actor, restores from snapshot
5. Sends `JOIN_GAME` event with player2Name
6. Actor updates player 2 name and game status
7. New snapshot persisted to database
8. Redirect to game page with `?player=2&name=...`

**Game State Retrieval (Per-Player):**

1. Page component calls `gameManager.getGameState(gameId, playerIndex)`
2. GameManager loads snapshot from database
3. Creates actor, restores from snapshot
4. Gets full game state from actor
5. Calls `filterGameStateForFiltered(state, playerIndex)`
6. Returns filtered state (opponent hands hidden, deck counts only)
7. Client component reconstructs full state from filtered for XState compatibility
8. Creates new actor from reconstructed state
9. Component renders using live actor snapshot

**Game Event Processing:**

1. User clicks action button in component
2. Component calls `handleEvent(event)` with `startTransition()`
3. Calls `sendEventAction(gameId, playerIndex, event)` (server action)
4. Server action calls `gameManager.sendGameEvent(gameId, playerIndex, event)`
5. GameManager loads game snapshot from database
6. Creates actor, restores from snapshot
7. Actor.send(event) processes event through state machine
8. State machine runs assigned actions, updates context
9. New snapshot persisted to database
10. Path revalidated, client polls for updates
11. useGamePolling detects change via `/api/game/[gameId]/status`
12. Component re-renders with updated state

**State Synchronization (Polling):**

1. `useGamePolling` hook runs every 3 seconds on mounted component
2. Calls `/api/game/[gameId]/status` endpoint
3. Endpoint loads game snapshot and extracts `currentPlayerIndex` and `actionsRemaining`
4. Returns status object with `lastUpdate` indicator
5. Hook compares new `lastUpdate` with previous value
6. If changed, calls parent to fetch fresh game state
7. Parent component re-renders with new state

## Key Abstractions

**GameState:**
- Purpose: Immutable game context containing all game data
- Examples: `src/store/gameStore.ts` (lines 114-160)
- Pattern: Plain object with nested structures for players, resources, game progress

**GameEvent:**
- Purpose: Union type of all possible game actions
- Examples: `BUILD`, `NETWORK`, `DEVELOP`, `PASS`, `SELECT_LINK`, etc.
- Pattern: Discriminated union of event types with associated data

**Player:**
- Purpose: Represents a player with resources, hand, built industries, links
- Examples: `src/store/gameStore.ts` (lines 83-112)
- Pattern: Contains mutable state (money, victoryPoints) and collections (hand, industries, links)

**ValidationResult:**
- Purpose: Result type for non-throwing validation
- Examples: `src/store/build/buildActions.ts` (lines 23-27)
- Pattern: `{ isValid: boolean; errorMessage?: string }`

**FilteredGameState:**
- Purpose: Client-safe version of game state with hidden information
- Examples: `src/server/stateFilter.ts` (lines 10-25)
- Pattern: Omits secret data (opponent hands, deck cards), replaces with counts

**Card & IndustryType:**
- Purpose: Domain types for card system
- Examples: `src/data/cards.ts`
- Pattern: Discriminated unions for type-safe card handling

## Entry Points

**Home Page:**
- Location: `src/app/page.tsx`
- Triggers: User navigates to `/`
- Responsibilities: Display game creation form, redirect to created game

**Game Page:**
- Location: `src/app/game/[gameId]/page.tsx`
- Triggers: User navigates to `/game/:gameId` with query params
- Responsibilities: Load game state from server, render GameInterface or JoinGameForm

**Created Page:**
- Location: `src/app/game/[gameId]/created/page.tsx`
- Triggers: Redirect after game creation
- Responsibilities: Display player links for sharing

**GameInterface Component:**
- Location: `src/components/GameInterface.tsx`
- Triggers: Game page render (if not join phase)
- Responsibilities: Restore XState actor from snapshot, set up polling, handle events, render game UI

**API Status Endpoint:**
- Location: `src/app/api/game/[gameId]/status/route.ts`
- Triggers: Polling from useGamePolling hook
- Responsibilities: Return game status and last update indicator

## Error Handling

**Strategy:** Dual approach - throwing validators for internal certainty, non-throwing for UI feedback

**Patterns:**

- **Throwing Validators:** Used by state machine event handlers (e.g., `validateBuildActionSelections()` in `src/store/build/buildActions.ts`). Throw on invalid condition, preventing state transition.

- **Non-Throwing Validators:** Return `ValidationResult` for UI validation before action attempts (e.g., `validateBuildActionSelectionsResult()` in `src/store/build/buildActions.ts`). Used by components to show error messages without triggering state change.

- **Error Context Tracking:** State machine stores `lastError` and `errorContext` to show contextual error messages to user.

- **Catch Blocks:** Server actions and API routes wrap logic in try-catch, returning error status to client.

## Cross-Cutting Concerns

**Logging:** State machine creates LogEntry objects via `createLogEntry()` helper in `src/store/shared/gameUtils.ts`. Logs stored in game state context.logs, rendered in GameLog component.

**Validation:** Multi-layered - game rules validated by business logic functions, UI validated by non-throwing validators, state transitions guarded by throwing validators.

**Authentication:** Not implemented. Game access controlled via URL sharing (gameId, playerIndex, playerName in query params).

**Serialization:** XState `getPersistedSnapshot()` and actor restoration handles JSON serialization of game state. stateFilter handles client-safe serialization.

---

*Architecture analysis: 2026-03-21*
