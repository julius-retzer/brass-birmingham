# Roadmap: Brass Birmingham Online

## Overview

The game engine already exists but needs gaps filled and full test coverage. Once the engine is bulletproof, the UI gets built in two waves: first the read-only board and state display (so you can see a game), then the interactive action UIs and lobby (so you can play a game). Three phases, engine-first, 2 players only.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Game Engine** - Complete and fully test all game logic for 2-player Brass Birmingham (gap closure in progress)
- [ ] **Phase 2: Board and State Display** - Visual representation of the game board, markets, and all player-visible state
- [ ] **Phase 3: Playable Game** - Action UIs for all 7 action types, game lobby, and end-game scoring

## Phase Details

### Phase 1: Game Engine
**Goal**: Every rule of 2-player Brass Birmingham is correctly enforced and verified by tests
**Depends on**: Nothing (first phase)
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-05, ENGINE-06, ENGINE-07, ENGINE-08, ENGINE-09, ENGINE-10
**Success Criteria** (what must be TRUE):
  1. A full 2-player game can be simulated programmatically from start through Canal scoring, era transition, Rail era, and final scoring without errors
  2. All 7 action types reject invalid inputs and accept valid inputs according to Brass Birmingham rules
  3. Scoring produces correct VP totals for both canal and rail eras (verified against hand-calculated reference games)
  4. Turn order, action count per turn, and first-round single-action rules work correctly across both eras
  5. Edge cases (bankruptcy, empty markets, no valid moves, last card) are tested and handled
**Plans:** 9 plans (5 complete, 4 gap closure)

Plans:
- [x] 01-01-PLAN.md -- Fix game data (board slots, connections, farm breweries, industry tiles, merchants)
- [x] 01-02-PLAN.md -- Fix scoring algorithms and automatic era transitions
- [x] 01-03-PLAN.md -- Fix action validation (network, build, develop, sell)
- [x] 01-04-PLAN.md -- Fix edge cases and turn management (bankruptcy, markets, turn order)
- [x] 01-05-PLAN.md -- Full game integration test and coverage
- [x] 01-06-PLAN.md -- Gap closure: buildActions.ts and gameUtils.ts test coverage
- [x] 01-07-PLAN.md -- Gap closure: gameStore.ts action execution and selection test coverage
- [x] 01-08-PLAN.md -- Gap closure: guard functions, marketActions.ts, and ENGINE-07 edge cases
- [ ] 01-09-PLAN.md -- Gap closure: final coverage push for gameStore.ts and industryTiles.ts

### Phase 01.1: Engine rule audit and correctness verification (INSERTED)

**Goal:** Systematically audit every Brass Birmingham rule against the engine implementation, producing a machine-parseable gap report with pass/fail/missing verdicts and test evidence for each rule
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06, AUDIT-07, AUDIT-08, AUDIT-09, AUDIT-10, AUDIT-11, AUDIT-12
**Depends on:** Phase 1
**Success Criteria** (what must be TRUE):
  1. Every rule in the Brass Birmingham rulebook has a pass/fail/missing verdict with test evidence
  2. Data layer values (tile costs, board connections, merchants) are verified against the physical game
  3. All 7 action types are audited for rule compliance
  4. Scoring, era transitions, and income rules are audited
  5. Summary report aggregates all findings with accurate totals
**Plans:** 1/5 plans executed

Plans:
- [ ] 01.1-01-PLAN.md -- Audit data layer (industry tiles, board, cards, merchants) and game setup
- [x] 01.1-02-PLAN.md -- Audit turn flow, round progression, income, and bankruptcy
- [ ] 01.1-03-PLAN.md -- Audit Build action and Network action
- [ ] 01.1-04-PLAN.md -- Audit Sell, Develop, Loan, Scout, Pass actions and resource consumption
- [ ] 01.1-05-PLAN.md -- Audit scoring, era transitions, and generate summary report

### Phase 2: Board and State Display
**Goal**: Players can see the complete game state -- board, markets, hands, resources, and opponent public info
**Depends on**: Phase 1
**Requirements**: BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, BOARD-06, BOARD-07, STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-08
**Success Criteria** (what must be TRUE):
  1. Player can see all 30 board locations with their industry slots, placed industries (with flip status), and resource cubes
  2. Player can see all network links colored by era type with built/unbuilt status
  3. Player can see coal and iron market prices, merchant tiles, and beer availability
  4. Player can see their own hand of cards, money, income, VP, and remaining unbuilt tiles
  5. Player can see opponent's public info (money, income, VP, built industries) but not opponent's hand (card count only)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Playable Game
**Goal**: Two players can play a complete game of Brass Birmingham online from lobby to final scoring
**Depends on**: Phase 2
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04, ACTN-05, ACTN-06, ACTN-07, STATE-06, STATE-07, LOBBY-01, LOBBY-02
**Success Criteria** (what must be TRUE):
  1. Player can create a new 2-player game and share a link; second player can join via that link
  2. Player can execute all 7 action types through the UI with clear valid/invalid move feedback
  3. Game log shows chronological history of all actions taken by both players
  4. When the game ends, both players see a scoring screen with VP breakdown (link points, industry points, income conversion) and winner declaration
  5. Two players on separate browsers can play a complete game from start to finish using only the UI
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 01.1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Game Engine | 8/9 | Gap closure | - |
| 01.1. Engine Rule Audit | 1/5 | In Progress|  |
| 2. Board and State Display | 0/0 | Not started | - |
| 3. Playable Game | 0/0 | Not started | - |
