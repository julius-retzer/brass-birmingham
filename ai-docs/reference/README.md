# Component reference images

Authoritative sources for the industry tile stats in
`src/data/industryTiles.ts`, audited 2026-07-14 (captain bug report:
breweries were missing their second link-scoring icon). Every value is
pinned by `src/data/industryTiles.test.ts`.

| File | What it is | Provenance |
| --- | --- | --- |
| `player-mat-retail-day-bgg4231621.jpg` | RETAIL player board, flat photo, all 29 tile slots readable | BoardGameGeek image 4231621, uploaded 2018-07-24 (post-release retail copy) |
| `player-mat-retail-night-bgg4231622.jpg` | Same board, night side | BoardGameGeek image 4231622 |
| `retail-mfg-iv.jpg` | Close-up: retail Manufacturer IV = £8, 1 iron, 3 VP, income 6, 1 link icon | Crop of 4231621 |
| `rulebook-prototype-mfg-iv-discrepancy.jpg` | The 2018 rulebook PDF's mat photo shows a PROTOTYPE: its Manufacturer IV reads £14 / income 7, which does NOT match the retail component | Crop of Roxley rulebook PDF p.5 (files.roxley.com/Brass-Birmingham-Rulebook-2018.11.20-highlights.pdf, rendered at 1200 dpi) |
| `board-retail-day-bgg4231616.jpg` | RETAIL game board, flat photo — source for the board-graph audit (city slots, connection era types, merchant bonuses); board.ts matched it with NO deviations, pinned by `src/data/board.test.ts` | BoardGameGeek image 4231616, uploaded 2018-07-24 |

## How to read a mat slot

Each tile slot on the board: the ribbon LEFT of the tile is the build cost
(coin) and required resources (black cube = coal, orange cube = iron); the
banner RIGHT of the tile is: VP (black hexagon), income advancement (arrow
over coins), and 0–2 link-scoring icons (•—• hexes). Icons on the tile face:
beer mugs crossed by a red band (top-right) = beers required to sell;
orange/black cubes in the art = iron/coal placed when built; red lightbulb =
may not be developed; blue droplet badge (bottom of cost ribbon) = canal era
only; black/white circle = rail era only.

## Cross-check

The independent TTS-derived transcription in
[npow/brass-birmingham](https://github.com/npow/brass-birmingham)
(`js/gameData.js`) agrees with the retail board on all 29 tile
definitions. The rulebook PDF's own photos are of a pre-production
prototype and deviate on Manufacturer IV — when in doubt, trust the
retail component photos in this directory.
