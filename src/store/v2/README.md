# V2 Actor Architecture Migration Plan: 1:1 Test-Driven Conversion

## Overview
Copy the current gameStore implementation and test suite, then incrementally convert to actor architecture while maintaining 100% test compatibility and feature parity.

## Directory Structure
```
src/store/v2/
├── README.md                              # This migration plan
├── gameActor.ts                           # Single actor (copied from gameStore.ts)
├── gameActor.*.test.ts                    # Converted tests (1:1 from gameStore tests)
├── _types/
│   ├── gameContext.ts                     # Types copied from gameStore
│   └── gameEvents.ts                      # Events copied from gameStore
├── _shared/                               # Copied utilities
│   ├── gameUtils.ts                       # Copy from store/shared/gameUtils.ts
│   └── validation.ts                      # Copy from store/shared/validation.ts
└── _tests/
    └── _utils/
        └── testHelpers.ts                 # Common test utilities
```

## Phase 1: Direct Copy and Convert Foundation
**Goal**: Create working V2 with identical behavior to V1

### Step 1.1: Copy Core Files
- Copy `gameStore.ts` → `v2/gameActor.ts`
- Copy all `gameStore.*.test.ts` → `v2/gameActor.*.test.ts`
- Copy `shared/gameUtils.ts` → `v2/_shared/gameUtils.ts`
- Copy `shared/validation.ts` → `v2/_shared/validation.ts`
- Update imports to use relative paths within v2 folder

### Step 1.2: Convert Machine Structure
- Rename exported machine from `gameStore` to `gameActor`
- Keep exact same context interface
- Keep exact same event types
- Keep exact same actions and guards
- Verify all tests pass with new machine name

### Step 1.3: Test Suite Conversion
Convert each test file 1:1:
- `gameStore.setup.test.ts` → `gameActor.setup.test.ts`
- `gameStore.build.test.ts` → `gameActor.build.test.ts`
- `gameStore.network.test.ts` → `gameActor.network.test.ts`
- `gameStore.develop.test.ts` → `gameActor.develop.test.ts`
- `gameStore.sell.test.ts` → `gameActor.sell.test.ts`
- `gameStore.scout.test.ts` → `gameActor.scout.test.ts`
- `gameStore.pass.test.ts` → `gameActor.pass.test.ts`
- `gameStore.cardSelection.test.ts` → `gameActor.cardSelection.test.ts`
- `gameStore.actions.test.ts` → `gameActor.actions.test.ts`
- `gameStore.turns.test.ts` → `gameActor.turns.test.ts`
- `gameStore.era.test.ts` → `gameActor.era.test.ts`
- `gameStore.income.test.ts` → `gameActor.income.test.ts`
- `gameStore.markets.test.ts` → `gameActor.markets.test.ts`
- `gameStore.coal.test.ts` → `gameActor.coal.test.ts`
- `gameStore.autoflip.test.ts` → `gameActor.autoflip.test.ts`
- `gameStore.integration.test.ts` → `gameActor.integration.test.ts`
- `gameStore.error.test.ts` → `gameActor.error.test.ts`
- `gameStore.xstate.test.ts` → `gameActor.xstate.test.ts`

### Step 1.4: Test Helper Utilities
```typescript
// v2/_tests/_utils/testHelpers.ts
export const setupV2Game = () => {
  const actor = createActor(gameActor)
  // Copy setupGame logic from existing tests
}

export const createV2TestPlayers = () => {
  // Copy createTestPlayers logic
}
```

## Phase 2: State Analysis and Marking
**Goal**: Identify what state should be separated without breaking anything

### Step 2.1: Add Privacy Comments
Mark state in context interface:
```typescript
interface GameState {
  // PUBLIC STATE - visible to all players
  era: 'canal' | 'rail'
  round: number
  currentPlayerIndex: number
  
  // PRIVATE STATE - should be player-specific
  players: Array<{
    hand: Card[]  // PRIVATE: only this player should see
    money: number // PUBLIC: all players can see
  }>
  
  // UI STATE - should be client-only
  selectedCard: Card | null // UI: never sync to server
  selectedLocation: CityId | null // UI: never sync to server
}
```

### Step 2.2: Create Privacy Test Suite
```typescript
// v2/gameActor.privacy.test.ts
describe('Privacy Boundaries (Analysis)', () => {
  test('identifies private player state', () => {
    // Mark what should be private
  })
  
  test('identifies UI state', () => {
    // Mark what should be client-only
  })
  
  test('identifies public game state', () => {
    // Mark what should be shared
  })
})
```

## Phase 3: UI State Separation
**Goal**: Extract UI state to separate actor while maintaining all test compatibility

### Step 3.1: Create UI Actor
```typescript
// v2/uiActor.ts
export const uiActor = setup({
  types: {} as {
    context: {
      selectedCard: Card | null
      selectedLocation: CityId | null
      selectedIndustryTile: IndustryTile | null
      selectedCardsForScout: Card[]
      selectedTilesForDevelop: IndustryType[]
      // All selection/wizard state
    }
    events: UIEvent
  }
}).createMachine({
  id: 'uiActor',
  // UI state machine logic
})
```

### Step 3.2: Convert Card Selection Tests
```typescript
// v2/uiActor.cardSelection.test.ts
// Convert gameActor.cardSelection.test.ts to use uiActor
```

### Step 3.3: Update Game Actor
- Remove UI state from gameActor context
- Add communication with uiActor
- Ensure all existing tests still pass

## Phase 4: Player State Separation  
**Goal**: Extract private player state while maintaining test compatibility

### Step 4.1: Create Player Actor
```typescript
// v2/playerActor.ts
export const playerActor = setup({
  types: {} as {
    context: {
      playerId: string
      hand: Card[]
      // Other private player data
    }
    events: PlayerEvent
  }
}).createMachine({
  id: 'playerActor'
  // Player-specific state and logic
})
```

### Step 4.2: Convert Hand Management
- Move hand management logic to playerActor
- Update tests to work with new architecture
- Maintain 100% test compatibility

## Phase 5: Game Logic Purification
**Goal**: Clean game logic actor with only public state

### Step 5.1: Create Pure Game Logic Actor
```typescript
// v2/gameLogicActor.ts
export const gameLogicActor = setup({
  types: {} as {
    context: {
      era: 'canal' | 'rail'
      round: number
      board: BoardState
      market: MarketState
      publicPlayerData: PublicPlayerData[] // No private data
    }
  }
}).createMachine({
  // Pure game logic, no private data
})
```

## Phase 6: Orchestrator Integration
**Goal**: Create orchestrator that coordinates all actors

### Step 6.1: Game Orchestrator
```typescript
// v2/gameOrchestrator.ts
export const gameOrchestrator = setup({
  actors: {
    gameLogic: gameLogicActor,
    player: playerActor,
    ui: uiActor
  }
}).createMachine({
  id: 'gameOrchestrator',
  invoke: [
    { id: 'gameLogic', src: 'gameLogic' },
    { id: 'ui', src: 'ui' },
    // Dynamic player actors
  ]
})
```

### Step 6.2: Integration Tests
```typescript
// v2/gameOrchestrator.integration.test.ts
// Convert gameActor.integration.test.ts to use orchestrator
```

## Success Criteria per Phase

**Phase 1**: ✅ All copied tests pass with identical behavior
**Phase 2**: ✅ State boundaries identified and documented  
**Phase 3**: ✅ UI state separated, all tests still pass
**Phase 4**: ✅ Player state separated, privacy improved
**Phase 5**: ✅ Game logic purified, no private data
**Phase 6**: ✅ Full actor system, complete feature parity

## Test Coverage Goals
- 100% test coverage maintained throughout migration
- All existing tests converted 1:1
- New privacy and architecture tests added
- Zero feature regression

## Files to Create/Copy
1. Copy `gameStore.ts` → `v2/gameActor.ts`
2. Copy all 18 test files → `v2/gameActor.*.test.ts` 
3. Copy `shared/gameUtils.ts` → `v2/_shared/gameUtils.ts`
4. Copy `shared/validation.ts` → `v2/_shared/validation.ts`
5. Create new `v2/README.md` with this plan ✅
6. Create test utilities in `v2/_tests/_utils/`

## Current Status: Phase 1 - Direct Copy and Convert Foundation

This approach ensures we start with a working copy and gradually improve the architecture while maintaining 100% feature parity through the comprehensive test suite.