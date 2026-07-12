'use client'

// The player ledger — the digital equivalent of the physical player mat.
// Opened from a player's rail card: remaining industry tiles by type and
// level (cost, VP, resource needs, next-buildable highlight), plus the
// works and routes already on the board.
import { type CityId, cities } from '~/data/board'
import { type IndustryType } from '~/data/cards'
import { type Player } from '~/store/gameStore'
import { PLAYER_FILL } from './board/board-map'
import { CanalIcon, IndustryGlyph, LaurelIcon, RailIcon } from './icons'

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

const cityName = (id: CityId) => cities[id]?.name ?? id

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
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close is a convenience; Escape/close button are the accessible paths
    <div
      className="bb2-curtain fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(10, 8, 6, 0.82)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bb2-panel bb2-rise w-full max-w-3xl p-5"
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
              className="bb2-display text-[22px] font-black leading-none"
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
              className="text-[11px] uppercase tracking-[0.18em]"
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

        {/* tile mat */}
        <div className="pt-4">
          <span className="bb2-panel-title">Tiles on the mat</span>
          <p
            className="pt-1.5 text-[11.5px]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Lowest level builds first — the brass-ringed tile is the next one
            out of the mat. Greyed tiles cannot be built in the {era} era.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-3 sm:grid-cols-3">
            {INDUSTRY_TYPES.map((t) => {
              const rows = [...(player.industryTilesOnMat[t] ?? [])].sort(
                (a, b) => a.tile.level - b.tile.level,
              )
              const nextIdx = rows.findIndex(
                (r) =>
                  r.quantityAvailable > 0 &&
                  (era === 'canal'
                    ? r.tile.canBuildInCanalEra
                    : r.tile.canBuildInRailEra),
              )
              return (
                <div key={t} className="flex flex-col gap-1.5">
                  <span
                    className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--bb-parchment)' }}
                  >
                    <IndustryGlyph type={t} size={14} />
                    {LABEL[t]}
                  </span>
                  <div className="flex flex-col gap-1">
                    {rows.map((r, i) => {
                      const eraOk =
                        era === 'canal'
                          ? r.tile.canBuildInCanalEra
                          : r.tile.canBuildInRailEra
                      const depleted = r.quantityAvailable === 0
                      const isNext = i === nextIdx
                      return (
                        <div
                          key={r.tile.id}
                          className="flex items-center gap-2 rounded border px-2 py-1 text-[11.5px]"
                          style={{
                            borderColor: isNext
                              ? 'var(--bb-brass-bright)'
                              : 'rgba(231,215,177,.12)',
                            boxShadow: isNext
                              ? '0 0 0 1px rgba(230,189,99,.35)'
                              : undefined,
                            opacity: depleted ? 0.32 : eraOk ? 1 : 0.45,
                            background: isNext
                              ? 'rgba(195,149,56,.09)'
                              : 'rgba(255,240,200,.02)',
                          }}
                        >
                          <span
                            className="bb2-display w-6 text-[12px] font-bold"
                            style={{ color: 'var(--bb-brass-bright)' }}
                          >
                            {ROMAN[r.tile.level] ?? r.tile.level}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{ color: 'var(--bb-parchment-bright)' }}
                          >
                            £{r.tile.cost}
                          </span>
                          {(r.tile.coalRequired > 0 ||
                            r.tile.ironRequired > 0) && (
                            <span className="flex items-center gap-1">
                              {Array.from(
                                { length: r.tile.coalRequired },
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
                                { length: r.tile.ironRequired },
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
                          <span
                            className="ml-auto flex items-center gap-0.5 text-[10.5px]"
                            style={{ color: 'rgba(231,215,177,.6)' }}
                          >
                            <LaurelIcon size={10} />
                            {r.tile.victoryPoints}
                          </span>
                          <span
                            className="text-[10.5px] tabular-nums"
                            style={{
                              color: depleted
                                ? 'var(--bb-danger)'
                                : 'rgba(231,215,177,.6)',
                            }}
                          >
                            ×{r.quantityAvailable}
                          </span>
                        </div>
                      )
                    })}
                    {rows.length === 0 && (
                      <span
                        className="text-[11px] italic"
                        style={{ color: 'rgba(231,215,177,.35)' }}
                      >
                        None remaining
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
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
                  className="flex items-center gap-2 text-[12px]"
                  style={{ color: 'var(--bb-parchment)' }}
                >
                  <IndustryGlyph type={ind.type} size={13} />
                  <span className="capitalize">
                    {LABEL[ind.type]} {ROMAN[ind.level] ?? ind.level}
                  </span>
                  <span style={{ color: 'rgba(231,215,177,.5)' }}>
                    at {cityName(ind.location)}
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
                  className="text-[11px] italic"
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
                  className="flex items-center gap-2 text-[12px]"
                  style={{ color: 'var(--bb-parchment)' }}
                >
                  {l.type === 'canal' ? (
                    <CanalIcon size={13} />
                  ) : (
                    <RailIcon size={13} />
                  )}
                  {cityName(l.from)} — {cityName(l.to)}
                </div>
              ))}
              {player.links.length === 0 && (
                <span
                  className="text-[11px] italic"
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
  )
}
