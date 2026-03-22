# Engine Rule Audit Summary

**Completed:** 2026-03-22
**Total Rules Audited:** 258
**Pass Rate:** 154/258 (59.7%)

## Results by Area

| Area | Total Rules | PASS | FAIL | MISSING | File |
|------|-------------|------|------|---------|------|
| Data Layer | 81 | 4 | 12 | 65 | 01-data-layer.md |
| Game Setup | 25 | 10 | 2 | 13 | 02-game-setup.md |
| Turn Flow | 16 | 14 | 1 | 1 | 03-turn-flow.md |
| Build Action | 25 | 22 | 2 | 1 | 04-build-action.md |
| Network Action | 18 | 17 | 1 | 0 | 05-network-action.md |
| Develop Action | 7 | 7 | 0 | 0 | 06-develop-action.md |
| Sell Action | 10 | 8 | 1 | 1 | 07-sell-action.md |
| Loan/Scout/Pass | 13 | 13 | 0 | 0 | 08-loan-scout-pass.md |
| Resource Consumption | 21 | 21 | 0 | 0 | 09-resource-consumption.md |
| Scoring & Era | 23 | 21 | 1 | 1 | 10-scoring-era.md |
| Income & Bankruptcy | 19 | 17 | 0 | 2 | 11-income-bankruptcy.md |
| **TOTAL** | **258** | **154** | **20** | **84** | |

## Critical Issues (FAIL)

| Rule Ref | Rule Description | Area | Notes |
|----------|-----------------|------|-------|
| DATA-TILE-21 | Pottery L1: VP and income values conflict between industryTiles.ts and availableIndustryTiles.ts | Data Layer | industryTiles.ts has VP=10, income=5; availableIndustryTiles.ts has VP=1, income=1 |
| DATA-TILE-22 | Pottery L2: zero-cost tile (cost=0) is suspicious placeholder | Data Layer | Needs physical game verification; availableIndustryTiles.ts has cost=19 |
| DATA-TILE-27 | Brewery L2: beerProduced=1 but should be era-dependent (1 canal, 2 rail) | Data Layer | Era-dependent beer production not modeled in tile data; build action must handle |
| DATA-TILE-34 | Two conflicting tile definition files with different values | Data Layer | industryTiles.ts vs availableIndustryTiles.ts have widespread disagreements on VP, income, cost, quantities |
| DATA-BOARD-25 | Gloucester-Redditch connection does not exist on physical board | Data Layer | Redditch connects to Birmingham (rail) and Oxford, not Gloucester |
| DATA-BOARD-26 | Redditch-Oxford connection does not exist on physical board | Data Layer | Oxford connects only to Birmingham |
| DATA-CARD-03 | Card color field is incorrect for all location cards | Data Layer | All cards have color='other' instead of correct banner colors |
| DATA-CARD-09 | Cotton industry card missing from deck | Data Layer | Players cannot use industry cards to build cotton mills |
| DATA-MERCH-01 | 2-player merchant setup incorrect in gameStore.ts | Data Layer | Code includes Warrington (should be excluded) and excludes Oxford+Shrewsbury |
| DATA-MERCH-02 | 3-player merchant setup incorrect in gameStore.ts | Data Layer | Missing Shrewsbury; only has Warrington+Gloucester+Oxford (should have 4) |
| DATA-MERCH-11 | Duplicate merchant definitions in merchants.ts and gameStore.ts | Data Layer | Two files with different logic; gameStore.ts is used at runtime |
| DATA-MERCH-12 | Merchant tile randomization | Data Layer | Not actually a bug after analysis -- board has fixed bonus types per location |
| SETUP-07 | Merchant tile setup for 2 players wrong in gameStore.ts | Game Setup | Same issue as DATA-MERCH-01; runtime code is incorrect |
| SETUP-16 | Discard pile starts empty instead of 1 face-down card per player | Game Setup | Architecture uses shared discard pile instead of per-player |
| TURN-02 | Spending tiebreak uses fixed array index instead of previous turn order | Turn Flow | After reorder, ties would not preserve correct relative position |
| BUILD-03 | Wild Location card not excluded from farm breweries | Build Action | No farm brewery exclusion check for wild_location cards |
| BUILD-23 | Farm breweries accept location cards (should only accept industry/wild industry) | Build Action | Same gap as BUILD-03; location cards incorrectly allowed at farm breweries |
| NET-17 | Farm brewery connections modeled as explicit graph nodes instead of implicit | Network Action | Players can place links directly to farm brewery nodes; should be virtual |
| SELL-07 | Multi-tile sell not implemented (only sells first tile) | Sell Action | Rulebook allows repeating sell for each unflipped industry; code sells only one |
| ERA-02 | triggerEraScoring removes ALL unflipped tiles regardless of level | Scoring & Era | Should only remove unflipped for scoring VP=0; level 1 removal is separate transition step. Unflipped level 2+ tiles incorrectly removed during canal era. |

## Coverage Gaps (MISSING)

| Rule Ref | Rule Description | Area | Notes |
|----------|-----------------|------|-------|
| DATA-TILE-01 to DATA-TILE-20 | Individual industry tile values (Cotton, Coal, Iron, Manufacturer levels) | Data Layer | 20 tiles have correct values in code but no dedicated data-layer tests |
| DATA-TILE-23 to DATA-TILE-29 | Pottery L3-L5, Brewery L1/L3/L4 tile values | Data Layer | Values appear correct but untested |
| DATA-TILE-31 to DATA-TILE-33 | Cross-cutting tile rules (lightbulb, auto-flip, sell-flip) | Data Layer | Logic exists but no data-layer tests (tested at action level) |
| DATA-BOARD-02 to DATA-BOARD-24 | Individual board location slots, connections, merchants | Data Layer | 23 connection/slot rules -- code matches board but no dedicated tests |
| DATA-CARD-01/02/04/05/08 | Card deck composition and filtering rules | Data Layer | Deck filtering logic exists but untested |
| DATA-MERCH-03 to DATA-MERCH-10 | Merchant bonuses, beer, accepted industries, 4-player setup | Data Layer | Values appear correct but no dedicated tests |
| SETUP-05/06 | Deck composition and player mat allocation verification | Game Setup | Logic exists but no test verifies exact composition |
| SETUP-11 | Turn order randomization at game start | Game Setup | Code uses input order, no shuffle |
| SETUP-15 | Draw pile shuffle verification | Game Setup | Hard to test randomness |
| SETUP-17 to SETUP-25 | Game constants (rounds, costs, market prices, income limits) | Game Setup | 9 constants match rulebook but lack dedicated tests |
| TURN-14 | Card refill timing (after all actions vs after each action) | Turn Flow | Cards drawn after each individual action, not at end of player's turn |
| BUILD-07 | Canal era per-player-per-location build limit | Build Action | No implementation found for 1-tile-per-location-per-player in canal era |
| SELL-09 | Merchant per-action uniqueness | Sell Action | Cannot verify since multi-sell (SELL-07) not implemented |
| ERA-06 | Rail era first round turn order based on canal spending | Scoring & Era | Implementation preserves last round order; no explicit test |
| INC-18 | Loan guard for minimum income (-10 blocking) | Income & Bankruptcy | Loans allowed and clamped at -10 instead of being blocked |
| INC-19 | Player choice during bankruptcy tile sale | Income & Bankruptcy | Engine auto-sells in array order; player should choose |

## Known Ambiguities

Rules where the rulebook was ambiguous and interpretation was applied:

| Rule Ref | Ambiguity | Resolution Source |
|----------|-----------|-------------------|
| DATA-MERCH-07/08 | VP merchant bonus values (Nottingham/Shrewsbury) vary per physical tile | Code uses fixed value=2; physical game has varying VP tiles |
| DATA-MERCH-12 | Whether merchant tiles are shuffled | Board has fixed bonus types per location; tile icons (accepted industries) could vary but all accept same types |
| DATA-TILE-22/24 | Zero-cost pottery tiles (L2, L4) | May be "develop-through" placeholder tiles; need physical game verification |
| LOAN-03 | Whether loan is blocked vs clamped at -10 income | Code clamps; strict rules would block. Accepted as equivalent per Phase 01.1 decision |
| TURN-14 | Card refill timing (per-action vs per-turn) | Implementation draws after each action; rules say after all actions completed. Functionally similar for most cases |

## High-Priority Fix Categories

1. **Data integrity (7 FAIL):** Tile file conflicts, missing cotton card, incorrect board connections, wrong merchant setup
2. **Farm brewery rules (3 FAIL):** Card restrictions, connection model, wild card exclusion
3. **Game logic (3 FAIL):** Multi-tile sell, era scoring unflipped removal, spending tiebreak
4. **Architecture (2 FAIL):** Shared discard pile, duplicate merchant definitions
5. **Test coverage (84 MISSING):** Primarily data layer (65) and game setup constants (13) lack dedicated tests
