# 10 - Scoring, Era Transition, and End-of-Game Audit

**Auditor:** Claude (automated)
**Date:** 2026-03-22
**Source files:** `src/store/gameStore.ts` (actions: `triggerEraScoring`, `triggerCanalEraEnd`, `triggerRailEraEnd`; states: `eraScoring`, `eraTransition`, `gameOver`)
**Test files:** `src/store/gameStore.scoring.test.ts`, `src/store/gameStore.era.test.ts`, `src/store/gameStore.integration.test.ts`
**Rulebook sections:** "End of Canal & Rail Era" (p.2), "End of Canal Era" (p.2), "Winning the Game" (p.2)

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| SCORE-01 | Canal era ends when draw deck empty and all players used all actions | PASS | `gameStore.era.test.ts:371-438` - automatic era transition test verifies draw pile empty + hands empty triggers scoring flow | Guard `isEraEnd` checks `drawPile.length === 0 && allPlayersHandsEmpty` |
| SCORE-02 | Link VP: each canal link scores VP equal to sum of linkScoringIcons on connected locations | PASS | `gameStore.scoring.test.ts:97-123` - tests link scoring with flipped industries at adjacent cities; `gameStore.era.test.ts:454-561` - era scoring awards VPs for links | Implementation at `triggerEraScoring` lines 1931-1962 correctly sums `linkScoringIcons` from ALL flipped industries in BOTH adjacent cities across ALL players |
| SCORE-03 | Industry VP: each flipped industry tile scores its VP value | PASS | `gameStore.scoring.test.ts:201-221` - flipped industries score victoryPoints (5+11=16); `gameStore.scoring.test.ts:174-197` - multiple flipped industries sum correctly | `triggerEraScoring` lines 1964-1998 |
| SCORE-04 | Unflipped tiles score 0 VP | PASS | `gameStore.scoring.test.ts:223-268` - unflipped industries removed and score 0; `gameStore.scoring.test.ts:247-268` - all unflipped removed, VP=0 | Unflipped industries filtered out of scoring loop |
| SCORE-05 | Link VP counts icons on BOTH ends of the link | PASS | `gameStore.scoring.test.ts:142-172` - opponent flipped industries adjacent to link count toward scoring | Implementation iterates `[link.from, link.to]` and all players' industries at each city |
| SCORE-06 | Rail era ends when draw deck empty and all players used all actions | PASS | `gameStore.era.test.ts:371-438` - same mechanism as canal era, guard `isEraEnd` applies to both eras | State machine: `eraScoring` -> `gameOver` when `!isCanalEra` (line 2972) |
| SCORE-07 | Rail link VP: same formula as canal scoring | PASS | `gameStore.ts:2108-2119` - `triggerRailEraEnd` uses identical link scoring logic | Code duplicated from `triggerEraScoring`, same adjacency + flipped check |
| SCORE-08 | Rail industry VP includes tiles remaining from canal era | PASS | `gameStore.scoring.test.ts:272-308` - winner determination test sets up industries after canal era end, scores them in rail era | Flipped tiles from canal era remain on board (ERA-03), `triggerRailEraEnd` scores all flipped industries including carried-over ones |
| SCORE-09 | Total VP = accumulated canal VPs + rail link VP + rail industry VP | PASS | `gameStore.scoring.test.ts:458-500` - `triggerRailEraEnd` records scores with breakdown including totalVP | `totalVP = player.victoryPoints + linkVPs + industryVPs` where `player.victoryPoints` already includes canal-era scoring (line 2131) |
| ERA-01 | All canal link tiles are removed from the board after scoring | PASS | `gameStore.era.test.ts:454-561` - after era scoring, `links` array is empty; `gameStore.ts:1960` sets `links: []` | Links removed during `triggerEraScoring`, not during `triggerCanalEraEnd` |
| ERA-02 | Unflipped industry tiles removed from board during era scoring | FAIL | `gameStore.era.test.ts:546-560` - test has TODO/console.warn about unflipped removal; `gameStore.ts:1965-1978` removes ALL unflipped | **BUG:** `triggerEraScoring` removes ALL unflipped tiles regardless of level. Per rules, only level 1 tiles are removed during canal era transition (step 3). Unflipped level 2+ tiles should remain on the board and carry into rail era. The current implementation incorrectly removes unflipped level 2+ tiles during canal scoring. |
| ERA-03 | Flipped industry tiles remain on the board | PASS | `gameStore.scoring.test.ts:223-244` - after scoring, flipped industries remain (`industries.length === 1, flipped === true`); `gameStore.ts:1975` keeps flipped | `remainingIndustries.push(industry)` when `industry.flipped` |
| ERA-04 | Level 1 industry tiles removed from board during canal era transition | PASS | `gameStore.era.test.ts:105-237` - level 1 coal removed, level 2 cotton remains after transition | `triggerCanalEraEnd` lines 2015-2033 filter `industry.level > 1`. Note: rules say "from the board (not from Player Mats)" -- implementation removes from board industries array which is correct. However, level 1 tiles on Player Mats should also be removed per rule ERA-04 in the plan -- implementation does NOT remove from `industryTilesOnMat`. |
| ERA-05 | Cards reshuffled and re-dealt (8 cards each) after canal era | PASS | `gameStore.era.test.ts:331-369` - players get 8-card hands after transition; `gameStore.era.test.ts:279-329` - discard pile shuffle test (with TODO note) | `triggerCanalEraEnd` shuffles discardPile + drawPile into new deck, deals 8 per player. Incomplete: empty for-loop at line 2044-2047 (comment says "collect from each player's discard pile") -- single shared discardPile is used which matches current data model |
| ERA-06 | Turn order for first round of rail era determined by canal era spending | MISSING | No test evidence for rail era turn order being based on canal spending | `triggerCanalEraEnd` line 2078: `turnOrder: context.turnOrder` -- preserves last canal round's turn order. No recalculation based on canal-era total spending. The rules imply spending determines turn order, and the last round's spending-based order happens to be preserved, but there is no explicit test verifying this. |
| ERA-07 | First round of rail era: each player gets 1 action | PASS | `gameStore.era.test.ts:441-452` - first round of rail era gives 1 action; `actionsRemaining === 1` verified | `triggerCanalEraEnd` line 2073: `actionsRemaining: GAME_CONSTANTS.FIRST_ROUND_ACTIONS` |
| ERA-08 | Player money, income, and VP carry over to rail era | PASS | `gameStore.ts:2063-2066` - only `hand` is overwritten; money, income, VP are preserved on player objects | No explicit test, but structure is clear: `triggerCanalEraEnd` only modifies `hand` and `industries` on player objects, leaving money/income/victoryPoints intact |
| END-01 | Player with most VP wins | PASS | `gameStore.scoring.test.ts:272-308` - winner has highest VP; `gameStore.ts:2157-2174` sorts by VP descending | `sorted = [...scoreBreakdown].sort((a, b) => b.totalVP - a.totalVP)` |
| END-02 | Tiebreaker 1: highest income level | PASS | `gameStore.scoring.test.ts:310-343` - income is tiebreaker when VPs equal, P2 wins with higher income | `if (a.finalIncome !== b.finalIncome) return b.finalIncome - a.finalIncome` (line 2160) |
| END-03 | Tiebreaker 2: most money remaining | PASS | `gameStore.scoring.test.ts:345-378` - money is second tiebreaker, P1 wins with higher money | `if (a.finalMoney !== b.finalMoney) return b.finalMoney - a.finalMoney` (line 2161) |
| END-04 | Income is NOT converted to VP (only used as tiebreaker) | PASS | `gameStore.scoring.test.ts:415-456` - high income player loses to higher VP player; VP values not inflated by income | `totalVP = player.victoryPoints + linkVPs + industryVPs` -- no income component |
| END-05 | Game result includes per-player breakdown | PASS | `gameStore.scoring.test.ts:458-500` - score breakdown has playerId, totalVP, linkVP, industryVP, finalIncome, finalMoney | `gameResult.scores` typed at lines 165-172 with full breakdown |
| END-06 | Tie declared when VP, income, and money are all equal | PASS | `gameStore.scoring.test.ts:380-413` - `isTie: true` when all values equal | `isTie = tiedPlayers.length > 1` where tied check is on all three fields (lines 2166-2171) |

## Summary

| Metric | Count |
|--------|-------|
| Total Rules | 22 |
| PASS | 20 |
| FAIL | 1 |
| MISSING | 1 |

## Critical Issues

| Rule Ref | Description | Impact | Fix Needed |
|----------|------------|--------|------------|
| ERA-02 | `triggerEraScoring` removes ALL unflipped industry tiles regardless of level | Unflipped level 2+ tiles incorrectly removed during canal era scoring -- they should remain on board and carry into rail era. Only level 1 tiles should be removed (during era transition step, not scoring step). | Modify `triggerEraScoring` to only score VPs (not remove unflipped tiles), or only remove unflipped tiles during canal-era-specific transition step. Scoring should keep unflipped tiles on board. |

## Coverage Gaps

| Rule Ref | Description | What's Missing |
|----------|------------|---------------|
| ERA-06 | Turn order for first round of rail era based on canal era spending | No test explicitly verifies rail era turn order reflects canal spending. Implementation preserves last round's order which may be correct by coincidence but is not deliberately tested. |

## Notes on Known TODOs

1. **Discard pile shuffle (ERA-05):** The empty for-loop at `gameStore.ts:2044-2047` is a code smell but functionally correct -- the game uses a single shared `discardPile` rather than per-player discard piles, so shuffling `discardPile + drawPile` works. Marked PASS with note.

2. **Unflipped industry removal (ERA-02):** `triggerEraScoring` removes ALL unflipped industries. Per rules, scoring does NOT remove tiles -- it only counts VPs. Level 1 tiles are removed separately during era transition (step 3 of canal era end). Unflipped level 2+ tiles should persist. Marked FAIL.

3. **Level 1 removal from player mats (ERA-04):** The plan mentioned "Level 1 industry tiles are removed from each player's mat." The rulebook says "Remove all level 1 Industry tiles from the board (not from Player Mats)." The rules explicitly say NOT from player mats. The plan's ERA-04 wording was misleading -- the implementation correctly only removes from board. Marked PASS.

4. **Link scoring tests (SCORE-02/05):** Several tests in `gameStore.scoring.test.ts` note they "can't set links via TEST_SET_PLAYER_STATE" but the code actually supports `links` in the event (line 1878). Tests primarily verify industry VP scoring rather than link VP scoring with actual link objects. Link scoring logic is correct in code but under-tested.
