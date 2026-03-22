# Sell Action Audit Report

## Rulebook Reference

Brass Birmingham Rulebook, "Sell Action" section (p.6-7):
- Discard any card from Hand.
- Choose 1 of your unflipped Cotton Mill, Manufacturer, or Pottery tiles connected to a Merchant tile featuring that industry's icon.
- Consume required beer (shown on tile). Merchant beer may be consumed as part of Sell action, collecting the merchant beer bonus.
- Flip the industry tile, advance Income Marker.
- May repeat for each unflipped Industry tile (including different industries).
- Cannot perform Sell if cannot consume required beer.

Merchant Beer Bonuses:
- Develop (Gloucester): Remove 1 lowest level tile from mat (no iron cost), cannot remove pottery with lightbulb.
- Income (Oxford): Advance Income Marker 2 spaces.
- Victory Points (Nottingham, Shrewsbury): Advance VP Marker by indicated spaces.
- Money (Warrington): Receive 5 pounds from Bank.

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|------------------|--------|---------------|-------|
| SELL-01 | Sell flips an unflipped CottonMill, Manufacturer, or Pottery tile on board | PASS | `gameStore.sell.test.ts:85-155` -- cotton flipped to true after sell. `gameStore.sell.test.ts:190-275` -- pottery flipped to true | `gameStore.ts:1232-1236` filters to unflipped cotton/manufacturer/pottery. Line 1300 sets `flipped: true` |
| SELL-02 | Selling requires beer (amount from tile's beerRequired field) | PASS | `gameStore.sell.test.ts:277-366` -- cotton L3 requires 2 beer, test verifies insufficient beer blocks sell (tile stays unflipped, error logged) | `gameStore.ts:1275-1296` reads `tile.beerRequired`, calls `consumeBeerFromSources`, returns early on failure |
| SELL-03 | Beer must come from connected brewery (own or opponent's) or connected merchant with beer | PASS | `gameStore.sell.test.ts:85-155` -- merchant beer consumed at Warrington (hasBeer toggled false). `marketActions.ts:439-525` implements own brewery -> connected opponent brewery -> merchant beer priority | `consumeBeerFromSources` in `marketActions.ts:397-562` handles all three sources with proper priority order |
| SELL-04 | Must connect to a merchant (via network) to sell | PASS | `gameStore.sell.test.ts:653-719` -- cotton at Birmingham (no merchant connection) fails to sell, logs "Cannot sell" error. Tile stays unflipped, no state changes | `gameStore.ts:1247-1272` uses `calculateNetworkDistance` to verify merchant connectivity, returns error log if no connected merchant found |
| SELL-05 | Selling flips the industry tile | PASS | `gameStore.sell.test.ts:134-135` -- `expect(cotton.flipped).toBe(true)`. `gameStore.sell.test.ts:271` -- pottery flipped. `gameStore.sell.test.ts:458` -- cotton flipped in income bonus test | `gameStore.ts:1299-1301` maps industries, sets `flipped: true` on sold industry |
| SELL-06 | Merchant bonus awarded when merchant beer consumed | PASS | `gameStore.sell.test.ts:85-155` -- Warrington money bonus +5 verified. `gameStore.sell.test.ts:368-463` -- Oxford income bonus +2 verified. `gameStore.sell.test.ts:465-560` -- Nottingham VP bonus +2 verified. `gameStore.sell.test.ts:562-651` -- Gloucester develop bonus verified | `gameStore.ts:1322-1387` switches on bonus type: money, income, victoryPoints, develop |
| SELL-07 | Multiple tiles can be sold in a single sell action | FAIL | No test covers selling multiple tiles in one action | `gameStore.ts:1242-1243` always sells `sellableIndustries[0]` (first available). The rulebook says "go back to step 2 and repeat" but implementation only sells one tile per action. No loop or repeated sell logic exists |
| SELL-08 | Sell requires discarding 1 card | PASS | `gameStore.sell.test.ts:157-173` -- guard blocks confirm without card selected. `gameStore.sell.test.ts:140-141` -- discard pile increases by expected amount | `gameStore.ts:1227-1229` checks `selectedCard`, line 1424 adds to `discardPile` |
| SELL-09 | Each merchant can only be used once per sell action | MISSING | No test verifies this rule. Since SELL-07 is also not implemented (only one tile sold), this is moot currently | Would need multi-sell implementation to test. Merchants do track `hasBeer` state |
| SELL-10 | Merchant bonus types: Gloucester=develop, Oxford=income+2, Nottingham=VP, Shrewsbury=VP, Warrington=money+5 | PASS | `gameStore.sell.test.ts:386` -- Oxford income bonus. `gameStore.sell.test.ts:483-484` -- Nottingham VP bonus. `gameStore.sell.test.ts:565-567` -- Gloucester develop bonus. `gameStore.sell.test.ts:147-154` -- Warrington money+5 | `gameStore.ts:311-363` defines merchant bonuses. Gloucester=develop(1), Oxford=income(2), Nottingham=VP(2), Shrewsbury=VP(2), Warrington=money(5) |

## Summary

| Status | Count |
|--------|-------|
| PASS | 8 |
| FAIL | 1 |
| MISSING | 1 |

### Issues Found

**SELL-07 (FAIL): Multi-tile sell not implemented.** The rulebook explicitly states "You may go back to step (2) and repeat the process for each of your unflipped Industry tiles." The current implementation at `gameStore.ts:1242-1243` only sells `sellableIndustries[0]` -- it does not loop or allow repeated selling within one action. This is a functional gap.

**SELL-09 (MISSING): Merchant per-action uniqueness.** Cannot be verified since multi-sell is not implemented. Once SELL-07 is fixed, this rule should be explicitly tested.
