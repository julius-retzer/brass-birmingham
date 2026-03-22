---
phase: 01-game-engine
plan: 05
subsystem: testing
tags: [xstate, vitest, integration-test, scoring, game-over, coverage]

requires:
  - phase: 01-game-engine/01
    provides: "Corrected board data, city industry slots, connections"
  - phase: 01-game-engine/02
    provides: "Scoring logic, era transitions, gameResult structure"
  - phase: 01-game-engine/03
    provides: "Action validation (network, build, develop, sell)"
  - phase: 01-game-engine/04
    provides: "Edge cases: bankruptcy, empty markets, turn order"
provides:
  - "Complete 2-player game integration test proving end-to-end game flow"
  - "Hand-calculated VP verification for canal and rail era scoring"
  - "Winner determination tests with income and money tiebreakers"
  - "Automatic era transition test (natural flow without TRIGGER_ events)"
  - "All 165 tests passing with 0 failures and 0 skipped"
  - "Coverage metrics: gameStore.ts at 82% line coverage"
affects: [02-multiplayer, game-engine]

tech-stack:
  added: ["@vitest/coverage-v8"]
  patterns: ["Integration test with TEST_ events for deterministic board state setup", "Hand-calculated VP in test comments for auditability"]

key-files:
  created: []
  modified:
    - src/store/gameStore.integration.test.ts
    - src/store/gameStore.coal.test.ts
    - src/store/gameStore.markets.test.ts

key-decisions:
  - "Rewrote integration test from scratch using TEST_ events for deterministic state setup instead of trying to script 30+ game actions"
  - "Canal links are invisible in rail era (calculateNetworkDistance filters by era type) -- tests must use rail links for rail-era merchant connections"
  - "Coal market merchant access test requires pre-existing rail link to merchant (coal check happens before link is built)"

patterns-established:
  - "Integration test pattern: use TEST_SET_PLAYER_STATE to set known board state, then TRIGGER_ events for scoring, then assert hand-calculated VP values"
  - "Each VP assertion includes hand-calculation comment showing linkIcon sums and industry VP breakdown"

requirements-completed: [ENGINE-06, ENGINE-01]

duration: 10min
completed: 2026-03-22
---

# Phase 01 Plan 05: Full Game Integration Test and Coverage Summary

**10 integration tests verifying complete 2-player game flow with hand-calculated VP scoring, automatic era transitions, and all 7 action types -- 165 tests passing, 0 skipped**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-22T10:31:54Z
- **Completed:** 2026-03-22T10:42:30Z
- **Tasks:** 3 commits
- **Files modified:** 5

## Accomplishments
- Rewrote integration test from scratch: 10 deterministic tests covering full game lifecycle
- Hand-calculated VP for both canal and rail eras with specific board states (values verified in test comments)
- Winner determination tested with VP tiebreaker chain (income > money)
- Automatic era transition verified (natural flow when draw pile + hands empty)
- All 7 action types exercised (BUILD, NETWORK, DEVELOP, SELL, SCOUT, TAKE_LOAN, PASS)
- Fixed 3 pre-existing test failures (coal tests with invalid connections, markets test with wrong city)
- Coverage measured: gameStore.ts 82% lines, marketActions.ts 92%, gameUtils.ts 82%
- All 165 tests pass across 19 test files, 0 failures, 0 skipped

## Task Commits

1. **Fix coal test invalid connections for rail era** - `6c51dec` (fix)
2. **Complete game integration test with VP verification** - `acbdeae` (feat)
3. **Add @vitest/coverage-v8 for coverage reporting** - `5a6a601` (chore)

## Files Created/Modified
- `src/store/gameStore.integration.test.ts` - Complete rewrite: 10 tests for game init, full flow, VP scoring, tiebreakers, era transition, action types, error handling
- `src/store/gameStore.coal.test.ts` - Fixed 2 tests: changed to valid connections (stoke->leek, worcester->kidderminster) with pre-existing rail links to merchants
- `src/store/gameStore.markets.test.ts` - Fixed 1 test: changed coal build location from stoke (no coal slot) to dudley (has coal slot)
- `package.json` - Added @vitest/coverage-v8 dev dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Rewrote integration test using TEST_ event approach instead of complex game scripts: more deterministic, easier to maintain, and VP values are hand-calculable
- Canal links are invisible in rail era due to calculateNetworkDistance filtering -- this is correct game behavior and tests must account for it
- Coal consumption check runs BEFORE link construction -- tests for merchant coal access need pre-existing rail links

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed coal tests with invalid board connections**
- **Found during:** Pre-task verification (running full test suite)
- **Issue:** Two coal tests used invalid connections (warrington->birmingham, gloucester->birmingham) from deferred items in plan 01-03
- **Fix:** Changed to valid connections with pre-existing rail links to merchant cities. Updated assertions for 2 links instead of 1.
- **Files modified:** src/store/gameStore.coal.test.ts
- **Verification:** All 8 coal tests pass
- **Committed in:** 6c51dec

**2. [Rule 3 - Blocking] Fixed markets test with wrong city for coal slot**
- **Found during:** Full test suite run
- **Issue:** Markets test tried to build coal at stoke, which has no coal slot after 01-01 data corrections
- **Fix:** Changed build location to dudley (which has a dedicated coal slot)
- **Files modified:** src/store/gameStore.markets.test.ts
- **Verification:** All 13 market tests pass
- **Committed in:** acbdeae

**3. [Rule 3 - Blocking] Missing @vitest/coverage-v8 dependency**
- **Found during:** Running coverage command
- **Issue:** `pnpm test --run --coverage` failed with missing dependency error
- **Fix:** Installed @vitest/coverage-v8 as dev dependency
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** Coverage report generated successfully
- **Committed in:** 5a6a601

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes necessary to achieve 0-failure test suite and coverage reporting. No scope creep.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Game engine is fully tested with 165 passing tests across 19 files
- Integration test proves complete game flow works end-to-end
- VP scoring verified against hand-calculated values
- Coverage metrics available for monitoring
- Phase 1 (Game Engine) is complete -- ready for Phase 2 (Multiplayer)

---
*Phase: 01-game-engine*
*Completed: 2026-03-22*
