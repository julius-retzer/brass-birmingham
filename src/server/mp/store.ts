// Durable, dependency-free game store for networked multiplayer.
//
// Why file-backed JSON (and not the repo's Drizzle/SQLite scaffold): the DB
// schema is a commented-out template, dev runs with SKIP_ENV_VALIDATION and
// no DATABASE_URL, and multiplayer needs exactly one access pattern — load/
// save a single record by unguessable token. One JSON file per game with
// atomic tmp+rename writes gives durability across dev-server restarts with
// zero env coupling; migrating to SQLite later is a drop-in swap of this
// module.
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface SeatRecord {
  seatId: number
  name: string | null
  color: string
  character: string
  claimed: boolean
  /** sha256 of the seat secret; the plain secret only ever goes to its owner */
  secretHash: string | null
}

export interface GameRecord {
  token: string
  phase: 'lobby' | 'playing' | 'over'
  createdAt: string
  updatedAt: string
  version: number
  seats: SeatRecord[]
  /** persisted XState snapshot of the authoritative engine (null in lobby) */
  snapshot: unknown | null
}

const STORE_DIR = path.join(process.cwd(), '.bb-games')

/** Games untouched for this long are garbage-collected. */
export const GAME_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/

function fileFor(token: string): string {
  if (!TOKEN_RE.test(token)) throw new Error('Malformed game token')
  return path.join(STORE_DIR, `${token}.json`)
}

export async function loadGame(token: string): Promise<GameRecord | null> {
  try {
    const raw = await fs.readFile(fileFor(token), 'utf8')
    return JSON.parse(raw) as GameRecord
  } catch {
    return null
  }
}

export async function saveGame(game: GameRecord): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true })
  const target = fileFor(game.token)
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(game), 'utf8')
  await fs.rename(tmp, target) // atomic on POSIX
}

let lastSweep = 0

/** Lazily delete stale games; throttled so it costs nothing per-request. */
export async function sweepStaleGames(now = Date.now()): Promise<void> {
  if (now - lastSweep < 60 * 60 * 1000) return
  lastSweep = now
  let entries: string[]
  try {
    entries = await fs.readdir(STORE_DIR)
  } catch {
    return
  }
  await Promise.all(
    entries
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        const p = path.join(STORE_DIR, f)
        try {
          const stat = await fs.stat(p)
          if (now - stat.mtimeMs > GAME_TTL_MS) await fs.unlink(p)
        } catch {
          // raced with another sweep — fine
        }
      }),
  )
}
