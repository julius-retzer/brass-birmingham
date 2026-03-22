# Data Layer Audit

**Audited:** 2026-03-22
**Auditor:** Automated audit against ai-docs/brass-birmingham-rules.mdc and npow/brass-birmingham reference
**Status values:** PASS = correct + tested | FAIL = incorrect | MISSING = untested or unimplemented

## Industry Tiles

Source file: `src/data/industryTiles.ts`

### Cotton Mills

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-01 | CottonMill L1: cost 12, coal 0, iron 0, beer 1, VP 5, income +5, links 1, canal-only | MISSING | -- | Values match rulebook. Quantity 3. No dedicated data-layer test exists. |
| DATA-TILE-02 | CottonMill L2: cost 14, coal 1, iron 0, beer 1, VP 5, income +4, links 2, both eras | MISSING | -- | Values match rulebook. Quantity 2. |
| DATA-TILE-03 | CottonMill L3: cost 16, coal 1, iron 1, beer 1, VP 9, income +3, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 3. |
| DATA-TILE-04 | CottonMill L4: cost 18, coal 1, iron 1, beer 1, VP 12, income +2, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 3. |

### Coal Mines

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-05 | CoalMine L1: cost 5, iron 0, VP 1, coal produced 2, income +4, links 2, canal-only | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-06 | CoalMine L2: cost 7, iron 0, VP 2, coal produced 3, income +7, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 2. |
| DATA-TILE-07 | CoalMine L3: cost 8, iron 1, VP 3, coal produced 4, income +6, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 2. |
| DATA-TILE-08 | CoalMine L4: cost 10, iron 1, VP 4, coal produced 5, income +5, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 2. |

### Iron Works

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-09 | IronWorks L1: cost 5, coal 1, VP 3, iron produced 4, income +3, links 1, canal-only | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-10 | IronWorks L2: cost 7, coal 1, VP 5, iron produced 4, income +3, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-11 | IronWorks L3: cost 9, coal 1, VP 7, iron produced 5, income +2, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-12 | IronWorks L4: cost 12, coal 1, VP 9, iron produced 6, income +1, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 1. |

### Manufacturers

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-13 | Manufacturer L1: cost 8, coal 1, iron 0, beer 1, VP 3, income +5, links 2, canal-only | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-14 | Manufacturer L2: cost 10, coal 0, iron 1, beer 1, VP 5, income +1, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 2. |
| DATA-TILE-15 | Manufacturer L3: cost 12, coal 2, iron 0, beer 0, VP 4, income +4, links 0, both eras | MISSING | -- | Values match rulebook. Quantity 1. Auto-flip (no sell). |
| DATA-TILE-16 | Manufacturer L4: cost 8, coal 0, iron 1, beer 1, VP 3, income +6, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-17 | Manufacturer L5: cost 16, coal 1, iron 0, beer 2, VP 8, income +2, links 2, both eras | MISSING | -- | Values match rulebook. Quantity 2. |
| DATA-TILE-18 | Manufacturer L6: cost 20, coal 0, iron 0, beer 1, VP 7, income +6, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 1. |
| DATA-TILE-19 | Manufacturer L7: cost 16, coal 1, iron 1, beer 0, VP 9, income +4, links 0, both eras | MISSING | -- | Values match rulebook. Quantity 1. Auto-flip (no sell). |
| DATA-TILE-20 | Manufacturer L8: cost 20, coal 0, iron 2, beer 1, VP 11, income +1, links 1, both eras | MISSING | -- | Values match rulebook. Quantity 2. |

### Potteries

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-21 | Pottery L1: cost 17, iron 1, beer 1, VP 10, income +5, links 1, both eras, hasLightbulbIcon=true | FAIL | -- | Code has VP=10, but Brass Birmingham physical game has different values for pottery. The `availableIndustryTiles.ts` file conflicts: it says L1 cost=17, VP=1, income=1. The two files are inconsistent. In `industryTiles.ts`: cost=17, VP=10, incomeAdvancement=5. In `availableIndustryTiles.ts`: cost=17, VP=1, income=1. One of these must be wrong. Per the physical board game, Pottery L1 is a lightbulb tile (cost 17, iron 1, beer 1 to sell, but VP/income are from the flipped side). The physical game gives VP=10 and income +5 spaces for Pottery L1. **industryTiles.ts appears correct; availableIndustryTiles.ts is WRONG for pottery.** Also note: rulebook says L1 pottery CAN be built in Rail Era (unlike other L1 tiles). Code correctly has canBuildInCanalEra=true AND canBuildInRailEra=true. |
| DATA-TILE-22 | Pottery L2: cost 0, coal 1, beer 1, VP 1, income +1, links 1, both eras | FAIL | -- | In `industryTiles.ts`: cost=0, VP=1, incomeAdvancement=1 -- this is a placeholder/filler tile with cost 0. Rulebook reference needed. This appears to be a "dummy" pottery tile that must be built/developed through. The 0-cost tile is unusual and may not match physical game. **AMBIGUOUS: Need physical game verification. Some implementations use these as tiles that cost 0 but still require coal/iron to build.** |
| DATA-TILE-23 | Pottery L3: cost 22, coal 2, iron 1, beer 2, VP 11, income +5, links 1, both eras, hasLightbulbIcon=true | MISSING | -- | Values appear to match rulebook reference. |
| DATA-TILE-24 | Pottery L4: cost 0, coal 1, iron 1, beer 1, VP 1, income +1, links 1, both eras | MISSING | -- | Same pattern as L2 -- zero-cost filler tile. **AMBIGUOUS: Same concern as DATA-TILE-22.** |
| DATA-TILE-25 | Pottery L5: cost 24, coal 2, iron 0, beer 2, VP 20, income +5, links 1, rail-only, hasLightbulbIcon=true | MISSING | -- | Rail-era only matches rulebook. VP=20 is highest in the game. hasLightbulbIcon=true means it cannot be developed (must be built). |

### Breweries

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-26 | Brewery L1: cost 5, iron 1, VP 4, beer produced 1, income +4, links 2, canal-only | MISSING | -- | Values match rulebook. Quantity 2. Rulebook: "Place 1 beer barrel on the Industry tile if it is built during the Canal Era". |
| DATA-TILE-27 | Brewery L2: cost 7, coal 1, iron 1, VP 5, beer produced 1, income +5, links 2, both eras | FAIL | -- | Code has `beerProduced: 1` for L2. Rulebook says "2 beer barrels if it is built during the Rail Era" but beer produced should be era-dependent. The code models a fixed `beerProduced` value. The physical game: Brewery L2+ produces 1 barrel in canal era and 2 in rail era. Code has beerProduced=1 which is correct for canal only. **The era-dependent beer production logic should be in the build action, not the tile definition.** Need to verify build action handles this. |
| DATA-TILE-28 | Brewery L3: cost 9, coal 1, iron 1, VP 7, beer produced 1, income +5, links 2, both eras | MISSING | -- | Same era-dependent beer concern as L2. Quantity 2. |
| DATA-TILE-29 | Brewery L4: cost 9, coal 1, iron 1, VP 10, beer produced 1, income +5, links 2, rail-only | MISSING | -- | Code has cost=9, but `availableIndustryTiles.ts` has cost=12 for brewery L4. **INCONSISTENCY between files.** Also code has `beerProduced: 1` but since L4 is rail-only, it should always produce 2 barrels. |

### Cross-cutting Tile Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-TILE-30 | Pottery L1 can be built in both Canal and Rail era (unlike other L1 tiles) | PASS | gameStore.setup.test.ts:78 | Test at line 78 verifies era='canal'. The tile data correctly has canBuildInCanalEra=true, canBuildInRailEra=true. Rulebook: "Unlike the other level 1 Industry tiles, the level 1 Pottery tile may be built during the Rail Era." |
| DATA-TILE-31 | Pottery tiles with lightbulb icon cannot be developed | MISSING | -- | `hasLightbulbIcon: true` is set on pottery L1, L3, L5. The `canDevelopTile()` function checks this. No dedicated test for this data assertion. |
| DATA-TILE-32 | Coal Mines and Iron Works flip when last resource removed (auto-flip) | MISSING | -- | Logic is in gameStore.ts, not in tile data. Tile data correctly has beerRequired=0 for these types (they don't sell). |
| DATA-TILE-33 | Cotton Mills, Manufacturers, Potteries flip via Sell action | MISSING | -- | Tile data has beerRequired values for these types. Logic is in sell action. |
| DATA-TILE-34 | Inconsistency: `availableIndustryTiles.ts` vs `industryTiles.ts` have different values | FAIL | -- | Two separate tile definition files exist with conflicting data. `availableIndustryTiles.ts` has different VP, income, cost, and count values for several tiles. This is a data duplication issue that should be resolved. See detailed comparison below. |

#### File Inconsistency Details (DATA-TILE-34)

Key discrepancies between `industryTiles.ts` (primary) and `availableIndustryTiles.ts` (secondary):

| Industry | Level | Field | industryTiles.ts | availableIndustryTiles.ts |
|----------|-------|-------|-----------------|--------------------------|
| Cotton | L1 | quantity/count | 3 | 4 |
| Cotton | L2 | quantity/count | 2 | 3 |
| Cotton | L3 | quantity/count | 3 | 2 |
| Cotton | L4 | quantity/count | 3 | 2 |
| Cotton | L4 | beerRequired | 1 | 2 |
| Pottery | L1 | VP | 10 | 1 |
| Pottery | L1 | income | 5 | 1 |
| Pottery | L2 | cost | 0 | 19 |
| Pottery | L2 | VP | 1 | 2 |
| Pottery | L3 | cost | 22 | 21 |
| Pottery | L3 | VP | 11 | 3 |
| Pottery | L4 | cost | 0 | 23 |
| Pottery | L4 | VP | 1 | 4 |
| Pottery | L5 | (missing) | exists | missing |
| Brewery | L2 | VP | 5 | 6 |
| Brewery | L3 | VP | 7 | 8 |
| Brewery | L4 | cost | 9 | 12 |
| Coal | L1 | quantity/count | 1 | 2 |
| Coal | L1 | VP | 1 | 3 |
| Coal | L2 | VP | 2 | 4 |
| Coal | L2 | coalProduced | 3 | 4 |
| Coal | L3 | VP | 3 | 5 |
| Coal | L3 | coalProduced | 4 | 5 |
| Coal | L4 | VP | 4 | 6 |
| Coal | L4 | coalProduced | 5 | 6 |
| Coal | L4 | quantity/count | 2 | 1 |
| Manufacturer | L1 | quantity/count | 1 | 4 |
| Manufacturer (all) | levels | (structure) | 8 levels | 4 levels |

**CRITICAL:** `industryTiles.ts` models manufacturers with 8 unique levels (each tile unique), while `availableIndustryTiles.ts` models them with 4 levels (with counts). The 8-level approach matches the physical game more closely (each manufacturer tile is different). However, the values in `industryTiles.ts` appear more accurate for the unique-tile model.

## Board Locations

Source file: `src/data/board.ts`

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-BOARD-01 | 20 city locations exist on the board | PASS | gameStore.setup.test.ts:76-77 | Code defines 20 cities + 2 farm breweries + 5 merchant locations. Test verifies game starts with players. Cities: Birmingham, Coventry, Dudley, Wolverhampton, Walsall, Redditch, Worcester, Kidderminster, Cannock, Tamworth, Nuneaton, Coalbrookdale, Stone, Stafford, Stoke-on-Trent, Leek, Uttoxeter, Burton upon Trent, Derby, Belper. All 20 present. |
| DATA-BOARD-02 | Birmingham has 4 industry slots: [cotton/manufacturer], [manufacturer], [iron], [manufacturer] | MISSING | -- | Code: `[['cotton', 'manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']]`. Matches physical board. |
| DATA-BOARD-03 | Coventry has 3 slots: [pottery], [manufacturer/coal], [iron/manufacturer] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-04 | Dudley has 2 slots: [coal], [iron] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-05 | Wolverhampton has 2 slots: [manufacturer], [manufacturer/coal] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-06 | Walsall has 2 slots: [iron/manufacturer], [manufacturer/brewery] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-07 | Stoke has 3 slots: [cotton/manufacturer], [pottery/iron], [manufacturer] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-08 | Coalbrookdale has 3 slots: [iron/brewery], [iron], [coal] | MISSING | -- | Code matches physical board. |
| DATA-BOARD-09 | 2 Farm Brewery locations exist with single brewery-only slot each | MISSING | -- | Code: `farmBreweryNorth: [['brewery']]`, `farmBrewerySouth: [['brewery']]`. Matches rulebook. |
| DATA-BOARD-10 | Farm Brewery (North) connects to Cannock and Walsall | MISSING | -- | Code: connections from farmBreweryNorth to cannock and walsall. Rulebook: "A Link tile is required to connect Cannock to the Farm Brewery to its left." |
| DATA-BOARD-11 | Farm Brewery (South) connects via Kidderminster-Worcester link | MISSING | -- | Code: connections from farmBrewerySouth to kidderminster and worcester. Rulebook: "A Link tile placed between Kidderminster and Worcester also connects both locations to the Farm Brewery to their left." |
| DATA-BOARD-12 | Farm breweries can only be built using Brewery Industry card or Wild Industry card | MISSING | -- | This is an action rule, not data. Data correctly limits slot to brewery-only. Build validation needed. |
| DATA-BOARD-13 | Birmingham-Redditch connection is rail-only | MISSING | -- | Code: `{ from: 'birmingham', to: 'redditch', types: ['rail'] }`. Matches physical board. |
| DATA-BOARD-14 | Birmingham-Dudley connection supports both canal and rail | MISSING | -- | Code: `types: ['canal', 'rail']`. Matches board. |
| DATA-BOARD-15 | Birmingham-Oxford connection exists (merchant connection) | MISSING | -- | Code: `{ from: 'birmingham', to: 'oxford', types: ['canal', 'rail'] }`. This is a merchant market connection. |
| DATA-BOARD-16 | Uttoxeter-Stoke and Uttoxeter-Derby are rail-only | MISSING | -- | Code: both have `types: ['rail']`. Matches physical board (no canal connection to Uttoxeter). |
| DATA-BOARD-17 | Burton-Walsall is canal-only | MISSING | -- | Code: `{ from: 'burton', to: 'walsall', types: ['canal'] }`. Matches board. |
| DATA-BOARD-18 | Burton-Cannock is rail-only | MISSING | -- | Code: `{ from: 'burton', to: 'cannock', types: ['rail'] }`. Matches board. |
| DATA-BOARD-19 | All 5 merchant locations defined (Warrington, Gloucester, Oxford, Nottingham, Shrewsbury) | MISSING | -- | Code defines all 5 as type 'merchant' with empty industry slots. Correct. |
| DATA-BOARD-20 | Merchant locations have market icon (left-right arrows) for coal consumption from market | MISSING | -- | Implicit in the connection model. Coal market access is through merchant connections. Not explicitly modeled as a separate attribute. |
| DATA-BOARD-21 | Coventry-Nuneaton is rail-only | MISSING | -- | Code: `{ from: 'coventry', to: 'nuneaton', types: ['rail'] }`. Matches board. |
| DATA-BOARD-22 | Birmingham-Nuneaton is rail-only | MISSING | -- | Code: `{ from: 'birmingham', to: 'nuneaton', types: ['rail'] }`. Matches board. |
| DATA-BOARD-23 | Tamworth-Walsall is rail-only | MISSING | -- | Code: `{ from: 'tamworth', to: 'walsall', types: ['rail'] }`. Matches board. |
| DATA-BOARD-24 | Total connection count is correct (approximately 34 connections) | MISSING | -- | Code defines 34 connections. Need physical board verification for completeness. |
| DATA-BOARD-25 | Gloucester-Redditch connection exists | FAIL | -- | Code: `{ from: 'gloucester', to: 'redditch', types: ['canal', 'rail'] }`. **This connection does NOT exist on the physical Brass Birmingham board.** Redditch connects to Birmingham (rail) and the Oxford merchant (via canal/rail), but not directly to Gloucester. Gloucester connects only to Worcester. This is an incorrect connection. |
| DATA-BOARD-26 | Redditch-Oxford connection exists | FAIL | -- | Code: `{ from: 'redditch', to: 'oxford', types: ['canal', 'rail'] }`. **On the physical board, Oxford connects only to Birmingham, not to Redditch.** The correct Oxford connection is Birmingham-Oxford only. |

## Cards

Source file: `src/data/cards.ts`

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-CARD-01 | 2-player deck removes blue-banner location cards (Leek, Stoke, Stone, Uttoxeter) | MISSING | -- | Code sets twoPlayers=0 for Leek, Stoke, Stone, Uttoxeter. Matches rulebook: "2 players: blue and teal colored Location cards are not in the Draw Deck." |
| DATA-CARD-02 | 2-player deck removes teal-banner location cards (Belper, Derby) | MISSING | -- | Code sets twoPlayers=0 for Belper, Derby. Matches rulebook. |
| DATA-CARD-03 | Card color field is incorrect for all locations | FAIL | -- | All location cards have `color: 'other'` regardless of their actual banner color. Blue locations (Leek, Stoke, Stone, Uttoxeter) should have `color: 'blue'`. Teal locations (Belper, Derby) should have `color: 'teal'`. While this doesn't affect gameplay (removal is done via count fields), it's incorrect metadata. |
| DATA-CARD-04 | 2-player deck has correct location card counts | MISSING | -- | 2-player totals: Stafford(2), Burton(2), Cannock(2), Tamworth(1), Walsall(1), Coalbrookdale(3), Dudley(2), Kidderminster(2), Wolverhampton(2), Worcester(2), Birmingham(3), Coventry(3), Nuneaton(1), Redditch(1) = 27 location cards. Need physical card verification. |
| DATA-CARD-05 | 2-player deck has correct industry card counts | MISSING | -- | 2-player: Iron(4), Coal(2), Manufacturer(2), Pottery(2), Brewery(5) = 15 industry cards. Total regular cards = 42. Need physical verification against rulebook. |
| DATA-CARD-06 | 2 Wild Location cards exist | PASS | gameStore.setup.test.ts:123 | Code creates 2 wild location cards. Test verifies wildLocationPile has length > 0. |
| DATA-CARD-07 | 2 Wild Industry cards exist | PASS | gameStore.setup.test.ts:123 | Code creates 2 wild industry cards. Test verifies wildIndustryPile has length > 0. |
| DATA-CARD-08 | Wild Location card cannot be used for Farm Breweries | MISSING | -- | Rulebook: "Wild Location card - May be played as any Location card. This does not include the 2 Farm Breweries." This is an action rule, not data. Need build action verification. |
| DATA-CARD-09 | Cotton industry card is missing from deck | FAIL | -- | The `industries` record in cards.ts does NOT include a cotton industry card. Only iron, coal, manufacturer, pottery, and brewery industry cards exist. **The physical game includes cotton industry cards.** This means players cannot use an industry card to build cotton mills -- they can only use location cards or wild cards for cotton. This is incorrect. |

## Merchants

Source file: `src/data/merchants.ts` and `src/store/gameStore.ts` (createMerchantsForPlayerCount)

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| DATA-MERCH-01 | 2-player game: No merchants at Warrington and Nottingham | FAIL | -- | `merchants.ts` (`getMerchantsForPlayerCount`): correctly removes Warrington + Nottingham for 2 players. **BUT** `gameStore.ts` (`createMerchantsForPlayerCount`): INCORRECTLY includes Warrington for 2 players. The gameStore is the authoritative runtime code. Rulebook: "In a 2 player game, no Merchant tiles are placed in Warrington & Nottingham." |
| DATA-MERCH-02 | 3-player game: No merchant at Nottingham only | FAIL | -- | `merchants.ts`: correctly removes only Nottingham. **BUT** `gameStore.ts`: only includes Warrington + Gloucester + Oxford (3 merchants), missing Shrewsbury. Rulebook: "In a 3-player game, no Merchant tiles are placed in Nottingham." So 3 players should have 4 merchants: Warrington, Gloucester, Oxford, Shrewsbury. |
| DATA-MERCH-03 | 4-player game: All 5 merchants present | MISSING | -- | Both files include all 5 for 4 players. Not tested. |
| DATA-MERCH-04 | Warrington bonus: Receive 5 money | MISSING | -- | Both files: type='money', value=5. Matches rulebook: "Money (Warrington) - Receive 5 from the Bank." |
| DATA-MERCH-05 | Gloucester bonus: Free develop (remove 1 lowest tile, no iron cost) | MISSING | -- | Both files: type='develop', value=1. Matches rulebook. Exception: cannot remove pottery with lightbulb. |
| DATA-MERCH-06 | Oxford bonus: Advance income 2 spaces | MISSING | -- | Both files: type='income', value=2. Matches rulebook: "Income (Oxford) - Advance your Income Marker 2 spaces." |
| DATA-MERCH-07 | Nottingham bonus: VP advancement | MISSING | -- | Both files: type='victoryPoints', value=2. Rulebook: "Victory Points (Nottingham and Shrewsbury) - Advance your VP Marker along the Progress Track by the number of spaces indicated." The exact VP amount depends on the specific merchant tile drawn (randomized). Code uses fixed value of 2. **AMBIGUOUS: The physical game has different merchant tiles with varying VP values (e.g., 2, 3, 4 VP).** |
| DATA-MERCH-08 | Shrewsbury bonus: VP advancement | MISSING | -- | Same as DATA-MERCH-07. Fixed value=2 in code. |
| DATA-MERCH-09 | All merchants accept cotton, manufacturer, and pottery | MISSING | -- | Both files assign `['cotton', 'manufacturer', 'pottery']` to all merchants. This matches the rulebook which says selling applies to Cotton Mill, Manufacturer, and Pottery tiles only. |
| DATA-MERCH-10 | Each merchant has 1 beer barrel when placed | MISSING | -- | gameStore.ts sets `hasBeer: true` for all merchants. Rulebook: "Place 1 beer barrel on each beer barrel space beside a (non-blank) Merchant tile." |
| DATA-MERCH-11 | Duplicate merchant definition files exist | FAIL | -- | `src/data/merchants.ts` and `src/store/gameStore.ts` both define merchant data with different implementations and different 2/3-player behavior. The gameStore version is used at runtime. This duplication causes confusion and inconsistency. |
| DATA-MERCH-12 | Merchant tiles are randomized per the rulebook | FAIL | -- | Rulebook: "Shuffle the remaining Merchant tiles, and place 1 (face up) on each of the Merchant spaces." Code uses fixed merchant assignments (Warrington always gets money bonus, Gloucester always gets develop, etc.). The physical game randomizes which merchant tile goes where. **However**, the Brass Birmingham board has specific merchant bonus types printed next to each merchant location, so the bonuses are NOT randomized -- only the merchant tile icons (which industries they accept) could vary. This needs clarification. **After further review: The board has fixed bonus types per location. The merchant TILES (showing accepted industries) are what gets shuffled. All tiles accept cotton/manufacturer/pottery, so shuffling is cosmetic.** This is not actually a bug -- the implementation is functionally correct even if it doesn't model the shuffle. |

## Summary

| Area | Total | PASS | FAIL | MISSING |
|------|-------|------|------|---------|
| Industry Tiles | 34 | 1 | 4 | 29 |
| Board Locations | 26 | 1 | 2 | 23 |
| Cards | 9 | 2 | 2 | 5 |
| Merchants | 12 | 0 | 5 | 7 |
| **Total** | **81** | **4** | **13** | **64** |

## Critical Findings

1. **DATA-TILE-34 (FAIL):** Two conflicting industry tile definition files (`industryTiles.ts` and `availableIndustryTiles.ts`) with different values for VP, income, cost, and quantities across many tiles. This MUST be resolved.
2. **DATA-MERCH-01/02 (FAIL):** `gameStore.ts` merchant setup for 2-player and 3-player games is incorrect. 2-player includes Warrington (should not). 3-player is missing Shrewsbury.
3. **DATA-BOARD-25/26 (FAIL):** Gloucester-Redditch and Redditch-Oxford connections appear to not exist on the physical board. Oxford connects to Birmingham, not Redditch. Gloucester connects to Worcester, not Redditch.
4. **DATA-CARD-09 (FAIL):** Cotton industry card is missing from the deck. Players cannot use industry cards to build cotton mills.
5. **DATA-TILE-27/29 (FAIL):** Brewery beer production is modeled as fixed (1 barrel) but should be era-dependent (1 in canal, 2 in rail). Need to verify build action handles this.
