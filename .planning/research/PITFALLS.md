# Domain Pitfalls

**Domain:** Online multiplayer board game (Brass Birmingham)
**Researched:** 2026-03-21 (updated for multiplayer milestone with PartyKit + better-auth)

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: PartyKit Room Hibernation Losing In-Memory State

**What goes wrong:** PartyKit rooms on Cloudflare Workers hibernate when no connections are active. The in-memory XState actor is destroyed. Players reconnect to an empty room with no game state.
**Why it happens:** Edge computing is ephemeral by design. Workers don't guarantee persistent memory. PartyKit rooms can sleep after all players disconnect.
**Consequences:** Game state vanishes. Players lose progress. Trust destroyed.
**Prevention:** Persist full XState context to PostgreSQL on every state transition. On room wake-up (`onStart()` lifecycle hook), hydrate the XState actor from the database. Test by disconnecting all players, waiting, then reconnecting.
**Detection:** Integration test: create game, disconnect all players, reconnect, verify state matches.

**Confidence:** HIGH -- well-documented behavior of Cloudflare Workers/Durable Objects.

---

### Pitfall 2: Running XState on Both Client and Server

**What goes wrong:** Developers run the XState machine on the client for fast iteration, then "also" run it on the server. Two copies of game state that diverge.
**Why it happens:** Client-side XState gives instant feedback. Feels productive early on.
**Consequences:** State desynchronization. Race conditions. Cheating vectors.
**Prevention:** Server-authoritative from day one. XState machine ONLY runs inside PartyKit room. Client is a renderer that sends action intents and receives filtered state. If you ever import the game machine in a client component, you've gone wrong.
**Detection:** Grep for game machine imports in client components.

**Confidence:** HIGH -- fundamental multiplayer architecture principle.

---

### Pitfall 3: State Filtering Bugs Leaking Hidden Information

**What goes wrong:** A bug in stateFilter.ts reveals opponent hands, deck order, or hidden information.
**Why it happens:** Current approach spreads full state then deletes sensitive fields (denylist). Any new field added to game state is sent to all clients by default.
**Consequences:** Players see opponent hands. Game integrity destroyed.
**Prevention:** Switch to allowlist approach (build filtered object from scratch). Create `PlayerVisibleState` interface. Exhaustive tests that assert filtered state does NOT contain opponent data. CI test that fails if new fields added without filter update.
**Detection:** Unit tests + manual network tab inspection.

**Confidence:** HIGH -- observed in current stateFilter.ts code patterns.

---

### Pitfall 4: Deploying PartyKit and Next.js as One Unit

**What goes wrong:** Trying to bundle PartyKit server code into Next.js build or run them in the same process.
**Why it happens:** Desire for simplicity. "One deploy" feels cleaner.
**Consequences:** Custom Next.js server breaks Vercel deployment. Lose serverless functions, ISR, edge optimizations. PartyKit can't run inside Next.js API routes (they're stateless).
**Prevention:** Two separate deployments from day one. Next.js on Vercel, PartyKit on Cloudflare. Share code (types, validation schemas) but deploy independently. If your `next.config.js` has a custom server, something is wrong.
**Detection:** Check that `dev` script is still `next dev`, not `node server.js`.

**Confidence:** HIGH -- verified via Next.js and PartyKit documentation.

---

### Pitfall 5: XState Snapshot Format Brittleness

**What goes wrong:** XState's `getPersistedSnapshot()` produces an internal format not guaranteed stable across versions. A minor XState update changes snapshot shape, and all games in the database become unrestorable.
**Why it happens:** Stored raw XState snapshots as JSON without schema versioning.
**Consequences:** All active games corrupted on XState upgrade. Silent failures.
**Prevention:** Pin XState version. Add `schemaVersion` field to stored snapshots. Write round-trip tests (create, persist, restore, verify). Before any XState upgrade, test restoration with existing stored data.
**Detection:** Snapshot restoration failures. Add error logging around `createActor(gameStore, { snapshot })`.

**Confidence:** HIGH -- examined gameManager.ts and XState documentation.

---

### Pitfall 6: Race Conditions on Game State (Now Mitigated by PartyKit)

**What goes wrong:** Two players send actions simultaneously. Both read same DB snapshot, both process, second write overwrites first.
**Why it happens:** SELECT then UPDATE without locking (current polling approach).
**Prevention:** PartyKit solves this. Single XState actor per room processes actions sequentially. No concurrent DB reads for game state. Only one actor modifies state at a time. However, still add optimistic locking (version column) on the DB persist as defense-in-depth.
**Detection:** Test concurrent action submission in PartyKit server.

**Confidence:** HIGH -- PartyKit's room model inherently serializes actions.

---

## Moderate Pitfalls

### Pitfall 7: better-auth Schema Conflicts with Existing Tables

**What goes wrong:** Running `better-auth generate` creates tables (user, session, account) that conflict with existing Drizzle schema or naming conventions.
**Prevention:** Run the CLI generator early. Review generated migrations before applying. Ensure table names don't clash with `games` table. Use consistent naming (snake_case). Run `better-auth migrate` in a test database first.

---

### Pitfall 8: Guest Sessions Accumulating in Database

**What goes wrong:** Every visitor creates an anonymous user record. Database fills with thousands of abandoned guest accounts.
**Prevention:** better-auth's anonymous plugin auto-deletes anonymous users when they link to real accounts. For orphaned guests, add a scheduled cleanup job (cron) that deletes anonymous users with no game activity older than 30 days.

---

### Pitfall 9: PartyKit Local Development Friction

**What goes wrong:** Running both Next.js dev server (port 3000) and PartyKit dev server (port 1999) simultaneously is confusing. Different ports, different logs, easy to forget to start one.
**Prevention:** Use `concurrently` in `pnpm dev` to start both. Document the two-server setup. Add health check that verifies PartyKit is reachable before game page loads.

---

### Pitfall 10: Hardcoded 2-Player Assumptions

**What goes wrong:** Expanding from 2 to 3-4 players breaks things. Player names in schema (`player1Name`, `player2Name`), game creation logic, turn order, card dealing all assume 2 players.
**Prevention:** Replace player columns with `game_players` join table (already planned). Audit all code paths that reference player count. Do the schema migration early.

**Confidence:** HIGH -- observed in schema.ts and gameManager.ts.

---

### Pitfall 11: SVG Board Performance with Many Elements

**What goes wrong:** Rendering 30+ locations, 40+ links, placed industries, and highlight overlays causes jank on lower-end machines.
**Prevention:** Use `React.memo` aggressively on SVG sub-components. Only re-render elements that changed. CSS transforms for zoom/pan (not re-rendering). Profile with a full 4-player end-game state.

---

### Pitfall 12: No Action Validation Feedback

**What goes wrong:** Player attempts an action, XState rejects it, player gets generic error with no explanation.
**Prevention:** XState guards should return structured rejection reasons. Server sends specific error messages. UI shows contextual help ("Cannot build here: no adjacent network"). Pre-validate on client where possible (gray out invalid options).

**Confidence:** HIGH -- official Steam Brass Birmingham was widely criticized for this exact problem.

---

## Minor Pitfalls

### Pitfall 13: WebSocket Reconnection Spam

**What goes wrong:** partysocket reconnects aggressively on flaky connections, causing repeated full state sends.
**Prevention:** partysocket has built-in exponential backoff. Trust defaults. Debounce state sends on reconnection if needed.

### Pitfall 14: Large State Payloads Over WebSocket

**What goes wrong:** Full Brass Birmingham game state sent on every action is wasteful.
**Prevention:** Start with full state sends (simplest). Brass game state is likely under 10KB. Only optimize to delta updates if bandwidth becomes measurable issue.

### Pitfall 15: Missing Loading States

**What goes wrong:** User joins game, WebSocket is connecting, UI shows nothing.
**Prevention:** Show "Connecting to game..." while WebSocket handshake completes. Use partysocket connection status events.

### Pitfall 16: Abandoned/Zombie Games

**What goes wrong:** Players create games and never finish them. Lobby fills with stale entries.
**Prevention:** Add `lastActivityAt` timestamp. Background job marks games as abandoned after 24 hours inactive. Display game age in lobby.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| PartyKit setup | Room hibernation (#1), deployment confusion (#4) | Implement DB persistence first. Two separate deploys. |
| Authentication | Schema conflicts (#7), guest accumulation (#8) | Run generator early. Plan cleanup job. |
| Game board SVG | Performance (#11), monolith component | Profile early. Separate layout/state/interaction layers. |
| Action UI | No validation feedback (#12), race conditions (#6) | Structured guard rejections. PartyKit serializes actions. |
| Lobby | Zombie games (#16), 2-player assumptions (#10) | TTL cleanup. Normalize player schema first. |
| Multi-player (3-4) | Untested edge cases | Write integration tests for 3 and 4 players before UI. |
| State management | Snapshot brittleness (#5), info leaks (#3) | Version snapshots. Allowlist filtering. |

## Sources

- [PartyKit Documentation](https://docs.partykit.io/)
- [Multiplayer XState with Durable Objects](https://www.astahmer.dev/posts/multiplayer-state-machine-with-durable-objects)
- [better-auth Anonymous Plugin](https://better-auth.com/docs/plugins/anonymous)
- [Next.js WebSocket Discussion #14950](https://github.com/vercel/next.js/discussions/14950)
- [BGG: Why is digital Brass so neglected?](https://boardgamegeek.com/thread/3033653/why-is-digital-brass-so-neglected)
- [Complete Guide to HTML5 Games with Canvas and SVG](https://www.sitepoint.com/the-complete-guide-to-building-html5-games-with-canvas-and-svg/)

---

*Pitfalls research: 2026-03-21 (updated for PartyKit + better-auth)*
