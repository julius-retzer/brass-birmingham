---
phase: 01-game-engine
plan: 01
subsystem: data
tags: [brass-birmingham, board-game, game-data, validation, vitest]

# Dependency graph
requires: []
provides:
  - Corrected city industry slots for all 20 cities + 2 farm breweries
  - Corrected board connections with proper canal/rail era types
  - Corrected industry tile definitions for all 6 industry types
  - Merchant player-count filtering function
  - Data validation test suite (79 tests)
affects: [01-02, 01-03, 01-04, game-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [data-validation-tests, tdd-for-game-data]

key-files:
  created:
    - src/data/board.test.ts
    - src/data/industryTiles.test.ts
    - src/data/merchants.test.ts
  modified:
    - src/data/board.ts
    - src/data/industryTiles.ts
    - src/data/merchants.ts

key-decisions:
  - "Farm breweries added as city type (not separate entity) for consistency with existing city-based logic"
  - "Pottery level 5 is rail-era only with hasLightbulbIcon true (cannot be developed)"

patterns-established:
  - "Data validation tests: dedicated test file per data module verifying exact values against real game"
  - "getMerchantsForPlayerCount: filter pattern for player-count-dependent game setup"

requirements-completed: [ENGINE-01]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 1 Plan 1: Fix Game Data Summary

**Corrected all board data (22 cities, 42 connections), industry tiles (6 types, 45 total tiles), and merchant filtering for 2/3/4-player games with 79 validation tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T09:44:19Z
- **Completed:** 2026-03-22T09:49:23Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- All 20 cities + 2 farm breweries have correct industry slots matching real Brass Birmingham board
- All connections corrected: era types fixed, non-existent connections removed, missing connections added
- All industry tile definitions corrected across 6 types (cotton, coal, iron, manufacturer, pottery, brewery)
- New pottery level 5 added (rail-only, 24 cost, 20 VP)
- Merchant filtering supports 2-player (excludes Warrington/Nottingham), 3-player (excludes Nottingham), and 4-player games

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix board data** - `97a55b3` (feat)
2. **Task 2: Fix industry tile definitions** - `d91a937` (feat)
3. **Task 3: Fix merchant setup** - `4cdad6d` (feat)

## Files Created/Modified
- `src/data/board.ts` - Corrected city industry slots, connections, added farm breweries
- `src/data/board.test.ts` - 38 validation tests for board data accuracy
- `src/data/industryTiles.ts` - Corrected all tile stats, added pottery level 5
- `src/data/industryTiles.test.ts` - 36 validation tests for tile data accuracy
- `src/data/merchants.ts` - Added getMerchantsForPlayerCount() function
- `src/data/merchants.test.ts` - 5 validation tests for merchant filtering

## Decisions Made
- Farm breweries implemented as city type entries in the cities object rather than a separate data structure, keeping consistency with existing city-based game logic
- Pottery level 5 added as rail-era only tile with hasLightbulbIcon true (cannot be developed), matching reference implementation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Existing gameStore tests (gameStore.build.test.ts, gameStore.error.test.ts, gameStore.network.test.ts) fail due to changed board data (they reference old slot configurations). This is expected and documented in the plan -- subsequent plans handle test fixes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All game data files are corrected and validated with 79 tests
- Ready for Plan 02 (core game engine logic) which depends on accurate data
- Note: 12 existing gameStore tests will need updating in subsequent plans to match new board data

## Self-Check: PASSED

All 6 files verified present. All 3 task commits verified in git log.

---
*Phase: 01-game-engine*
*Completed: 2026-03-22*
