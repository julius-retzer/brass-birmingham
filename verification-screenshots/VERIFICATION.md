# Hotseat UI — verification

Driven in a real Chromium session (chrome-devtools-axi) against `pnpm dev`
(`SKIP_ENV_VALIDATION=1 PORT=3939`). The engine (`gameStore`) runs entirely
client-side via `useMachine`; no server, DB, or polling is involved.

## What was exercised end-to-end

1. **Setup** — chose 2 players, named them Alice / Bob, started the game.
   (`01-setup.png`)
2. **Game start** — board renders all cities, industry slots, and era-coloured
   connections; both player panels show £17 / income 10 / 0 VP; all 7 legal
   actions offered. (`02-game-start.png`)
3. **Build (mid-turn action selection)** — Build → pick card → pick city.
   - Picking `iron industry` then Dudley left **Confirm disabled**: iron needs
     coal and Alice has no network to source it on turn 1. The engine's
     `canCompleteBuild` guard correctly blocked it (verified via the disabled
     button). (`03-build-select-city.png`)
   - Switched to `brewery industry` (no coal) at Nuneaton → **Confirm enabled**
     → executed. Log: "Alice built brewery Level 1 at nuneaton for £5"; Alice's
     money dropped £17→£12; brewery tile appears on the board; Ind 1/1.
4. **Turn hand-off (hotseat)** — turn advanced to Bob with a "Pass the device to
   Bob" gate that hides the incoming player's hand until they tap ready.
   (`04-handoff-gate.png`)
5. **Era transition** — auto-drove a full game (both players passing). Canal Era
   ran to round 11, then the log shows: "Era end detected… / End of canal era
   scoring / Canal Era ended / Merchant beer reset for Rail Era / Rail Era
   started / All players drew new 8-card hands". Header flips to Rail Era.
   (`05-rail-era.png`)
6. **Game end / winner** — game reached the final `gameOver` state; the winner
   screen declares "🏆 Bob wins!" with a full standings table (VP, income,
   money) and a New game button. Bob won the money tiebreak (both 0 VP).
   (`06-game-over.png`)

Two complete games were played through the browser (one interactive, one
auto-passed to completion), plus a third partial game driven to the Rail Era.

## How to run

```
SKIP_ENV_VALIDATION=1 pnpm dev        # or add DATABASE_URL to .env
# open http://localhost:3000/  → hotseat setup screen
```

`DATABASE_URL` is only required because `src/env.js` validates it at boot; the
hotseat surface itself never touches the database.

## Deferred polish (follow-ups, not blockers)

- No per-player industry-tile mat / resource-cube detail view (cubes are on the
  board tiles; panel shows aggregate counts only).
- Board does not yet visually preview link/city legality for every edge case;
  illegal board clicks are caught by `state.can(...)` and surfaced as a toast.
- Double-link (rail) flow is wired and reachable but was not hand-exercised in
  the browser (covered by engine tests).
- Pre-existing type errors remain in the legacy networked components
  (`GameInterface`, `Improved*`, `/game/[gameId]`), untouched by this work;
  they would need fixing before `pnpm build` passes.
