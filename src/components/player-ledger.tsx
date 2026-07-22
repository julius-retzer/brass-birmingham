'use client'

// The player ledger — the digital equivalent of the physical player mat.
// Opened from a player's rail card or the dock's OpenMatButton: remaining
// industry tiles by type and
// level (cost, VP, resource needs, next-buildable highlight), plus the
// works and routes already on the board.
import { useEffect } from 'react'
import { type IndustryType } from '~/data/cards'
import { canBuildTileInEra, getBuildableTileInEra } from '~/data/industryTiles'
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import {
  BeerSteinIcon,
  CanalIcon,
  CoalIcon,
  DevelopIcon,
  IncomeIcon,
  IndustryChip,
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

  // Each industry's remaining tiles, expanded one-per-token, lowest level
  // first.
  const stacks = INDUSTRY_TYPES.map((t) => {
    const levels = [...(player.industryTilesOnMat[t] ?? [])].sort(
      (a, b) => a.tile.level - b.tile.level,
    )
    const tiles = levels.flatMap((r) =>
      Array.from({ length: r.quantityAvailable }, () => r.tile),
    )
    // Next tile out = the lowest one left, via the shared helper so this
    // highlight can't drift from the build/develop guards.
    return { type: t, tiles, buildableNext: getBuildableTileInEra(levels, era) }
  })

  // Pack the stacks into balanced columns (greedy: tallest stack first into
  // the currently shortest column) so a full fresh mat's tall tracks don't
  // leave ragged whitespace beside short ones. Each column is then shown
  // shortest-first — short stacks on top, tall on the bottom.
  const COLUMN_COUNT = 3
  const columns = Array.from({ length: COLUMN_COUNT }, () => ({
    rows: 0,
    stacks: [] as typeof stacks,
  }))
  for (const stack of [...stacks].sort(
    (a, b) => b.tiles.length - a.tiles.length,
  )) {
    const target = columns.reduce((min, c) => (c.rows < min.rows ? c : min))
    target.stacks.push(stack)
    target.rows += stack.tiles.length + 1 // +1 for the label row
  }
  for (const c of columns)
    c.stacks.sort((a, b) => a.tiles.length - b.tiles.length)

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

        {/* Scrollable modal body — listing every tile individually can get
            tall, so the body scrolls inside the modal rather than the page or
            the overlay. */}
        <div className="-mr-2 flex-1 overflow-y-auto pr-2">
          {/* tile mat */}
          <div className="pt-4">
            <span className="bb2-panel-title">Tiles on the mat</span>
            <p
              className="pt-1.5 text-[12.5px]"
              style={{ color: 'rgba(231,215,177,.5)' }}
            >
              Lowest level builds first — the brass-ringed tile is the next one
              out of the mat. Greyed tiles cannot be built in the {era} era.
            </p>
            <p
              className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-[11.5px]"
              style={{ color: 'rgba(231,215,177,.45)' }}
            >
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-[7px] w-[7px] rounded-[1.5px]"
                  style={{ background: '#55504a', border: '1px solid #8d867c' }}
                />
                coal to build
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-[7px] w-[7px] rounded-[1.5px]"
                  style={{ background: '#c2632f', border: '1px solid #7c3d1c' }}
                />
                iron to build
              </span>
              <span className="flex items-center gap-1">
                <LaurelIcon size={11} /> victory points
              </span>
              <span className="flex items-center gap-1">
                <IncomeIcon size={11} /> income when flipped
              </span>
              <span className="flex items-center gap-1">
                <svg width="15" height="8" viewBox="0 0 15 8" aria-hidden>
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
                link-scoring icons
              </span>
              <span className="flex items-center gap-1">
                <CoalIcon size={11} /> resources produced when built
              </span>
              <span className="flex items-center gap-1">
                <BeerSteinIcon size={11} /> beer needed to sell
              </span>
              <span className="flex items-center gap-1">
                <DevelopIcon size={11} /> develop (<span aria-hidden>✕</span> =
                cannot)
              </span>
            </p>
            {/* height-packed columns (see packing above) so short stacks
                don't leave a gap beside tall ones the way fixed grid rows did */}
            <div className="flex flex-col gap-x-6 gap-y-6 pt-3 sm:flex-row sm:items-start">
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-1 flex-col gap-4">
                  {col.stacks.map(({ type: t, tiles, buildableNext }) => (
                    <div key={t} className="flex flex-col gap-1.5">
                      <span
                        className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: 'var(--bb-parchment)' }}
                      >
                        <IndustryChip type={t} size={14} />
                        {LABEL[t]}
                      </span>
                      <div className="flex flex-col gap-1">
                        {tiles.map((tile, i) => {
                          const eraOk = canBuildTileInEra(tile, era)
                          // Only the lowest remaining tile is ever in play, and
                          // only if this era allows it — otherwise it is what the
                          // player must Develop away. `buildableNext` is the shared
                          // helper's verdict on that lowest tile (null when barred).
                          const isNext = i === 0 && buildableNext !== null
                          const isBlocking = i === 0 && buildableNext === null
                          // Resources a tile YIELDS when built (only one of the
                          // three is ever non-zero): coal mines → coal, iron
                          // works → iron, breweries → beer. All sourced from the
                          // tile definition, never hardcoded.
                          const producedKind =
                            tile.coalProduced > 0
                              ? ('coal' as const)
                              : tile.ironProduced > 0
                                ? ('iron' as const)
                                : tile.beerProduced > 0
                                  ? ('beer' as const)
                                  : null
                          const producedCount =
                            tile.coalProduced ||
                            tile.ironProduced ||
                            tile.beerProduced
                          // Lightbulb pottery tiles can only be removed by
                          // selling, never Developed (rules p.6).
                          const developable = !tile.hasLightbulbIcon
                          return (
                            <div
                              key={`${tile.id}-${i}`}
                              className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-[13px]"
                              style={{
                                borderColor: isNext
                                  ? 'var(--bb-brass-bright)'
                                  : 'rgba(231,215,177,.12)',
                                boxShadow: isNext
                                  ? '0 0 0 1px rgba(230,189,99,.35)'
                                  : undefined,
                                opacity: eraOk ? 1 : 0.45,
                                background: isNext
                                  ? 'rgba(195,149,56,.09)'
                                  : 'rgba(255,240,200,.02)',
                              }}
                            >
                              <span
                                className="bb2-display w-7 text-[13.5px] font-bold"
                                style={{ color: 'var(--bb-brass-bright)' }}
                              >
                                {ROMAN[tile.level] ?? tile.level}
                              </span>
                              <span
                                className="tabular-nums"
                                style={{ color: 'var(--bb-parchment-bright)' }}
                              >
                                £{tile.cost}
                              </span>
                              {(tile.coalRequired > 0 ||
                                tile.ironRequired > 0) && (
                                <span className="flex items-center gap-1">
                                  {Array.from(
                                    { length: tile.coalRequired },
                                    (_, k) => (
                                      <span
                                        key={`c${k}`}
                                        className="inline-block h-[7px] w-[7px] rounded-[1.5px]"
                                        style={{
                                          background: '#55504a',
                                          border: '1px solid #8d867c',
                                        }}
                                        title="coal required"
                                      />
                                    ),
                                  )}
                                  {Array.from(
                                    { length: tile.ironRequired },
                                    (_, k) => (
                                      <span
                                        key={`i${k}`}
                                        className="inline-block h-[7px] w-[7px] rounded-[1.5px]"
                                        style={{
                                          background: '#c2632f',
                                          border: '1px solid #7c3d1c',
                                        }}
                                        title="iron required"
                                      />
                                    ),
                                  )}
                                </span>
                              )}
                              {producedKind && (
                                <span
                                  className="flex items-center gap-0.5 text-[12px] tabular-nums"
                                  style={{
                                    color:
                                      producedKind === 'coal'
                                        ? '#b6ae9f'
                                        : producedKind === 'iron'
                                          ? '#d07135'
                                          : '#d3a44a',
                                  }}
                                  title={`produces ${producedCount} ${producedKind} when built`}
                                >
                                  {producedKind === 'coal' ? (
                                    <CoalIcon size={12} />
                                  ) : producedKind === 'iron' ? (
                                    <IronIcon size={12} />
                                  ) : (
                                    <BeerSteinIcon size={12} />
                                  )}
                                  ×{producedCount}
                                </span>
                              )}
                              {tile.beerRequired > 0 && (
                                <span
                                  className="flex items-center gap-0.5 text-[12px] tabular-nums"
                                  style={{ color: 'rgba(231,215,177,.6)' }}
                                  title={`${tile.beerRequired} beer needed to sell`}
                                >
                                  <BeerSteinIcon size={12} />×
                                  {tile.beerRequired}
                                </span>
                              )}
                              <span
                                className="ml-auto flex items-center gap-0.5 text-[12px]"
                                style={{ color: 'rgba(231,215,177,.6)' }}
                                title="victory points when flipped"
                              >
                                <LaurelIcon size={11} />
                                {tile.victoryPoints}
                              </span>
                              <span
                                className="flex items-center gap-0.5 text-[12px]"
                                style={{ color: 'rgba(231,215,177,.6)' }}
                                title="income advance when flipped"
                              >
                                <IncomeIcon size={11} />+
                                {tile.incomeAdvancement}
                              </span>
                              <span
                                className="flex items-center gap-0.5 text-[12px]"
                                style={{ color: 'rgba(231,215,177,.6)' }}
                                title={`${tile.linkScoringIcons} link-scoring icon(s) on the tile`}
                              >
                                {/* one •—• per printed icon, like the physical
                                tile face (0 icons → an em-dash) */}
                                {tile.linkScoringIcons === 0 ? (
                                  <span style={{ opacity: 0.5 }}>—</span>
                                ) : (
                                  Array.from(
                                    { length: tile.linkScoringIcons },
                                    (_, k) => (
                                      <svg
                                        key={k}
                                        width="15"
                                        height="8"
                                        viewBox="0 0 15 8"
                                        aria-hidden
                                      >
                                        <circle
                                          cx="2"
                                          cy="4"
                                          r="1.6"
                                          fill="currentColor"
                                        />
                                        <line
                                          x1="3.6"
                                          y1="4"
                                          x2="11"
                                          y2="4"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                        />
                                        <circle
                                          cx="12.6"
                                          cy="4"
                                          r="1.6"
                                          fill="currentColor"
                                        />
                                      </svg>
                                    ),
                                  )
                                )}
                              </span>
                              <span
                                className="flex items-center"
                                style={{
                                  color: developable
                                    ? 'rgba(231,215,177,.32)'
                                    : 'var(--bb-brass-bright)',
                                }}
                                title={
                                  developable
                                    ? 'can be developed'
                                    : 'lightbulb tile — cannot be developed'
                                }
                              >
                                <DevelopIcon size={12} />
                                {!developable && (
                                  <span className="ml-0.5 text-[11px] font-bold leading-none">
                                    ✕
                                  </span>
                                )}
                              </span>
                              {isBlocking && (
                                <span
                                  data-testid={`mat-blocked-${tile.id}`}
                                  className="w-full text-[11px] italic"
                                  style={{ color: 'rgba(231,215,177,.5)' }}
                                >
                                  {era === 'rail'
                                    ? 'canal-era tile — Develop to skip'
                                    : 'rail-era tile — not yet buildable'}
                                </span>
                              )}
                            </div>
                          )
                        })}
                        {tiles.length === 0 && (
                          <span
                            className="text-[12px] italic"
                            style={{ color: 'rgba(231,215,177,.35)' }}
                          >
                            None remaining
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
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
