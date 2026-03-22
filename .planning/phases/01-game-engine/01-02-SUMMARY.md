---
phase: 01-game-engine
plan: 02
subsystem: game-engine
tags: [xstate, scoring, era-transition, tdd, brass-birmingham]

# Dependency graph
requires:
  - phase: 01-game-engine/01
    provides: Corrected industry tile definitions with linkScoringIcons values
provides:
  - Correct link scoring using linkScoringIcons from adjacent flipped industries
  - Full rail era final scoring with winner determination and tiebreakers
  - Automatic era transitions via XState always guards (no manual TRIGGER_ events needed)
  - gameResult on GameState with score breakdown per player
affects: [01-03, 01-04, game-engine, ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [xstate-always-guards-for-automatic-transitions, game-result-structure]

key-files:
  created:
    - src/store/gameStore.scoring.test.ts
  modified:
    - src/store/gameStore.ts
    - src/store/gameStore.era.test.ts
    - src/store/shared/gameUtils.ts

key-decisions:
  - "Income is NOT converted to VP per official rules -- only used as tiebreaker"
  - "gameResult structure includes per-player breakdown (linkVP, industryVP, finalIncome, finalMoney)"
  - "TRIGGER_ events kept on root state for backward compatibility, automatic transitions added in parallel"

patterns-established:
  - "Automatic XState transitions: always guards route between states without user events"
  - "Game result structure: gameResult field on context with winner, isTie, scores array"

requirements-completed: [ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-10]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 01 Plan 02: Correct Scoring and Automatic Era Transitions Summary

**Fixed link scoring to use linkScoringIcons, implemented rail era final scoring with VP/income/money tiebreakers, and added automatic XState era transitions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T09:52:24Z
- **Completed:** 2026-03-22T09:57:40Z
- **Tasks:** 4 (TDD: RED, GREEN, states, era tests)
- **Files modified:** 4

## Accomplishments
- Link scoring correctly sums linkScoringIcons from ALL flipped industries in BOTH adjacent cities across ALL players
- Rail era final scoring records gameResult with winner determination using VP > income > money tiebreaker chain
- Automatic era transitions via XState always guards (nextPlayer -> eraScoring -> eraTransition/gameOver)
- First round of rail era correctly gives 1 action per player

## Task Commits

Each task was committed atomically:

1. **RED: Scoring tests** - `01e6460` (test) - 13 tests for link VP, industry VP, winner determination
2. **GREEN: Fix scoring + implement winner determination** - `53019c0` (feat) - Fixed triggerEraScoring, implemented triggerRailEraEnd, fixed isFirstRound
3. **XState automatic era transitions** - `1561e2e` (feat) - Added eraScoring, eraTransition, gameOver states with always guards
4. **Era transition tests** - `ccf7b43` (test) - Tests for automatic transitions and first-round rail era

## Files Created/Modified
- `src/store/gameStore.scoring.test.ts` - 13 scoring tests (link VP, industry VP, winner determination, tiebreakers)
- `src/store/gameStore.ts` - Fixed triggerEraScoring, implemented triggerRailEraEnd, added gameResult, eraScoring/eraTransition/gameOver states, isCanalEra guard
- `src/store/gameStore.era.test.ts` - Added 2 new tests (automatic transition, first-round rail era), fixed assertion for 1 action
- `src/store/shared/gameUtils.ts` - Fixed isFirstRound to work for both eras (round === 1)

## Decisions Made
- Income is NOT converted to VP per official Brass Birmingham rules -- only used as first tiebreaker, money as second tiebreaker
- TRIGGER_ events kept on root playing state for backward compatibility; automatic transitions added via new states in parallel
- gameResult includes per-player score breakdown (linkVP, industryVP, totalVP, finalIncome, finalMoney)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed isFirstRound to work for both eras**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** isFirstRound only returned true for canal era round 1 (`context.era === 'canal' && context.round === 1`), but per rules first round of EITHER era gives 1 action
- **Fix:** Changed to `context.round === 1` (no era check)
- **Files modified:** src/store/shared/gameUtils.ts
- **Verification:** Era test confirms rail era starts with 1 action
- **Committed in:** 53019c0

**2. [Rule 1 - Bug] Fixed triggerCanalEraEnd actionsRemaining**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** triggerCanalEraEnd hardcoded `actionsRemaining: 2` for rail era start, should be 1 for first round
- **Fix:** Changed to use `GAME_CONSTANTS.FIRST_ROUND_ACTIONS`
- **Files modified:** src/store/gameStore.ts
- **Verification:** Era test confirms actionsRemaining is 1 after canal era end
- **Committed in:** 53019c0

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for correct first-round-of-era behavior per official rules. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scoring and era transitions are fully implemented and tested
- gameResult structure is ready for UI consumption
- Automatic XState transitions eliminate need for manual TRIGGER_ events in game flow
- Pre-existing test failures in build/network tests are unrelated to this plan's changes

---
*Phase: 01-game-engine*
*Completed: 2026-03-22*
