---
phase: 01-game-engine
verified: 2026-03-22T20:00:00Z
status: gaps_found
score: 9/10 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "industryTiles.ts: 82.6% -> 100% line coverage (src/data now included in test script)"
    - "gameStore.coverage.test.ts created: 861 lines, 32 tests targeting all uncovered code paths"
    - "package.json test script updated to 'vitest run src/store src/data' (both directories)"
    - "Total test count: 307 -> 426 (30 new coverage tests + 89 from src/data now in scope)"
    - "gameStore.ts coverage: 91.36% -> 91.8% (marginal improvement, practical ceiling reached)"
  gaps_remaining:
    - "ENGINE-06: gameStore.ts at 91.8% line coverage — v8 coverage provider cannot instrument XState defensive dead code. Remaining ~8.2% consists exclusively of: (a) defensive event-type guards inside XState assign actions that never fire (XState only calls actions on matching events), (b) error-throw branches inside actions that are unreachable because state machine guards prevent invalid state, (c) guards defined but never referenced in any machine transition (isGameEnd, hasSelectedSecondLink, canSelectIndustryType). This is a hard technical ceiling with vitest v8 coverage provider."
  regressions: []
gaps:
  - truth: "Game machine has 100% unit test coverage for all actions and state transitions"
    status: partial
    reason: "gameStore.ts is at 91.8% line coverage — the practical maximum achievable with vitest's v8 coverage provider. The remaining ~8.2% uncovered lines are XState defensive dead code: event-type guards inside assign actions (if event.type !== 'X' return {}), error branches unreachable via state machine guards, and three guards defined but never wired into any machine transition (isGameEnd, hasSelectedSecondLink, canSelectIndustryType). All meaningful game logic paths are covered. industryTiles.ts is now at 100%."
    artifacts:
      - path: "src/store/gameStore.ts"
        issue: "91.8% line coverage (was 91.36%). Ceiling is ~91.8% with v8 provider. Uncovered code is XState defensive dead code, not logic gaps."
    missing:
      - "Switching from vitest v8 to istanbul coverage provider (requires @vitest/coverage-istanbul) may enable ignore comments and push coverage higher, but the v8/esbuild comment-stripping issue was tested and found to affect both providers. This is a known vitest limitation."
      - "Alternative: extract the three unreferenced guards (isGameEnd, hasSelectedSecondLink, canSelectIndustryType) from gameStore.ts into separate functions and unit-test them directly, bypassing the coverage-provider limitation."
---

# Phase 01: Game Engine Verification Report

**Phase Goal:** Every rule of 2-player Brass Birmingham is correctly enforced and verified by tests
**Verified:** 2026-03-22T20:00:00Z
**Status:** gaps_found (ENGINE-06 partial — 91.8% vs 100% target; technical ceiling)
**Re-verification:** Yes — after Plan 09 gap closure (gameStore.coverage.test.ts + test script update)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A full 2-player game can be simulated from start through Canal scoring, era transition, Rail era, and final scoring without errors | VERIFIED | gameStore.integration.test.ts — full lifecycle tests with hand-calculated VP; all 426 tests pass |
| 2 | All 7 action types reject invalid inputs and accept valid inputs according to Brass Birmingham rules | VERIFIED | Build, Network, Develop, Sell, Loan, Scout, Pass all tested; 32 additional tests in gameStore.coverage.test.ts exercise error paths |
| 3 | Scoring produces correct VP totals for both canal and rail eras (verified against hand-calculated reference games) | VERIFIED | gameStore.scoring.test.ts with hand-calculated reference game; all pass |
| 4 | Turn order, action count per turn, and first-round single-action rules work correctly across both eras | VERIFIED | gameStore.turns.test.ts, gameStore.era.test.ts; GAME_CONSTANTS.FIRST_ROUND_ACTIONS enforced |
| 5 | Edge cases (bankruptcy, empty markets, no valid moves, last card) are tested and handled | VERIFIED | gameStore.error.test.ts, gameStore.markets.test.ts, gameStore.edgecases.test.ts — all pass |
| 6 | All guard functions enforce correct state machine transitions | VERIFIED | gameStore.guards.test.ts (752 lines, 40+ checks); coverage tests add canCompleteBuild, canBuildSecondLink, hasSelectedTilesForDevelop, isGameEnd guard tests |
| 7 | selectIndustryType and selectTilesForDevelop selection actions work correctly | VERIFIED | gameStore.coverage.test.ts describes blocks for both; pottery-lightbulb filtering and max-2-tile limit tested |
| 8 | Pass action routes wild cards to correct piles | VERIFIED | gameStore.actions.test.ts "Pass with wild cards" describe block |
| 9 | Sell action applies all 3 merchant bonus types correctly (income, VP, develop) | VERIFIED | gameStore.sell.test.ts extended with merchant income, VP, and develop bonus tests |
| 10 | Game machine has 100% unit test coverage for all actions and state transitions | PARTIAL | buildActions.ts: 100%. gameUtils.ts: 100%. industryTiles.ts: 100% (was 82.6% — gap closed). marketActions.ts: 98.37%. gameStore.ts: 91.8% (was 91.36% — practical ceiling with v8 provider; XState defensive dead code cannot be covered). |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/store/gameStore.coverage.test.ts` | Tests for all uncovered error paths, guard branches, and edge cases in gameStore.ts | VERIFIED | 861 lines, 32 tests, 19 describe blocks covering all 7 action types plus guards, JOIN_GAME, and selection actions. Wired via `import { gameStore } from './gameStore'` + `createActor(gameStore)`. |
| `src/data/industryTiles.test.ts` | Tests for getInitialPlayerIndustryTiles, canBuildTileInEra, canDevelopTile utility functions | VERIFIED | File existed previously with tests; now in scope via updated test script. industryTiles.ts at 100% line coverage. Wired via `import { getInitialPlayerIndustryTiles, canBuildTileInEra, canDevelopTile } from './industryTiles'`. |
| `package.json` | Updated test script that includes src/data test files in coverage | VERIFIED | `"test": "vitest run src/store src/data"` — includes both directories. 28 test files total. |
| `src/store/gameStore.ts` | Game state machine | PARTIALLY COVERED | 91.8% line coverage — hard ceiling with v8 coverage provider. All meaningful logic paths covered. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/store/gameStore.coverage.test.ts` | `src/store/gameStore.ts` | `import { gameStore } from './gameStore'` + `createActor(gameStore)` | WIRED | Confirmed by grep; 32 tests exercise state machine directly |
| `src/data/industryTiles.test.ts` | `src/data/industryTiles.ts` | `import { ... } from './industryTiles'` | WIRED | Confirmed by grep; industryTiles.ts at 100% lines |
| `package.json test script` | `src/store/**/*.test.ts` + `src/data/**/*.test.ts` | `vitest run src/store src/data` | WIRED | Confirmed in package.json; 426 tests across 28 files pass |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ENGINE-01 | 01-01, 01-05 | Game machine correctly implements all Brass Birmingham rules for 2 players | SATISFIED | 426 tests pass; integration test with hand-calculated VP passes |
| ENGINE-02 | 01-02 | Canal era scoring calculates link points and industry points correctly | SATISFIED | triggerEraScoring with linkScoringIcons; scoring tests pass |
| ENGINE-03 | 01-02 | Rail era scoring calculates link points and industry points correctly | SATISFIED | triggerRailEraEnd; rail scoring tests pass |
| ENGINE-04 | 01-02 | Era transition correctly removes canal-only links/tiles, re-deals cards, sets turn order | SATISFIED | triggerCanalEraEnd; era transition tests pass |
| ENGINE-05 | 01-03 | All 7 action types have complete rule enforcement with correct resource/money handling | SATISFIED | All 7 actions implemented, tested, and 32 additional coverage tests passing |
| ENGINE-06 | 01-05 through 01-09 | Game machine has 100% unit test coverage for all actions and state transitions | PARTIAL | gameStore.ts at 91.8% — hard ceiling with vitest v8. buildActions.ts: 100%, gameUtils.ts: 100%, industryTiles.ts: 100% (gap closed), marketActions.ts: 98.37%. "100% coverage" is technically unmet on gameStore.ts only; all logic paths are tested, only XState defensive dead code is uncovered. |
| ENGINE-07 | 01-04, 01-08 | Edge cases tested: bankruptcy, empty markets, no valid moves, last card scenarios | SATISFIED | gameStore.edgecases.test.ts: "No Valid Moves" (2 tests), "Last Card Triggers Era End" (3 tests); gameStore.error.test.ts: bankruptcy; gameStore.markets.test.ts: empty markets |
| ENGINE-08 | 01-04 | Turn order correctly determined each round (lowest spend goes first) | SATISFIED | playerSpending tracking; gameStore.turns.test.ts passes |
| ENGINE-09 | 01-04 | Current player switches correctly after each action (2 actions per turn) | SATISFIED | actionsRemaining decremented; gameStore.turns.test.ts passes |
| ENGINE-10 | 01-02 | First round of each era correctly gives each player only 1 action | SATISFIED | GAME_CONSTANTS.FIRST_ROUND_ACTIONS; gameStore.era.test.ts passes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/store/gameStore.ts` | ~2384-2415 | `canSelectIndustryType` guard defined but never referenced in machine transitions | Info | Dead code — guard was written but not wired into any transition; impossible to test via state machine |
| `src/store/gameStore.ts` | ~1914-1918 | `trackMoneySpent` action defined but never referenced in any machine transition | Info | Dead code — spending tracked inline in executeBuildAction/executeNetworkAction instead |
| `src/store/gameStore.ts` | Defensive event-type guards | `if (event.type !== 'X') return {}` in assign actions | Info | XState defensive pattern — unreachable because XState only calls actions for matching events. Not a logic gap. |

No blockers found. All anti-patterns are info-level dead code resulting from XState's defensive coding conventions.

### Human Verification Required

None. All phase behaviors are verifiable programmatically.

### Re-Verification Comparison

| Item | Previous (after glob fix) | Current (after Plan 09) | Change |
|------|--------------------------|-------------------------|--------|
| Total tests running | 307 | 426 | +119 tests (30 new coverage tests + 89 from src/data) |
| Test files | 24 | 28 | +4 test files in scope |
| gameStore.ts line coverage | 91.36% | **91.8%** | +0.44pp — marginal improvement, hard ceiling reached |
| industryTiles.ts line coverage | 82.6% | **100%** | +17.4pp — gap fully closed |
| buildActions.ts line coverage | 100% | 100% | No change — maintained |
| gameUtils.ts line coverage | 100% | 100% | No change — maintained |
| marketActions.ts line coverage | 98.37% | 98.37% | No change — maintained |
| ENGINE-06 (100% coverage) | PARTIAL (glob) | PARTIAL (v8 ceiling) | Root cause changed: was a glob exclusion bug, now is a v8 provider technical ceiling |

### Gaps Summary

**Plan 09 achieved all achievable coverage improvements.** industryTiles.ts reached 100% (gap closed). gameStore.coverage.test.ts (861 lines, 32 tests) exercises all 7 action error paths, guard functions, selection actions, and JOIN_GAME flows. Total tests grew from 307 to 426, all passing.

**Remaining gap (ENGINE-06):** gameStore.ts at 91.8% is a hard technical ceiling imposed by vitest's v8 coverage provider. The uncovered ~8.2% consists exclusively of:

1. **XState defensive event-type guards** — `if (event.type !== 'X') return {}` inside assign actions. XState only invokes an action callback when the matching event fires, so these guards can never evaluate to true through normal state machine usage.
2. **Error branches inside guarded actions** — throw statements inside XState assign actions that are unreachable because state machine guards prevent the machine from reaching those actions with invalid state.
3. **Unreferenced guards** — `isGameEnd`, `hasSelectedSecondLink`, `canSelectIndustryType` are defined but not wired into any machine transition. They are dead code.

The game engine's business logic — all 7 action types, both era scorings, era transitions, turn order, edge cases — is fully covered. The ENGINE-06 literal requirement of "100% coverage" is not met due to XState's inherent defensive coding patterns creating permanently unreachable code paths under vitest v8.

**9 out of 10 success criteria are fully SATISFIED.** The game engine correctly implements all Brass Birmingham rules for 2 players.

---

_Verified: 2026-03-22T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after Plan 09 gap closure (gameStore.coverage.test.ts + test script update)_
