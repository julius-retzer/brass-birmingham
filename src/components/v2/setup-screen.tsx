'use client'

// The company charter — local hotseat setup, opening an online table, or
// founding a company against server-driven AI opponents.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { AI_TIERS, type AiTierId } from '~/server/ai/types'
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'

const COLORS: Player['color'][] = ['red', 'blue', 'green', 'yellow']
const CHARACTERS: Player['character'][] = [
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
  'Richard Arkwright',
]
const DEFAULT_NAMES = ['Eliza', 'Isambard', 'George', 'Richard']

const TIER_ORDER: AiTierId[] = [
  'clerk',
  'apprentice',
  'foreman',
  'magnate',
  'ironmaster',
]

export type SetupPlayer = Omit<
  Player,
  'hand' | 'links' | 'industries' | 'incomeSpace'
>

export function SetupScreen({
  onStart,
}: {
  onStart: (players: SetupPlayer[]) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'local' | 'online' | 'ai'>('local')
  const [count, setCount] = useState(3)
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES)
  // Default rival: haiku — fast and nearly as cheap as the budget tier
  // (the Clerk reasons for ~a minute per decision).
  const [tiers, setTiers] = useState<AiTierId[]>([
    'apprentice',
    'apprentice',
    'apprentice',
  ])
  const [creating, setCreating] = useState(false)

  const createOnline = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/mp/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: names[0]?.trim() || DEFAULT_NAMES[0],
          playerCount: count,
          ...(mode === 'ai' ? { opponents: tiers.slice(0, count - 1) } : {}),
        }),
      })
      const body = (await res.json()) as {
        token: string
        seatId: number
        seatSecret: string
        error?: string
      }
      if (!res.ok) throw new Error(body.error ?? 'Could not open the table')
      localStorage.setItem(
        `bb-mp-${body.token}`,
        JSON.stringify({ seatId: body.seatId, seatSecret: body.seatSecret }),
      )
      router.push(`/g/${body.token}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the table')
      setCreating(false)
    }
  }

  const start = () => {
    onStart(
      Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        name: names[i]?.trim() || DEFAULT_NAMES[i]!,
        color: COLORS[i]!,
        character: CHARACTERS[i]!,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as Player['industryTilesOnMat'],
      })),
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="bb2-rise flex flex-col items-center gap-1 text-center">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          Birmingham · 1770
        </span>
        <h1
          className="bb2-display text-7xl font-black tracking-wide"
          style={{ color: 'var(--bb-parchment-bright)' }}
        >
          BRASS
        </h1>
        <p
          className="bb2-display text-lg italic"
          style={{ color: 'rgba(231,215,177,.65)' }}
        >
          The Ironmaster&rsquo;s Atlas — pass one device between players
        </p>
      </div>

      <div
        className="bb2-panel bb2-rise flex w-full max-w-md flex-col gap-5 p-6"
        style={{ animationDelay: '0.12s' }}
      >
        <span className="bb2-panel-title">Company charter</span>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="bb2-option justify-center py-2"
            data-selected={mode === 'local'}
            data-testid="mode-local"
            onClick={() => setMode('local')}
          >
            <span className="text-[11.5px] font-bold uppercase tracking-[0.14em]">
              One device
            </span>
          </button>
          <button
            type="button"
            className="bb2-option justify-center py-2"
            data-selected={mode === 'online'}
            data-testid="mode-online"
            onClick={() => setMode('online')}
          >
            <span className="text-[11.5px] font-bold uppercase tracking-[0.14em]">
              Play online
            </span>
          </button>
          <button
            type="button"
            className="bb2-option justify-center py-2"
            data-selected={mode === 'ai'}
            data-testid="mode-ai"
            onClick={() => setMode('ai')}
          >
            <span className="text-[11.5px] font-bold uppercase tracking-[0.14em]">
              Versus AI
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="bb2-stat-label">Industrialists at the table</span>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className="bb2-option justify-center py-2.5"
                data-selected={count === n}
                onClick={() => setCount(n)}
              >
                <span className="bb2-display text-lg font-bold">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: mode === 'local' ? count : 1 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="h-8 w-2 flex-none rounded-full"
                style={{ background: PLAYER_FILL[COLORS[i]!] }}
              />
              <input
                value={names[i] ?? ''}
                onChange={(e) =>
                  setNames((prev) => {
                    const next = [...prev]
                    next[i] = e.target.value
                    return next
                  })
                }
                placeholder={mode === 'local' ? DEFAULT_NAMES[i] : 'Your name'}
                data-testid={`name-${i}`}
                className="w-full rounded border bg-transparent px-3 py-2 text-[14px] outline-none transition-colors"
                style={{
                  borderColor: 'rgba(231,215,177,.2)',
                  color: 'var(--bb-parchment-bright)',
                }}
              />
              <span
                className="w-28 flex-none text-right text-[10px] uppercase tracking-[0.12em]"
                style={{ color: 'rgba(231,215,177,.4)' }}
              >
                {CHARACTERS[i]}
              </span>
            </div>
          ))}
          {mode === 'ai' &&
            Array.from({ length: count - 1 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="h-8 w-2 flex-none rounded-full"
                  style={{ background: PLAYER_FILL[COLORS[i + 1]!] }}
                />
                <div className="grid w-full grid-cols-5 gap-1">
                  {TIER_ORDER.map((tierId) => {
                    const tier = AI_TIERS[tierId]
                    return (
                      <button
                        key={tierId}
                        type="button"
                        className="bb2-option flex-col justify-center gap-0.5 px-1 py-1.5"
                        data-selected={tiers[i] === tierId}
                        data-testid={`ai-tier-${i}-${tierId}`}
                        title={`${tier.label} — ${tier.model}`}
                        onClick={() =>
                          setTiers((prev) => {
                            const next = [...prev]
                            next[i] = tierId
                            return next
                          })
                        }
                      >
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em]">
                          {tier.difficulty}
                        </span>
                        <span
                          className="text-[9px]"
                          style={{ color: 'rgba(231,215,177,.55)' }}
                        >
                          {tier.label.replace('The ', '')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          {mode === 'online' && (
            <p
              className="text-[12px]"
              style={{ color: 'rgba(231,215,177,.5)' }}
            >
              You&rsquo;ll get a link to share — the other{' '}
              {count - 1 === 1 ? 'player claims' : 'players claim'} their seats
              by opening it. No accounts, ever.
            </p>
          )}
          {mode === 'ai' && (
            <p
              className="text-[12px]"
              style={{ color: 'rgba(231,215,177,.5)' }}
            >
              Each AI rival is a Claude model — harder rivals think with
              stronger models. You&rsquo;ll see a one-line rationale for every
              move they make.
            </p>
          )}
        </div>

        {mode === 'local' ? (
          <button type="button" className="bb2-confirm" onClick={start}>
            Open the ledger
          </button>
        ) : (
          <button
            type="button"
            className="bb2-confirm"
            data-testid="create-online"
            disabled={creating}
            onClick={() => void createOnline()}
          >
            {creating
              ? 'Opening the table…'
              : mode === 'ai'
                ? 'Found the company'
                : 'Open an online table'}
          </button>
        )}
      </div>

      {/* CC BY 3.0 attribution for the game-icons.net glyphs */}
      <p
        className="text-center text-[10.5px]"
        style={{ color: 'rgba(231,215,177,.38)' }}
      >
        Industry icons by Delapouite &amp; Lorc —{' '}
        <a
          href="https://game-icons.net"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          game-icons.net
        </a>{' '}
        (CC BY 3.0)
      </p>
    </div>
  )
}
