# Build Action Audit Report

**Auditor:** Claude (automated)
**Date:** 2026-03-22
**Source files:**
- `src/store/gameStore.ts` (executeBuildAction, canCompleteBuild, selectCard)
- `src/store/build/buildActions.ts` (validation functions, buildIndustryTile)
- `src/store/shared/gameUtils.ts` (canOverbuildIndustry, performOverbuild, canCityAccommodateIndustryType, isLocationInPlayerNetwork, validateIndustryBuildLocation)
- `src/data/board.ts` (cityIndustrySlots, connections, farm brewery definitions)
- `src/data/industryTiles.ts` (tile definitions with canBuildInCanalEra/canBuildInRailEra)

**Test files:**
- `src/store/gameStore.build.test.ts`
- `src/store/build/buildValidation.test.ts`

**Rulebook reference:** `ai-docs/brass-birmingham-rules.mdc` (BUILD ACTION section, pp. 4-6)

---

## Card Requirements

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-01 | Location card allows building at the named city only | PASS | `src/store/build/buildValidation.test.ts:656-672` (validateCardLocationMatching throws on mismatch, passes on match) | Implemented in `validateCardLocationMatching()` at `buildActions.ts:163-172` |
| BUILD-02 | Industry card allows building the named industry type at any location in player's network | PASS | `src/store/build/buildValidation.test.ts:674-700` (validateCardIndustryMatching); `src/store/build/buildValidation.test.ts:141-162` (network via industry/link) | Card-industry matching in `validateCardIndustryMatching()`. Network check in `validateNetworkRequirement()` |
| BUILD-03 | Wild Location card allows building at any city (but NOT farm breweries) | FAIL | `src/store/build/buildValidation.test.ts:113-125` (wild location builds anywhere -- no farm brewery exclusion test) | `validateNetworkRequirement()` at `buildActions.ts:45-47` treats wild_location same as location (returns immediately). **No code checks farm brewery exclusion for wild location cards.** Rulebook: "This does not include the 2 Farm Breweries." |
| BUILD-04 | Wild Industry card allows building any industry type | PASS | `src/store/build/buildValidation.test.ts:209-230` (wild_industry tested for network requirement) | `validateCardIndustryMatching()` at `buildActions.ts:174-188` only checks matching for `card.type === 'industry'`, wild_industry bypasses matching |
| BUILD-05 | One card must be discarded per build action | PASS | `src/store/gameStore.build.test.ts:118-119` (discardPile.length === 1 and correct card ID) | `executeBuildAction` at `gameStore.ts:627-629` removes card from hand, adds to discardPile at `gameStore.ts:683` |

## Location Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-06 | Can only build at locations that have a matching industry slot | PASS | `src/store/gameStore.build.test.ts:424-431` (rejects incompatible types); `src/store/build/buildValidation.test.ts:271-297` (rejects coal at Birmingham, cotton at merchant) | `canCityAccommodateIndustryType()` at `gameUtils.ts:500-544` checks `cityIndustrySlots` |
| BUILD-07 | Canal era: max 1 industry tile per location per player | MISSING | No test evidence found | **No implementation found.** `canCityAccommodateIndustryType()` only checks slot availability globally (all players), not per-player-per-location in canal era. A player could potentially build 2 different industry types at same location in canal era if slots exist. |
| BUILD-08 | Rail era: may place multiple tiles at same location | PASS | `src/store/gameStore.build.test.ts:594-614` (slot availability changes test implicitly demonstrates multiple builds at same location) | No explicit per-player limit in rail era. `canCityAccommodateIndustryType()` only checks slot availability. |
| BUILD-09 | Cannot build at a slot already occupied by another player's tile (unless overbuilding) | PASS | `src/store/gameStore.build.test.ts:433-494` (occupied slots correctly rejected); `src/store/build/buildValidation.test.ts:327-366` | `canCityAccommodateIndustryType()` considers all players' industries when determining occupied slots. Overbuilding handled separately by `canOverbuildIndustry()`. |
| BUILD-10 | Building with a location card does not require network connection | PASS | `src/store/build/buildValidation.test.ts:99-111` (location card builds with empty network); `buildActions.ts:44-47` | `validateNetworkRequirement()` returns immediately for location/wild_location cards |
| BUILD-11 | Building with an industry card requires location to be in player's network | PASS | `src/store/build/buildValidation.test.ts:141-207` (passes in network, rejects outside); `buildActions.ts:49-57` | `isLocationInPlayerNetwork()` checks via `getPlayerNetworkLocations()`. Exception: first build (no tiles) can build anywhere. |

## Cost and Resource Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-12 | Must pay the money cost shown on the industry tile | PASS | `src/store/gameStore.build.test.ts:131-139` (money deducted); `src/store/build/buildValidation.test.ts:850-862` (throws Insufficient funds) | `buildIndustryTile()` at `buildActions.ts:270-274` validates funds. Cost from `tile.cost`. |
| BUILD-13 | Must provide coal required (connected sources or market) | PASS | `src/store/gameStore.build.test.ts:171-239` (coal consumed from coal mine); `src/store/build/buildValidation.test.ts:1070-1091` (throws when no coal) | `buildIndustryTile()` at `buildActions.ts:238-253` calls `consumeCoalFromSources()`. Connection requirement enforced by coal consumption logic. |
| BUILD-14 | Must provide iron required (from board or market -- no network requirement) | PASS | `src/store/build/buildValidation.test.ts:939-997` (iron auto-sell test); implied by `consumeIronFromSources()` | `buildIndustryTile()` at `buildActions.ts:256-265`. `findAvailableIronWorks()` at `gameUtils.ts:124-136` has no connection check per rules. |
| BUILD-15 | Coal consumed from nearest source first (network distance) | PASS | `src/store/shared/gameUtils.ts:83-122` (findConnectedCoalMines sorts by distance, returns closest) | `findConnectedCoalMines()` uses `calculateNetworkDistance()` BFS and returns mines at shortest distance. Test coverage via `gameStore.build.test.ts:171-239`. |
| BUILD-16 | Iron consumed from board first, then market | PASS | `src/store/shared/gameUtils.ts:124-136` (findAvailableIronWorks checks board first) | `consumeIronFromSources()` checks board iron works first, falls back to market. Pattern matches rules. |

## Overbuilding Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-17 | Can overbuild own tile (replace with higher level of same or different industry) | PASS | `src/store/build/buildValidation.test.ts:999-1029` (overbuilt own level 1 with level 2); `gameUtils.ts:428-430` | `canOverbuildIndustry()` at `gameUtils.ts:428-430`: own tile always allowed. **ISSUE:** Implementation only checks same industry type (`findExistingIndustryAtLocation` filters by `industryType`). Rulebook says "higher-level tile of the same industry type" -- so same type is correct per rules. |
| BUILD-18 | Cannot overbuild opponent's tile (except Coal Mine / Iron Works when no resources exist) | PASS | `src/store/shared/gameUtils.ts:433-474` (checks opponent restrictions: only coal/iron, no cubes on board/market) | Tests at `src/store/build/buildValidation.test.ts:813-847` (rejects lower level overbuild). Opponent restriction logic is thorough: checks all cubes on board + market. |
| BUILD-19 | Overbuilt tile must be same location | PASS | Implicit in implementation | `canOverbuildIndustry()` is called with `context.selectedLocation!` -- always checks at the selected build location. `findExistingIndustryAtLocation()` filters by location. |
| BUILD-20 | Overbuilt tile is removed from game (not returned to player mat) | PASS | `src/store/shared/gameUtils.ts:479-497` (performOverbuild removes from industries array, does not add back to mat) | `performOverbuild()` filters out the existing industry. Resources on tile returned to general supply (comment at line 492-493). Tile is not returned to player mat. |

## Farm Brewery Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-21 | Farm breweries can only contain Brewery tiles | PASS | Board data at `board.ts:207-212`: `farmBreweryNorth: [['brewery']]`, `farmBrewerySouth: [['brewery']]` | Slot definitions only allow brewery type. `canCityAccommodateIndustryType()` will reject non-brewery types at farm locations. No explicit test, but enforced by data+slot validation. |
| BUILD-22 | Farm breweries are connected to adjacent cities via link tiles placed between those cities | PASS | Board data at `board.ts:87-90`: farmBreweryNorth connected to cannock/walsall, farmBrewerySouth to kidderminster/worcester | Connection data correctly modeled. Per rules: "A Link tile placed between Kidderminster and Worcester also connects both locations to the Farm Brewery to their left." **ISSUE:** The current model has separate explicit connections from farmBrewerySouth to kidderminster and worcester. The rules say a single link between Kidderminster-Worcester implicitly connects to the farm brewery. This may cause incorrect behavior if a link is placed farmBrewerySouth-kidderminster instead of kidderminster-worcester. |
| BUILD-23 | Can only build at farm brewery using an industry card (Brewery), not a location card or wild location card | FAIL | No test found | **No implementation found.** `validateNetworkRequirement()` allows location cards and wild location cards to build anywhere including farm breweries. Rulebook: "You may only build in these locations using a Brewery Industry card or a Wild Industry card." The BUILD-03 finding (wild location not excluded from farms) is the same gap. |

## Era-Specific Build Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| BUILD-24 | Canal era: tiles with black half-circle may not be built (era-restricted tiles) | PASS | `src/store/build/buildValidation.test.ts:702-741` (validateTileEraCompatibility throws for incompatible eras) | `validateTileEraCompatibility()` at `buildActions.ts:190-197` checks `tile.canBuildInCanalEra` / `tile.canBuildInRailEra`. Auto-selection in `selectCard` action filters by era (gameStore.ts:481-483). |
| BUILD-25 | Rail era: tiles with blue half-circle may not be built; level 1 pottery exception | PASS | `src/store/gameStore.build.test.ts:309-403` (restrictedTiles auto-select level 2+; pottery level 1 allowed in rail era) | `selectCard` filters by `canBuildInRailEra`. Industry tile data has `canBuildInCanalEra`/`canBuildInRailEra` flags. Level 1 pottery has `canBuildInRailEra: true` per rules. |

---

## Summary

| Category | Total | PASS | FAIL | MISSING |
|----------|-------|------|------|---------|
| Card Requirements | 5 | 4 | 1 | 0 |
| Location Rules | 6 | 5 | 0 | 1 |
| Cost and Resource Rules | 5 | 5 | 0 | 0 |
| Overbuilding Rules | 4 | 4 | 0 | 0 |
| Farm Brewery Rules | 3 | 1 | 1 | 0 |
| Era-Specific Rules | 2 | 2 | 0 | 0 |
| **TOTAL** | **25** | **21** | **2** | **1** |

## Critical Findings

### FAIL: BUILD-03 -- Wild Location card should not allow building at farm breweries
- **Severity:** Medium
- **Location:** `src/store/build/buildActions.ts:45-47` (`validateNetworkRequirement`)
- **Issue:** Wild Location cards can currently be used to build at farmBreweryNorth/farmBrewerySouth. Per rules: "Wild Location card - May be played as any Location card. This does not include the 2 Farm Breweries."
- **Fix needed:** Add farm brewery exclusion check when card type is `wild_location`.

### FAIL: BUILD-23 -- Farm breweries only accept Brewery industry card or Wild Industry card
- **Severity:** Medium
- **Location:** `src/store/build/buildActions.ts:44-47` and `src/store/shared/gameUtils.ts:354-371`
- **Issue:** Location cards and wild location cards can currently target farm brewery locations. Per rules: "You may only build in these locations using a Brewery Industry card or a Wild Industry card."
- **Fix needed:** Add check that if selected location is a farm brewery, only industry or wild_industry cards are accepted.

### MISSING: BUILD-07 -- Canal era max 1 industry per location per player
- **Severity:** High
- **Location:** No implementation found
- **Issue:** During canal era, players should be limited to 1 industry tile per location. No per-player-per-era check exists in `canCityAccommodateIndustryType()` or elsewhere.
- **Fix needed:** Add canal era per-player-per-location limit in build validation.

### Note: BUILD-22 -- Farm brewery connection modeling
- **Severity:** Low (data modeling concern)
- **Issue:** Farm breweries are modeled as separate nodes with explicit connections. The rulebook says a link between Kidderminster-Worcester implicitly connects to the adjacent farm brewery. Current model has separate farmBrewerySouth-kidderminster and farmBrewerySouth-worcester connections, which means players could place links directly to farm breweries. This may need a "virtual connection" approach instead.
