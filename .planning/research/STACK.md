# Technology Stack

**Project:** Brass Birmingham Online - Multiplayer & Lobby Milestone
**Researched:** 2026-03-21

## Existing Stack (No Changes)

These are already in place and will not be migrated:

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.4.6 | App framework with App Router |
| React | 18.3.1 | UI rendering |
| XState | 5.19.2 | Game state machine (server-side) |
| Tailwind CSS | 3.4.3 | Styling |
| Shadcn UI | 0.9.4 | Component library |
| Drizzle ORM | 0.44.4 | Database ORM |
| Neon PostgreSQL | - | Database |
| Vitest | 3.0.6 | Testing |
| TypeScript | 5.5.3 | Language |

## New Stack Additions

### Real-Time Communication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PartyKit | 0.0.115 | Real-time multiplayer rooms | Purpose-built for multiplayer. Each game = a "party" (room) with server-side state. Runs XState on edge. Free on Cloudflare Workers. Native WebSocket management with reconnection. | HIGH |
| partysocket | 1.1.6 | Client-side WebSocket connection | Official PartyKit client. Auto-reconnect, TypeScript-native. Drop-in for polling replacement. | HIGH |

**Why PartyKit over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Socket.io + custom server | Requires custom Node.js server, loses Vercel deployment, loses serverless functions, loses Automatic Static Optimization. PartyKit runs separately and integrates cleanly. |
| Liveblocks | Designed for collaborative docs (CRDT-focused), not game state machines. Expensive at scale. Overkill for turn-based board games. |
| Raw WebSockets | No reconnection handling, no room management, no state persistence. You'd rebuild what PartyKit gives you. |
| SSE (Server-Sent Events) | Unidirectional only. Board games need client-to-server action submission AND server-to-client state broadcast. |
| Keep polling (3s interval) | Functional but poor UX. 0-3 second delay on every opponent action. WebSockets give instant updates. Polling also wastes server resources between turns. |

**Architecture fit:** PartyKit's "room = stateful server" model maps perfectly to Brass Birmingham. Each game is a PartyKit room. The XState machine runs inside the party server. Client sends actions via WebSocket, server validates with XState, broadcasts new state to all players. This replaces the current polling + server actions model.

**Deployment:** PartyKit deploys to your own Cloudflare account (free tier). Next.js stays on Vercel. The two communicate via WebSocket connections from the browser. No custom server needed for Next.js.

### Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| better-auth | 1.5.5 | Authentication framework | Built-in anonymous/guest plugin (exact project requirement). Drizzle ORM adapter for PostgreSQL. Plugin architecture for email/password later. Modern, actively maintained. | HIGH |

**Why better-auth over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Auth.js v5 (NextAuth) | No native anonymous/guest auth. Would require custom session workaround. Guest-first is a core requirement. |
| Lucia Auth | Deprecated as of March 2025. Now educational resources only. Do not use for new projects. |
| Custom JWT sessions | Reinventing the wheel. better-auth handles sessions, CSRF, cookie management, and gives you guest-to-account linking for free. |
| Clerk / Auth0 | External SaaS dependency. Overkill for guest + email/password. Adds latency and cost. |

**Guest auth flow with better-auth:**
1. User visits site -- anonymous plugin creates a session automatically
2. User can create/join games immediately as a guest
3. Optionally link a real account later (email/password) -- anonymous record merges
4. Plugin handles the entire lifecycle including cleanup of orphaned anonymous accounts

**Key better-auth features used:**
- `anonymous` plugin -- guest sessions without PII
- Drizzle adapter -- reuses existing Neon PostgreSQL connection
- Email/password plugin -- optional account upgrade
- Session management -- cookie-based, server-validated

### Game Board Visualization

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| SVG (native React) | - | Board rendering | Brass Birmingham's board is a static map with interactive locations. SVG is ideal: scalable, styleable with CSS/Tailwind, accessible, no canvas complexity. Each location/link is a clickable SVG element. | MEDIUM |

**Why SVG over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| HTML Canvas / Konva.js | Imperative API. Loses React component model. No CSS styling. Harder to make accessible. Overkill for a board that doesn't animate continuously. |
| Pixi.js (WebGL) | Game engine for 60fps rendering. Brass Birmingham is turn-based with no real-time animation. Massive unnecessary dependency. |
| @xyflow/react | Already in the project. Designed for node-graph UIs, not board game maps. Wrong abstraction -- locations aren't "nodes" in a flowchart sense. |
| boardgame.io | Full game framework. Would conflict with existing XState state machine. Opinionated about state management. Can't adopt partially. |

**SVG approach for Brass Birmingham:**
- Board background as a single SVG image (the map)
- Interactive overlay: SVG `<circle>`, `<rect>`, `<path>` elements positioned at location coordinates
- Placed industries rendered as SVG groups on top of locations
- Links rendered as SVG lines/paths between connected locations
- Hover/click states via React event handlers + Tailwind classes on SVG elements
- Zoom/pan with CSS transforms (no library needed for desktop-first)

**Confidence note (MEDIUM):** SVG works well for boards with ~30 locations and ~40 links. If performance becomes an issue with all elements rendered, consider `react-konva` as a fallback. But Brass Birmingham's board complexity is well within SVG's comfort zone.

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| zod | 3.24.2 (existing) | Action validation schemas | Validate player actions before sending to PartyKit server | HIGH |
| sonner | 2.0.1 (existing) | Toast notifications | Game events (your turn, opponent passed, etc.) | HIGH |
| nanoid | 5.x | Short unique IDs | Game IDs, player session IDs for URLs | HIGH |

### NOT Adding (Explicit Exclusions)

| Library | Why Not |
|---------|---------|
| Redux / Zustand | XState already manages game state. Adding another state manager creates confusion about source of truth. |
| tRPC | PartyKit handles the real-time communication layer. Server actions handle lobby CRUD. tRPC adds complexity with no benefit. |
| Pusher / Ably | Paid pub/sub services. PartyKit gives the same capability for free on Cloudflare Workers. |
| Prisma | Drizzle ORM is already in place and working. No reason to switch. |
| next-auth | better-auth is more modern and has the anonymous plugin we need. |

## Installation

```bash
# Real-time multiplayer
pnpm add partykit partysocket

# Authentication
pnpm add better-auth

# Utilities (if not already present)
pnpm add nanoid
```

## Configuration Additions

### Environment Variables (new)

```env
# PartyKit
NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999  # dev
# NEXT_PUBLIC_PARTYKIT_HOST=your-project.your-account.partykit.dev  # prod

# Better Auth
BETTER_AUTH_SECRET=<random-secret>
BETTER_AUTH_URL=http://localhost:3000  # dev
```

### New Config Files

- `partykit.json` -- PartyKit server configuration (entry point, port, Cloudflare deployment)
- `src/server/auth.ts` -- better-auth server configuration with Drizzle adapter + anonymous plugin
- `src/lib/auth-client.ts` -- better-auth client instance

### Database Schema Additions

better-auth requires these tables (auto-generated by CLI):
- `user` -- user records (including anonymous users)
- `session` -- active sessions
- `account` -- linked auth methods

## Architecture Impact

### Before (Current)
```
Browser --> Next.js Server Actions --> DB (read/write game state)
Browser <-- Polling (3s) <-- Next.js API Route (read game state)
```

### After (With PartyKit)
```
Browser <--> PartyKit Room (WebSocket, per-game) <--> XState Machine (in-memory)
                                                  --> DB (persist on state change)
Browser --> Next.js Server Actions (lobby CRUD, auth only)
```

**Key shift:** Game state lives in PartyKit rooms during active play. XState machine runs inside the PartyKit server class. Database is used for persistence (game save/load), not as the real-time communication channel.

## Sources

- [PartyKit Documentation](https://docs.partykit.io/)
- [PartyKit + Stately/XState Integration](https://blog.partykit.io/posts/partykit-orchestrates-stately/)
- [PartyKit on Cloudflare (acquisition, free tier)](https://blog.cloudflare.com/cloudflare-acquires-partykit/)
- [Better Auth Official Docs](https://better-auth.com/)
- [Better Auth Anonymous Plugin](https://better-auth.com/docs/plugins/anonymous)
- [Better Auth Next.js Integration](https://better-auth.com/docs/integrations/next)
- [better-auth npm](https://www.npmjs.com/package/better-auth) -- v1.5.5
- [partykit npm](https://www.npmjs.com/package/partykit) -- v0.0.115
- [partysocket npm](https://www.npmjs.com/package/partysocket) -- v1.1.6
- [Multiplayer XState with PartyKit](https://github.com/astahmer/multiplayer-xstate)
- [Socket.IO with Next.js](https://socket.io/how-to/use-with-nextjs) -- reviewed and rejected
