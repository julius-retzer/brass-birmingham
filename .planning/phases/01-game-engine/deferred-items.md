# Deferred Items - Phase 01 Game Engine

## From Plan 01-03: Action Validation Fixes

### 1. Coal test file uses invalid board connections
- **File:** `src/store/gameStore.coal.test.ts`
- **Tests:** `SUCCESS: Coal market access when connected to merchant`, `SUCCESS: Coal market fallback price when market empty but connected`
- **Issue:** Tests use `warrington->birmingham` connection which doesn't exist (warrington only connects to stoke)
- **Cause:** Plan 01-03 added connection validation to `canBuildLink` guard, now correctly rejecting invalid connections
- **Fix:** Update tests to use valid connections (e.g., `stoke->warrington`)

### 2. Markets test file uses invalid board connections
- **File:** `src/store/gameStore.markets.test.ts`
- **Test:** `resource consumption priority - coal from mines first`
- **Issue:** Test likely uses invalid city connections that now fail validation
- **Fix:** Update test to use valid board connections
