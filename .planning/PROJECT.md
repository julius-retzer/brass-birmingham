# Brass Birmingham Online

## What This Is

An online multiplayer implementation of the board game Brass Birmingham. Players create and join games through a lobby system, then play real-time 2-4 player games with full rules — both Canal and Rail eras, all industries, all actions, complete scoring. The focus is on a functional, readable board UI that lets you play a complete game remotely.

## Core Value

Two to four players can play a complete game of Brass Birmingham online in real-time, with the game correctly enforcing all rules.

## Requirements

### Validated

<!-- Existing capabilities confirmed in codebase -->

- ✓ XState v5 state machine with full game logic (both eras, all actions) — existing
- ✓ Build action with location/industry selection and resource spending — existing
- ✓ Network action with link building and coal costs — existing
- ✓ Develop action for removing industry tiles — existing
- ✓ Sell action with merchant/market interaction — existing
- ✓ Loan action with income reduction — existing
- ✓ Scout action for card management — existing
- ✓ Pass action with card selection — existing
- ✓ Turn progression and era transitions (Canal → Rail) — existing
- ✓ Game data: board layout, cards, industry tiles, merchants — existing
- ✓ Server-side game persistence with Drizzle/Neon PostgreSQL — existing
- ✓ State filtering for information hiding (opponent hands hidden) — existing
- ✓ Game creation and join flow via server actions — existing
- ✓ Polling-based state synchronization (3-second interval) — existing
- ✓ Basic game UI with GameInterface, PlayerCard, PlayerHand components — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Functional game board UI showing all locations, links, and placed industries
- [ ] Interactive action selection UI for all 7 action types
- [ ] Clear visual feedback for valid/invalid moves
- [ ] Game lobby: create games, browse open games, join games
- [ ] Guest access with optional account creation (email/password)
- [ ] Support 2, 3, and 4 player games (currently hardcoded to 2)
- [ ] Scoring display and end-game results screen
- [ ] Game log showing action history
- [ ] Market display (coal, iron prices and availability)
- [ ] Player dashboard showing resources, income, VP, and built industries

### Out of Scope

- AI opponents — complexity too high for v1, focus on human play
- Ranked matchmaking / ELO — not needed until player base exists
- Spectator mode — nice to have, not core
- Chat system — players can use external communication
- Mobile-optimized layout — desktop-first, functional is the goal
- OAuth / social login — guest + simple email auth is sufficient
- Async/turn-based mode — real-time only for v1
- Game replays — out of scope for initial release

## Context

- Phase 01.1 audit complete: 258 rules audited — 154 PASS (59.7%), 20 FAIL, 84 MISSING test evidence. Full audit report at `.planning/phases/01.1-engine-rule-audit-and-correctness-verification/audit-report/00-summary.md`
- Existing codebase has solid game logic in XState state machine with extensive test coverage
- Board data, cards, industry tiles, and merchants are fully modeled as static data
- Server architecture uses Next.js server actions + API routes with Drizzle ORM on Neon PostgreSQL
- State filtering already handles information hiding (opponent hands, deck)
- Current UI is barebones — game logic works but you can't play a full game visually
- Multiplayer networking exists (polling-based) but only supports 2 players
- No authentication system exists — game access is via shared URL with query params
- The game board visualization (locations, connections, placed tiles) is the biggest UI gap

## Constraints

- **Tech stack**: Next.js 15, XState v5, Tailwind/Shadcn — already established, no migration
- **Database**: Neon PostgreSQL with Drizzle ORM — already in place
- **Board game rules**: Must faithfully implement Brass Birmingham rules — no simplifications
- **Real-time**: Polling-based sync is functional; WebSockets can be added later if needed
- **Visual style**: Functional and readable over flashy — clean Shadcn-based UI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep polling over WebSockets | Already working, simpler infra, good enough for turn-based flow | — Pending |
| Guest-first auth | Minimize friction to start playing, accounts optional | — Pending |
| Lobby system over auto-match | Simpler to build, lets players control game settings | — Pending |
| Full rules from day one | Game logic already implements full rules, no reason to subset | — Pending |
| Functional UI over polished | Ship playable game faster, polish later | — Pending |

---
*Last updated: 2026-03-22 after Phase 01.1 completion*
