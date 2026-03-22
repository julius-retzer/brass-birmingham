# Audit Report: Turn Flow and Round Progression

**Audit Area:** Turn order, actions per turn, round progression, current player switching
**Source of Truth:** `ai-docs/brass-birmingham-rules.mdc` (sections: ROUNDS, PLAYER TURNS, END OF ROUND, ACTIONS LIST)
**Engine Files:** `src/store/gameStore.ts`, `src/store/shared/gameUtils.ts`, `src/store/constants.ts`
**Test Files:** `gameStore.turns.test.ts`, `gameStore.actions.test.ts`, `gameStore.integration.test.ts`, `gameStore.edgecases.test.ts`

---

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| TURN-01 | At start of each round (except first), player who spent least money goes first | PASS | gameStore.turns.test.ts:102 "turn order determined by money spent - least spender goes first" | Implementation at gameStore.ts:1599 sorts by spending ascending |
| TURN-02 | Ties in spending broken by previous turn order (who went second last round goes first) | FAIL | gameStore.turns.test.ts:136 "equal spending maintains relative turn order" | Implementation at gameStore.ts:1601 uses `a.index - b.index` (fixed array position) instead of previous turn order position. Rulebook: "their relative turn order remains the same." Current code preserves relative order by array index which happens to match initial order, but after a reorder the tiebreak would use array position not previous turn order position. |
| TURN-03 | First round of game, starting player determined randomly | PASS | gameStore.integration.test.ts:162 "game initializes correctly for 2 players" | Initial turnOrder set from player order at gameStore.ts:447. Note: randomization happens externally (Character tiles shuffled per rulebook setup). Engine trusts provided order. |
| TURN-04 | Turn order recalculated after every round | PASS | gameStore.turns.test.ts:162 "turnOrder tracks player IDs in spending order" | Implementation at gameStore.ts:1590-1608 recalculates on `isRoundComplete` |
| TURN-05 | Each player gets exactly 2 actions per turn in normal rounds | PASS | gameStore.actions.test.ts:138 "turn progression - round 2+ has 2 actions each" | `NORMAL_ROUND_ACTIONS = 2` in constants.ts:17 |
| TURN-06 | First round of Canal era, each player gets exactly 1 action | PASS | gameStore.turns.test.ts:48 "first round starts with 1 action" and gameStore.actions.test.ts:120 "turn progression - round 1 has 1 action each" | `FIRST_ROUND_ACTIONS = 1` in constants.ts:16, `isFirstRound` checks `context.round === 1` at gameUtils.ts:31 |
| TURN-07 | First round of Rail era, each player gets exactly 1 action | PASS | gameStore.integration.test.ts:289-290 "actionsRemaining toBe 1 in first round of rail era" | `isFirstRound` checks round === 1, and rail era resets round to 1 at gameStore.ts:2073 |
| TURN-08 | Player must perform an action (cannot skip without using Pass action) | PASS | gameStore.edgecases.test.ts:57 "player with cards but no legal actions can still pass" | State machine requires going through an action state (build/network/develop/sell/loan/scout/pass) to reach actionComplete. No way to skip without action. |
| TURN-09 | Each action requires discarding one card (except Scout which discards 3) | PASS | gameStore.actions.test.ts:102 "pass action - basic mechanics" (1 card); gameStore.scout.test.ts (3 cards) | Every action handler calls `removeCardFromHand`. Scout discards 3 total (1 action card + 2 additional) per gameStore.ts:1490 `SCOUT_CARDS_REQUIRED = 3`. |
| TURN-10 | Round ends when all players have completed their actions | PASS | gameStore.turns.test.ts:67 "end of round collects income and resets actions for next round" | `isRoundComplete` at gameStore.ts:1574 triggers when `nextPlayerIndex === 0` (wrapped around all players) |
| TURN-11 | After all actions, turn order is recalculated | PASS | gameStore.turns.test.ts:162 "turnOrder tracks player IDs in spending order" | Recalculation at gameStore.ts:1592-1608, inside `isRoundComplete` block |
| TURN-12 | After turn order, income is collected | PASS | gameStore.turns.test.ts:67 "end of round collects income" and gameStore.income.test.ts:69 "collects income at end of round" | Income collected at gameStore.ts:1613-1712, after turn order recalculation (line 1591-1608) |
| TURN-13 | After income, new round begins (or era ends if deck is empty) | PASS | gameStore.integration.test.ts:540 "automatic era transition when draw pile and hands empty" | `nextPlayer` state checks `isEraEnd` guard at gameStore.ts:2956; if false, goes to `action` state for new round |
| TURN-14 | Cards drawn back to hand size (8 cards) at end of round | MISSING | -- | Card refilling happens at `actionComplete` state entry (gameStore.ts:2936 `refillPlayerHand`) which runs AFTER EACH ACTION, not at end of round. Rulebook says "After all of your actions have been completed, refill your Hand back up to 8 cards." Current implementation refills after each individual action, not at end of player's turn. This means cards are drawn mid-turn between actions, giving the player information about the next card before their second action. Functionally equivalent in most cases but differs from the rulebook timing. |
| TURN-15 | After player completes both actions, play passes to next player in turn order | PASS | gameStore.actions.test.ts:138 "turn progression - round 2+ has 2 actions each" (line 157: currentPlayerIndex toBe 1 after P1 uses both actions) | `actionComplete` checks `hasActionsRemaining` guard; if false, transitions to `nextPlayer` at gameStore.ts:2942-2944 |
| TURN-16 | Current player indicator correctly tracks whose turn it is | PASS | gameStore.turns.test.ts:48 (line 53: currentPlayerIndex toBe 0) and gameStore.actions.test.ts:120 (line 126: currentPlayerIndex toBe 1 after P1 turn) | `currentPlayerIndex` updated in `nextPlayer` action at gameStore.ts:1737 |

---

## Summary

| Metric | Count |
|--------|-------|
| Total Rules | 16 |
| PASS | 14 |
| FAIL | 1 |
| MISSING | 1 |

### FAIL Details

- **TURN-02:** Tie-breaking uses fixed array index (`a.index - b.index`) instead of previous turn order. After a spending-based reorder, subsequent ties would not preserve the correct relative order. The rulebook states: "If multiple players have spent an equal amount, their relative turn order remains the same." The tiebreak should reference the previous `turnOrder` array positions, not the `players` array indices.

### MISSING Details

- **TURN-14:** Card refilling timing. The rulebook specifies cards are drawn "after all of your actions have been completed." The implementation draws after each individual action (at `actionComplete` entry). This means a player draws a replacement card between their first and second action, which is not per the rulebook. The card a player draws between actions could influence their second action choice, subtly changing game dynamics.

---

*Audited: 2026-03-22*
*Auditor: Claude (automated)*
*No source code modifications made during this audit.*
