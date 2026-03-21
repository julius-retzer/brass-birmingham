# Codebase Concerns

**Analysis Date:** 2026-03-21

## Tech Debt

**Large Monolithic State Machine:**
- Issue: `src/store/gameStore.ts` is 2,799 lines, containing the entire XState machine definition inline with all action implementations and guards
- Files: `src/store/gameStore.ts`
- Impact: Difficult to navigate, modify, and extend. Single point of failure for game logic. Makes testing isolated features harder. Increases cognitive load when adding new features.
- Fix approach: Extract action/guard definitions into separate modules by domain (e.g., `src/store/build/`, `src/store/network/`, `src/store/shared/`). Keep state configuration in the main file but move implementations out.

**Legacy Store Files Still Present:**
- Issue: Multiple abandoned state machine implementations remain in codebase
- Files: `src/legacyStores/claudeMachine.ts` (30KB), `src/legacyStores/gamesStoreOld.ts` (37KB), `src/legacyStores/claudeMachine2.ts` (6.9KB), `src/legacyStores/gameStorePoc.ts` (3.2KB)
- Impact: Adds ~80KB of dead code. Creates confusion about which implementation is "correct". Increases context when reading code. Wastes time when searching for where things are implemented.
- Fix approach: Delete entire `src/legacyStores/` directory. Verify tests for new store cover what was tested in old stores.

**Type Casting Workarounds:**
- Issue: Multiple `as any` type assertions in client code for XState snapshot restoration
- Files: `src/components/GameInterface.tsx` (lines 58, 73), `src/app/game/[gameId]/created/page.tsx`, `src/server/stateFilter.ts` (lines 76-79)
- Impact: Loses TypeScript safety on critical snapshot reconstruction logic. Errors in snapshot format won't be caught at compile time. Makes it harder to refactor XState store confidently.
- Fix approach: Create proper TypeScript interfaces for the persisted snapshot format. Update XState snapshot type definitions to match what's actually being stored/restored.

**Unsafe State Filtering with Type Assertions:**
- Issue: `src/server/stateFilter.ts` uses `as any` and `delete` operations to remove properties from filtered state
- Files: `src/server/stateFilter.ts`
- Impact: Fragile approach that could break if properties get added. No compile-time verification that deleted properties are actually removed.
- Fix approach: Create filtered state object from scratch instead of spreading and deleting. Use `Omit` type helper properly to ensure type safety.

## Known Bugs

**Network Test Failures:**
- Symptoms: Two network action tests failing in `gameStore.network.test.ts`
  1. "network adjacency requirement" - expected 0 to be 1
  2. "network costs vary by era" - expected 1 to be >= 2
- Files: `src/store/gameStore.ts` (network action implementation), `src/store/gameStore.network.test.ts` (tests at lines 502+ and 531+)
- Trigger: Running `pnpm test` or `pnpm test:all` fails the network tests
- Workaround: Tests are not blocking CI/CD since test suite still passes overall. Network action itself is not yet fully implemented.

**Incomplete Network Action Implementation:**
- Issue: `src/store/network/networkActions.ts` contains stub functions with TODO comments
- Files: `src/store/network/networkActions.ts` (lines 6-9, 11-18)
- Trigger: Network action is attempted in game (user selects network action)
- Impact: Network building doesn't actually validate connections or apply proper costs. Player can build invalid networks.
- Workaround: Network action returns context unchanged (line 8), so no actual state corruption occurs, but game rules aren't enforced

## Security Considerations

**Game State Serialization to Database:**
- Risk: Game state stored as JSON string in database. If deserialization is not done carefully, malformed data could cause crashes or unexpected behavior.
- Files: `src/server/gameManager.ts` (lines 57, 84, 118, 154, 174), `src/server/db/schema.ts` (line 5)
- Current mitigation: Using XState's `getPersistedSnapshot()` and snapshot restoration via `createActor(gameStore, { snapshot })`. Assumes snapshot format is immutable.
- Recommendations: Add validation of snapshot structure before restoring. Consider versioning snapshot format to handle future schema changes. Add try-catch around JSON.parse operations (currently missing in some paths).

**Private Information Filtering:**
- Risk: Hand cards for opponent players should never leak to client. Filtering logic in `src/server/stateFilter.ts` is critical for hiding opponent cards.
- Files: `src/server/stateFilter.ts`, `src/components/GameInterface.tsx` (uses filtered state)
- Current mitigation: `filterGameStateForPlayer()` removes opponent hand property, only includes hand for requesting player. Proper checks on `playerIndex - 1` conversion.
- Recommendations: Add unit tests specifically for the hand filtering (currently has coverage but could be more explicit). Consider returning error if state is sent to wrong player index. Add logging on hand access for debugging.

## Performance Bottlenecks

**Game State Polling Every 3 Seconds:**
- Problem: `src/hooks/useGamePolling.ts` polls game status every 3 seconds regardless of game state (e.g., if current player is someone else). Creates unnecessary network requests.
- Files: `src/hooks/useGamePolling.ts` (line 51), `src/components/GameInterface.tsx` (line 51)
- Cause: Uses fixed interval without checking if current player is waiting for action or another player is active
- Improvement path: Only poll when it's not the current player's turn. Increase polling interval to 5-10 seconds. Implement server-sent events (SSE) or WebSocket for push-based updates instead.

**Large State Objects Being Serialized:**
- Problem: Entire game context with all player hands, board state, and history gets JSON.stringify'd on every action
- Files: `src/server/gameManager.ts` (lines 57, 100, 174), `src/server/db/schema.ts` (line 5)
- Cause: Using TEXT column for entire state snapshot rather than normalized schema
- Scaling path: Move to normalized database schema. Store only delta changes instead of full snapshot. Consider JSONB columns if using PostgreSQL.

**Large Component Renders Without Optimization:**
- Problem: Board, player cards, and game interface components re-render entire subtree on any state change
- Files: `src/components/GameInterface.tsx`, `src/components/game/ImprovedGameInterface.tsx`, `src/components/Board/Board.tsx`
- Cause: Components use snapshots directly without memoization. Heavy use of computed selectors without caching.
- Improvement path: Memoize components with `React.memo()`. Use `useMemo` for derived state. Split large components into smaller pieces that only subscribe to needed state.

## Fragile Areas

**XState Snapshot Restoration in Browser:**
- Files: `src/components/GameInterface.tsx` (lines 55-96), `src/app/game/[gameId]/created/page.tsx`
- Why fragile: Creating XState actor from persisted snapshot in browser is a reconstruction process that can fail silently. Multiple `as any` assertions hide type mismatches. Fallback mock snapshot is incomplete.
- Safe modification: Add comprehensive tests for snapshot restoration. Create TypeScript types that match persisted format exactly. Log restoration failures with full error context. Avoid using `useMemo` without proper dependencies.
- Test coverage: Snapshot restoration has no dedicated unit tests. Only integration tests test the flow.

**Network Action Logic:**
- Files: `src/store/gameStore.ts` (network-related guards and actions), `src/store/network/networkActions.ts`, `src/store/gameStore.network.test.ts`
- Why fragile: Not fully implemented. Guards in state machine reference functions that have TODO comments. Tests are failing. Link validation depends on `calculateNetworkDistance()` which has complex graph logic.
- Safe modification: Complete the `validateNetworkConnection()` and `executeNetworkAction()` implementations. Fix failing tests before adding new features. Add guards to prevent invalid state transitions.
- Test coverage: 2 of 11 network tests failing. Basic network tests pass but advanced scenarios (era-specific costs, double linking) fail.

**State Filter and Reconstruction Logic:**
- Files: `src/server/stateFilter.ts`, `src/components/GameInterface.tsx` (usage)
- Why fragile: Two-way conversion (filter → send to client, reconstruct → use in actor) creates synchronization risk. Uses `delete` operator which is not type-safe. Filtered state has different shape than full state.
- Safe modification: Add comprehensive round-trip tests (filter then reconstruct, compare with original). Add type guards to catch shape mismatches. Consider using builder pattern instead of spreading/deleting.
- Test coverage: `src/server/stateFilter.test.ts` has tests but they're mostly checking that properties are undefined, not testing reconstruction round-trip.

**Develop Action Not Fully Implemented:**
- Files: `src/store/gameStore.ts` (develop action), `src/store/gameStore.develop.test.ts` (9 tests, 3 skipped)
- Why fragile: Multiple TODO comments in tests indicate incomplete implementation. Tile selection and removal not properly wired. Game doesn't track tile quantities correctly during development.
- Safe modification: Complete tile quantity tracking. Implement proper validation for develop action. Unskip and implement the 3 skipped tests.
- Test coverage: 3 of 12 develop tests are skipped, indicating incomplete feature.

## Scaling Limits

**Database Connection Pool:**
- Current capacity: SQLite with file-based storage (dev), Neon serverless (production)
- Limit: SQLite can only handle one writer at a time. If game load increases, concurrent games will get write contention.
- Scaling path: Move to PostgreSQL. Implement connection pooling. Consider read replicas for game status queries. Cache recent game states in Redis.

**In-Memory Test Complexity:**
- Current capacity: 179 tests total, 166 passing
- Limit: Each test creates a full game actor and processes events. No test parallelization. Large test files (1000+ lines each).
- Scaling path: Split test files by feature area. Implement test fixtures to reuse setup. Consider snapshot testing for complex state transitions.

## Dependencies at Risk

**XState v5 Migration:**
- Risk: Project uses XState v5 which is relatively new. Actor model and snapshot APIs may change.
- Impact: Snapshot serialization/deserialization logic would need updates. State machine definitions might need refactoring.
- Migration plan: Keep tests current. Use XState validation where possible. Document snapshot format assumptions. Monitor XState releases.

**Shadcn UI Component Library:**
- Risk: Many Shadcn UI components are imported but only a subset are actively used. Maintenance burden.
- Impact: Unused components add bundle size. Updates to library might introduce incompatibilities.
- Migration plan: Audit which Shadcn components are actually used. Remove unused components. Track which component versions are in use.

## Missing Critical Features

**Turn Order System:**
- Problem: Game rules require turn order to be recalculated based on player spending. Currently not implemented.
- Blocks: Fair turn progression. Players who spend money go later in next round.
- Files: Multiple TODOs in `src/store/gameStore.turns.test.ts`
- Priority: High - affects game fairness

**Era Transition Mechanics:**
- Problem: Moving from Canal Era to Rail Era requires specific discard pile shuffling and unflipped industry removal. Not implemented.
- Blocks: Game cannot progress past first era. Players can't see actual game progression.
- Files: TODOs in `src/store/gameStore.era.test.ts`
- Priority: High - blocks core gameplay

**Loan Action:**
- Problem: Loan action mechanics not fully implemented. Tests have TODOs.
- Blocks: Players with low money can't take loans to continue playing.
- Files: `src/store/gameStore.ts` (loan state machine), tests indicate incomplete
- Priority: Medium - players can pass instead but limits gameplay

**Proper Validation Feedback:**
- Problem: Error messages are generic. Players don't understand why actions fail.
- Blocks: Player experience suffers. Players make repeated invalid attempts.
- Files: `src/components/GameInterface.tsx`, `src/components/game/ErrorDisplay.tsx`
- Priority: Medium - improves UX but doesn't block gameplay

## Test Coverage Gaps

**Network Action Tests:**
- What's not tested: Valid network path finding across multiple era links. Double-link building in rail era. Network cost calculation variations.
- Files: `src/store/gameStore.network.test.ts` (has 11 tests, 2 failing)
- Risk: Network validation bugs won't be caught. Rules will be wrong when network is fully implemented.
- Priority: High - 2 current test failures must be fixed

**XState Machine Structure Tests:**
- What's not tested: State transitions under edge cases. Guard conditions prevent invalid state entry.
- Files: `src/store/gameStore.xstate.test.ts` (exists but minimal coverage)
- Risk: Machine configuration errors won't surface until gameplay.
- Priority: Medium - currently passing but could be more comprehensive

**Snapshot Restoration Tests:**
- What's not tested: Round-trip filtering and reconstruction. Filtered state actually works in XState actor.
- Files: `src/server/stateFilter.test.ts` (basic tests exist, no round-trip tests)
- Risk: Client-side actor restoration can silently fail or use incomplete data.
- Priority: High - critical for online multiplayer

**UI Component Integration Tests:**
- What's not tested: User interactions with game interface. Button clicks, card selections, state updates.
- Files: No integration tests for `src/components/` directory
- Risk: UI bugs won't be caught until manual testing. Regressions go unnoticed.
- Priority: Medium - E2E tests could cover this but unit tests would catch basics

**Development Action Round-Trip:**
- What's not tested: Selecting tile to develop, deducting from player mat, updating board state
- Files: `src/store/gameStore.develop.test.ts` (9 tests, 3 skipped)
- Risk: Develop action is broken when implemented. Players can't actually develop industries.
- Priority: High - feature is not ready for use

---

*Concerns audit: 2026-03-21*
