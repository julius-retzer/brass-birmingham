# Phase 1: Game Engine - Research

**Researched:** 2026-03-22
**Domain:** XState v5 game state machine, Brass Birmingham rule enforcement, TDD with Vitest
**Confidence:** HIGH

## Summary

The existing engine (~2800 lines XState v5 state machine) provides a solid foundation with all 7 action types wired, guard-based validation, and 124 passing tests. However, research uncovered **critical data accuracy issues** (city industry slots, tile stats, connections) and **significant logic gaps** (link scoring is simplified to 1 VP per link, era transitions are manual, no income-to-VP conversion, missing farm breweries). The reference implementation (npow/brass-birmingham on GitHub) provides verified data against the Tabletop Simulator implementation, revealing that most city industry slot definitions in the current codebase are wrong.

The work breaks into three logical streams: (1) fix game data to match real Brass Birmingham, (2) fix scoring and era transition logic, (3) fill gaps in action validation and edge cases. The TDD approach (write failing test, then fix) is well-suited to this incremental correction work. The existing TEST_ events make it easy to set up specific game states for testing.

**Primary recommendation:** Start by fixing game data (board.ts, industryTiles.ts) since all action validation and scoring depends on accurate data. Then fix scoring/era transitions. Then fill action gaps and edge cases. End with the full integration test.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fix incrementally -- keep existing structure, fix bugs and fill gaps one area at a time
- TDD: write failing test for each gap, then implement the fix
- Keep gameStore.ts as one file for Phase 1 -- no file restructuring, focus purely on correctness
- Keep TEST_ events (TEST_SET_PLAYER_HAND, TEST_SET_ERA, etc.) for test setup -- pragmatic, already wired in
- Convert era transitions from manual triggers to automatic state machine transitions
- Fix link scoring to count VP icons on adjacent flipped industries per real rules
- Implement income-to-VP conversion at final scoring
- Full game simulation test is a must-have
- Verify board data and industry tile definitions against online references
- Primary rule reference: ai-docs/brass-birmingham-rules.mdc

### Claude's Discretion
- Exact order of fixing individual actions (which bugs/gaps to tackle first)
- Test organization (how to group/name test files)
- How to structure the automatic era transition states in XState
- Specific approach to scoring implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENGINE-01 | Game machine correctly implements all Brass Birmingham rules for 2 players | Data accuracy fixes (board.ts, industryTiles.ts, connections), all action validation fixes |
| ENGINE-02 | Canal era scoring calculates link points and industry points correctly | Link scoring must count adjacent flipped industry VP icons, not 1-per-link |
| ENGINE-03 | Rail era scoring calculates link points and industry points correctly | Same link scoring fix plus income-to-VP conversion for final scoring |
| ENGINE-04 | Era transition correctly removes canal-only links/tiles, re-deals cards, sets turn order | Convert manual TRIGGER_ events to automatic XState transitions with proper sequencing |
| ENGINE-05 | All 7 action types have complete rule enforcement with correct resource/money handling | Fix network adjacency (2 failing tests), brewery beer production (canal=1, rail=2), overbuilding rules, sell action multi-sell |
| ENGINE-06 | Game machine has 100% unit test coverage for all actions and state transitions | Fix 2 failing tests, unskip 6 skipped tests, add missing coverage |
| ENGINE-07 | Edge cases tested: bankruptcy, empty markets, no valid moves, last card scenarios | Income shortfall/bankruptcy logic exists but needs verification; empty market fallback prices; last-card era-end detection |
| ENGINE-08 | Turn order correctly determined each round (lowest spend goes first) | Existing nextPlayer logic handles spending-based ordering; needs test coverage |
| ENGINE-09 | Current player switches correctly after each action (2 actions per turn) | Existing actionsRemaining decrement logic; needs edge case tests |
| ENGINE-10 | First round of each era correctly gives each player only 1 action | isFirstRound check exists; Rail Era first round must also be 1 action (needs verification) |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| XState | 5.28.0 | Game state machine | Already installed, all game logic built on it |
| Vitest | 4.1.0 | Test framework | Already installed, 124 tests passing, TDD workflow |
| TypeScript | 5.9.3 | Type safety | Already configured with strict mode |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Biome | (installed) | Linting/formatting | Run `pnpm lint` before committing |

No new libraries needed for Phase 1. This is pure logic work on existing code.

## Architecture Patterns

### Existing Project Structure (DO NOT CHANGE)
```
src/store/
  gameStore.ts          # Main XState v5 machine (~2800 lines) - ALL changes here
  constants.ts          # GAME_CONSTANTS
  build/
    buildActions.ts     # Build action validation logic
    buildValidation.test.ts
  market/
    marketActions.ts    # Coal/iron/beer consumption
  network/
    networkActions.ts   # Network action logic
  shared/
    gameUtils.ts        # Shared utilities
src/data/
  board.ts              # City definitions, connections, industry slots - NEEDS FIXES
  industryTiles.ts      # Tile definitions - NEEDS FIXES
  cards.ts              # Card definitions
  merchants.ts          # Merchant definitions
```

### Pattern 1: XState v5 Automatic (Eventless) Transitions
**What:** Use `always` transitions with guards to auto-detect era end and transition through scoring
**When to use:** Replacing manual TRIGGER_ERA_SCORING / TRIGGER_CANAL_ERA_END events
**Example:**
```typescript
// In XState v5, 'always' transitions are checked immediately on state entry
nextPlayer: {
  entry: 'nextPlayer',
  always: [
    {
      guard: 'isEraEnd',           // drawPile empty AND all hands empty
      target: 'eraScoring',        // Auto-transition to scoring
    },
    {
      target: 'action',            // Normal flow
    },
  ],
},
eraScoring: {
  entry: 'performEraScoring',
  always: [
    {
      guard: 'isCanalEra',
      target: 'eraTransition',     // Canal -> Rail transition
    },
    {
      target: 'gameOver',          // Rail era scoring = game over
    },
  ],
},
eraTransition: {
  entry: 'performCanalEraEnd',
  always: {
    target: 'action',              // Start Rail Era
  },
},
gameOver: {
  entry: 'performFinalScoring',
  type: 'final',
},
```

### Pattern 2: TDD for Each Fix
**What:** Write a failing test that asserts correct behavior, then fix the code
**When to use:** Every bug fix and feature addition in this phase
**Example:**
```typescript
// 1. Write failing test
test('link scoring counts VP icons on adjacent flipped industries', () => {
  const { actor } = setup()
  // Set up state with a link between two cities, each with flipped industries
  actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, industries: [...] })
  // Trigger scoring
  actor.send({ type: 'TRIGGER_ERA_SCORING' })
  // Assert VP equals sum of linkScoringIcons from adjacent flipped industries
  const s = actor.getSnapshot()
  expect(s.context.players[0].victoryPoints).toBe(expectedVP)
})
// 2. Fix triggerEraScoring to count linkScoringIcons instead of 1-per-link
```

### Pattern 3: TEST_ Events for State Setup
**What:** Use existing TEST_ events to set up specific game states for testing
**When to use:** All tests that need specific board/hand/era states
```typescript
actor.send({ type: 'TEST_SET_ERA', era: 'rail' })
actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [...] })
actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, money: 50, industries: [...] })
```

### Anti-Patterns to Avoid
- **Restructuring files:** User explicitly said keep gameStore.ts as one file for Phase 1
- **Removing TEST_ events:** They are needed for test setup, keep them
- **Rewriting from scratch:** Fix incrementally, minimize regression risk
- **Adding new dependencies:** No new libraries needed

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State machine | Custom state management | XState v5 `setup()` with `assign` actions | Already built, handles transitions/guards/actions |
| Test assertions | Custom validation | Vitest `expect` + `toBe`/`toEqual` | Standard, already configured |
| Card shuffling | Custom RNG | Existing `shuffleArray` in gameUtils.ts | Already tested, Fisher-Yates |
| Resource consumption | Manual tracking | Existing `consumeCoalFromSources`, etc. in marketActions.ts | Already handles closest-source logic |

## Common Pitfalls

### Pitfall 1: Game Data is Wrong
**What goes wrong:** City industry slots, tile stats, and connections in the codebase don't match the real game
**Why it happens:** Data was entered manually and has accumulated errors
**How to avoid:** Cross-reference every data point against the npow/brass-birmingham reference implementation (verified against Tabletop Simulator)
**Warning signs:** Tests pass but game behavior doesn't match real Brass Birmingham rules

**Critical discrepancies found in research:**

#### City Industry Slots (board.ts `cityIndustrySlots`)
Current code vs reference (npow/brass-birmingham verified against TTS):

| City | Current Code | Reference (Correct) |
|------|-------------|---------------------|
| Birmingham | [cotton,iron], [manufacturer,pottery], [brewery], [cotton,manufacturer] | [cotton,manufacturer], [manufacturer], [iron], [manufacturer] |
| Coventry | [cotton,manufacturer], [pottery] | [pottery], [manufacturer,coal], [iron,manufacturer] |
| Dudley | [coal], [iron], [brewery] | [coal], [iron] |
| Wolverhampton | [coal], [iron], [manufacturer] | [manufacturer], [manufacturer,coal] |
| Walsall | [coal], [iron] | [iron,manufacturer], [manufacturer,brewery] |
| Redditch | [cotton,manufacturer] | [manufacturer,coal], [iron] |
| Worcester | [cotton], [pottery] | [cotton], [cotton] |
| Kidderminster | [cotton], [pottery] | [cotton,coal], [cotton] |
| Cannock | [coal] | [manufacturer,coal], [coal] |
| Tamworth | [coal], [iron] | [cotton,coal], [cotton,coal] |
| Nuneaton | [cotton,manufacturer] | [manufacturer,brewery], [cotton,coal] |
| Coalbrookdale | [coal], [iron] | [iron,brewery], [iron], [coal] |
| Stone | [coal], [pottery,brewery] | [cotton,brewery], [manufacturer,coal] |
| Stafford | [coal], [pottery] | [manufacturer,brewery], [pottery] |
| Stoke | [coal], [pottery], [brewery] | [cotton,manufacturer], [pottery,iron], [manufacturer] |
| Leek | [cotton,manufacturer] | [cotton,manufacturer], [cotton,coal] |
| Uttoxeter | [brewery] | [manufacturer,brewery], [cotton,brewery] |
| Burton | [brewery], [brewery] | [manufacturer,coal], [brewery] |
| Derby | [cotton,manufacturer], [iron] | [cotton,brewery], [cotton,manufacturer], [iron] |
| Belper | [cotton,manufacturer] | [cotton,manufacturer], [coal], [pottery] |

Almost every city is wrong. This is the highest-priority fix.

#### Connection Discrepancies
| Connection | Current Code | Reference (Correct) |
|-----------|-------------|---------------------|
| Birmingham-Redditch | canal+rail | rail only |
| Birmingham-Nuneaton | canal+rail | rail only |
| Birmingham-Oxford | canal+rail | both |
| Burton-Cannock | canal+rail | rail only |
| Burton-Walsall | not present | canal only |
| Tamworth-Nuneaton | rail only | both |
| Tamworth-Walsall | canal+rail | rail only |
| Coventry-Nuneaton | canal+rail | rail only |
| Coventry-Oxford | canal+rail | not present (Oxford connects to Birmingham and Redditch) |
| Belper-Nottingham | rail only | both |
| Gloucester-Redditch | canal+rail | both |
| Gloucester-Oxford | canal+rail | not present |
| Redditch-Oxford | canal+rail | both |
| Redditch-Worcester | rail only | not present |
| Derby-Uttoxeter | rail only | rail only (correct) |
| Cannock-Walsall | not present | both |

Multiple connection errors affect network validation and coal connectivity.

#### Farm Breweries Missing
Current code has no farm brewery locations. The real board has:
- Northern Farm Brewery: between Cannock and Walsall
- Southern Farm Brewery: between Kidderminster and Worcester

#### Industry Tile Discrepancies

**Cotton:** Level 2 quantity should be 2 (code has 3). Level 2 link scoring should be 2 (code has 1). Level 4 quantity should be 3 (code has 2).

**Coal:** Level 1 quantity should be 1 (code has 2). Level 2 quantity should be 2 (code has 3). Level 3 quantity should be 2 (code has 3). Level 4 quantity should be 2 (code has 4). Level 1 link scoring should be 2 (code has 1).

**Iron:** Level 2 iron produced should be 4 (code has 5). Level 3 iron produced should be 5 (code has 6). Level 3 income should be 2 (code has 5). Level 4 iron produced should be 6 (code has 7). Level 4 income should be 1 (code has 6).

**Manufacturer:** Level 1 coal required should be 1 (code has 0). Level 1 quantity should be 1 (code has 8). Level 2 coal required should be 0, iron required should be 1 (code has coal=1, iron=0). Level 2 quantity should be 2 (code has 7). Levels 3-8 all have significant cost/resource/VP/quantity/link-scoring discrepancies.

**Pottery:** Level 1 cost should be 17 (code has 5). Level 1 coal should be 0 (code has 1). Level 1 iron should be 1 (code has 0). Level 2 coal should be 1 (code has 1, correct). Level 3 cost should be 22 (code has 11). Level 3 VP should be 11 (code has 5). Level 3 coal should be 2 (code has 1). Level 3 beer should be 2 (code has 1). Level 4 cost should be 0 (code has 17). Level 4 VP should be 1 (code has 11). Pottery also needs a level 5 tile that doesn't exist in code.

**Brewery:** All levels need iron required = 1 (code has 0 for levels 1-3). Level 1 link scoring should be 2 (code has 1). Level 2 quantity should be 2 (code has 1). Level 3 quantity should be 2 (code has 1). Level 4 should be rail-only (code has it as both eras).

### Pitfall 2: Link Scoring Logic is Wrong
**What goes wrong:** Current scoring gives 1 VP per link tile instead of counting VP icons on adjacent flipped industries
**Why it happens:** Comment in code says "simplified" -- was intentionally deferred
**How to avoid:** For each link, find all flipped industry tiles in the two adjacent cities, sum their `linkScoringIcons` values
**Warning signs:** Scoring tests pass but with wrong expected values

### Pitfall 3: Era Transition Must Be Atomic
**What goes wrong:** If era transition is split across multiple events, the game can end up in an inconsistent state
**Why it happens:** Currently uses separate TRIGGER_ERA_SCORING and TRIGGER_CANAL_ERA_END events
**How to avoid:** Use XState `always` transitions to chain: era-end detection -> scoring -> transition -> next era. Entry actions on each state perform the logic.
**Warning signs:** Tests work but real gameplay requires manual triggers

### Pitfall 4: First Round of Rail Era Also Gets 1 Action
**What goes wrong:** Code may only check first round of Canal Era
**Why it happens:** `isFirstRound` checks `round === 1` but doesn't distinguish between Canal round 1 and Rail round 1
**How to avoid:** After era transition resets round to 1, the isFirstRound check should naturally work. Verify with tests.
**Warning signs:** Rail era starts with 2 actions instead of 1

### Pitfall 5: Income-to-VP Conversion Missing at Game End
**What goes wrong:** Final scoring doesn't convert remaining income to VP for tiebreaking
**Why it happens:** triggerRailEraEnd is a stub that only logs
**How to avoid:** Per rules: "The player with the most VPs is declared the winner. Ties are broken, first by the highest income, and then by the most money remaining."
**Warning signs:** Game ends but winner determination is wrong in tied scenarios

### Pitfall 6: Brewery Beer Production Varies by Era
**What goes wrong:** Brewery always places 1 beer regardless of era
**Why it happens:** Code stores `beerProduced: 1` as fixed value
**How to avoid:** When building a brewery, check era: Canal = 1 beer, Rail = 2 beer. The tile data stores the base (1), but the build action must double it in Rail era.
**Warning signs:** Rail era breweries only produce 1 beer

### Pitfall 7: 2-Player Merchant Setup
**What goes wrong:** Warrington and Nottingham should have NO merchant tiles in 2-player games
**Why it happens:** May not filter merchants by player count correctly
**How to avoid:** The rules state: "In a 2 player game, no Merchant tiles are placed in Warrington & Nottingham"
**Warning signs:** Players can sell to Warrington/Nottingham in 2-player games

## Code Examples

### Correct Link Scoring Algorithm
```typescript
// For each link, count linkScoringIcons on all flipped industries in both adjacent cities
function scoreLinkVP(link: Link, allPlayers: Player[]): number {
  let vp = 0
  for (const cityId of [link.from, link.to]) {
    // Check all players' industries in this city
    for (const player of allPlayers) {
      for (const industry of player.industries) {
        if (industry.location === cityId && industry.flipped) {
          vp += industry.tile.linkScoringIcons
        }
      }
    }
  }
  return vp
}
```

### Automatic Era Detection Guard
```typescript
// Guard: check if era should end
isEraEnd: ({ context }) => {
  const drawDeckEmpty = context.drawPile.length === 0
  const allHandsEmpty = context.players.every(p => p.hand.length === 0)
  return drawDeckEmpty && allHandsEmpty
}
```

### Brewery Beer Production (Era-Aware)
```typescript
// In executeBuildAction, when placing a brewery:
const beerToPlace = context.era === 'rail'
  ? tile.beerProduced * 2   // Rail era: 2 beer barrels
  : tile.beerProduced        // Canal era: 1 beer barrel
```

## State of the Art

| Old Approach (Current) | Current Approach (Correct) | Impact |
|------------------------|---------------------------|--------|
| Manual TRIGGER_ events for era transitions | XState `always` transitions with guards | Prevents missed transitions in gameplay |
| 1 VP per link for scoring | Sum linkScoringIcons from adjacent flipped industries | Correct VP calculation per rules |
| Fixed beerProduced = 1 | Era-dependent: 1 (canal) / 2 (rail) | Correct brewery mechanics |
| Hardcoded city slots (mostly wrong) | Verified against reference implementation | Correct build validation |

## Open Questions

1. **Farm Brewery Implementation**
   - What we know: Two farm brewery locations exist (Cannock-Walsall area, Kidderminster-Worcester area). Can only build there with Brewery Industry card or Wild Industry card.
   - What's unclear: How to represent farm breweries in the data model -- as special CityIds or as connection modifiers
   - Recommendation: Add as special CityIds (e.g., `farmBreweryNorth`, `farmBrewerySouth`) with single `['brewery']` slot each, and connections to adjacent cities

2. **Exact Merchant Tile Icons per Player Count**
   - What we know: 2-player game has no merchants at Warrington and Nottingham. Shrewsbury, Gloucester, Oxford active.
   - What's unclear: Exact industry icons on each merchant tile (do they vary by player count or just presence/absence?)
   - Recommendation: Each merchant accepts cotton, manufacturer, pottery (per rules). The merchant tiles themselves have specific icons but the rules allow selling any of those 3 types to any merchant. Verify by checking if reference implementation restricts by icon.

3. **Income Track Precise Spacing**
   - What we know: Income goes from -10 to 30. Income advancement is in "spaces" not "levels."
   - What's unclear: Exact number of spaces per income level (the reference says variable: 1 space/level for negatives, increasing to 4 spaces/level at top)
   - Recommendation: Need to implement income track as array mapping level to space count for accurate advancement

4. **Pottery Level 5 Tile**
   - What we know: Reference implementation has 5 pottery levels; current code has 4
   - What's unclear: Whether level 5 pottery (cost 24, VP 20, coal 2, beer 2) is correct
   - Recommendation: Add level 5 pottery, verify against official player mat image if possible

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGINE-01 | All rules enforced for 2 players | integration | `pnpm test --run src/store/gameStore.integration.test.ts` | Yes (skipped) |
| ENGINE-02 | Canal era link + industry scoring | unit | `pnpm test --run src/store/gameStore.era.test.ts` | Yes (partial) |
| ENGINE-03 | Rail era link + industry scoring + income-to-VP | unit | `pnpm test --run src/store/gameStore.era.test.ts` | Yes (partial, needs income-to-VP) |
| ENGINE-04 | Era transition (remove L1, re-deal, turn order) | unit | `pnpm test --run src/store/gameStore.era.test.ts` | Yes (partial) |
| ENGINE-05 | All 7 actions with correct resources | unit | `pnpm test --run src/store/gameStore.build.test.ts src/store/gameStore.network.test.ts src/store/gameStore.develop.test.ts src/store/gameStore.sell.test.ts src/store/gameStore.scout.test.ts src/store/gameStore.income.test.ts src/store/gameStore.pass.test.ts` | Yes (2 failing) |
| ENGINE-06 | 100% unit test coverage | unit | `pnpm test --run --coverage` | Partial |
| ENGINE-07 | Edge cases (bankruptcy, empty markets, etc.) | unit | `pnpm test --run src/store/gameStore.markets.test.ts src/store/gameStore.error.test.ts` | Yes (partial) |
| ENGINE-08 | Turn order by spending | unit | `pnpm test --run src/store/gameStore.turns.test.ts` | Yes |
| ENGINE-09 | Player switching after actions | unit | `pnpm test --run src/store/gameStore.actions.test.ts` | Yes |
| ENGINE-10 | First round 1-action rule | unit | `pnpm test --run src/store/gameStore.turns.test.ts` | Yes (needs Rail era case) |

### Sampling Rate
- **Per task commit:** `pnpm test --run`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] Scoring-specific test file (`gameStore.scoring.test.ts`) -- covers ENGINE-02, ENGINE-03 with correct link scoring
- [ ] Data validation tests (`data/board.test.ts`, `data/industryTiles.test.ts`) -- verify data accuracy
- [ ] Full integration test completion -- currently skipped in `gameStore.integration.test.ts`
- [ ] Coverage configuration -- add `--coverage` to vitest config if not present

## Sources

### Primary (HIGH confidence)
- `ai-docs/brass-birmingham-rules.mdc` -- Complete Brass Birmingham rules, used as primary authority
- [npow/brass-birmingham on GitHub](https://github.com/npow/brass-birmingham) -- Reference implementation verified against Tabletop Simulator; used for data validation
- Existing codebase (`src/store/gameStore.ts`, `src/data/*.ts`) -- Current implementation analyzed directly

### Secondary (MEDIUM confidence)
- [Stately XState v5 docs](https://stately.ai/docs/transitions) -- Automatic transitions with `always` and guards
- [Order of Gamers rules summary](https://www.orderofgamers.com/downloads/BrassBirmingham_v1.2.pdf) -- Brass Birmingham rules reference v1.2

### Tertiary (LOW confidence)
- Reference implementation tile data -- while verified against TTS, some values (especially pottery level 5) should be double-checked against physical game if possible

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing and verified
- Architecture: HIGH - XState v5 patterns well documented, existing code provides clear modification points
- Data accuracy: MEDIUM - Reference implementation is verified against TTS but not physical game; most values align with rules doc
- Pitfalls: HIGH - Directly verified by reading code and comparing to rules
- Scoring/transitions: HIGH - Rules are explicit, code gaps clearly identified

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, rules don't change)
