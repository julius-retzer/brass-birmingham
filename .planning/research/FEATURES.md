# Feature Landscape

**Domain:** Online board game platform (single-title: Brass Birmingham)
**Researched:** 2026-03-21 (updated for multiplayer milestone)
**References:** BoardGameArena, Yucata, Tabletopia, Steam Brass Birmingham

## Table Stakes

Features users expect from any online board game. Missing any of these and players will leave for an alternative.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Game board visualization** | Players need to see the board to play. Cities, links, placed industries, resources must be visible and readable at a glance. | High | Biggest current gap. Brass Birmingham's board is complex (30+ cities, ~50 links, multiple industry slots per city). Must show canal vs rail era links, resource cubes on locations, flipped/unflipped industries. SVG-based rendering recommended. |
| **Interactive action UI** | Players must be able to execute all 7 actions (Build, Network, Develop, Sell, Loan, Scout, Pass) through clear step-by-step flows. | High | Each action has different sub-steps. Build requires card + location + industry + resource spending. Sell requires choosing connected merchants. UI must guide through multi-step actions. |
| **Real-time state sync (sub-second)** | Polling delay feels broken in a "real-time" game. Players expect instant feedback when opponents act. | Medium | PartyKit replaces 3s polling with WebSocket push. Instant state broadcast to all connected players. |
| **Turn indication** | Player must know whose turn it is and when it changes. BGA, Yucata, and every platform makes this prominent. | Low | Already partially implemented. Needs to be more prominent with sound/visual notification when turn changes. |
| **Game lobby (create/join)** | Players need to find and start games. Every platform has a lobby: create a game with settings, browse open games, join. | Medium | Currently only has "Create Game" form. Needs: list of open games, game settings (player count), join flow with shareable link. |
| **Guest access (no signup required)** | Friction kills casual play. Nobody signs up to try a board game. | Low | better-auth anonymous plugin creates sessions automatically. Zero-friction start. |
| **Rules enforcement** | The game must prevent illegal moves and explain why a move is invalid. This is the primary value proposition of digital over physical. | Low | Already implemented in XState state machine. Need clear error messages surfaced in UI. |
| **Game state display** | Money, income, VP, cards in hand, industry tiles remaining -- all must be visible. Players need this info to make decisions. | Medium | Partially built (QuickStatusBar, PlayerCard). Needs polish: opponent's public info visible, own hand clearly displayed. |
| **Resource markets display** | Coal and iron market prices/availability must be visible. Central to gameplay decisions. | Low | Already implemented (ResourceMarkets component). Needs clear visual of current prices and remaining cubes. |
| **Merchant display** | Beer availability at merchants and merchant connections affect Sell actions. Must be visible. | Low | Already implemented (MerchantDisplay component). |
| **Game log** | Record of all actions taken. Players need to see what happened while waiting for their turn. | Low | Already implemented (GameLog component). Should show clear, readable action descriptions. |
| **End-game scoring screen** | Players must see final scores with breakdown (link points, industry points, income). The payoff of the whole game. | Medium | Not yet built. Must show VP breakdown by category, winner declaration, and per-player scoring details. |
| **Player count support (2-4)** | Brass Birmingham supports 2-4 players. Shipping with only 2-player would feel incomplete. | Medium | Currently hardcoded to 2 players. Game logic likely supports more, but server/lobby flow needs to handle variable player counts. |
| **Reconnection handling** | If a player refreshes or loses connection, they must be able to rejoin their game. | Low | PartyKit + partysocket handle reconnection automatically with exponential backoff. Current state sent on reconnect. |
| **Valid move highlighting** | Without guidance, players guess and get errors. Must show which locations/actions are valid. | Medium | Highlight valid locations/actions based on current XState state. |

## Differentiators

Features that set the product apart. Not expected, but valued. These can wait for post-launch iteration.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Undo support** | Brass has complex multi-step actions. Allowing undo before committing an action reduces frustration. | Medium | Implement at the action-wizard level: let players back out of partially-completed actions before confirming. Do NOT allow undoing completed turns. |
| **Turn timer** | Prevents games from stalling when a player goes AFK. BGA uses configurable turn timers. | Low | Optional feature for game creation. Not needed for launch. |
| **Sound/browser notifications** | Alert players when it's their turn. Critical for real-time play where players alt-tab. | Low | Browser Notification API + audio cue when turn changes. Low effort, high impact. |
| **Invite links** | Share a URL to invite friends directly to a game. | Low | Generate unique game URLs. Add copy-to-clipboard button. |
| **Game settings customization** | Let host configure: player count, turn timer, era. | Medium | Requires extending game creation to pass settings. |
| **Player name/color customization** | Personalization in a multi-player setting. | Low | Guest gets random name, can change it. |
| **Animated transitions** | Smooth animations for placing industries, building links. | Medium | CSS animations on state changes. Visual polish that can be added incrementally. |

## Anti-Features

Features to explicitly NOT build. These are traps that consume development time without proportional value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **AI opponents** | Brass Birmingham AI is an extremely hard problem. Would consume months for a bad experience. | Focus on human multiplayer. |
| **In-game chat** | Players coordinate via Discord/WhatsApp already. Building chat means moderation headaches. | Add "Copy invite link" button. |
| **Ranked matchmaking / ELO** | Requires a player base that doesn't exist yet. Premature optimization. | Simple game history (wins/losses) is sufficient. |
| **Mobile-responsive layout** | Brass Birmingham's board has 30+ cities. Cramming onto a phone screen would be unreadable. | Design for 1280px+ screens. Desktop-first. |
| **OAuth / social login** | Integration complexity with minimal value for a niche game. | better-auth supports adding OAuth later via plugins if needed. |
| **Tutorial / interactive guide** | Building an in-game tutorial is massive. Players who seek online Brass already know the rules. | Link to existing rule references. Surface rule explanations in error messages. |
| **Async/turn-based for v1** | Requires email notification infrastructure and different timeout handling. | Build real-time first. Async can be added later. |
| **Multi-language support** | Brass is a niche Euro game with primarily English-speaking online audience. | English only. |
| **Game replays / spectator mode** | Doubles the state management complexity. | Defer to future milestone. |

## Feature Dependencies

```
Guest Auth (better-auth) --> Lobby System (need identity to create/join games)
                         --> Reconnection handling (need to identify returning player)

Real-time Sync (PartyKit) --> All gameplay features (everything depends on WebSocket connection)

Game board visualization --> Interactive action UI (actions reference board locations)
                         --> End-game scoring screen (shows board state at game end)

Interactive action UI --> Undo support (undo operates on action steps)

Game lobby --> Player count support (lobby sets player count)
           --> Invite links (lobby generates shareable URLs)
           --> Game settings customization (lobby configures settings)

Valid Move Highlighting --> Action Selection UI (highlighting requires knowing valid moves)
Market Display --> Sell Action UI (need to see market to make sell decisions)
Player Dashboard --> All Action UIs (need to see resources to plan actions)
Turn indication --> Sound/browser notifications (notifications triggered by turn change)
               --> Turn timer (timer starts on turn change)
```

## MVP Recommendation

Prioritize these for the first playable release:

1. **Real-time sync via PartyKit** -- Foundation for everything else. Replaces polling.
2. **Guest authentication (better-auth)** -- Unblocks lobby and player identity.
3. **Game lobby (create + browse + join)** -- Players need to find games.
4. **Game board visualization** -- The single biggest gap. Can't play without seeing the board.
5. **Player dashboard with resource display** -- Players need to see their state.
6. **Action selection UI for all 7 actions** -- Make the game playable.
7. **Valid move highlighting** -- Essential UX for complex actions.
8. **Market display** -- Core to Brass strategy.
9. **Turn indicator with notifications** -- Quality of life for real-time play.
10. **End-game scoring screen** -- The payoff of the whole game.
11. **Player count support (2-4 players)** -- Core Brass Birmingham experience.

Defer to polish milestone:
- Turn timer
- Undo support
- Animated transitions
- Game settings customization

## Sources

- [Board Game Arena FAQ](https://en.boardgamearena.com/faq) -- Turn timers, game modes, premium features
- [BGA Undo Policy](https://en.boardgamearena.com/doc/BGA_Undo_policy) -- Undo philosophy
- [Yucata Platform](https://www.yucata.de/en) -- Async play model, lobby system
- [BGG Thread: Brass Birmingham Online](https://boardgamegeek.com/thread/3030181/on-line-web-based-version-of-brass-birmingham) -- Community demand
- [NN/g Usability Heuristics for Board Games](https://www.nngroup.com/articles/usability-heuristics-board-games/) -- UX principles
