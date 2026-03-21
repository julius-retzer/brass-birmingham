# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- Lowercase with dashes for directories: `src/store/`, `src/components/ui/`, `src/server/db/`
- Lowercase with camelCase for source files: `gameStore.ts`, `buildActions.ts`, `stateFilter.ts`
- Test files append domain before `.test.ts`: `gameStore.pass.test.ts`, `gameStore.build.test.ts`, `gameStore.integration.test.ts`
- Component files use PascalCase: `GameInterface.tsx`, `PlayerCard.tsx`, `CreateGameForm.tsx`

**Functions:**
- camelCase for all functions: `getCurrentPlayer()`, `validateBuildActionSelections()`, `calculateNetworkDistance()`
- Helper/utility functions use descriptive names: `findConnectedCoalMines()`, `isLocationInPlayerNetwork()`, `canCityAccommodateIndustryType()`
- Private/internal functions use underscore prefix (not enforced by linter): `_executePassAction()` pattern not observed; functions exported for testability
- XState assign actions use camelCase: `refillPlayerHand`, `nextPlayer`, `executePassAction`

**Variables:**
- camelCase throughout: `selectedCard`, `actionsRemaining`, `industryTilesOnMat`
- Boolean variables use auxiliary verbs: `isFinalRound`, `isInNetwork`, `canAccommodate`
- Readonly config constants use UPPER_SNAKE_CASE: `GAME_CONSTANTS`, accessed as `GAME_CONSTANTS.STARTING_HAND_SIZE`
- Loop variables use short names: `dist`, `nbr`, `queue`

**Types:**
- Interfaces use PascalCase with no `I` prefix: `Player`, `GameState`, `ValidationResult`, `LogEntry`
- Type aliases use PascalCase: `GameEvent`, `CityId`, `IndustryType`
- Union types inline with `|`: `era: 'canal' | 'rail'`, `color: 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange'`
- Optional properties use `?`: `hand?: Card[]`, `errorContext?: 'build' | 'network' | 'develop' | 'sell' | 'scout'`

## Code Style

**Formatting:**
- Tool: Biome 1.9.4
- Indentation: 2 spaces
- Line width: 80 characters
- Line endings: LF
- Single quotes for strings: `const name = 'Player'`
- JSX attribute quotes: Double quotes: `<Card className="ring-2 ring-primary" />`
- Trailing commas: All (in objects, arrays): `{ a: 1, b: 2, }`
- Semicolons: As needed (inserted by formatter)
- Arrow parentheses: Always: `(x) => x + 1`
- Bracket same line: False (break to next line)
- Bracket spacing: True: `{ prop: value }`

**Linting:**
- Tool: Biome 1.9.4
- Key rules enforced:
  - `noExplicitAny`: error (strict TypeScript)
  - `noVar` / `useConst`: error (always use const/let)
  - `useForOf`: error (prefer for-of over forEach)
  - `useOptionalChain`: error (use `?.` operator)
  - `useAsConstAssertion`: error (use `as const` for literals)
  - `noEmptyBlockStatements`: error (no empty blocks)
  - `useNamespaceKeyword`: error (use namespace keyword if needed)
  - `noUnusedVariables`: off (disabled to allow temporary test helpers)

## Import Organization

**Order:**
1. External libraries (node_modules): `import { setup, assign } from 'xstate'`
2. Relative parent imports: `import { GAME_CONSTANTS } from '../constants'`
3. Relative sibling imports: `import { buildIndustryTile } from './buildActions'`
4. Type imports: `import type { GameState, Player } from '../gameStore'`

**Pattern observed in `src/store/gameStore.ts` (lines 1-60):**
- External library imports first
- Type imports grouped together with `type` keyword
- All imports from external folders before internal functions
- Organized by conceptual grouping (cards, industry tiles, build actions, etc.)

**Path Aliases:**
- `~/*` maps to `./src/*`: Used in client components and app code
- Example: `import { gameStore } from '~/store/gameStore'`
- Declared in `tsconfig.json` and used in client-side code

**Biome Import Organization:**
- Enabled in `biome.json` (line 19): `"organizeImports": { "enabled": true }`
- Automatically sorts imports; manual ordering should follow the groups above

## Error Handling

**Patterns:**
- Throwing errors for unrecoverable validation failures: `throw new Error('Current player not found')`
- Two-layer validation approach:
  1. **Throwing validators** for XState guards: `validateBuildActionSelections()` checks preconditions and throws
  2. **Non-throwing validators** for recoverable errors: `validateIndustrySlotAvailabilityResult()` returns `ValidationResult` object with `{ isValid: boolean, errorMessage?: string, errorContext?: string }`
- Error state stored in context: `lastError: string | null`, `errorContext: 'build' | 'network' | 'develop' | 'sell' | 'scout' | null`
- Error entries logged: `createLogEntry(message, 'error')` creates log with type='error'
- Test error handling: Tests subscribe to actor errors with `actor.subscribe({ error: (error) => {} })`

**Validation Result Interface** (`src/store/build/buildActions.ts` line 23-26):
```typescript
export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
  errorContext?: 'build' | 'network' | 'develop' | 'sell' | 'scout'
}
```

## Logging

**Framework:** `console` (built-in) and custom `createLogEntry()` function

**Patterns:**
- Game logs: `createLogEntry(message: string, type: LogEntryType)` stored in `context.logs`
- Types: `'system'`, `'action'`, `'info'`, `'error'`
- Example action log: `createLogEntry('${player.name} passed (discarded ${getCardDescription(...)})', 'action')`
- Debug logs: `debugLog(functionName, context)` for development tracing (pattern used in gameStore.ts)
- Console output in tests uses template strings: `` console.log(`🎯 Game state: ${JSON.stringify(...)}`) ``

**LogEntry Interface** (`src/store/gameStore.ts` lines 63-67):
```typescript
export interface LogEntry {
  message: string
  type: LogEntryType
  timestamp: Date
}
```

## Comments

**When to Comment:**
- Complex algorithms: Network distance calculation (BFS in `gameUtils.ts`)
- Game-specific rules: "RULE: Find closest (fewest Link tiles distant) connected unflipped Coal Mines"
- Clarifying non-obvious logic: "// Stoke has coal slots, making this a valid default combination"
- Explaining type assertions: "// Type assertion needed for XState compatibility"
- Section headers for major state updates: `// 1. Determine turn order for next round based on spending`

**JSDoc/TSDoc:**
- Used sparingly for public functions
- Example from `stateFilter.ts` (lines 27-31):
```typescript
/**
 * Filters the game state to hide private information from other players
 * @param state The full game state
 * @param requestingPlayerIndex The index of the player requesting the state (0-based)
 * @returns A filtered game state with private information hidden
 */
export function filterGameStateForPlayer(
  state: GameState,
  requestingPlayerIndex: number,
): FilteredGameState
```
- Not used on every function; only on complex or public APIs
- Inline comments preferred for clarification over block comments

## Function Design

**Size:**
- Keep functions focused: `validateBuildActionSelections()` checks one thing (3 lines)
- Complex logic broken into helpers: Build validation split across multiple functions
- XState assign actions are tightly scoped to specific state changes

**Parameters:**
- Use destructuring where possible: `({ context }) => { ... }` in XState actions
- Avoid long parameter lists; use context object for XState
- Single responsibility: validation functions take `context: GameState`, return void or `ValidationResult`

**Return Values:**
- Throwing validators return `void` (implicit, throws on error)
- Non-throwing validators return `ValidationResult` object with clear error info
- Utility functions return specific types: `GameState`, `Player`, `number`, `boolean`
- Array manipulation returns new array: `context.players.slice()`, not mutation

## Module Design

**Exports:**
- One main export per file where possible: `export const gameStore = setup({ ... })`
- Type exports separate: `export interface Player { ... }`, `export type GameEvent = ...`
- Helper exports at end of file: `export function validateBuildActionSelections() { ... }`
- No default exports; always named exports

**Barrel Files:**
- Not used; each file has specific imports listed explicitly
- No `index.ts` re-exports observed; direct imports preferred
- Example: Import directly from `src/store/gameStore.ts`, not through a barrel

**File Organization Pattern:**
- Types/interfaces first (lines 1-200 in `gameStore.ts`)
- Constants second: `GAME_CONSTANTS`
- Helper imports: Utility functions from shared/
- Main logic/actions: XState setup and assign handlers
- XState machine definition: Last (largest section)

---

*Convention analysis: 2026-03-21*
