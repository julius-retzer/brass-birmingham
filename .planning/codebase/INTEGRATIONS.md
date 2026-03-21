# External Integrations

**Analysis Date:** 2026-03-21

## APIs & External Services

**Not Detected:**
- No third-party REST/GraphQL APIs currently integrated
- No payment processing (Stripe, etc.)
- No third-party analytics
- No messaging/push notification services
- No email services

## Data Storage

**Database:**
- Provider: Neon DB (PostgreSQL serverless)
  - Connection: Environment variable `DATABASE_URL`
  - Client: @neondatabase/serverless 1.0.1
  - ORM: Drizzle ORM 0.44.4
  - Schema location: `src/server/db/schema.ts`
  - Tables defined: `games` (with state, players, timestamps)

**Alternate Provider (Commented Out):**
- Turso (SQLite via @libsql/client 0.9.0)
- Currently disabled in `src/server/db/index.ts`

**File Storage:**
- Local filesystem only - No cloud storage configured
- No S3, GCS, or file upload services

**Caching:**
- None configured - No Redis, Memcached, or HTTP caching layers
- Next.js built-in caching via revalidatePath

## Authentication & Identity

**Auth Provider:**
- Custom implementation - No third-party auth (Auth0, Clerk, NextAuth, etc.)
- Player identification via game URL and name parameter
- Query parameter based: `?player=2&name={playerName}` in `src/app/actions.ts`

**Current Approach:**
- Simple player name validation (max 50 chars)
- No session management
- No user accounts or persistent identity
- Game-scoped authentication only

## Monitoring & Observability

**Error Tracking:**
- Not configured - No Sentry, LogRocket, or similar
- Console error logging present in code

**Logs:**
- Console logging only via `console.error` and custom `debugLog` function
- No external log aggregation
- No structured logging framework

**Debugging:**
- @statelyai/inspect 0.4.0 available for XState visualization
- State machine inspection in development

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from Next.js 15, standard deployment platform)
- Not explicitly configured in repo
- Environment variables configured via provider

**CI Pipeline:**
- Not configured in repository
- No GitHub Actions, GitLab CI, or other pipelines detected

**Build System:**
- Next.js 15 production builds
- Turbo for build optimization
- drizzle-kit for database migrations

## Environment Configuration

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (server-side only)
- `NODE_ENV` - Node environment (development/test/production)

**Optional Variables:**
- None currently configured

**No Public Environment Variables:**
- No `NEXT_PUBLIC_*` variables defined
- All configuration is server-side

**Secrets Location:**
- `.env` file (git-ignored)
- Example template: `.env.example`
- Validated via `@t3-oss/env-nextjs` before app initialization

## Webhooks & Callbacks

**Incoming Webhooks:**
- Not implemented - No webhook endpoints

**Outgoing Webhooks:**
- Not implemented - No outbound integrations

**API Endpoints:**
- `GET /api/game/[gameId]/status` - Game state polling endpoint
  - Returns: player index, game status, player names, last update indicator
  - Location: `src/app/api/game/[gameId]/status/route.ts`
  - No authentication required (game-scoped)
  - Cache control: no-store (disables caching)

**Test Endpoints (Development Only):**
- `GET /api/test` - Basic test endpoint
- `GET /api/test-neon` - Neon database connection test
- Location: `src/app/api/test/route.ts`, `src/app/api/test-neon/route.ts`

## Data Flow & Integrations

**Server Actions:**
- `createGameAction` - Create new game instance in database
  - Location: `src/app/actions.ts`
  - Calls: `gameManager.createGame()`
  - Database interaction: Games table insert

- `joinGameAction` - Join existing game
  - Location: `src/app/actions.ts`
  - Calls: `gameManager.joinGame()`
  - Database interaction: Games table update (add player 2)

- `sendEventAction` - Send game event/action
  - Location: `src/app/actions.ts`
  - Calls: `gameManager.sendGameEvent()`
  - Database interaction: Games table update (state mutations)

**Game State Management:**
- XState machines process actions and validate game logic
- Database persistence in `src/server/gameManager.ts`
- State serialized/deserialized from `games.state` column (JSON text)
- Location: `src/server/gameManager.ts`

## Third-Party Dependencies Summary

**No External Service Dependencies:**
- All integrations are internal or database-only
- Zero external APIs in current implementation
- No SaaS dependencies
- Minimal surface area for external failures

---

*Integration audit: 2026-03-21*
