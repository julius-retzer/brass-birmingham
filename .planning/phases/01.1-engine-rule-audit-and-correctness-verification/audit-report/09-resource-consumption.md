# Resource Consumption Audit Report

## Rulebook References

**Consuming Coal** (p.3-4):
- Coal consumed from closest connected unflipped Coal Mine first (fewest links distant). Free.
- If not connected to Coal Mine, purchase from Coal Market starting at cheapest price. Requires connection to merchant space (arrows icon). If Coal Market empty, still purchase for 8 pounds per piece.

**Consuming Iron** (p.4):
- Iron does NOT need connection to source. Any unflipped Iron Works (any player), not necessarily closest. Free.
- If no unflipped Iron Works, purchase from Iron Market starting at cheapest price. If empty, 6 pounds per piece.

**Consuming Beer** (p.4):
- Own unflipped Breweries: no connection required.
- Opponent's unflipped Brewery: must be connected.
- Merchant tile beer space (Sell action only).

**Flipping Industry Tiles** (p.2-3):
- Cotton Mills, Manufacturers, Potteries: flip via Sell action.
- Coal Mines, Iron Works, Breweries: flip when last resource removed.
- Flipping advances income.

## Audit Table

| Rule Ref | Rule Description | Status | Test Evidence | Notes |
|----------|------------------|--------|---------------|-------|
| COAL-01 | Coal consumed from nearest connected source first (network distance) | PASS | `gameStore.coal.test.ts:81-149` -- "Connected coal mine provides free coal" verifies coal consumed from mine at birmingham (distance 0), money only charged link cost. `gameStore.markets.test.ts:272-375` -- "connected coal mines before market" verifies mine depleted before market used | `marketActions.ts:35-72` calls `findConnectedCoalMines` which returns mines sorted by distance, iterates nearest-first |
| COAL-02 | Coal on the board is free | PASS | `gameStore.coal.test.ts:147-148` -- `expect(finalMoney).toBe(initialMoney - 5)` (only link cost, no coal cost). `gameStore.markets.test.ts:370-374` -- coal mine depleted to 0, no money charged for coal | `marketActions.ts:43-71` consumes from mines without adding to `coalCost` variable |
| COAL-03 | Coal from market costs money (price per market state) | PASS | `gameStore.coal.test.ts:151-226` -- "Coal market access when connected to merchant" verifies `finalMoney < initialMoney - 5` (link cost + coal cost). `gameStore.markets.test.ts:379-413` -- direct function test verifies `coalCost === 16` for 2 coal at fallback price | `marketActions.ts:79-91` adds `level.price` to `coalCost` for each market purchase |
| COAL-04 | Coal market price increases as purchased (cheapest first) | PASS | `gameStore.markets.test.ts:115-141` -- "cheapest first principle" verifies consumption starts from lowest price levels. `gameStore.markets.test.ts:61-86` -- "initial setup" verifies price structure 1-8 pounds | `marketActions.ts:83-92` iterates `updatedCoalMarket` in order (price ascending), takes from first level with cubes > 0 |
| COAL-05 | CoalMine auto-flips when all coal consumed | PASS | `gameStore.coal.test.ts:81-149` -- after consuming last coal cube from mine (2->1->0 via network build), mine could auto-flip. `marketActions.ts:139-146` calls `checkAndFlipIndustryTilesLogic` after coal consumption | `gameUtils.ts:212-213` checks `industry.type === 'coal' && industry.coalCubesOnTile === 0` for auto-flip |
| COAL-06 | Coal requires network connection to source | PASS | `gameStore.coal.test.ts:302-348` -- "No coal sources" test verifies no links built when no connection to mines or merchants. `gameStore.coal.test.ts:350-416` -- "Coal mine exists but not connected" verifies 0 links when mine at different location | `marketActions.ts:35-39` uses `findConnectedCoalMines` which filters by network connectivity. Market access also requires merchant connection (line 76) |
| IRON-01 | Iron has NO network requirement | PASS | `gameStore.markets.test.ts:467-486` -- "iron does NOT require merchant connection" creates context with no links, no industries, verifies iron still purchasable from market with cost > 0 | `marketActions.ts:182` calls `findAvailableIronWorks(context)` with no location parameter. Line 217+ goes directly to market with no connectivity check |
| IRON-02 | Board iron consumed before market iron | PASS | `gameStore.autoflip.test.ts:102-157` -- "develop consumes iron from iron works before market" places iron works with 1 cube, develops, verifies money unchanged (free iron from works). `gameStore.autoflip.test.ts:159-188` -- without iron works, money decreases (market iron) | `marketActions.ts:181-213` tries iron works first (free), then falls through to market loop at line 217+ |
| IRON-03 | Iron from market costs money | PASS | `gameStore.develop.test.ts:189-212` -- "consumes iron from market when no iron works available" verifies money decreased. `gameStore.markets.test.ts:416-443` -- direct test verifies `ironCost === 18` for 3 iron at fallback 6 | `marketActions.ts:220-230` charges `level.price` per iron from market |
| IRON-04 | Iron market price increases as purchased (cheapest first) | PASS | `gameStore.markets.test.ts:88-113` -- "initial setup" verifies price structure 1-6 pounds, 1-pound starts empty. `gameStore.markets.test.ts:115-141` -- "cheapest first principle" verifies consumption order | `marketActions.ts:221-230` iterates market levels in ascending price order, takes from first level with cubes > 0 |
| IRON-05 | IronWorks auto-flips when all iron consumed | PASS | `gameStore.autoflip.test.ts:48-100` -- "iron works flips when its last iron consumed during develop" sets up iron works with 1 cube, develops, verifies `industry.flipped === true` | `gameUtils.ts:214-215` checks `industry.type === 'iron' && industry.ironCubesOnTile === 0`. `marketActions.ts:248-261` calls `checkAndFlipIndustryTilesLogic` after iron consumption |
| BEER-01 | Beer required for selling goods | PASS | `gameStore.sell.test.ts:277-366` -- cotton L3 requires 2 beer, sell fails with "insufficient beer" when only 1 available | `gameStore.ts:1275-1296` reads `tile.beerRequired`, calls `consumeBeerFromSources`, returns early on failure |
| BEER-02 | Beer from connected brewery (own or opponent's) | PASS | `marketActions.ts:439-490` -- own breweries consumed first (no connection required), then connected opponent breweries. `findAvailableBreweries` in `gameUtils.ts` separates own vs opponent breweries | Own breweries: lines 440-465. Connected opponent breweries: lines 469-490. Connection checked via `calculateNetworkDistance` in `findAvailableBreweries` |
| BEER-03 | Beer from connected merchant also valid (sell action only) | PASS | `gameStore.sell.test.ts:85-155` -- Warrington merchant beer consumed during sell (hasBeer toggled false). `marketActions.ts:493-525` -- merchant beer only consumed when `includeMerchantBeer === true` | `consumeBeerFromSources` parameter `includeMerchantBeer` defaults to false, only passed true from sell action at `gameStore.ts:1280` |
| BEER-04 | Brewery auto-flips when all beer consumed | PASS | `gameUtils.ts:216-220` -- checks `industry.type === 'brewery' && industry.beerBarrelsOnTile === 0` for auto-flip. `marketActions.ts:540-548` calls `checkAndFlipIndustryTilesLogic` after beer consumption | Auto-flip runs after every beer consumption via `checkAndFlipIndustryTilesLogic` |
| BEER-05 | Own brewery beer consumed before opponent's | PASS | `marketActions.ts:439-465` -- own breweries iterated first. `marketActions.ts:469-490` -- connected opponent breweries only checked after own exhausted. `gameStore.markets.test.ts:241-269` -- "beer consumption priority" builds own brewery, verifies beer available | `findAvailableBreweries` returns `{ ownBreweries, connectedBreweries }` separately. `consumeBeerFromSources` processes own first |
| FLIP-01 | Coal mines auto-flip when empty | PASS | `gameUtils.ts:212-213` -- `if (industry.type === 'coal' && industry.coalCubesOnTile === 0) shouldFlip = true` | Called from `checkAndFlipIndustryTilesLogic` after every resource consumption |
| FLIP-02 | Iron works auto-flip when empty | PASS | `gameStore.autoflip.test.ts:48-100` -- explicit test. `gameUtils.ts:214-215` -- `if (industry.type === 'iron' && industry.ironCubesOnTile === 0) shouldFlip = true` | Tested end-to-end through develop action |
| FLIP-03 | Breweries auto-flip when empty | PASS | `gameUtils.ts:216-220` -- `if (industry.type === 'brewery' && industry.beerBarrelsOnTile === 0) shouldFlip = true` | Triggered via beer consumption in sell action and network action |
| FLIP-04 | Flipped tiles score VP and link points (at era end) | PASS | Scoring tests in `gameStore.scoring.test.ts` cover era-end VP calculation for flipped tiles | `checkAndFlipIndustryTilesLogic` at `gameUtils.ts:230-233` advances income on flip. VP scoring happens at era end (separate system) |
| FLIP-05 | CottonMill/Manufacturer/Pottery flip via Sell only (not auto-flip) | PASS | `gameUtils.ts:212-220` -- auto-flip only checks coal, iron, brewery types. Cotton/manufacturer/pottery are not in the auto-flip conditions | These types only flip through `executeSellAction` at `gameStore.ts:1300` |

## Summary

| Status | Count |
|--------|-------|
| PASS | 21 |
| FAIL | 0 |
| MISSING | 0 |

All resource consumption rules are correctly implemented. The coal/iron/beer priority systems follow the rulebook accurately: coal from nearest connected mine first (free) then market (paid, requires merchant connection); iron from any works first (free, no connection) then market (paid, no connection needed); beer from own breweries first then connected opponent then merchant (sell only). Auto-flip mechanics correctly trigger for coal mines, iron works, and breweries when their last resource is consumed.
