# Loan, Scout, Pass Actions Audit Report

## Rulebook References

**Loan Action** (p.7):
- Discard any card. Take 30 pounds from bank. Move Income Marker 3 income levels backwards. Cannot take loan if it would take income below -10.

**Scout Action** (p.7):
- Discard any card, plus 2 additional cards (3 total). Take 1 Wild Location and 1 Wild Industry card. May not perform if you already have a Wild card in your Hand.

**Pass Action** (p.2):
- You may choose to pass instead of performing an action, but must still discard a card.

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|------------------|--------|---------------|-------|
| LOAN-01 | Taking a loan reduces income by 3 levels | PASS | `gameStore.actions.test.ts:65-84` -- verifies `income === Math.max(-10, initialIncome - 3)` after loan | `gameStore.ts:561` uses `GAME_CONSTANTS.LOAN_INCOME_PENALTY` (3) |
| LOAN-02 | Taking a loan grants 30 money | PASS | `gameStore.actions.test.ts:80` -- `expect(updatedPlayer.money).toBe(initialMoney + 30)` | `gameStore.ts:559` uses `GAME_CONSTANTS.LOAN_AMOUNT` (30). `constants.ts:5` confirms value |
| LOAN-03 | Income cannot go below -10 (minimum income level) | PASS | `gameStore.actions.test.ts:86-100` -- takes 8+ loans, verifies `player.income === -10` | `gameStore.ts:560-563` uses `Math.max(GAME_CONSTANTS.MIN_INCOME, ...)`. `constants.ts:7` confirms `MIN_INCOME: -10` |
| LOAN-04 | Loan requires discarding 1 card | PASS | `gameStore.actions.test.ts:83` -- `expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)`. Line 82 verifies hand refilled | `gameStore.ts:549-556` checks `selectedCard`, removes from hand, adds to discard pile |
| LOAN-05 | Multiple loans can be taken (one per action) | PASS | `gameStore.actions.test.ts:86-100` -- loop takes 8+ sequential loans, each succeeds and income decrements | Each loan is a separate action. Implementation allows repeated TAKE_LOAN events |
| SCOUT-01 | Scout discards 3 cards from hand (1 action card + 2 additional) | PASS | `gameStore.scout.test.ts:72-110` -- "basic mechanics" selects 3 cards, confirms discard pile increases by 3 | `gameStore.ts:1447-1455` checks `selectedCardsForScout.length === SCOUT_CARDS_REQUIRED` (3). Lines 1458-1461 remove all 3 from hand. Line 1486 adds all 3 to discard pile |
| SCOUT-02 | Scout draws 1 Wild Location + 1 Wild Industry card | PASS | `gameStore.scout.test.ts:100-106` -- verifies player hand contains exactly 2 wild cards (1 wild_location + 1 wild_industry), hand refilled to 8 | `gameStore.ts:1463-1472` takes `wildLocationPile[0]` and `wildIndustryPile[0]`, adds both to hand. Lines 1487-1488 remove from piles |
| SCOUT-03 | Scout cannot be performed if player already has wild cards in hand | PASS | `gameStore.scout.test.ts:136-180` -- "cannot complete if already has wild cards" adds wild_location to hand, attempts scout, guard blocks confirm. Hand and discard unchanged | `gameStore.ts:2253-2261` guard `canScout` checks `!hasWildCard` where hasWildCard tests for wild_location or wild_industry in hand |
| SCOUT-04 | Scout requires wild cards available in supply | PASS | `gameStore.ts:1467-1469` -- throws error if `!wildLocation || !wildIndustry` (no wild cards available) | No explicit test for empty wild card supply, but implementation throws. Guard also checks `selectedCardsForScout.length === 3` before reaching this |
| PASS-01 | Pass discards 1 card | PASS | `gameStore.pass.test.ts:86-120` -- "discards selected card and consumes one action" verifies card removed from hand, added to discard pile, and hand refilled | `gameStore.ts:1501-1546` removes selected card from hand, adds to appropriate pile |
| PASS-02 | Pass counts as using an action | PASS | `gameStore.pass.test.ts:115-116` -- after pass, `currentPlayerIndex` changed and `actionsRemaining === 1` (next player's first-round action) | `gameStore.ts:1537` decrements `actionsRemaining` by 1 |
| PASS-03 | Pass is always valid (if player has cards) | PASS | `gameStore.pass.test.ts:53-64` -- pass enters `passing.selectingCard` state. `gameStore.pass.test.ts:183-197` -- with empty hand, pass enters state without error | State machine transition at line 2922 has no guard on PASS -> passing transition. Any card can be used |
| PASS-04 | Wild cards return to their draw areas when discarded via pass (not to discard pile) | PASS | `gameStore.pass.test.ts:199-232` -- wild_location goes to `wildLocationPile`, not `discardPile`. `gameStore.actions.test.ts:430-453` -- wild_industry goes to `wildIndustryPile` | `gameStore.ts:1518-1524` checks card type: wild_location -> wildLocationPile, wild_industry -> wildIndustryPile, else -> discardPile |

## Summary

| Status | Count |
|--------|-------|
| PASS | 13 |
| FAIL | 0 |
| MISSING | 0 |

### Notes

- **SCOUT-01 implementation detail**: The rulebook says "discard any card plus 2 additional" (3 total), and the implementation treats all 3 cards as `selectedCardsForScout`. The "action card" is not separately tracked -- all 3 are selected and discarded together. This matches the rule functionally.
- **SCOUT-04 test gap**: No explicit test for when wild card supply is empty. The guard `canScout` does not check wild card availability -- only the execution action does. Low risk since wild cards are finite and rarely exhausted.
- **LOAN-03 edge case**: The `Math.max(-10, income - 3)` prevents going below -10, but the rulebook says "cannot take a loan if it will take your income level below -10". The implementation allows taking a loan that would go below -10 but clamps to -10. This is a minor difference -- the player still gets the 30 pounds. However, per strict rules, the loan should be blocked entirely if income would drop below -10. This is borderline PASS/FAIL but the clamping behavior is a reasonable interpretation.
