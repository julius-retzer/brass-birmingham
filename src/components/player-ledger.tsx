'use client'

// The player ledger — the digital equivalent of the physical player mat.
// Opened from a player's rail card or the dock's OpenMatButton.
//
// Layout mirrors the real player board: one horizontal track per industry,
// tiles laid left→right by level (lowest = next out) using the board's own
// tile art. The per-tile facts (cost, resources, VP, income, links, beer,
// develop) live in a docked readout that follows the highlighted tile —
// progressive disclosure keeps the mat a clean, board-faithful overview.
import { useEffect, useMemo, useState } from 'react'
import { type IndustryType } from '~/data/cards'
import {
  canBuildTileInEra,
  getBuildableTileInEra,
  type IndustryTile,
} from '~/data/industryTiles'
import { type Player } from '~/store/gameStore'
import { INDUSTRY_FILL, INDUSTRY_INK, PLAYER_FILL } from './board/board-map'
import {
  BeerSteinIcon,
  CanalIcon,
  CoalIcon,
  DevelopIcon,
  IncomeIcon,
  IndustryChip,
  IndustryFragment,
  IronIcon,
  LaurelIcon,
  MatIcon,
  RailIcon,
} from './icons'
import { CityName } from './locate'

const INDUSTRY_TYPES: IndustryType[] = [
  'cotton',
  'coal',
  'iron',
  'manufacturer',
  'pottery',
  'brewery',
]

const LABEL: Record<IndustryType, string> = {
  cotton: 'Cotton Mill',
  coal: 'Coal Mine',
  iron: 'Iron Works',
  manufacturer: 'Manufacturer',
  pottery: 'Pottery',
  brewery: 'Brewery',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

// Produced-cube fills, matching the board tile face (board-map.tsx BuiltTile).
const PRODUCED_CUBE_FILL = {
  coal: '#1d1b18',
  iron: '#d07135',
  beer: '#e8bc4f',
} as const

// The one resource a tile YIELDS when built (only one is ever non-zero).
function producedOf(tile: IndustryTile) {
  if (tile.coalProduced > 0)
    return { kind: 'coal' as const, n: tile.coalProduced }
  if (tile.ironProduced > 0)
    return { kind: 'iron' as const, n: tile.ironProduced }
  if (tile.beerProduced > 0)
    return { kind: 'beer' as const, n: tile.beerProduced }
  return null
}

// The board tile face rendered on a 52-unit grid (mirrors BuiltTile's
// unflipped working side), scaled to `size`. Brass ring marks the next tile
// out of the mat.
function MatTileArt({
  type,
  tile,
  size = 48,
  next = false,
  barred = false,
}: {
  type: IndustryType
  tile: IndustryTile
  size?: number
  next?: boolean
  barred?: boolean
}) {
  const prod = producedOf(tile)
  const fill = INDUSTRY_FILL[type]
  const ink = INDUSTRY_INK[type]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      role="img"
      aria-label={`${LABEL[type]} ${ROMAN[tile.level] ?? tile.level}`}
      style={{
        display: 'block',
        opacity: barred ? 0.9 : 1,
        filter: next ? 'drop-shadow(0 0 5px rgba(230,189,99,.55))' : undefined,
      }}
    >
      <rect
        width="52"
        height="52"
        rx="5"
        fill={fill}
        stroke="#16130f"
        strokeWidth="1.2"
      />
      <g transform="translate(5, 4)" style={{ color: ink }}>
        <IndustryFragment type={type} />
      </g>
      <text
        x="47"
        y="13"
        textAnchor="end"
        fill={ink}
        style={{
          fontFamily: 'var(--bb-display)',
          fontWeight: 700,
          fontSize: 11.5,
        }}
      >
        {ROMAN[tile.level] ?? tile.level}
      </text>
      {/* Resource cubes ride the right edge, starting BELOW the level
          numeral (baseline y=13) so the two never overlap at any width. */}
      {prod &&
        prod.n > 0 &&
        (prod.n <= 5 ? (
          Array.from({ length: prod.n }, (_, i) => (
            <rect
              key={i}
              x="41"
              y={17 + i * 6.6}
              width="6.2"
              height="6.2"
              rx="1"
              fill={PRODUCED_CUBE_FILL[prod.kind]}
              stroke="#f2e6c8"
              strokeWidth="1"
            />
          ))
        ) : (
          <g>
            <rect
              x="41"
              y="17"
              width="6.2"
              height="6.2"
              rx="1"
              fill={PRODUCED_CUBE_FILL[prod.kind]}
              stroke="#f2e6c8"
              strokeWidth="1"
            />
            <text
              x="44.1"
              y="31"
              textAnchor="middle"
              fill="#f2e6c8"
              stroke="#16130f"
              strokeWidth="0.5"
              paintOrder="stroke"
              style={{
                fontFamily: 'var(--bb-display)',
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {`×${prod.n}`}
            </text>
          </g>
        ))}
      {next && (
        <rect
          x="0.9"
          y="0.9"
          width="50.2"
          height="50.2"
          rx="5"
          fill="none"
          stroke="#e6bd63"
          strokeWidth="2"
        />
      )}
    </svg>
  )
}

// A small coal/iron square, matching the "to build" legend.
function BuildSquare({ kind }: { kind: 'coal' | 'iron' }) {
  return (
    <span
      className="inline-block h-[8px] w-[8px] rounded-[2px]"
      style={
        kind === 'coal'
          ? { background: '#55504a', border: '1px solid #8d867c' }
          : { background: '#c2632f', border: '1px solid #7c3d1c' }
      }
    />
  )
}

function LinkIcons({ n }: { n: number }) {
  if (n === 0) return <span style={{ opacity: 0.5 }}>—</span>
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <svg key={k} width="15" height="8" viewBox="0 0 15 8" aria-hidden>
          <circle cx="2" cy="4" r="1.6" fill="currentColor" />
          <line
            x1="3.6"
            y1="4"
            x2="11"
            y2="4"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="12.6" cy="4" r="1.6" fill="currentColor" />
        </svg>
      ))}
    </>
  )
}

// One slot in an industry track: a tile, or an empty placeholder for a
// depleted level. Tapping/hovering a tile drives the docked readout.
function TrackSlot({
  entry,
  selected,
  onSelect,
}: {
  entry: SlotEntry
  selected: boolean
  onSelect: () => void
}) {
  if (entry.kind === 'empty') {
    return (
      <span
        aria-hidden
        title={`no level ${entry.level} left`}
        className="inline-block h-12 w-12 rounded-md"
        style={{
          border: '1px dashed rgba(231,215,177,.16)',
          background: 'rgba(0,0,0,.18)',
        }}
      />
    )
  }
  const { tile, count, next, barred } = entry
  return (
    <button
      type="button"
      data-testid={`mat-slot-${tile.id}`}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      className="relative shrink-0 rounded-md transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus:outline-none"
      style={{ opacity: barred ? 0.42 : 1 }}
    >
      <MatTileArt
        type={tile.type}
        tile={tile}
        size={48}
        next={next}
        barred={barred}
      />
      {count > 1 && (
        <span
          className="absolute -bottom-1.5 -right-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full px-1 text-[9.5px] font-bold leading-none"
          style={{
            background: '#231e17',
            border: '1px solid var(--bb-brass-dim)',
            color: 'var(--bb-brass-bright)',
          }}
        >
          ×{count}
        </span>
      )}
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-lg"
          style={{
            inset: -3,
            border: '1.5px solid var(--bb-brass-bright)',
            boxShadow: '0 0 12px rgba(230,189,99,.4)',
          }}
        />
      )}
    </button>
  )
}

interface TileSlot {
  kind: 'tile'
  level: number
  tile: IndustryTile
  count: number
  next: boolean
  barred: boolean
  blocking: boolean
}
type SlotEntry = TileSlot | { kind: 'empty'; level: number }

export function PlayerLedger({
  player,
  era,
  isCurrent,
  onClose,
}: {
  player: Player
  era: 'canal' | 'rail'
  isCurrent: boolean
  onClose: () => void
}) {
  // Escape closes the ledger — promised by the a11y note on the backdrop.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Each industry as a track: a slot per level (empty when depleted), the
  // lowest remaining marked `next` (buildable this era) or `blocking` (the
  // lowest is barred, so it must be Developed away first).
  const tracks = useMemo(
    () =>
      INDUSTRY_TYPES.map((type) => {
        const rows = [...(player.industryTilesOnMat[type] ?? [])].sort(
          (a, b) => a.tile.level - b.tile.level,
        )
        // The one tile in play, via the shared helper so this highlight
        // can't drift from the build/develop guards (null when barred).
        const buildableNext = getBuildableTileInEra(rows, era)
        const lowestLevel = rows.find((r) => r.quantityAvailable > 0)?.tile
          .level
        const slots: SlotEntry[] = rows.map((r) => {
          if (r.quantityAvailable === 0)
            return { kind: 'empty', level: r.tile.level }
          const isLowest = r.tile.level === lowestLevel
          return {
            kind: 'tile',
            level: r.tile.level,
            tile: r.tile,
            count: r.quantityAvailable,
            next: isLowest && buildableNext !== null,
            barred: !canBuildTileInEra(r.tile, era),
            blocking: isLowest && buildableNext === null,
          }
        })
        const remaining = rows.reduce((a, r) => a + r.quantityAvailable, 0)
        return { type, slots, remaining }
      }),
    [player.industryTilesOnMat, era],
  )

  // All selectable tiles, flat, in track/level order — the readout reads
  // from this and defaults to the first next-out tile.
  const flatTiles = useMemo(
    () =>
      tracks.flatMap((tr) =>
        tr.slots
          .filter((s): s is TileSlot => s.kind === 'tile')
          .map((s) => ({ ...s, industry: tr.type })),
      ),
    [tracks],
  )
  const defaultKey =
    (flatTiles.find((f) => f.next) ?? flatTiles[0])?.tile.id ?? null

  const [selectedId, setSelectedId] = useState<string | null>(defaultKey)
  // Keep the readout valid if the mat changed underneath (e.g. reopened for
  // another player): fall back to the current default.
  const selected =
    flatTiles.find((f) => f.tile.id === selectedId) ??
    flatTiles.find((f) => f.tile.id === defaultKey) ??
    null

  return (
    <div
      className="bb2-curtain fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(10, 8, 6, 0.82)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bb2-panel bb2-rise flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden p-5"
        role="dialog"
        aria-label={`${player.name}'s ledger`}
      >
        {/* header */}
        <div className="flex items-center gap-3 pb-4">
          <span
            className="h-9 w-2 rounded-full"
            style={{ background: PLAYER_FILL[player.color] }}
          />
          <div className="flex flex-col">
            <span
              className="bb2-display text-[24px] font-black leading-none"
              style={{ color: 'var(--bb-parchment-bright)' }}
            >
              {player.name}
              {isCurrent && (
                <span
                  className="ml-3 align-middle text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: 'var(--bb-brass-bright)' }}
                >
                  · to act ·
                </span>
              )}
            </span>
            <span
              className="text-[12px] uppercase tracking-[0.18em]"
              style={{ color: 'rgba(231,215,177,.45)' }}
            >
              {player.character}
            </span>
          </div>
          <button
            type="button"
            className="bb2-ghost-btn ml-auto"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <hr className="bb2-rule" />

        {/* Scrollable modal body — the body scrolls inside the modal rather
            than the page or the overlay. */}
        <div className="-mr-2 flex-1 overflow-y-auto pr-2">
          {/* tile mat */}
          <div className="pt-4">
            <span className="bb2-panel-title">Tiles on the mat</span>
            <p
              className="pt-1.5 text-[12.5px]"
              style={{ color: 'rgba(231,215,177,.5)' }}
            >
              Tiles build lowest level first — the brass-ringed tile is the next
              one out. Hover or tap any tile to read its full stats below.
              Greyed tiles cannot be built in the {era} era.
            </p>

            {/* industry tracks — one row each, tiles left→right by level.
                Slots scroll horizontally on narrow screens so nothing runs
                off-screen. */}
            <div className="flex flex-col gap-2 pt-3">
              {tracks.map((tr) => (
                <div
                  key={tr.type}
                  className="grid grid-cols-[110px_1fr] items-center gap-3 rounded-md px-2.5 py-2"
                  style={{
                    background:
                      'linear-gradient(180deg,rgba(255,240,200,.03),rgba(0,0,0,.12))',
                    border: '1px solid rgba(231,215,177,.07)',
                  }}
                >
                  <span
                    className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--bb-parchment)' }}
                  >
                    <IndustryChip type={tr.type} size={13} />
                    {LABEL[tr.type]}
                  </span>
                  <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-1">
                    {tr.slots.length === 0 ? (
                      <span
                        className="text-[12px] italic"
                        style={{ color: 'rgba(231,215,177,.35)' }}
                      >
                        None remaining
                      </span>
                    ) : (
                      tr.slots.map((slot) => (
                        <TrackSlot
                          key={`${tr.type}-${slot.level}`}
                          entry={slot}
                          selected={
                            slot.kind === 'tile' &&
                            selected?.tile.id === slot.tile.id
                          }
                          onSelect={() => {
                            if (slot.kind === 'tile')
                              setSelectedId(slot.tile.id)
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* docked readout — follows the highlighted tile */}
            {selected && <TileReadout slot={selected} era={era} />}
          </div>

          {/* board holdings */}
          <div className="grid gap-5 pt-6 sm:grid-cols-2">
            <div>
              <span className="bb2-panel-title">Works on the board</span>
              <div className="flex flex-col gap-1 pt-2">
                {player.industries.map((ind, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[13.5px]"
                    style={{ color: 'var(--bb-parchment)' }}
                  >
                    <IndustryChip type={ind.type} size={13} />
                    <span className="capitalize">
                      {LABEL[ind.type]} {ROMAN[ind.level] ?? ind.level}
                    </span>
                    <span style={{ color: 'rgba(231,215,177,.5)' }}>
                      at <CityName cityId={ind.location} />
                    </span>
                    {ind.flipped && (
                      <span
                        className="ml-auto text-[9.5px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: 'var(--bb-brass-bright)' }}
                      >
                        flipped
                      </span>
                    )}
                  </div>
                ))}
                {player.industries.length === 0 && (
                  <span
                    className="text-[12px] italic"
                    style={{ color: 'rgba(231,215,177,.35)' }}
                  >
                    Nothing built yet
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="bb2-panel-title">Routes claimed</span>
              <div className="flex flex-col gap-1 pt-2">
                {player.links.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[13.5px]"
                    style={{ color: 'var(--bb-parchment)' }}
                  >
                    {l.type === 'canal' ? (
                      <CanalIcon size={13} />
                    ) : (
                      <RailIcon size={13} />
                    )}
                    <CityName cityId={l.from} /> — <CityName cityId={l.to} />
                  </div>
                ))}
                {player.links.length === 0 && (
                  <span
                    className="text-[12px] italic"
                    style={{ color: 'rgba(231,215,177,.35)' }}
                  >
                    No routes yet
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// The docked readout for the highlighted tile — every fact sourced from the
// tile definition, never hardcoded.
function TileReadout({
  slot,
  era,
}: {
  slot: TileSlot
  era: 'canal' | 'rail'
}) {
  const { tile, count, next, barred, blocking } = slot
  const status = next
    ? 'Next out of the mat'
    : blocking
      ? era === 'rail'
        ? 'Canal-era tile — Develop to skip'
        : 'Rail-era tile — not yet buildable'
      : barred
        ? 'Not buildable this era'
        : 'Later build'
  const prod = producedOf(tile)
  // Lightbulb pottery tiles can only be removed by selling (rules p.6).
  const developable = !tile.hasLightbulbIcon

  return (
    <div
      data-testid="mat-readout"
      className="mt-3 rounded-md p-3.5"
      style={{
        border: '1px solid var(--bb-brass-hairline)',
        background: 'linear-gradient(170deg,#2c2417,var(--bb-iron-panel))',
        boxShadow: 'inset 0 1px 0 rgba(255,230,170,.08)',
      }}
    >
      <div className="flex items-center gap-3">
        <MatTileArt
          type={tile.type}
          tile={tile}
          size={52}
          next={next}
          barred={barred}
        />
        <div>
          <div
            className="bb2-display text-[18px] font-bold"
            style={{ color: 'var(--bb-parchment-bright)' }}
          >
            {LABEL[tile.type]} {ROMAN[tile.level] ?? tile.level}
          </div>
          <div
            className="text-[11px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--bb-brass-bright)' }}
          >
            {status}
            {count > 1 && ` · ${count} left`}
          </div>
        </div>
      </div>
      <div
        className="mt-3 grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))' }}
      >
        <ReadoutCell
          k="Cost"
          v={<span className="tabular-nums">£{tile.cost}</span>}
        />
        <ReadoutCell
          k="To build"
          v={
            tile.coalRequired > 0 || tile.ironRequired > 0 ? (
              <span className="flex items-center gap-1">
                {Array.from({ length: tile.coalRequired }, (_, k) => (
                  <BuildSquare key={`c${k}`} kind="coal" />
                ))}
                {Array.from({ length: tile.ironRequired }, (_, k) => (
                  <BuildSquare key={`i${k}`} kind="iron" />
                ))}
              </span>
            ) : (
              <span style={{ color: 'rgba(231,215,177,.55)' }}>none</span>
            )
          }
        />
        <ReadoutCell
          k="Victory pts"
          v={
            <span className="flex items-center gap-1">
              <LaurelIcon size={14} />
              {tile.victoryPoints}
            </span>
          }
        />
        <ReadoutCell
          k="Income"
          v={
            <span className="flex items-center gap-1">
              <IncomeIcon size={14} />+{tile.incomeAdvancement}
            </span>
          }
        />
        <ReadoutCell
          k="Link icons"
          v={<LinkIcons n={tile.linkScoringIcons} />}
        />
        <ReadoutCell
          k="Beer to sell"
          v={
            tile.beerRequired > 0 ? (
              <span className="flex items-center gap-1">
                <BeerSteinIcon size={14} />
                {tile.beerRequired}
              </span>
            ) : (
              <span style={{ color: 'rgba(231,215,177,.55)' }}>none</span>
            )
          }
        />
        <ReadoutCell
          k="Develop"
          v={
            developable ? (
              <span className="flex items-center gap-1">
                <DevelopIcon size={14} />
                yes
              </span>
            ) : (
              <span
                className="flex items-center gap-1"
                style={{ color: 'var(--bb-brass-bright)' }}
              >
                <DevelopIcon size={14} />
                cannot
              </span>
            )
          }
        />
        {prod && (
          <ReadoutCell
            k="Produces"
            v={
              <span className="flex items-center gap-1">
                {prod.kind === 'coal' ? (
                  <CoalIcon size={14} />
                ) : prod.kind === 'iron' ? (
                  <IronIcon size={14} />
                ) : (
                  <BeerSteinIcon size={14} />
                )}
                ×{prod.n}
              </span>
            }
          />
        )}
      </div>
    </div>
  )
}

function ReadoutCell({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      className="rounded p-2"
      style={{
        background: 'rgba(0,0,0,.2)',
        border: '1px solid rgba(231,215,177,.08)',
      }}
    >
      <div
        className="mb-1 text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'rgba(231,215,177,.4)' }}
      >
        {k}
      </div>
      <div
        className="bb2-display flex items-center gap-1 text-[15px] font-semibold"
        style={{ color: 'var(--bb-parchment)' }}
      >
        {v}
      </div>
    </div>
  )
}

// The mat is also reachable by tapping your own rail card, which is not
// discoverable — this is the signposted way in, sat under the dock.
export function OpenMatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="bb2-ghost-btn flex items-center justify-center gap-2"
      data-testid="open-player-mat"
      onClick={onClick}
      title="Your remaining industry tiles, works and routes"
    >
      <MatIcon size={14} />
      Your player mat
    </button>
  )
}
