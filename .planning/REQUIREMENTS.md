# Requirements: Brass Birmingham Online

**Defined:** 2026-03-21
**Core Value:** Two players can play a complete game of Brass Birmingham online in real-time, with the game correctly enforcing all rules.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Game Engine

- [x] **ENGINE-01**: Game machine correctly implements all Brass Birmingham rules for 2 players
- [x] **ENGINE-02**: Canal era scoring calculates link points and industry points correctly
- [x] **ENGINE-03**: Rail era scoring calculates link points and industry points correctly
- [x] **ENGINE-04**: Era transition correctly removes canal-only links/tiles, re-deals cards, sets turn order
- [x] **ENGINE-05**: All 7 action types have complete rule enforcement with correct resource/money handling
- [x] **ENGINE-06**: Game machine has 100% unit test coverage for all actions and state transitions
- [x] **ENGINE-07**: Edge cases tested: bankruptcy, empty markets, no valid moves, last card scenarios
- [x] **ENGINE-08**: Turn order correctly determined each round (lowest spend goes first)
- [x] **ENGINE-09**: Current player switches correctly after each action (2 actions per turn)
- [x] **ENGINE-10**: First round of each era correctly gives each player only 1 action

### Board UI

- [ ] **BOARD-01**: Player can see all board locations (cities) with their industry slots
- [ ] **BOARD-02**: Player can see all network links (canal and rail era) with their status
- [ ] **BOARD-03**: Player can see placed industries on the board with flip status
- [ ] **BOARD-04**: Player can see resource cubes on locations (coal, iron, beer)
- [ ] **BOARD-05**: Player can see which locations/actions are valid moves on their turn
- [ ] **BOARD-06**: Player can see coal and iron market with current prices and availability
- [ ] **BOARD-07**: Player can see merchant tiles with beer availability and connections

### Action UI

- [ ] **ACTN-01**: Player can execute Build action (select card, location, industry, spend resources)
- [ ] **ACTN-02**: Player can execute Network action (select card, link, spend coal if needed)
- [ ] **ACTN-03**: Player can execute Develop action (select industries to remove, spend iron)
- [ ] **ACTN-04**: Player can execute Sell action (select industry, choose merchant route)
- [ ] **ACTN-05**: Player can execute Loan action (reduce income for money)
- [ ] **ACTN-06**: Player can execute Scout action (discard cards, draw new ones)
- [ ] **ACTN-07**: Player can execute Pass action (select card to discard)

### Game State

- [ ] **STATE-01**: Player can see their money, income level, and victory points
- [ ] **STATE-02**: Player can see their hand of cards
- [ ] **STATE-03**: Player can see their remaining unbuilt industry tiles
- [ ] **STATE-04**: Player can see opponent's public info (money, income, VP, built industries)
- [ ] **STATE-05**: Player can see whose turn it is with clear visual indicator
- [ ] **STATE-06**: Player can see game log of all actions taken
- [ ] **STATE-07**: Player can see end-game scoring with VP breakdown by category
- [ ] **STATE-08**: Player can only see their own hand; opponent's hand shows card count only

### Lobby

- [ ] **LOBBY-01**: Player can create a new game and receive a shareable link
- [ ] **LOBBY-02**: Player can join a game via shared link

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Infrastructure

- **INFRA-01**: Real-time sync via PartyKit/WebSockets (replace polling)
- **INFRA-02**: Guest authentication with better-auth (zero-friction sessions)
- **INFRA-03**: Support for 3 and 4 player games

### Social

- **SOCL-01**: Browse open games in lobby
- **SOCL-02**: Invite links with copy-to-clipboard
- **SOCL-03**: Player name/color customization

### Polish

- **PLSH-01**: Undo support for in-progress actions (before confirming)
- **PLSH-02**: Turn timer (configurable)
- **PLSH-03**: Sound/browser notifications on turn change
- **PLSH-04**: Animated transitions for tile/link placement

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| AI opponents | Brass Birmingham AI is extremely hard; focus on human play |
| In-game chat | Players use Discord/WhatsApp; chat means moderation headaches |
| Ranked matchmaking / ELO | No player base yet; premature |
| Mobile-responsive layout | Board too complex for phone screens; desktop-first |
| OAuth / social login | Email/password or guest is sufficient |
| Tutorial / interactive guide | Players who seek online Brass already know the rules |
| Async/turn-based mode | Real-time only for v1 |
| Multi-language | Niche Euro game, English-speaking audience |
| Game replays / spectator mode | Doubles state management complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENGINE-01 | Phase 1 | Complete |
| ENGINE-02 | Phase 1 | Complete |
| ENGINE-03 | Phase 1 | Complete |
| ENGINE-04 | Phase 1 | Complete |
| ENGINE-05 | Phase 1 | Complete |
| ENGINE-06 | Phase 1 | Complete |
| ENGINE-07 | Phase 1 | Complete |
| ENGINE-08 | Phase 1 | Complete |
| ENGINE-09 | Phase 1 | Complete |
| ENGINE-10 | Phase 1 | Complete |
| BOARD-01 | Phase 2 | Pending |
| BOARD-02 | Phase 2 | Pending |
| BOARD-03 | Phase 2 | Pending |
| BOARD-04 | Phase 2 | Pending |
| BOARD-05 | Phase 2 | Pending |
| BOARD-06 | Phase 2 | Pending |
| BOARD-07 | Phase 2 | Pending |
| ACTN-01 | Phase 3 | Pending |
| ACTN-02 | Phase 3 | Pending |
| ACTN-03 | Phase 3 | Pending |
| ACTN-04 | Phase 3 | Pending |
| ACTN-05 | Phase 3 | Pending |
| ACTN-06 | Phase 3 | Pending |
| ACTN-07 | Phase 3 | Pending |
| STATE-01 | Phase 2 | Pending |
| STATE-02 | Phase 2 | Pending |
| STATE-03 | Phase 2 | Pending |
| STATE-04 | Phase 2 | Pending |
| STATE-05 | Phase 2 | Pending |
| STATE-06 | Phase 3 | Pending |
| STATE-07 | Phase 3 | Pending |
| STATE-08 | Phase 2 | Pending |
| LOBBY-01 | Phase 3 | Pending |
| LOBBY-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
