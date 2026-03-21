# Testing Patterns

**Analysis Date:** 2026-03-21

## Test Framework

**Runner:**
- Vitest 3.0.6
- Config: `vitest.config.ts`
- Test timeout: 5 seconds per test
- Hook timeout: 3 seconds for setup/teardown
- Environment: Node.js

**Assertion Library:**
- Vitest built-in expect() from chai
- Example: `expect(snapshot.context.selectedCard).toBe(null)`

**Run Commands:**
```bash
pnpm test              # Run gameStore.*.test.ts files (main test suite)
pnpm test:watch       # Watch mode for gameStore tests
pnpm test:v2          # Run v2 store tests (src/store/v2/*.*.test.ts)
pnpm test:all         # Run all tests in project
pnpm test:coverage    # Generate coverage report
```

**Test command configuration** (`package.json` lines 21-25):
- Default test command runs only `src/store/gameStore.*.test.ts` (focused on main game logic)
- v2 tests separated for experimental store rewrite
- Watch mode available for rapid iteration during development

## Test File Organization

**Location:**
- Co-located with source: Tests sit in same directory as code they test
- `src/store/gameStore.ts` has parallel test files: `gameStore.pass.test.ts`, `gameStore.build.test.ts`, `gameStore.network.test.ts`
- Utility tests: `src/store/shared/gameUtils.industrySlots.test.ts` for utility functions
- Server tests: `src/server/stateFilter.test.ts`

**Naming:**
- `[fileName].[domain].test.ts`: `gameStore.pass.test.ts` (pass action tests), `gameStore.build.test.ts` (build action tests)
- One test file per major feature/action type
- Domain categories: `pass`, `build`, `network`, `develop`, `sell`, `scout`, `coal`, `income`, `era`, `turns`, `markets`, `actions`, `autoflip`, `cardSelection`, `setup`, `error`, `xstate`, `integration`

**Structure:**
```
src/store/
├── gameStore.ts                 # Main state machine
├── gameStore.pass.test.ts       # Pass action tests
├── gameStore.build.test.ts      # Build action tests
├── gameStore.integration.test.ts # Full game flow tests
├── build/
│   ├── buildActions.ts
│   ├── buildValidation.test.ts  # Validation-specific tests
│   └── ...
├── shared/
│   ├── gameUtils.ts
│   └── gameUtils.industrySlots.test.ts
└── ...
```

## Test Structure

**Suite Organization:**

From `gameStore.pass.test.ts` (lines 1-100):
```typescript
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import type { Card } from '../data/cards'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setup = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  const players = [
    { id: '1', name: 'Player 1', color: 'red' as const, ... },
    { id: '2', name: 'Player 2', color: 'blue' as const, ... },
  ]
  actor.send({ type: 'START_GAME', players })
  return { actor }
}

describe('Game Store - Pass Action', () => {
  test('pass action requires card selection', () => {
    const { actor } = setup()
    // ... test logic
  })
})
```

**Patterns:**
- **Global actor tracking**: `let activeActors: ReturnType<typeof createActor>[] = []` collects all actors created in test file
- **Teardown in afterEach**: Ensures all actors stopped after each test, prevents resource leaks
- **Setup helper function**: `setup()` or `setupGame()` creates and initializes actor, returns reusable reference
- **Snapshot assertions**: `let s = actor.getSnapshot()` gets current state, then assertions on `s.context` and `s.matches()`

## Mocking

**Framework:** XState built-in actor subscription for error handling

**Patterns:**

Error handling in tests (from `gameStore.build.test.ts` lines 25-31):
```typescript
actor.subscribe({
  error: (error: any) => {
    console.warn('Actor error caught in test:', error.message)
    // Silently handle errors that are expected in failure test scenarios
  }
})
```

Test data setup actions (from `gameStore.build.test.ts` lines 62-93):
```typescript
// Set player hand with specific cards
actor.send({
  type: 'TEST_SET_PLAYER_HAND',
  playerId: currentPlayerId,
  hand: [
    {
      id: `${industryType}_test`,
      type: 'industry',
      industries: [industryType],
    },
  ],
})

// Set player money
actor.send({
  type: 'TEST_SET_PLAYER_STATE',
  playerId: currentPlayerId,
  money: 50,
})
```

**What to Mock:**
- Player hands: Use `TEST_SET_PLAYER_HAND` event to inject specific cards for testing (not random deck shuffling)
- Player state: Use `TEST_SET_PLAYER_STATE` to set money, income, etc. without side effects
- Don't mock internal game utilities (distance calculations, validation)

**What NOT to Mock:**
- Core game logic: State machine transitions must run real
- Validation functions: Must test actual validation to catch bugs
- State mutations: Use real XState assign handlers
- Game rules: No shortcuts; verify rules are enforced correctly

## Fixtures and Factories

**Test Data:**

From `gameStore.integration.test.ts` (lines 77-100):
```typescript
const setupScriptedCards = (actor: ReturnType<typeof createActor>) => {
  const aliceCards = [
    { id: 'alice_card_1', type: 'industry', industries: ['brewery'] },
    { id: 'alice_card_2', type: 'industry', industries: ['coal'] },
    { id: 'alice_card_3', type: 'industry', industries: ['cotton'] },
    { id: 'alice_card_4', type: 'industry', industries: ['iron'] },
    { id: 'alice_card_5', type: 'location', location: 'birmingham' },
    // ... more cards
  ]
  // ... send cards to actor
}
```

Factory helper from `stateFilter.test.ts` (lines 10-98):
```typescript
function createMockGameState(): GameState {
  const player1Cards: Card[] = [
    { id: 'p1-card-1', type: 'location', location: 'birmingham' } as Card,
    { id: 'p1-card-2', type: 'industry', industries: ['coal'] } as Card,
  ]
  // ... build complete mock state
  return {
    players: [
      { id: '1', name: 'Player 1', color: 'red', ... },
      { id: '2', name: 'Player 2', color: 'blue', ... },
    ],
    // ... all required state properties
  }
}
```

**Location:**
- Test-specific factories inline in test files (not separate fixture files)
- Large mock states use factory functions at top of file
- Simple test data embedded directly in describe blocks

## Coverage

**Requirements:** 100% unit test coverage required for `gameStore.ts` (per CLAUDE.md)

**Target:** gameStore.ts state machine must have complete test coverage
- All actions tested
- All state transitions tested
- All error paths tested
- Test files exist for major action domains (pass, build, network, develop, sell, scout, coal, income, era, turns, markets)

**View Coverage:**
```bash
pnpm test:coverage    # Generates coverage report in console/html
```

## Test Types

**Unit Tests:**
- Scope: Individual game actions (Pass, Build, Network, Develop, Sell, Scout)
- Approach: Create actor, send specific action, verify state snapshot matches expected outcome
- Example from `gameStore.pass.test.ts` (lines 82-100):
```typescript
test('pass action discards selected card and consumes one action', () => {
  const { actor } = setup()
  let s = actor.getSnapshot()

  const initialHand = s.context.players[0]!.hand
  const initialHandSize = initialHand.length
  const cardToDiscard = initialHand[1]!

  actor.send({ type: 'PASS' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
  actor.send({ type: 'CONFIRM' })
  s = actor.getSnapshot()

  // Verify state changes
  expect(s.context.players[0]?.hand).toHaveLength(initialHandSize - 1)
  expect(s.context.actionsRemaining).toBe(initialActionsRemaining - 1)
})
```

**Integration Tests:**
- Scope: Full game scenarios from setup to multiple rounds
- Approach: Setup game, execute scripted sequences of player actions, verify game progresses correctly
- File: `src/store/gameStore.integration.test.ts` (38.7 KB, extensive)
- Example: Full round of play with Build → Network → Develop → Pass actions

**Server-Side Tests:**
- Scope: State filtering for multi-player (hiding opponent hands)
- File: `src/server/stateFilter.test.ts`
- Functions tested: `filterGameStateForPlayer()`, `reconstructGameStateFromFiltered()`
- Verifies hidden information isn't leaked to clients

**E2E Tests:**
- Not found: No browser-based E2E tests (Cypress, Playwright, etc.)
- Game UI tested manually through development

## Common Patterns

**Async Testing:**

From `vitest.config.ts`:
- Default test timeout: 5 seconds
- Hook timeout: 3 seconds
- No async/await patterns in tests; XState uses synchronous events
- Timeouts configured but rarely needed (sync state machine)

Example test structure (no async needed):
```typescript
test('example', () => {
  const { actor } = setup()
  actor.send({ type: 'ACTION' })  // Synchronous
  const s = actor.getSnapshot()    // Synchronous
  expect(s.matches('state')).toBe(true)
})
```

**Error Testing:**

From `gameStore.error.test.ts` (lines 50-80):
```typescript
test('prevents invalid location selection', () => {
  const { actor } = setupGame()
  let snapshot = actor.getSnapshot()

  // Initially no error
  expect(snapshot.context.lastError).toBeNull()
  expect(snapshot.context.errorContext).toBeNull()

  // Attempt invalid action
  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId: invalidCard })
  actor.send({ type: 'SELECT_LOCATION', cityId: invalidLocation })
  actor.send({ type: 'CONFIRM' })

  // Verify error state
  snapshot = actor.getSnapshot()
  expect(snapshot.context.lastError).not.toBeNull()
  expect(snapshot.context.lastError).toContain('Cannot build')
})
```

Pattern:
- Test precondition: Verify clean state (`lastError === null`)
- Perform invalid action
- Verify error captured in context
- Verify state machine doesn't advance (stays in error-recoverable state)

**State Snapshot Verification:**

Pattern from multiple test files:
```typescript
const { actor } = setup()
let s = actor.getSnapshot()

// Verify state path
expect(s.matches('playing.action.passing.selectingCard')).toBe(true)

// Verify context values
expect(s.context.selectedCard).toBe(null)
expect(s.context.actionsRemaining).toBeLessThan(initialActions)

// Verify array mutations
expect(s.context.players[0]?.hand).toHaveLength(expectedLength)
```

**Test Isolation:**

Every test file follows this pattern:
```typescript
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})
```

Ensures:
- No actor resource leaks between tests
- Each test gets fresh actor instance
- State doesn't bleed across tests

---

*Testing analysis: 2026-03-21*
