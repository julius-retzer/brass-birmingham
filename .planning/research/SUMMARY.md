# Project Research Summary

**Project:** Brass Birmingham Online — Multiplayer & Lobby Milestone
**Domain:** Online multiplayer board game (turn-based, 2-4 players)
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

Brass Birmingham Online is a digital implementation of a complex Euro board game, and the multiplayer milestone requires solving three problems simultaneously: real-time state synchronization across players, identity management for guests and registered users, and a board visualization that makes a dense physical game legible on screen. Research strongly converges on a two-deployment architecture: Next.js on Vercel handles the lobby and auth surface, while PartyKit on Cloudflare Workers hosts long-lived XState game rooms per game. This is not a speculative choice — PartyKit was purpose-built for exactly this pattern (stateful WebSocket rooms on edge infrastructure), and a community reference implementation for XState + PartyKit multiplayer already exists. The existing XState state machine migrates from ephemeral server-action actors to a persistent room actor, eliminating polling latency and concurrent-write race conditions in one move.

The recommended approach is to build the infrastructure foundation first (PartyKit + better-auth + schema migration), then the lobby system, then the game board visualization, then the action UIs. The board visualization is the largest single effort and the most impactful gap — players cannot play without it — but it has no dependency on auth or lobby, so it can proceed in parallel with lobby development. The game logic (XState machine, rule enforcement, state filtering) is already implemented and well-tested; this milestone is primarily about wrapping that logic in a real-time multiplayer shell and building the UI surface that was previously absent.

The primary risks are operational: PartyKit rooms hibernate when all players disconnect, which destroys in-memory state unless the XState snapshot is persisted to PostgreSQL on every transition. This is a known and preventable failure. A secondary risk is the current state filter using a denylist pattern — any new game state field is sent to all clients by default, which is an information leak waiting to happen. Switching to an allowlist pattern before multiplayer goes live is critical. Both risks have clear, well-documented mitigations.

## Key Findings

### Recommended Stack

The existing stack (Next.js 15, XState 5, Drizzle ORM, Neon PostgreSQL, Tailwind, Shadcn UI, Vitest) requires no migration. Two significant additions are needed: PartyKit + partysocket for real-time game rooms, and better-auth for guest-first authentication. PartyKit was chosen over Socket.io (requires custom server, breaks Vercel), Liveblocks (CRDT-focused, wrong abstraction), and raw WebSockets (no reconnection or room management). better-auth was chosen over Auth.js v5 (no native anonymous auth), Lucia Auth (deprecated March 2025), and Clerk/Auth0 (external SaaS, overkill). The game board will be rendered as SVG within React — appropriate for a 30-location, 40-link board that is not continuously animated.

**Core technologies:**
- **PartyKit + partysocket**: Real-time game rooms on Cloudflare Workers — XState actor runs inside each room, WebSocket replaces 3s polling
- **better-auth (anonymous plugin)**: Guest-first auth with session lifecycle management — no signup required to play, optional account upgrade
- **SVG (React-native)**: Board visualization — scalable, CSS-styleable, no continuous animation needed, well within complexity limits for Brass Birmingham's board size
- **Zod (existing)**: Action validation schemas before sending to PartyKit server
- **nanoid**: Short unique IDs for game URLs and player sessions

### Expected Features

Research reviewed BGA, Yucata, Tabletopia, and Steam Brass Birmingham to identify the full feature landscape. The biggest current gap is the game board visualization — without it, the game is not playable.

**Must have (table stakes):**
- Game board visualization — biggest gap; cities, links, industries, resources must be visible
- Interactive action UI for all 7 actions — Build, Network, Develop, Sell, Loan, Scout, Pass each need step-by-step wizard flows
- Real-time state sync (sub-second) — WebSocket push via PartyKit replaces 3s polling
- Game lobby (create / browse / join) — currently only create exists
- Guest access with zero signup friction — better-auth anonymous plugin
- Valid move highlighting — essential for complex multi-step actions
- End-game scoring screen — not yet built; the payoff of the whole game
- Player count support (2-4 players) — currently hardcoded to 2
- Turn indication with notifications — prominent turn change indicator + browser notification
- Game state display (money, income, VP, hand) — partially built, needs polish
- Reconnection handling — partysocket handles automatically

**Should have (differentiators, post-launch):**
- Undo support at action-wizard level (before confirming, not after completing a turn)
- Sound / browser notifications when turn changes
- Invite links (shareable game URLs)
- Player name / color customization

**Defer to v2+:**
- AI opponents (extremely hard problem, months for bad UX)
- Turn timers
- Animated transitions
- In-game chat
- Mobile-responsive layout (board unreadable at phone width)
- Ranked matchmaking / ELO
- Game replays / spectator mode
- Async play (requires email notification infrastructure)

### Architecture Approach

The system is server-authoritative with two separate deployments sharing a PostgreSQL database. The XState machine moves from ephemeral server-action actors into a long-lived PartyKit room actor. Clients are dumb renderers: they send action intents over WebSocket and receive filtered state in response. The lobby requires no real-time — Server Components with revalidation are sufficient because games are created every few minutes, not every second. The state filter (stateFilter.ts, already implemented) must move into the PartyKit server and must be hardened from denylist to allowlist.

**Major components:**
1. **PartyKit Game Server** — hosts XState actor per game, validates actions, broadcasts filtered state, persists to DB on every transition
2. **Next.js App (Vercel)** — lobby UI, auth endpoints, game creation; no game logic; communicates via HTTPS
3. **better-auth** — session management, guest auth, account linking; runs as Next.js API route handler with Drizzle adapter
4. **Browser Client** — renders SVG board and action wizards; connects to PartyKit via WebSocket for game, to Next.js for lobby/auth
5. **State Filter** — per-player allowlist projection hiding opponent hands; moves into PartyKit room server
6. **Neon PostgreSQL** — persistence for games, users, sessions, lobby metadata; schema requires new `game_players` join table and better-auth auto-generated tables

### Critical Pitfalls

1. **PartyKit room hibernation destroys in-memory XState state** — persist full XState snapshot to PostgreSQL on every state transition; hydrate from DB in `onStart()`. Test by disconnecting all players, waiting, reconnecting, and verifying state matches. This is the single most important thing to get right in Phase 1.

2. **Running XState on both client and server** — XState machine must run ONLY inside the PartyKit room. Client is a renderer. If the game machine is ever imported in a client component, the architecture has broken down. Detect by grepping for game machine imports in client components.

3. **State filter denylist leaks hidden information** — switch stateFilter.ts to an allowlist (build `PlayerVisibleState` from scratch). Add CI tests that assert filtered state does NOT contain opponent hand data. New fields should fail to leak rather than leak silently.

4. **XState snapshot format brittleness across upgrades** — pin XState version, add `schemaVersion` field to stored snapshots, write round-trip restoration tests before any XState upgrade. The existing gameManager.ts already persists snapshots — validate format before PartyKit builds on top of it.

5. **Hardcoded 2-player assumptions in schema and code** — the current schema uses `player1Name`/`player2Name` columns. Replace with `game_players` join table before building lobby player count selection. This is visible in both schema.ts and gameManager.ts.

## Implications for Roadmap

Based on research, dependencies run in this order: infrastructure (PartyKit + auth + schema) must come first, then lobby and board visualization can proceed in parallel, then action wizards depend on board visualization, then scoring and polish close out. Five phases total.

### Phase 1: Infrastructure Foundation

**Rationale:** Everything else depends on this. PartyKit must be integrated before any real-time gameplay. better-auth must be set up before lobby identity. Schema must be normalized before lobby player count logic. These three items are tightly coupled foundation work that cannot be split.
**Delivers:** Real-time WebSocket connection from browser to game room; guest auth sessions; normalized `game_players` schema and better-auth tables; XState actor running in PartyKit room; DB persistence on every state transition; DB hydration on room wake-up.
**Addresses:** Real-time state sync, guest access, reconnection handling, player count support (foundation), state filter hardened to allowlist
**Avoids:** Room hibernation pitfall (#1), deployment confusion (#4), 2-player hardcoding (#10), schema conflicts (#7)
**Research flag:** Standard patterns — PartyKit + XState integration is well-documented with a reference implementation. better-auth has clear docs and Drizzle adapter. No research phase needed; proceed directly to implementation.

### Phase 2: Lobby System

**Rationale:** Players need to find and start games. Lobby is the entry point to the game and depends on Phase 1 (auth for identity, schema for game/player records). Lobby does NOT need real-time — Server Components with revalidation are sufficient.
**Delivers:** Create game with player count selection, browse open games list, join game flow, shareable invite links, lobby redirect to game page when full, game age display, abandoned game cleanup.
**Addresses:** Game lobby (create/browse/join), invite links, player count support (UI), turn indication plumbing
**Avoids:** Zombie games (#16 — add `lastActivityAt`), guest session accumulation (#8 — plan cleanup cron)
**Research flag:** Standard Next.js Server Components + Server Actions CRUD pattern. No research phase needed.

### Phase 3: Game Board Visualization

**Rationale:** The biggest UI gap and the most impactful for playability. Can begin in parallel with Phase 2 since it has no dependency on lobby or auth — it only needs the game state shape from Phase 1. SVG approach is appropriate for Brass Birmingham's board complexity.
**Delivers:** SVG board with all location slots, placed industries, links (canal vs rail era coloring), resource indicators on tiles, merchant positions at board edges, highlight overlay layer for valid moves and selection feedback.
**Addresses:** Game board visualization, valid move highlighting (visual layer), resource markets display, merchant display
**Avoids:** SVG performance issues (#11 — React.memo on sub-components, profile with 4-player end-game state before shipping)
**Research flag:** The coordinate mapping for Brass Birmingham's specific map layout is the one unknown — location positions on the SVG canvas must be manually mapped or sourced from an existing digital asset. Plan discovery time for this. SVG rendering patterns themselves are standard.

### Phase 4: Action Wizard UIs

**Rationale:** Depends on board visualization (actions reference board locations for selection). All 7 action types need step-by-step wizard flows. The XState machine already enforces rules — the wizards surface valid options and collect player intent.
**Delivers:** BuildWizard, NetworkWizard, DevelopWizard, SellWizard, LoanWizard, ScoutWizard, PassWizard; structured validation feedback from XState guards with contextual error messages; gray-out of invalid options before confirmation; player dashboard polish showing money, income, VP, hand.
**Addresses:** Interactive action UI, valid move highlighting (confirmation side), game state display polish, rules enforcement surfaced in UI
**Avoids:** No validation feedback (#12 — structured guard rejections, not generic errors), client-side XState (#2 — server-authoritative throughout), state filter info leaks (#3 — must be hardened in Phase 1 before action UI exposes state)
**Research flag:** No additional research needed — pure implementation task guided by the existing XState state machine and guards.

### Phase 5: End-Game, Scoring, and Polish

**Rationale:** Scoring screen is the payoff of the game and must exist before the game can be considered shippable. Polish features (notifications, undo, player name customization) improve UX without blocking the core loop.
**Delivers:** End-game scoring screen with VP breakdown by category (link points, industry points, income); winner declaration; turn change notification (visual + browser Notification API); player name/color customization; undo support at wizard level (pre-confirmation only); loading state on WebSocket handshake.
**Addresses:** End-game scoring screen, sound/browser notifications, player name/color customization, undo support, missing loading states (#15)
**Avoids:** Reconnection spam (#13 — trust partysocket defaults, no custom handling needed)
**Research flag:** No research phase needed. Standard notification APIs and scoring display; no novel patterns.

### Phase Ordering Rationale

- Phase 1 before everything: PartyKit changes the fundamental communication pattern. Building any UI on the current polling system then migrating is wasteful rework.
- Phase 2 and Phase 3 can proceed in parallel: lobby has no dependency on board visualization; board visualization has no dependency on lobby plumbing. Both only need Phase 1 complete.
- Phase 4 cannot start until Phase 3 is sufficiently complete, because action wizards reference board locations for selection UI. Starting wizards without the board would require building against a placeholder.
- Phase 5 is a natural cleanup phase — scoring depends on game completion logic that emerges from Phase 4 completion.
- This ordering matches the dependency graph from FEATURES.md: `PartyKit → everything; Auth → Lobby; Board → Actions → Undo`.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Board visualization):** Coordinate mapping for Brass Birmingham's specific map layout. Location coordinates for the SVG canvas are not documented anywhere obvious and must be discovered or derived. This is the single unknown in an otherwise well-understood phase.

Phases with standard patterns (skip research-phase):
- **Phase 1:** PartyKit + XState reference implementation exists at github.com/astahmer/multiplayer-xstate; better-auth has official Next.js + Drizzle integration docs.
- **Phase 2:** Next.js Server Components + Server Actions lobby is thoroughly documented in official Next.js docs.
- **Phase 4:** Guided entirely by existing XState machine; no new technology introduced.
- **Phase 5:** Standard Web Notification API and scoring display; no novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | PartyKit + XState integration verified via official blog post and community reference implementation. better-auth anonymous plugin verified via official docs. SVG assessed as MEDIUM — correct approach but no Brass-specific benchmark; board complexity is well within safe range. |
| Features | HIGH | Derived from BGA, Yucata, Steam Brass reviews, and BGG community threads. Feature priority grounded in existing platform conventions and community feedback on what made Steam Brass feel bad. |
| Architecture | HIGH | Two-deployment model is well-documented. Component boundaries are clear and consistent. Allowlist state filtering pattern is critical and should be treated as blocking before any multiplayer state is exposed. |
| Pitfalls | HIGH | Critical pitfalls 1-6 are all verifiable from official documentation or direct code inspection of the existing codebase. Pitfall #3 (state filter) and #10 (2-player hardcoding) were found by examining current code. |

**Overall confidence:** HIGH

### Gaps to Address

- **Board coordinate mapping:** The physical Brass Birmingham map's location coordinates need to be established before SVG implementation begins. Either manually map the board, extract from an existing digital source, or use the board game's published location graph as a starting point. This is the biggest unknown.
- **XState snapshot round-trip validation:** The existing `gameManager.ts` already persists snapshots. Validate the format and add schema versioning before PartyKit integration builds on top of it. A breaking format change after games are in production would corrupt all active games.
- **better-auth anonymous session cleanup:** The anonymous plugin handles linking, but orphaned guests (visitors who never play a game) will accumulate. Plan the cron cleanup strategy during Phase 1 even if the job is implemented later.
- **3-4 player XState edge cases:** The game logic may have untested edge cases for 3 and 4 player configurations. Write integration tests for these player counts before building the multi-player lobby UI in Phase 2.
- **PartyKit free tier concurrency:** Cloudflare's free tier is generous, but worth verifying limits once before launch. At 10 concurrent 4-player games this is nowhere near a concern at current scale.

## Sources

### Primary (HIGH confidence)
- [PartyKit Documentation](https://docs.partykit.io/) — room lifecycle, hibernation, WebSocket API
- [PartyKit + Stately/XState Integration](https://blog.partykit.io/posts/partykit-orchestrates-stately/) — official confirmation of XState support
- [Multiplayer XState with PartyKit](https://github.com/astahmer/multiplayer-xstate) — community reference implementation
- [Multiplayer XState with Durable Objects](https://www.astahmer.dev/posts/multiplayer-state-machine-with-durable-objects) — architecture deep-dive
- [Better Auth Official Docs](https://better-auth.com/) — anonymous plugin, Drizzle adapter, Next.js integration
- [Cloudflare acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/) — free tier and deployment model

### Secondary (MEDIUM confidence)
- [Board Game Arena FAQ](https://en.boardgamearena.com/faq) — turn timers, game modes, platform conventions
- [BGA Undo Policy](https://en.boardgamearena.com/doc/BGA_Undo_policy) — undo philosophy for digital board games
- [Yucata Platform](https://www.yucata.de/en) — async play model, lobby system conventions
- [BGG Thread: Brass Birmingham Online](https://boardgamegeek.com/thread/3030181/on-line-web-based-version-of-brass-birmingham) — community demand signal
- [BGG: Why is digital Brass so neglected?](https://boardgamegeek.com/thread/3033653/why-is-digital-brass-so-neglected) — community pain points with Steam version (informed pitfall #12)

### Tertiary (LOW confidence)
- [NN/g Usability Heuristics for Board Games](https://www.nngroup.com/articles/usability-heuristics-board-games/) — general UX principles, not Brass-specific
- SVG vs Canvas performance for board games — inferred from general knowledge; no Brass-specific benchmark exists

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
