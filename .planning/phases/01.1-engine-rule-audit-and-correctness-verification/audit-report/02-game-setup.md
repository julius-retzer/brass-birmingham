# Game Setup Audit

**Audited:** 2026-03-22
**Auditor:** Automated audit against ai-docs/brass-birmingham-rules.mdc
**Status values:** PASS = correct + tested | FAIL = incorrect | MISSING = untested or unimplemented

Source files: `src/store/gameStore.ts`, `src/store/constants.ts`, `src/data/cards.ts`

## Game Setup Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| SETUP-01 | Each player starts with 17 money | PASS | gameStore.setup.test.ts:88 | Code: `GAME_CONSTANTS.STARTING_MONEY = 17`. Test: `expect(player.money).toBe(17)`. Rulebook: "Take 17 from the Bank." |
| SETUP-02 | Starting income level is 10 | PASS | gameStore.setup.test.ts:89 | Code: `GAME_CONSTANTS.STARTING_INCOME = 10`. Test: `expect(player.income).toBe(10)`. Rulebook: "Place your Income Marker on the '10' space of the Progress Track." |
| SETUP-03 | Starting VP is 0 | PASS | gameStore.setup.test.ts:90 | Code: `victoryPoints: 0`. Test: `expect(player.victoryPoints).toBe(0)`. Rulebook: "Place your Victory Point (VP) Marker on the '0' space of the Progress Track." |
| SETUP-04 | Each player is dealt 8 cards | PASS | gameStore.setup.test.ts:91 | Code: `GAME_CONSTANTS.STARTING_HAND_SIZE = 8`. Test: `expect(player.hand.length).toBeGreaterThan(0)`. Note: Test checks > 0, not exactly 8. Partial evidence. |
| SETUP-05 | 2-player deck removes blue and teal location cards | MISSING | -- | Code: `getInitialCards(2)` filters by twoPlayers count, setting Belper, Derby, Leek, Stoke, Stone, Uttoxeter to 0 cards. Matches rulebook. No dedicated test for deck composition verification. |
| SETUP-06 | Industry tile allocation per player (all tiles on player mat) | MISSING | -- | Code: `getInitialPlayerIndustryTilesWithQuantities()` gives each player all tile types with quantities. No test verifies the exact tile allocation matches the physical player mat. |
| SETUP-07 | Merchant tile setup for 2 players (no Warrington, no Nottingham) | FAIL | -- | Code in `gameStore.ts` (`createMerchantsForPlayerCount`): For 2 players, includes Warrington + Gloucester (2 merchants). Rulebook: "In a 2 player game, no Merchant tiles are placed in Warrington & Nottingham." So 2-player should have Gloucester, Oxford, Shrewsbury (3 merchants). Code is WRONG: includes Warrington (should be excluded) and excludes Oxford + Shrewsbury (should be included). |
| SETUP-08 | Coal market initial state: 13 cubes filling from most expensive, leaving 1 of the 1-pound spaces open | PASS | gameStore.setup.test.ts:102-106 | Code: price-1 has 1/2 cubes, prices 2-7 have 2/2 cubes, price-8 has 0 (infinite fallback). Total: 1 + (6*2) = 13 cubes. Test: verifies coalMarket[0].cubes=1 and coalMarket[0].price=1. Rulebook: "Place 1 black cube on each space of the Coal Market, leaving 1 of the 1-pound spaces open." This means 13 cubes total (14 spaces minus 1 open = 13). Code matches. |
| SETUP-09 | Iron market initial state: 8 cubes filling from most expensive, leaving both 1-pound spaces open | PASS | gameStore.setup.test.ts:109-113 | Code: price-1 has 0/2 cubes, prices 2-5 have 2/2 cubes, price-6 has 0 (infinite fallback). Total: 0 + (4*2) = 8 cubes. Test: verifies ironMarket[0].cubes=0 and ironMarket[0].price=1. Rulebook: "Place 1 orange cube on each space of the Iron Market, leaving both of the 1-pound spaces open." This means 8 cubes (10 spaces minus 2 = 8). Code matches. |
| SETUP-10 | Starting era is Canal | PASS | gameStore.setup.test.ts:78 | Code: `era: 'canal' as const`. Test: `expect(snapshot.context.era).toBe('canal')`. Rulebook: "the Canal Era (1770-1830)" starts first. |
| SETUP-11 | First player determination (random order) | MISSING | -- | Rulebook: "Shuffle all players' Character tiles together and place them in a random order on the Turn Order Track." Code: `turnOrder: players.map((p) => p.id)` -- uses input order, not randomized. No shuffle of turn order at game start. **POTENTIAL ISSUE:** Turn order should be randomized at game start. |
| SETUP-12 | Board starts empty (no placed industries or links) | PASS | gameStore.setup.test.ts:92-93 | Code: each player starts with `links: []` and `industries: []`. Test: `expect(player.links).toHaveLength(0)` and `expect(player.industries).toHaveLength(0)`. |
| SETUP-13 | 2 Wild Location and 2 Wild Industry cards in separate piles | PASS | gameStore.setup.test.ts:121-123 | Code: creates 2 of each wild card type, placed in separate piles. Test: `expect(snapshot.context.wildLocationPile.length).toBeGreaterThan(0)` and `expect(snapshot.context.wildIndustryPile.length).toBeGreaterThan(0)`. Note: test checks > 0, not exactly 2. |
| SETUP-14 | First round of Canal Era: each player performs only 1 action | PASS | gameStore.setup.test.ts:80 | Code: `GAME_CONSTANTS.FIRST_ROUND_ACTIONS = 1`. Test: `expect(snapshot.context.actionsRemaining).toBe(1)`. Rulebook: "During the first round of the Canal Era, each player performs only 1 action." |
| SETUP-15 | Draw pile is shuffled | MISSING | -- | Code: `shuffleArray(regularCards)`. No test verifies shuffling occurs (hard to test randomness). |
| SETUP-16 | Discard pile starts with 1 face-down card per player | FAIL | -- | Rulebook: "Draw 1 additional card from the Draw Deck and place it face down in your player area; this is your Discard Pile." Code: `discardPile: []` -- discard pile starts empty. Each player should start with 1 card in their personal discard pile. **Note:** The code uses a shared discard pile rather than per-player discard piles. The rulebook has per-player discard piles. This is an architectural difference that affects several game mechanics (Scout, end of era shuffle). |
| SETUP-17 | 10 rounds per era in 2-player game (10 cards each after dealing 8+1) | MISSING | -- | Rulebook: "exactly 8/9/10 rounds per era in a 4/3/2-players game." For 2 players: 10 rounds per era. 2-player deck should have enough cards for 2 players x (8 hand + 1 discard) = 18 cards dealt, leaving enough for 10 rounds of 2 actions each. Need to verify total card count. |
| SETUP-18 | Loan amount is 30 pounds | MISSING | -- | Code: `GAME_CONSTANTS.LOAN_AMOUNT = 30`. Matches rulebook: "Take 30 from the bank." No dedicated test. |
| SETUP-19 | Loan income penalty is 3 income levels | MISSING | -- | Code: `GAME_CONSTANTS.LOAN_INCOME_PENALTY = 3`. Matches rulebook: "move your Income Marker 3 income levels (not spaces) backwards." |
| SETUP-20 | Canal link costs 3 pounds | MISSING | -- | Code: `GAME_CONSTANTS.CANAL_LINK_COST = 3`. Matches rulebook: "You may build a maximum of 1 canal Link for 3." |
| SETUP-21 | Single rail link costs 5 pounds, double rail costs 15 | MISSING | -- | Code: `RAIL_LINK_COST = 5`, `RAIL_DOUBLE_LINK_COST = 15`. Matches rulebook: "1 rail Link for 5" and "2 rail Links for 15." |
| SETUP-22 | Coal market fallback price is 8 per cube | MISSING | -- | Code: `COAL_FALLBACK_PRICE = 8`. Matches rulebook: "If the Coal Market is empty, you can still purchase coal for 8 per piece." |
| SETUP-23 | Iron market fallback price is 6 per cube | MISSING | -- | Code: `IRON_FALLBACK_PRICE = 6`. Matches rulebook: "If the Iron Market is empty, you can still purchase iron for 6 per piece." |
| SETUP-24 | Minimum income level is -10 | MISSING | -- | Code: `MIN_INCOME = -10`. Matches rulebook: "You cannot take a loan if it will take your income level below -10." |
| SETUP-25 | Maximum income level is 30 | MISSING | -- | Code: `MAX_INCOME = 30`. Matches rulebook: "You cannot increase your income level above level 30." |

## Summary

| Area | Total | PASS | FAIL | MISSING |
|------|-------|------|------|---------|
| Game Setup | 25 | 10 | 2 | 13 |

## Critical Findings

1. **SETUP-07 (FAIL):** Merchant setup for 2-player games is incorrect in `gameStore.ts`. Code includes Warrington (should be excluded) and excludes Oxford and Shrewsbury (should be included). The `merchants.ts` file has the correct logic but is not used at runtime.

2. **SETUP-16 (FAIL):** Discard pile initialization is wrong. Each player should start with 1 face-down card from the draw deck as their initial discard pile. Code starts with an empty shared discard pile. The architecture uses a shared discard pile instead of per-player discard piles, which affects Scout action and end-of-era reshuffling.

3. **SETUP-11 (MISSING but notable):** Turn order is not randomized at game start. The code uses the order players are passed in, rather than shuffling character tiles as the rulebook requires.

4. **SETUP-04/13 (PASS but weak):** Tests only check `> 0` rather than exact values (8 cards in hand, 2 wild cards each). Test evidence is partial.
