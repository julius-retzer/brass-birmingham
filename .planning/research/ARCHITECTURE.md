# Architecture Patterns

**Domain:** Online multiplayer board game (Brass Birmingham)
**Researched:** 2026-03-21 (updated for multiplayer milestone with PartyKit)

## Recommended Architecture

The system is a **server-authoritative turn-based multiplayer game** with two deployment targets: Next.js on Vercel for lobby/auth/static content, and PartyKit on Cloudflare Workers for real-time game rooms. The existing XState state machine moves from ephemeral server-action actors to long-lived PartyKit room actors.

### High-Level Architecture

```
[Browser]                    [PartyKit (Cloudflare)]           [Vercel]

PlayerA  <-- WebSocket -->  PartyKit Room (per game)     Next.js App
PlayerB  <-- WebSocket -->    - XState machine              - Lobby pages (RSC)
PlayerC  <-- WebSocket -->    - State filtering             - Auth endpoints (better-auth)
PlayerD  <-- WebSocket -->    - Action validation           - Static assets
                              - Persist to DB ------------> Neon PostgreSQL

Browser  <-- HTTPS -------> Next.js Server Actions
                              - Lobby CRUD
                              - Auth (better-auth)
                              - Game list queries
```

### Component Boundaries

| Component | Responsibility | Communicates With | Status |
|-----------|---------------|-------------------|--------|
| **PartyKit Game Server** | Hosts XState machine per game. Validates actions. Broadcasts filtered state. Persists to DB. | Browser (WebSocket), Neon PostgreSQL (HTTP) | NEW |
| **Next.js App (Vercel)** | Lobby UI, auth endpoints, game creation, static pages. No game logic. | Browser (HTTPS), Neon PostgreSQL (Drizzle), PartyKit (room create API) | EXISTS - needs lobby pages |
| **better-auth** | Session management, guest auth, account linking. Runs as Next.js API route handler. | Browser (cookies), Neon PostgreSQL (user/session tables) | NEW |
| **Browser Client** | Renders game board (SVG), action UI, lobby. Sends actions via WebSocket. Receives filtered state. | PartyKit (WebSocket), Next.js (HTTPS for lobby/auth) | EXISTS - needs major expansion |
| **Neon PostgreSQL** | Persists games, users, sessions, lobby metadata. | PartyKit server, Next.js server actions | EXISTS - needs schema additions |
| **State Filter** | Per-player state projection (hide opponent hands). | PartyKit server (called on every broadcast) | EXISTS - moves into PartyKit server |

## Data Flow

### Authentication Flow (NEW - better-auth)

```
1. User visits site
2. better-auth middleware checks for session cookie
3. No cookie? Anonymous plugin auto-creates guest session + user record
4. Cookie exists? Validate session, extract userId
5. userId attached to all subsequent requests
6. Optional: User creates account (email/password) -> links to existing guest userId
7. Game actions validated: session userId must match game player slot
```

**Key decision:** Use better-auth with anonymous plugin instead of custom JWT or iron-session. better-auth handles session lifecycle, CSRF protection, cookie security, and guest-to-account linking out of the box. The anonymous plugin is purpose-built for the guest-first flow.

### Lobby Flow (NEW - Server Components + Server Actions)

```
1. Authenticated user (guest or real) lands on lobby page
2. Server Component queries DB for open games (status = 'waiting')
3. Displays list: game name, creator, player count, created time
4. User can:
   a. Create game -> picks player count (2/3/4) -> Server Action creates DB record + PartyKit room
   b. Join game -> Server Action adds player to DB record
   c. Resume game -> sees in-progress games where userId is a player
5. When game reaches required player count -> all players redirected to game page
6. Game page connects to PartyKit room via WebSocket
```

**No real-time needed for lobby.** Games are created every few minutes. Server-rendered pages with revalidation are simpler and sufficient. Do not add WebSocket to the lobby.

### Game Event Flow (CHANGED - PartyKit replaces polling)

**Before (current):**
```
1. Player clicks action -> Server Action -> load snapshot from DB -> create ephemeral actor
2. Actor processes event -> persist new snapshot to DB -> destroy actor
3. Other players discover change via 3-second polling
```

**After (with PartyKit):**
```
1. Player clicks action -> WebSocket message to PartyKit room
2. PartyKit server validates with long-lived XState actor (always in memory)
3. If valid: state transitions, new state computed
4. State filter runs per-player (existing stateFilter.ts)
5. Each player receives filtered state via WebSocket broadcast (instant)
6. PartyKit persists full state to PostgreSQL (async, non-blocking)
```

**Key improvements:**
- No ephemeral actor creation/destruction per action (actor lives in room)
- No polling (WebSocket push)
- No race conditions from concurrent DB reads (single actor processes actions sequentially)
- Instant feedback to all players

### State Synchronization (CHANGED - WebSocket replaces polling)

```
PartyKit Room:
  onMessage(action, sender):
    1. Validate sender is current player
    2. actor.send(action)
    3. For each connected player:
       filtered = filterStateForPlayer(actor.getSnapshot(), playerId)
       player.send(JSON.stringify({ type: 'STATE', state: filtered }))
    4. Persist to DB (async)

Client:
  usePartySocket(roomId):
    onMessage(msg):
      if msg.type === 'STATE':
        setGameState(msg.state)  // triggers React re-render
```

### Board Rendering (SVG approach)

```
Board (SVG container with viewBox for scaling)
  +-- BoardBackground (static SVG map image)
  +-- LinkLayer (SVG paths between locations)
  |     +-- Link (line/path, colored if built by player)
  +-- LocationLayer (SVG groups at map coordinates)
  |     +-- Location (circle/rect, clickable)
  |           +-- IndustrySlot[] (available build slots)
  |           +-- PlacedIndustry[] (tiles with level, flipped status)
  |           +-- ResourceIndicator (coal/iron cubes on tile)
  +-- MerchantLayer (edge-of-board merchant positions)
  +-- HighlightLayer (valid move indicators, selection feedback)
```

## Patterns to Follow

### Pattern 1: Server-Authoritative State (via PartyKit)

**What:** The XState machine runs ONLY inside the PartyKit room. Clients send action intents; the server validates and applies them. No game logic on the client.

**When:** Always, for all game actions.

**Example:**
```typescript
// PartyKit server (party/game.ts)
export default class GameServer implements Party.Server {
  actor: ActorRefFrom<typeof brassMachine>;

  onConnect(conn: Party.Connection) {
    const playerId = this.connectionToPlayer.get(conn.id);
    const filtered = filterStateForPlayer(this.actor.getSnapshot(), playerId);
    conn.send(JSON.stringify({ type: 'STATE', state: filtered }));
  }

  onMessage(message: string, sender: Party.Connection) {
    const action = JSON.parse(message);
    const playerId = this.connectionToPlayer.get(sender.id);

    // Validate it's this player's turn
    if (!isPlayerTurn(this.actor.getSnapshot(), playerId)) {
      sender.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
      return;
    }

    // XState validates via guards
    this.actor.send(action);
    this.broadcastFilteredState();
    this.persistToDatabase(); // async
  }
}
```

### Pattern 2: Room Lifecycle with DB Hydration

**What:** PartyKit rooms can hibernate when all players disconnect. On wake-up, hydrate the XState actor from the database.

**When:** Every room start (onStart) and connection to a room that may have hibernated.

**Example:**
```typescript
async onStart() {
  // Load persisted state from DB
  const gameRecord = await db.select().from(games).where(eq(games.id, this.room.id));
  if (gameRecord?.state) {
    const snapshot = JSON.parse(gameRecord.state);
    this.actor = createActor(brassMachine, { snapshot });
  } else {
    this.actor = createActor(brassMachine);
  }
  this.actor.start();
}
```

### Pattern 3: Filtered State Projection (Allowlist)

**What:** Build filtered state from scratch (allowlist) rather than spreading full state and deleting sensitive fields (denylist).

**When:** Every state broadcast to a player.

**Why:** Prevents accidental information leaks when new fields are added to game state. Already partially implemented in stateFilter.ts but should be hardened.

### Pattern 4: Component-Per-Action UI (Wizards)

**What:** Each game action type gets its own wizard component with step-by-step selection.

**When:** Building action UI.

```
ActionPanel
  +-- BuildWizard (card -> location -> industry -> confirm)
  +-- NetworkWizard (card -> link(s) -> confirm)
  +-- DevelopWizard (industry type -> confirm)
  +-- SellWizard (industry -> merchant -> confirm)
  +-- LoanWizard (confirm)
  +-- ScoutWizard (discard selection -> confirm)
  +-- PassWizard (card selection -> confirm)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Game Logic

**What:** Running XState validation or game rules on the client.
**Why bad:** Two sources of truth. State desync. Cheating vectors.
**Instead:** Server-authoritative. Client is a dumb renderer.

### Anti-Pattern 2: Database as Message Bus

**What:** Using PostgreSQL polling to communicate between players (current approach).
**Why bad:** 3-second latency. DB load scales with players * poll frequency. Wastes resources.
**Instead:** WebSocket via PartyKit for real-time. Database for persistence only.

### Anti-Pattern 3: Shared Process for All Games

**What:** One Socket.io server handling all games in the same process.
**Why bad:** No isolation. One game crash affects all. Memory grows linearly.
**Instead:** PartyKit rooms provide process-level isolation per game.

### Anti-Pattern 4: Bundling PartyKit into Next.js

**What:** Running PartyKit server code inside Next.js custom server.
**Why bad:** Loses Vercel deployment. Breaks serverless. PartyKit needs Cloudflare.
**Instead:** Two separate deployments. Share code (types, schemas), deploy independently.

### Anti-Pattern 5: Real-Time Lobby

**What:** Using WebSocket for the lobby to show games appearing in real-time.
**Why bad:** Over-engineering. Games are created every few minutes. Server-rendered pages are sufficient.
**Instead:** Server Components with revalidation. Refresh button if needed.

## Database Schema Evolution

The current schema needs expansion for lobby and auth:

```sql
-- better-auth tables (auto-generated by CLI)
user (id, name, email, emailVerified, image, createdAt, updatedAt, isAnonymous)
session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
account (id, accountId, providerId, userId, ...)

-- Games table (MODIFIED)
games (
  id UUID PRIMARY KEY,
  name TEXT,                        -- NEW: game display name
  max_players INTEGER DEFAULT 2,    -- NEW: 2/3/4
  host_user_id UUID REFERENCES user, -- NEW
  status TEXT,                      -- existing, add 'lobby' status
  state TEXT,                       -- existing XState snapshot
  partykit_room_id TEXT,            -- NEW: PartyKit room identifier
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Game Players table (NEW - replaces player1Name/player2Name columns)
game_players (
  id UUID PRIMARY KEY,
  game_id UUID REFERENCES games,
  user_id UUID REFERENCES user,
  seat_index INTEGER,              -- 0-3
  player_name TEXT,
  color TEXT,
  joined_at TIMESTAMP,
  UNIQUE(game_id, seat_index),
  UNIQUE(game_id, user_id)
)
```

## Scalability Considerations

| Concern | At 10 games | At 100 games | At 1000 games |
|---------|-------------|--------------|---------------|
| PartyKit rooms | Trivial | Cloudflare free tier | May need paid plan (~$5/mo) |
| WebSocket connections | 40 | 400 | 4000 (Cloudflare handles millions) |
| DB writes | ~300/hr | ~3000/hr | Batch writes or write less frequently |
| State serialization | Negligible | Negligible | Monitor payload size |

For a personal board game project, 10 concurrent games is realistic. The architecture handles 100x without changes.

## Suggested Build Order

Based on component dependencies:

1. **PartyKit setup + DB schema migration** -- Foundation. Everything depends on this.
2. **better-auth integration** -- Auth needed for lobby. Low complexity.
3. **Lobby system** -- Create/browse/join games. Uses auth + DB schema.
4. **Game board SVG** -- Biggest UI effort. Independent of auth/lobby.
5. **Action wizard UIs** -- Depends on board visualization.
6. **End-game and polish** -- Scoring, notifications, player count expansion.

Items 3 and 4 can proceed in parallel.

## Sources

- [PartyKit Documentation](https://docs.partykit.io/)
- [PartyKit Server API](https://docs.partykit.io/reference/partyserver-api/)
- [PartyKit + Stately/XState Integration](https://blog.partykit.io/posts/partykit-orchestrates-stately/)
- [Multiplayer XState with Durable Objects](https://www.astahmer.dev/posts/multiplayer-state-machine-with-durable-objects)
- [PartyKit Game Starter (Next.js)](https://docs.partykit.io/examples/starter-kits/game-starter-nextjs-redux/)
- [better-auth Next.js Integration](https://better-auth.com/docs/integrations/next)
- [Next.js WebSocket Discussion](https://github.com/vercel/next.js/discussions/14950)
- [boardgame.io Lobby API](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Lobby.md)

---

*Architecture research: 2026-03-21 (updated for PartyKit + better-auth)*
