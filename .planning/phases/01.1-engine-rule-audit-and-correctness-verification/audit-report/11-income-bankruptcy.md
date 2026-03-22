# Audit Report: Income Collection and Bankruptcy

**Audit Area:** Income track, income collection, negative income, bankruptcy/shortfall handling
**Source of Truth:** `ai-docs/brass-birmingham-rules.mdc` (sections: END OF ROUND - Take Income, PLAYER AREA SETUP)
**Engine Files:** `src/store/gameStore.ts` (lines 1613-1712), `src/store/constants.ts`
**Test Files:** `gameStore.income.test.ts`, `gameStore.edgecases.test.ts`, `gameStore.actions.test.ts`

---

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| INC-01 | Income level ranges from -10 to 30 | PASS | gameStore.actions.test.ts:86 "loan action - income cannot go below -10" | `MIN_INCOME = -10`, `MAX_INCOME = 30` in constants.ts:7-8. Loan action clamps at -10 (gameStore.ts:560-562). Flip income capped at 30 (gameStore.ts:1064-1068). |
| INC-02 | Income level determines money received each round | PASS | gameStore.income.test.ts:69 "collects income at end of round" (line 96-97: money increased by income value) | Implementation at gameStore.ts:1620 adds `player.income` directly to money. In Brass Birmingham, income level = money received. |
| INC-03 | Income track values match rulebook (income level = money amount) | PASS | gameStore.income.test.ts:112 "handles different income levels correctly" (tests levels 0, 5, 10, 20, 30) | Brass Birmingham income level IS the money amount. Starting income 10 = receive 10 money. Implementation correct. |
| INC-04 | Income level can go negative (from Loan action) | PASS | gameStore.actions.test.ts:86 "loan action - income cannot go below -10" (takes multiple loans until -10) | Loan reduces income by 3 levels per loan (gameStore.ts:562). Multiple loans stack to minimum -10. |
| INC-05 | Negative income means player pays money instead of receiving | PASS | gameStore.income.test.ts:173 "player can afford to pay negative income" (line 188: money 20 - income 5 = 15) | Implementation at gameStore.ts:1627-1629 handles negative income by deducting from money. |
| INC-06 | Income collected once per round, after turn order recalculation | PASS | gameStore.income.test.ts:69 "collects income at end of round"; gameStore.turns.test.ts:67 "end of round collects income" | In `nextPlayer` action: turn order at lines 1591-1608 THEN income at lines 1613-1712. Correct sequence. |
| INC-07 | Income amount matches the income track value for current income level | PASS | gameStore.income.test.ts:112 "handles different income levels correctly" (tests 0, 5, 10, 20, 30 and verifies exact money amounts) | Direct mapping: income level N yields N money. |
| INC-08 | Income is NOT collected on the final round of the game | PASS | gameStore.income.test.ts:139 "does not collect income on final round of era" | Guarded by `!context.isFinalRound` at gameStore.ts:1614. Note: the rulebook says "Income is not collected at the end of the final round of the game" (only the final round of the Rail Era). The test says "final round of era" which is broader, but the `isFinalRound` flag is only relevant to actual game-ending rounds, so behavior is correct. |
| INC-09 | If player cannot pay negative income, must sell industry tiles to cover shortfall | PASS | gameStore.income.test.ts:198 "player cannot afford negative income - sells industry tiles" (line 248: industries.length toBe 0 after sale) | Implementation at gameStore.ts:1640-1676 handles shortfall by selling tiles. |
| INC-10 | Player may remove ANY industry tiles (not just unflipped) to cover shortfall | PASS | gameStore.income.test.ts:198 (sells unflipped tiles); gameStore.income.test.ts:263 "multiple industries sold to cover shortfall" | Rulebook: "you must acquire money by removing one or more of your Industry tiles (not Link tiles)". No flipped/unflipped restriction. Code iterates all industries without filtering by flipped status (gameStore.ts:1649-1669). Correct per rulebook. |
| INC-11 | Sold tiles are removed from the board (removed from game) | PASS | gameStore.income.test.ts:248 "player.industries.length toBe 0" after sale | Implementation at gameStore.ts:1671-1676 splices tiles from industries array. |
| INC-12 | Sale value = half the build cost, rounded down | PASS | gameStore.income.test.ts:380 "calculates sale value correctly (half cost rounded down)" (tests cost 10->5, 15->7, 7->3, 1->0) | `Math.floor(industry.tile.cost / 2)` at gameStore.ts:1655. |
| INC-13 | Debt is deducted from sale proceeds (player keeps only excess) | PASS | gameStore.income.test.ts:198 (line 253: money toBe 4; owed 10, paid 5, sold tile for 9, excess 4) | Implementation at gameStore.ts:1681-1683 sets money to `Math.abs(remainingShortfall)` when covered. Matches Phase 01-04 decision. |
| INC-14 | Must stop selling tiles as soon as shortfall is covered | PASS | gameStore.income.test.ts:427 "only sells minimum tiles needed to cover shortfall" (line 478: 2 industries remain after selling 1 of 3) | Loop condition `remainingShortfall > 0` at gameStore.ts:1651 stops iteration when covered. |
| INC-15 | If still in debt after selling all tiles, lose 1 VP per pound of remaining shortfall | PASS | gameStore.income.test.ts:328 "loses VP when cannot cover shortfall even after selling all industries" (line 368: victoryPoints toBe 0); gameStore.income.test.ts:511 "player with no industries and negative income loses VP" | Implementation at gameStore.ts:1688-1692 deducts VP, clamped to 0 minimum. |
| INC-16 | Starting income is 10 (per Player Area Setup) | PASS | gameStore.integration.test.ts:174 "players[0].income toBe 10" | `STARTING_INCOME = 10` in constants.ts:3. Rulebook: "Place your Income Marker on the 10 space of the Progress Track." |
| INC-17 | Income level cannot exceed 30 | PASS | gameStore.income.test.ts:121 "income: 30, expected: 30" (max income tested) | `MAX_INCOME = 30` in constants.ts:8. Capped via `Math.min(GAME_CONSTANTS.MAX_INCOME, ...)` at gameStore.ts:1066, 1306, 1330. Rulebook: "You cannot increase your income level above level 30." |
| INC-18 | Loan action: cannot take loan if income would go below -10 | MISSING | -- | The current implementation clamps income at -10 via `Math.max(GAME_CONSTANTS.MIN_INCOME, income - 3)` (gameStore.ts:560-562) but does NOT prevent taking the loan. Rulebook: "You cannot take a loan if it will take your income level below -10." At income -8, taking a loan should be BLOCKED (would go to -11), but current code allows it and clamps to -10. No guard prevents this. |
| INC-19 | Player choice of which tiles to sell during bankruptcy | MISSING | -- | Rulebook: "You may remove any of your Industry tiles, but must stop as soon as you have acquired enough money." Current implementation sells tiles in array order (first-in-first-sold) without player choice (gameStore.ts:1649-1669). The player should choose which tiles to sell, but the engine sells them automatically in iteration order. |

---

## Summary

| Metric | Count |
|--------|-------|
| Total Rules | 19 |
| PASS | 17 |
| FAIL | 0 |
| MISSING | 2 |

### MISSING Details

- **INC-18:** Loan guard for minimum income. The rulebook says loans are blocked when income would drop below -10. The current implementation allows the loan and clamps income at -10, which means a player at income -8 can take a loan for 30 money with only a 2-level income reduction instead of the expected 3. This gives the player a financial advantage (free money with reduced penalty).

- **INC-19:** Player choice during bankruptcy tile sale. The current implementation sells tiles in iteration order. While functional, the rulebook allows the player to choose which tiles to sell. This could matter strategically (selling a cheap flipped tile instead of an expensive unflipped one). Would require a bankruptcy UI interaction or at minimum a smarter tile selection heuristic.

---

*Audited: 2026-03-22*
*Auditor: Claude (automated)*
*No source code modifications made during this audit.*
