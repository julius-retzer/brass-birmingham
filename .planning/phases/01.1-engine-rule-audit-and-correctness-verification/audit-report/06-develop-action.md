# Develop Action Audit Report

## Rulebook Reference

Brass Birmingham Rulebook, "Develop Action" section (p.7):
- Discard any card from Hand.
- Remove 1 or 2 Industry tiles from Player Mat, return to box. Each tile removed separately, does not need to be same industry, but must be lowest level tile of chosen industry.
- Consume 1 iron for each tile removed.
- Pottery tiles with lightbulb icon may NOT be developed.

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|------------------|--------|---------------|-------|
| DEV-01 | Develop removes 1 or 2 industry tiles from player's mat (not board) | PASS | `gameStore.develop.test.ts:267-310` -- "removes lowest level tiles from player mat" test verifies quantity decremented on mat tiles, not board industries | Implementation in `gameStore.ts:1154-1180` updates `industryTilesOnMat`, not `industries` array |
| DEV-02 | Removed tiles must be lowest available level of that industry | PASS | `gameStore.develop.test.ts:267-310` -- test sets up coal L1 (qty 2) + L2 (qty 1), verifies L1 quantity decremented after develop | `gameStore.ts:1172` uses `getLowestLevelTile(developableTiles)` to find lowest level |
| DEV-03 | Each tile removed requires 1 iron (from iron works or market) | PASS | `gameStore.develop.test.ts:407-447` -- "iron consumed from market equals tiles developed" verifies exactly 1 iron consumed for 1 tile developed. `gameStore.autoflip.test.ts:102-157` -- verifies free iron from iron works before market | `gameStore.ts:1137-1143` sets `ironRequired = tilesRemoved` and calls `consumeIronFromSources` |
| DEV-04 | Pottery tiles with lightbulb icon cannot be developed | PASS | `gameStore.develop.test.ts:312-361` -- "pottery with lightbulb icon cannot be developed" verifies pottery qty unchanged, coal developed instead. `gameStore.actions.test.ts:394-426` -- "selectTilesForDevelop filters out pottery with lightbulb icon" | `gameStore.ts:1127` and `1166-1168` filter `hasLightbulbIcon` pottery. Selection guard in `gameStore.ts:1808+` also filters |
| DEV-05 | Develop requires discarding 1 card | PASS | `gameStore.develop.test.ts:129-167` -- "basic mechanics" verifies discard pile increases by 1. `gameStore.develop.test.ts:169-187` -- guard blocks confirm without card selected | `gameStore.ts:1100-1104` checks `selectedCard`, line 1209 adds to `discardPile` |
| DEV-06 | Can develop 1 or 2 tiles in a single action | PASS | `gameStore.actions.test.ts:297-359` -- "selectTilesForDevelop validates and sets selected tiles" selects 2 tiles (cotton + coal), confirms both selected. `gameStore.actions.test.ts:361-392` -- "limits to max 2 tiles" verifies 3 requested results in only 2 selected | `gameStore.ts:1108-1133` allows 1-2 tiles via `selectedTilesForDevelop` |
| DEV-07 | Both tiles can be same industry or different industries | PASS | `gameStore.actions.test.ts:297-359` -- selects cotton + coal (different industries), both accepted | `gameStore.ts:1159` iterates `selectedIndustryTypes` which can contain any mix. Same type twice would need qty >= 2 |

## Summary

| Status | Count |
|--------|-------|
| PASS | 7 |
| FAIL | 0 |
| MISSING | 0 |

All Develop action rules are correctly implemented with test coverage. The implementation properly handles lightbulb pottery restriction, lowest-level-first removal, iron consumption per tile, and the 1-2 tile limit.
