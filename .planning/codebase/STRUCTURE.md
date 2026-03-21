# Codebase Structure

**Analysis Date:** 2026-03-21

## Directory Layout

```
brass/
├── src/
│   ├── app/                    # Next.js 15 App Router pages & actions
│   ├── components/             # React components
│   ├── data/                   # Static game data
│   ├── hooks/                  # React custom hooks
│   ├── lib/                    # Utilities and helpers
│   ├── server/                 # Server-side logic
│   ├── store/                  # XState state machine & game logic
│   └── styles/                 # Global styles
├── public/                     # Static assets
├── drizzle/                    # Database migrations
├── .planning/                  # GSD planning documents
├── ai-docs/                    # AI agent guidelines
└── package.json, tsconfig.json, etc.
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router pages, layouts, and server actions
- Contains: Page components (*.tsx), server actions (actions.ts), API routes
- Key files: `page.tsx` (home), `layout.tsx` (root), `actions.ts`, `game/[gameId]/page.tsx`

**`src/app/api/`:**
- Purpose: HTTP API endpoints
- Contains: Route handlers for game operations
- Key files: `game/[gameId]/status/route.ts` (game state polling)

**`src/app/game/`:**
- Purpose: Game-specific pages
- Contains: Dynamic game page, created page (for sharing)
- Key files: `[gameId]/page.tsx`, `[gameId]/created/page.tsx`

**`src/components/`:**
- Purpose: Reusable React components
- Contains: Page-level components, feature components, UI components
- Key files: `GameInterface.tsx`, `CreateGameForm.tsx`, `JoinGameForm.tsx`, `PlayerCard.tsx`, `PlayerHand.tsx`

**`src/components/game/`:**
- Purpose: Game-specific UI components
- Contains: Action handling, UI wizards, status displays
- Key files: `ImprovedGameInterface.tsx`, `ImprovedActionWizard.tsx`, `ActionConfirmModal.tsx`, `MerchantDisplay.tsx`, `ResourceMarkets.tsx`, `EraTransition.tsx`

**`src/components/Board/`:**
- Purpose: Board rendering and visualization
- Contains: Board component and related display logic

**`src/components/ui/`:**
- Purpose: shadcn/ui component library
- Contains: Radix UI-based components (buttons, cards, dialogs, etc.)

**`src/data/`:**
- Purpose: Static game data constants
- Contains: Board layout, card definitions, industry tile data, merchant definitions
- Key files: `board.ts`, `cards.ts`, `industryTiles.ts`, `merchants.ts`, `availableIndustryTiles.ts`

**`src/hooks/`:**
- Purpose: React custom hooks for stateful logic
- Contains: Game state, polling, keyboard shortcuts, responsive utilities
- Key files: `useGamePolling.ts`, `useGameState.ts`, `useKeyboardShortcuts.tsx`, `use-mobile.tsx`

**`src/lib/`:**
- Purpose: Utility functions
- Contains: General-purpose helpers
- Key files: `utils.ts`

**`src/server/`:**
- Purpose: Server-side business logic
- Contains: Game manager, database access, state filtering
- Key files: `gameManager.ts`, `stateFilter.ts`

**`src/server/db/`:**
- Purpose: Database schema and configuration
- Contains: Drizzle ORM schema definitions
- Key files: `schema.ts`, `index.ts`

**`src/store/`:**
- Purpose: XState state machine and game logic
- Contains: Main game state machine, action handlers, validation, tests
- Key files: `gameStore.ts` (main state machine, 87.7K), `constants.ts`, subdirectories for game phases

**`src/store/build/`:**
- Purpose: Build action handlers and validation
- Contains: Building mechanics, validation
- Key files: `buildActions.ts`, `buildValidation.test.ts`

**`src/store/market/`:**
- Purpose: Market/resource management
- Contains: Resource consumption and production
- Key files: `marketActions.ts`

**`src/store/network/`:**
- Purpose: Link/network building
- Contains: Link-related actions and types
- Key files: `networkActions.ts`

**`src/store/shared/`:**
- Purpose: Shared game utilities and helpers
- Contains: General game logic functions, validation helpers
- Key files: `gameUtils.ts`, `validation.ts`

**`src/styles/`:**
- Purpose: Global styles
- Contains: CSS imports, global style definitions
- Key files: `globals.css`

**`drizzle/`:**
- Purpose: Database migrations
- Contains: Generated migration files
- Generated: Yes (by drizzle-kit)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD orchestrator analysis documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md
- Generated: No (manually written by Claude)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Home page with game creation form
- `src/app/layout.tsx`: Root layout with metadata and global setup
- `src/app/game/[gameId]/page.tsx`: Game page with state loading and routing logic
- `src/components/GameInterface.tsx`: Main game UI component
- `src/server/gameManager.ts`: Server-side game orchestration

**Configuration:**
- `package.json`: Project dependencies and scripts
- `tsconfig.json`: TypeScript configuration with path aliases (`~/*` → `src/*`)
- `next.config.ts`: Next.js configuration
- `tailwind.config.ts`: Tailwind CSS theme
- `biome.json`: Biome linting/formatting rules
- `vitest.config.ts`: Vitest testing configuration
- `drizzle.config.ts`: Drizzle ORM configuration

**Core Logic:**
- `src/store/gameStore.ts`: XState state machine definition (main game logic)
- `src/store/build/buildActions.ts`: Build action validation and execution
- `src/store/market/marketActions.ts`: Market/resource management
- `src/store/shared/gameUtils.ts`: Utility functions for game logic
- `src/server/gameManager.ts`: Game persistence and event processing

**Data & Types:**
- `src/data/board.ts`: Board layout, cities, connections
- `src/data/cards.ts`: Card type definitions and initial deck
- `src/data/industryTiles.ts`: Industry tile definitions and quantities
- `src/store/gameStore.ts`: Game state type definitions
- `src/server/db/schema.ts`: Database schema (Drizzle ORM)

**Testing:**
- `src/store/gameStore.*.test.ts`: Test files for game logic (20 test suites)
- Each feature (build, network, develop, etc.) has dedicated test file

## Naming Conventions

**Files:**
- `*.tsx`: React components
- `*.ts`: TypeScript files, helpers, logic
- `*.test.ts`: Unit test files
- Page files: `page.tsx` (Next.js convention)
- Route files: `route.ts` (Next.js convention)
- Layout files: `layout.tsx` (Next.js convention)

**Directories:**
- Lowercase with dashes: `src/components/game/`, `src/store/build/`
- Descriptive names: `[gameId]` for dynamic segments (Next.js convention)

**Functions:**
- camelCase: `getCurrentPlayer()`, `drawCards()`, `calculateNetworkDistance()`
- Prefix with verb: `is*` for boolean (isFirstRound), `get*` for retrieval, `validate*` for validation

**Components:**
- PascalCase: `GameInterface`, `PlayerCard`, `ActionConfirmModal`
- Functional with hooks, no classes

**Variables:**
- camelCase: `selectedCard`, `actionsRemaining`, `currentPlayerIndex`
- Type/interface names: PascalCase: `Player`, `GameState`, `Card`
- Constants: UPPER_SNAKE_CASE: `STARTING_MONEY`, `LOAN_AMOUNT`, `GAME_CONSTANTS`

**Types:**
- Interfaces preferred: `Player`, `GameState`, `ValidationResult`
- Union types for actions: `GameEvent`, `Card`, `IndustryType`
- Suffixes: `*Card` for card types, `*Type` for enums, `*Result` for output types

## Where to Add New Code

**New Game Action Feature (e.g., Loan, Income):**
1. Add event type to `GameEvent` union in `src/store/gameStore.ts` (around line 162)
2. Create action handler function in appropriate subdirectory:
   - Build/Develop → `src/store/build/`
   - Market/Resources → `src/store/market/`
   - Network → `src/store/network/`
   - General → `src/store/shared/gameUtils.ts`
3. Add throwing validator function in same location (e.g., `validateLoanAction()`)
4. Add non-throwing validator function (e.g., `validateLoanActionResult()`)
5. Add state transition in `gameStore.ts` state machine (in appropriate state)
6. Add tests in new or existing `gameStore.*.test.ts` file
7. Create UI component in `src/components/game/` for user interaction
8. Hook component into `GameInterface.tsx` or subcomponents

**New UI Component:**
1. Create file in `src/components/` (if page-level) or `src/components/game/` (if game-specific)
2. Export main component first, then subcomponents, then helpers, then types
3. Use path alias `~/*` for imports
4. Prefer shadcn/ui components from `src/components/ui/` for consistency
5. Add TypeScript interfaces for props
6. Minimize 'use client' directives (use only when necessary for interactivity)

**New Game Data:**
- Static board data → `src/data/board.ts`
- Card definitions → `src/data/cards.ts`
- Industry tile data → `src/data/industryTiles.ts`
- Merchant definitions → `src/data/merchants.ts`

**New Utility Function:**
- General helpers → `src/lib/utils.ts`
- Game logic helpers → `src/store/shared/gameUtils.ts`
- Board/network helpers → `src/store/shared/gameUtils.ts` (calculateNetworkDistance, etc.)

**New Custom Hook:**
- React hooks → `src/hooks/`
- Use `use*` naming convention
- Keep logic in hook, UI in component

## Special Directories

**`src/store/` Structure:**
- Main file: `gameStore.ts` contains the XState state machine definition and all game types
- Test files: Separate test file for each feature area (`gameStore.build.test.ts`, `gameStore.network.test.ts`, etc.)
- Subdirectories: Organize action handlers by game phase/feature
  - `build/`: Build action handlers and validation
  - `market/`: Resource market management
  - `network/`: Link/network building
  - `shared/`: Shared utilities used across all phases
- Constants: `constants.ts` contains `GAME_CONSTANTS` (starting money, costs, etc.)

**`src/components/game/` Components:**
- UI wizards for complex actions: `ActionWizard.tsx`, `ImprovedActionWizard.tsx`, `ImprovedCardSelector.tsx`
- Status displays: `QuickStatusBar.tsx`, `TurnOrderTracker.tsx`, `GameStatus.tsx`
- Phase transitions: `EraTransition.tsx`, `IncomePhase.tsx`, `GameOver.tsx`
- Resource displays: `ResourceMarkets.tsx`, `ResourcesDisplay.tsx`, `MerchantDisplay.tsx`
- Action interfaces: `ActionButtons.tsx`, `DevelopInterface.tsx`, `SellInterface.tsx`

**`.next/` Directory:**
- Purpose: Next.js build output
- Generated: Yes (by `pnpm build`)
- Committed: No (in .gitignore)

**`node_modules/` Directory:**
- Purpose: Installed dependencies
- Generated: Yes (by `pnpm install`)
- Committed: No (in .gitignore)

**`drizzle/` Directory:**
- Purpose: Database migration history
- Generated: Yes (by `drizzle-kit generate`)
- Committed: Yes (track migrations)

**`ai-docs/` Directory:**
- Purpose: AI agent guidelines and rules
- Contains: Game rules reference, implementation guidelines
- Committed: Yes
- Key files: `brass-birmingham-rules.mdc`

## Path Alias Resolution

All imports use path alias `~` which maps to `src/`:
- `~/components` → `src/components`
- `~/store` → `src/store`
- `~/data` → `src/data`
- `~/hooks` → `src/hooks`
- `~/lib` → `src/lib`
- `~/server` → `src/server`
- `~/app` → `src/app`

This is configured in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

---

*Structure analysis: 2026-03-21*
