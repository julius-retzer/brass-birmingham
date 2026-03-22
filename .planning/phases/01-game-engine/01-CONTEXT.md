# Phase 1: Game Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete and fully test all game logic for 2-player Brass Birmingham. Every rule correctly enforced, all 7 action types validated, scoring verified, era transitions automatic, edge cases handled. The engine already exists (~2800 lines XState v5) but has bugs, gaps, and simplified scoring. This phase fills those gaps and achieves 100% test coverage.

</domain>

<decisions>
## Implementation Decisions

### Code approach
- Fix incrementally — keep existing structure, fix bugs and fill gaps one area at a time
- TDD: write failing test for each gap, then implement the fix
- Keep gameStore.ts as one file for Phase 1 — no file restructuring, focus purely on correctness
- Keep TEST_ events (TEST_SET_PLAYER_HAND, TEST_SET_ERA, etc.) for test setup — pragmatic, already wired in

### Era transitions
- Convert from manual triggers (TRIGGER_ERA_SCORING, TRIGGER_CANAL_ERA_END) to automatic state machine transitions
- State machine should auto-detect era end (empty deck + empty hands) and transition through scoring -> era change -> next era
- This is the correct XState pattern and prevents missed transitions in real gameplay

### Scoring
- Current link scoring is wrong (simplified to 1 VP per link) — must count VP icons on adjacent flipped industries per real rules
- Income-to-VP conversion at final scoring must be implemented
- Industry tile VP scoring and link VP scoring must both be accurate to real Brass Birmingham rules

### Integration testing
- Full game simulation test is a must-have (Success Criteria #1)
- Simulate a complete 2-player game programmatically: start -> Canal era -> scoring -> era transition -> Rail era -> final scoring
- This is the ultimate proof the engine works

### Scoring verification
- Search for published Brass Birmingham reference games with known final scores to validate against
- If none found (likely), create 2-3 hand-crafted game states with manually calculated expected VP totals

### Data accuracy
- Board data (board.ts) and industry tile definitions (industryTiles.ts) must be verified against the real game
- User does not have physical game available — verify against online references (BGG, rulebook PDFs, community resources)
- Fix any discrepancies found in city connections, industry slots, tile quantities, tile stats

### Rule ambiguities
- Primary reference: ai-docs/brass-birmingham-rules.mdc
- Tricky areas flagged by user: exact tile quantities on player mat, exact board graph (cities and connections)
- When rules are unclear, search online resources for official FAQ/errata and community consensus

### Claude's Discretion
- Exact order of fixing individual actions (which bugs/gaps to tackle first)
- Test organization (how to group/name test files)
- How to structure the automatic era transition states in XState
- Specific approach to scoring implementation details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Game rules
- `ai-docs/brass-birmingham-rules.mdc` — Complete Brass Birmingham rules. Primary authority for all rule enforcement

### Game data
- `src/data/board.ts` — City definitions, connections graph, industry slots per city. Needs accuracy verification
- `src/data/industryTiles.ts` — Industry tile definitions with levels, costs, VP, resources. Needs accuracy verification
- `src/data/cards.ts` — Card definitions (location cards, industry cards, wild cards)
- `src/data/merchants.ts` — Merchant tile definitions

### Existing engine
- `src/store/gameStore.ts` — Main XState v5 state machine (~2800 lines). All 7 actions, guards, scoring, era transitions
- `src/store/build/buildActions.ts` — Build action logic (extracted module)
- `src/store/market/marketActions.ts` — Market consumption logic (coal, iron, beer)
- `src/store/network/networkActions.ts` — Network action logic
- `src/store/shared/gameUtils.ts` — Shared utility functions

### Existing tests
- `src/store/gameStore.*.test.ts` — 16 test files covering actions, setup, turns, markets, eras, etc. (124 passing, 2 failing, 6 skipped)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- XState v5 state machine with full action/guard/transition architecture — working foundation
- Build/market/network modules already extracted into subdirectories
- Shared utilities (gameUtils.ts) with validation, card management, player helpers
- TEST_ events for programmatic state manipulation in tests
- GAME_CONSTANTS for configurable values

### Established Patterns
- XState `assign` actions for immutable state updates
- Guard functions for action validation (canCompleteBuild, canBuildLink, etc.)
- Action flow: selectingCard -> selectingLocation/Link -> confirming -> actionComplete
- Log entries created for every action and state change
- Resource consumption via market module (consumeCoalFromSources, consumeIronFromSources, consumeBeerFromSources)

### Integration Points
- `actionComplete` state handles hand refill and industry flipping after each action
- `nextPlayer` state handles turn progression
- Era scoring/transition currently triggered manually — needs to integrate into state machine flow
- State machine consumed by server (gameManager.ts) and UI components

### Known Issues
- 2 failing tests in gameStore.network.test.ts (adjacency requirement, costs vary by era)
- 6 skipped tests (3 develop, 1 error, plus integration suite)
- Link scoring simplified (1 VP per link instead of counting adjacent industry VP icons)
- Era transitions are manual triggers, not automatic
- No income-to-VP conversion at final scoring
- Full game integration test is skipped

</code_context>

<specifics>
## Specific Ideas

- User flagged tile quantities and board graph as areas where rules doc is insufficient — need external verification
- No physical game available — must use online resources for data verification
- The approach is explicitly "fix what's there" not "rewrite" — minimize regression risk

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-game-engine*
*Context gathered: 2026-03-22*
