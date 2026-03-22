# Network Action Audit Report

**Auditor:** Claude (automated)
**Date:** 2026-03-22
**Source files:**
- `src/store/gameStore.ts` (executeNetworkAction, executeDoubleNetworkAction, canBuildLink, canBuildSecondLink, hasSelectedLink guards)
- `src/store/network/networkActions.ts` (stubs only -- executeNetworkAction, validateNetworkConnection, calculateNetworkCost)
- `src/store/shared/gameUtils.ts` (calculateNetworkDistance, findConnectedCoalMines, findAvailableBreweries)
- `src/store/constants.ts` (CANAL_LINK_COST=3, RAIL_LINK_COST=5, RAIL_DOUBLE_LINK_COST=15)
- `src/data/board.ts` (connections with era types)

**Test files:**
- `src/store/gameStore.network.test.ts`

**Rulebook reference:** `ai-docs/brass-birmingham-rules.mdc` (NETWORK ACTION section, pp. 7-8)

**Architecture note:** `src/store/network/networkActions.ts` contains only stubs (TODOs). All actual network logic is implemented directly in `gameStore.ts` as XState assign actions and guards. The stubs in networkActions.ts are unused dead code.

---

## Basic Network Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| NET-01 | Network action places a link tile on a connection between two locations | PASS | `src/store/gameStore.network.test.ts:78-103` (basic link building, link from/to verified) | `executeNetworkAction` at `gameStore.ts:757-761` creates `newLink` with from/to/type. Added to player's links array at line 804. |
| NET-02 | Connection must exist on the board (defined in board.ts connections) | PASS | `src/store/gameStore.ts:2287-2295` (canBuildLink guard validates connection exists in board data and supports current era) | Guard checks `connections.find()` matching from/to and era type. No explicit negative test, but guard prevents invalid connections from reaching executeNetworkAction. |
| NET-03 | Connection must not already have a link tile (from any player) | PASS | `src/store/gameStore.ts:2297-2308` (canBuildLink checks `context.players.some(player => player.links.some(...))`) | Guard iterates all players' links to check for existing link on the connection. Bidirectional check (from-to or to-from). |
| NET-04 | One card must be discarded per network action | PASS | `src/store/gameStore.network.test.ts:102` (discardPile contains card used); `gameStore.ts:817` | `executeNetworkAction` adds card to discardPile. Card removed from hand at line 746-749. |

## Canal Era Network Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| NET-05 | Canal era: can only place canal links (on canal-type connections) | PASS | `src/store/gameStore.ts:2287-2295` (canBuildLink checks `conn.types.includes(context.era)`); `gameStore.ts:760` (link type set to `context.era`) | Board connections define which era types they support. Guard validates era compatibility. Link type auto-set to current era. |
| NET-06 | Canal era: max 1 link per network action | PASS | `src/store/gameStore.ts:2444-2447` (canBuildSecondLink returns false if `context.era !== 'rail'`) | `canBuildSecondLink` guard explicitly blocks double link in canal era. Only `executeNetworkAction` (single link) is available. |
| NET-07 | Canal era: link costs 3 pounds | PASS | `src/store/gameStore.network.test.ts:495-506` (canal cost verified as 3); `constants.ts:9` (CANAL_LINK_COST=3) | `executeNetworkAction` at `gameStore.ts:752-755` uses `GAME_CONSTANTS.CANAL_LINK_COST`. Test explicitly verifies `canalCost === 3`. |
| NET-08 | Canal era: must build adjacent to player's network (or any if first link) | PASS | `src/store/gameStore.network.test.ts:177-199` (adjacency test builds 2 links); `gameStore.ts:2312-2318` (first tile exception) | `canBuildLink` guard at `gameStore.ts:2331-2350` builds `playerLocations` set from industries and links, checks if either end of new link is in set. Exception for no tiles on board. |

## Rail Era Network Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| NET-09 | Rail era: can only place rail links (on railroad connections) | PASS | `src/store/gameStore.ts:2287-2295` (same canBuildLink era check applies to rail); `gameStore.network.test.ts:169` (builtLink.type === 'rail') | Same mechanism as NET-05. Rail era links are type 'rail'. Connection must have 'rail' in types array. |
| NET-10 | Rail era: can place 1 or 2 links per network action | PASS | `src/store/gameStore.network.test.ts:202-367` (double rail link test -- full sequence); `gameStore.network.test.ts:369-475` (single rail link test) | Single link via `executeNetworkAction`. Double link via `CHOOSE_DOUBLE_LINK_BUILD` -> `SELECT_SECOND_LINK` -> `EXECUTE_DOUBLE_NETWORK_ACTION`. Both paths tested. |
| NET-11 | Rail era: each link requires 1 coal | PASS | `src/store/gameStore.network.test.ts:105-174` (coal consumed from connected mine for single rail); `gameStore.network.test.ts:822-925` (2 coal consumed for double rail) | `executeNetworkAction` at `gameStore.ts:771-791` consumes 1 coal for single rail. `executeDoubleNetworkAction` at `gameStore.ts:910-925` and `gameStore.ts:947-962` consumes 1 coal per link. |
| NET-12 | Rail era: must build adjacent to player's network (or any if first) | PASS | Same as NET-08 -- `canBuildLink` guard is era-agnostic for adjacency check | Network adjacency enforced identically in both eras. |
| NET-13 | Rail era: coal for second link sourced after first link is placed (network may have expanded) | PASS | `src/store/gameStore.ts:862-962` (executeDoubleNetworkAction: first link added to player at line 899-907, first coal consumed, second link added at line 936-944, second coal consumed with updated player state) | Implementation explicitly builds first link, adds to player, consumes first coal, then builds second link with expanded network state. Test at `gameStore.network.test.ts:563-701` verifies correct resource consumption sequence. |

## Network Connectivity Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| NET-14 | "Your network" = all locations connected by your link tiles + locations with your industries | PASS | `src/store/shared/gameUtils.ts:340-352` (isLocationInPlayerNetwork); `gameStore.ts:2336-2350` (canBuildLink network check) | Network defined as: locations with own industries + locations adjacent to own links. Consistent in both `isLocationInPlayerNetwork` and `canBuildLink`. |
| NET-15 | Canal links are invisible/removed during rail era | PASS | `src/store/shared/gameUtils.ts:55-58` (calculateNetworkDistance filters `link.type !== era`) | `calculateNetworkDistance()` only considers links matching current era. Canal links excluded from rail era distance calculations. Decision documented: [01-05] in STATE.md. |
| NET-16 | Network distance calculation follows shortest path through any player's links | PASS | `src/store/shared/gameUtils.ts:37-80` (BFS implementation using all players' links of current era) | `calculateNetworkDistance()` builds adjacency from ALL players' links (not just current player). Uses BFS for shortest path. Correct per "connected = trace a route of Link tiles owned by any player." |

## Special Connection Rules

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|-----------------|--------|---------------|-------|
| NET-17 | Farm brewery connections are implicit via city-to-city links | FAIL | No test found | **Implementation concern:** Board data models farm breweries as separate nodes (farmBreweryNorth, farmBrewerySouth) with explicit connections to adjacent cities (board.ts:87-90). Per rules, a link between Kidderminster-Worcester also connects to the farm brewery -- no separate link is needed. Current model allows placing links directly to/from farm brewery nodes, which is incorrect. A link from kidderminster to worcester should implicitly connect the farm brewery without consuming a link tile on the farm brewery connection. |
| NET-18 | Double connections (multiple links on same route) | PASS | `src/store/gameStore.ts:2297-2308` (canBuildLink checks existing links on connection) | Guard prevents any player from building on a connection that already has a link. Board data doesn't define explicit "double connections" -- each pair of cities has at most one connection entry per era. This matches the physical board. |

---

## Summary

| Category | Total | PASS | FAIL | MISSING |
|----------|-------|------|------|---------|
| Basic Network Rules | 4 | 4 | 0 | 0 |
| Canal Era Network Rules | 4 | 4 | 0 | 0 |
| Rail Era Network Rules | 5 | 5 | 0 | 0 |
| Network Connectivity Rules | 3 | 3 | 0 | 0 |
| Special Connection Rules | 2 | 1 | 1 | 0 |
| **TOTAL** | **18** | **17** | **1** | **0** |

## Critical Findings

### FAIL: NET-17 -- Farm brewery connections should be implicit via city-to-city links
- **Severity:** Medium
- **Location:** `src/data/board.ts:87-90` (connection definitions)
- **Issue:** Farm breweries are modeled as separate graph nodes with explicit connections (farmBreweryNorth-cannock, farmBreweryNorth-walsall, farmBrewerySouth-kidderminster, farmBrewerySouth-worcester). This allows players to build link tiles directly to farm breweries, which is incorrect per rules.
- **Rules:** "A Link tile placed between Kidderminster and Worcester also connects both locations to the Farm Brewery to their left. A second Link tile is not required; nor may it be placed there." Similarly, a link between Cannock and Walsall connects to farmBreweryNorth.
- **Fix needed:** Farm brewery connections should be virtual/implicit. When a link is placed between the two adjacent cities (e.g., Kidderminster-Worcester), the farm brewery should automatically become reachable. No link tile should be placeable on farm brewery connections directly.

### Architecture Note: networkActions.ts is dead code
- **Severity:** Low (technical debt)
- **Location:** `src/store/network/networkActions.ts`
- **Issue:** Contains stub functions (`executeNetworkAction`, `validateNetworkConnection`, `calculateNetworkCost`) that are never called. All actual network logic is in `gameStore.ts` actions and guards. The file should be removed or the logic should be refactored into it for consistency with the build module pattern (buildActions.ts is actively used).

### Positive: Double rail link sequence is correct
- The implementation correctly follows the rules sequence: place first rail, consume first coal, place second rail (with expanded network), consume second coal, then consume beer. Beer must be reachable from the second rail endpoint. This is thoroughly tested across multiple test cases.

### Positive: Coal market connection requirement
- Test at `gameStore.network.test.ts:1072-1131` validates that rail links cannot be built when no coal source is available and player is not connected to merchants. Coal consumption logic correctly requires either a connected coal mine or market access.
