# Brass Birmingham

Digital implementation of the Brass Birmingham board game, built on Next.js 16
and React 19, deployed on Vercel.

The game engine is an [XState 5](https://stately.ai/docs/xstate-v5) state
machine — every rule (build legality, resource sourcing, turn order, scoring)
lives there, not scattered across the UI. Online games are persisted with
[Drizzle ORM](https://orm.drizzle.team) on Neon Postgres; env config and AI
responses are validated with [Zod](https://zod.dev); errors are tracked with
[Sentry](https://sentry.io).

There are no user accounts and no auth. A hotseat game runs entirely in the
browser and saves to `localStorage`. Online games are identified by a token in
the URL, with a per-seat secret in each player's `localStorage`; the server
owns the state and streams updates to every player over Server-Sent Events
(SSE).

## Local test database (Docker)

Most tests are pure and need no database, but the multiplayer/AI suites and two
e2e specs drive the real store. Start a local database for them with:

```bash
pnpm db:local     # docker compose up -d --wait
```

Then `pnpm test` and `pnpm exec playwright test` just use it — no flags, no API
key, no network. `pnpm db:local:down` stops it. The data is RAM-backed and
thrown away with the container; nothing is worth keeping.

**Why two containers.** The app talks to Postgres through
`@neondatabase/serverless`, which speaks Neon's HTTP protocol rather than the
Postgres wire protocol — so a bare Postgres container is unreachable from the
app. `compose.yaml` therefore runs Postgres plus the
[Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy) that
Neon's own [local development guide](https://neon.com/guides/local-development-with-neon)
recommends. (Neon's `neon_local` image is a different thing: it proxies to a
Neon *cloud* branch, needs an API key, and every query still crosses the
Atlantic — which is what we are avoiding.)

**Why bother.** The Neon project lives in us-east-1, so from Europe every query
costs ~100ms+. Locally it is ~15ms, which takes the multiplayer suite from ~43s
to ~6s and stops the latency-sensitive chat-SSE e2e check from flaking.

### Which database a test run picks

Setup takes the first that applies (`src/test/global-db-branch.ts` for vitest,
`playwright.config.ts` + `e2e/global-db.ts` for e2e):

1. **`DATABASE_URL` already set in the environment** — an external owner chose
   it, so it is used untouched. This is how CI passes each run its own Neon
   branch, and it is the escape hatch for pointing a run anywhere:
   `DATABASE_URL=... pnpm test`.
2. **The local Docker stack is reachable** — the run gets its own database
   (`bb_test_<rand>` / `bb_e2e_<rand>`), created in setup and dropped in
   teardown. Concurrent runs in different worktrees each get their own, so they
   cannot interfere.
3. **`NEON_API_KEY` is set** — an ephemeral Neon branch off `ci`, as before.
4. **Otherwise** — `TEST_DATABASE_URL`, else a loud warning that the run is
   about to touch a non-test database.

Each path prints a `[test-db]` line saying which it took. Schema comes from the
same idempotent `ensureTestSchema()` either way, so a fresh local database is
migrated automatically. `TEST_DB_LOCAL=0` skips the Docker step (e.g. to
reproduce a CI-only failure against a real Neon branch).

> Note: a `pnpm dev` server already running on :3199 is reused by the e2e run and
> keeps its own `.env` `DATABASE_URL` — stop it if you want the DB-backed specs
> to hit this run's database.

## Debugging the game state machine (Stately Inspector)

The client-side XState machine can be visualised live with the
[Stately Inspector](https://stately.ai/docs/inspector). It is **opt-in and
dev-only** — hard-gated off production, and the inspector package is loaded via
a dynamic import so it never lands in the production bundle.

To turn it on, set the flag when running locally (or on a preview):

```bash
NEXT_PUBLIC_XSTATE_INSPECT=1 pnpm dev
```

Then open the app. A Stately Inspector window pops up and shows the live
machine, its states and every event as you play. Leave the flag unset (the
default) for normal play — the inspector adds nothing when disabled.

Wiring lives in `src/lib/xstate-inspector.ts` (the flag check + dynamic import)
and is fed into `useMachine` in `src/components/game.tsx`.

## Icon credits

Industry and marker icons are from [game-icons.net](https://game-icons.net),
licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):

- **Delapouite** — Cotton Flower, Coal Wagon, Wooden Crate, Amphora, Barrel,
  Steam Locomotive
- **Lorc** — Metal Bar, Beer Stein

The narrowboat canal-link marker and all remaining UI glyphs are original
hand-drawn artwork for this project.
