'use client'

// The Ironmaster's Atlas — a custom SVG survey map of the Midlands.
// Renders the whole game state (city plates, industry slots, built tiles,
// canal/rail routes, merchants) with pan/zoom and legal-target highlighting.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CityId,
  FARM_BREWERIES,
  cities,
  cityIndustrySlots,
  connections,
  linkConnectedLocations,
} from '~/data/board'
import { type IndustryType } from '~/data/cards'
import { type Merchant, type Player } from '~/store/gameStore'
import { GAME_ICONS } from '../gameicons-data'
import { IndustryFragment } from '../icons'
import { VIEW_H, VIEW_W, cityPos, linkKey, routeBow } from './board-data'
import {
  FOCUS_PAN_ANIMATION_MS,
  FOCUS_PAN_DEBOUNCE_MS,
  easeInOutCubic,
  planPanToCity,
} from './pan-into-view'

/* ---------------- palette (mirrors theme.css) ---------------- */

const INDUSTRY_FILL: Record<IndustryType, string> = {
  cotton: '#ded1b4',
  coal: '#3b3833',
  iron: '#d07135',
  manufacturer: '#a5433a',
  pottery: '#c9a227',
  brewery: '#7a8b3d',
}
const INDUSTRY_INK: Record<IndustryType, string> = {
  cotton: '#2a2014',
  coal: '#e7d7b1',
  iron: '#1f1208',
  manufacturer: '#f2e6c8',
  pottery: '#2a2014',
  brewery: '#f2e6c8',
}
export const PLAYER_FILL: Record<Player['color'], string> = {
  red: '#b5402f',
  blue: '#45719d',
  green: '#5f7d45',
  yellow: '#c9a227',
  purple: '#7d5a86',
  orange: '#c07430',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * The locations that are part of a player's network, exactly as the
 * engine's canBuildLink guard computes it: cities holding one of their
 * works, plus every location touched by one of their routes (the shared
 * linkConnectedLocations helper covers the farm-brewery 3-way). An empty
 * set means "no presence yet" — the rules then allow building anywhere,
 * so callers should highlight nothing rather than everything.
 */
export function playerNetworkCities(player: Player): Set<CityId> {
  const network = new Set<CityId>()
  for (const industry of player.industries) network.add(industry.location)
  for (const link of player.links) {
    for (const loc of linkConnectedLocations(link.from, link.to)) {
      network.add(loc)
    }
  }
  return network
}

const SLOT = 52
const SLOT_GAP = 4
const PLATE_PAD = 6

/* ---------------- geometry helpers ---------------- */

interface Pt {
  x: number
  y: number
}

function routePath(from: CityId, to: CityId): { d: string; mid: Pt } {
  const a = cityPos[from]
  const b = cityPos[to]
  const bow = routeBow[linkKey(from, to)] ?? 0
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const cx = mx + (-dy / len) * bow
  const cy = my + (dx / len) * bow
  return {
    d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
    // quadratic bezier midpoint (t = 0.5)
    mid: {
      x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x,
      y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y,
    },
  }
}

interface BuiltIndustry {
  location: CityId
  type: IndustryType
  level: number
  flipped: boolean
  coalCubesOnTile: number
  ironCubesOnTile: number
  beerBarrelsOnTile: number
  tile: {
    victoryPoints: number
    incomeAdvancement: number
    linkScoringIcons: number
  }
  owner: Player
}

// The engine tracks industries per location, not per printed slot; assign
// each built tile to the first free slot that allows its type (fallback to
// any free slot) so the map mirrors how the physical board fills up.
function assignSlots(
  cityId: CityId,
  built: BuiltIndustry[],
): (BuiltIndustry | null)[] {
  const slots = cityIndustrySlots[cityId] ?? []
  const out: (BuiltIndustry | null)[] = slots.map(() => null)
  for (const b of built) {
    let idx = slots.findIndex(
      (allowed, i) => out[i] === null && allowed.includes(b.type),
    )
    if (idx === -1) idx = out.findIndex((s) => s === null)
    if (idx !== -1) out[idx] = b
  }
  return out
}

/* ---------------- props ---------------- */

/**
 * The game-end VP marker: a struck brass roundel showing what a place or
 * route earned. Purely decorative — never intercepts board pointer events.
 */
function VpRoundel({
  vp,
  color,
  scale = 1,
}: {
  vp: number
  color: string
  scale?: number
}) {
  const negative = vp < 0
  return (
    <g pointerEvents="none" transform={`scale(${scale})`}>
      <circle
        r="13"
        fill={negative ? '#c14434' : '#16130f'}
        stroke={negative ? '#f2e6c8' : '#e6bd63'}
        strokeWidth="2"
        filter="url(#bb2-plate-shadow)"
      />
      <circle r="13" fill={color} fillOpacity={negative ? 0 : 0.22} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="800"
        fill={negative ? '#f2e6c8' : '#e6bd63'}
        style={{ fontFamily: 'var(--bb-display)' }}
      >
        {negative ? vp : `${vp}`}
      </text>
    </g>
  )
}

export interface BoardMapProps {
  players: Player[]
  era: 'canal' | 'rail'
  merchants: Merchant[]
  /** Cities that are legal SELECT_LOCATION targets right now (null = not picking). */
  legalCities?: ReadonlySet<string> | null
  /** Connections (linkKey both orders) legal for SELECT_LINK right now. */
  legalLinks?: ReadonlySet<string> | null
  selectedCity?: CityId | null
  selectedLinks?: Array<{ from: CityId; to: CityId }>
  prompt?: string | null
  onCityClick?: (cityId: CityId) => void
  onLinkClick?: (from: CityId, to: CityId) => void
  /** Locations in the viewing player's network (see playerNetworkCities). */
  networkCities?: ReadonlySet<string> | null
  /** The viewing player's colour — tints the network markers and legend. */
  networkColor?: string | null
  /** Cities spotlit while a hand card is hovered (soft preview hint). */
  hoverCities?: ReadonlySet<string> | null
  /**
   * Hover-to-locate: the city whose NAME is hovered/focused somewhere in the
   * UI right now (journal, pickers, ledger) — its plate gets the teal
   * surveyor's mark so the player can find it on the map.
   */
  locatedCity?: string | null
  /**
   * Card-hover map sync: the city a hovered hand card names (location cards
   * only). When it sits outside the current viewport the map pans — with a
   * slight zoom-out — to bring it into view (debounced; suppressed while a
   * gesture or a board pick step is active). The map stays where it panned
   * when the hover ends. Decision logic in `pan-into-view.ts`.
   */
  focusCity?: string | null
  /**
   * Game-end scoring overlay: VP earned per city and per route by ONE player
   * (null = off). Annotated places get a brass VP roundel; everything else
   * recedes, so the score reads off the board. Links are destroyed by era
   * scoring, so these totals come from the engine's ledger, not the board.
   */
  vpAnnotations?: {
    cities: ReadonlyMap<string, number>
    links: ReadonlyMap<string, number>
  } | null
  /** The annotated player's colour — tints the roundels. */
  vpColor?: string | null
}

/* ================================================================ */

export function BoardMap({
  players,
  era,
  merchants,
  legalCities = null,
  legalLinks = null,
  selectedCity = null,
  selectedLinks = [],
  prompt = null,
  onCityClick,
  onLinkClick,
  networkCities = null,
  networkColor = null,
  hoverCities = null,
  locatedCity = null,
  focusCity = null,
  vpAnnotations = null,
  vpColor = null,
}: BoardMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [vb, setVb] = useState({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  const drag = useRef<{
    px: number
    py: number
    vb: { x: number; y: number; w: number; h: number }
    moved: boolean
  } | null>(null)

  /* ---- pan / zoom ---- */

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopAutoPan()
      setVb((v) => {
        const rect = svg.getBoundingClientRect()
        const fx = (e.clientX - rect.left) / rect.width
        const fy = (e.clientY - rect.top) / rect.height
        const scale = e.deltaY > 0 ? 1.14 : 1 / 1.14
        const w = Math.min(Math.max(v.w * scale, VIEW_W / 6), VIEW_W * 1.3)
        const h = (w / VIEW_W) * VIEW_H
        return {
          x: v.x + (v.w - w) * fx,
          y: v.y + (v.h - h) * fy,
          w,
          h,
        }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // Live pointer positions — one pointer pans, two pointers pinch-zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    dist: number
    vb: { x: number; y: number; w: number; h: number }
  } | null>(null)

  const pinchDistance = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return 0
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  // IMPORTANT: never setPointerCapture on pointerdown. Capturing retargets
  // the browser's compatibility `click` event to the svg element itself, so
  // the city/route onClick handlers never fire for a real pointer (synthetic
  // dispatchEvent clicks are unaffected, which is how this once hid in
  // testing). Capture only once an actual drag/pinch is under way.
  const capturePointer = (id: number) => {
    try {
      svgRef.current?.setPointerCapture(id)
    } catch {
      // pointer already gone — nothing to capture
    }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopAutoPan()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // second finger down — switch from pan to pinch (no click expected
      // from a two-finger gesture, so capturing immediately is safe)
      pinch.current = { dist: pinchDistance(), vb }
      if (drag.current) drag.current.moved = true
      for (const id of pointers.current.keys()) capturePointer(id)
      return
    }
    drag.current = { px: e.clientX, py: e.clientY, vb, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size >= 2) {
      const p = pinch.current
      const dist = pinchDistance()
      if (dist <= 0 || p.dist <= 0) return
      const rect = svg.getBoundingClientRect()
      const pts = [...pointers.current.values()]
      const midX = (pts[0]!.x + pts[1]!.x) / 2
      const midY = (pts[0]!.y + pts[1]!.y) / 2
      const fx = (midX - rect.left) / rect.width
      const fy = (midY - rect.top) / rect.height
      const w = Math.min(
        Math.max(p.vb.w * (p.dist / dist), VIEW_W / 6),
        VIEW_W * 1.3,
      )
      const h = (w / VIEW_W) * VIEW_H
      setVb({
        x: p.vb.x + (p.vb.w - w) * fx,
        y: p.vb.y + (p.vb.h - h) * fy,
        w,
        h,
      })
      return
    }

    const d = drag.current
    if (!d) return
    const rect = svg.getBoundingClientRect()
    const dx = ((e.clientX - d.px) / rect.width) * d.vb.w
    const dy = ((e.clientY - d.py) / rect.height) * d.vb.h
    if (
      !d.moved &&
      Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4
    ) {
      // a real pan has started — only now is it safe to capture the pointer
      d.moved = true
      capturePointer(e.pointerId)
    }
    if (!d.moved) return
    setVb({ x: d.vb.x - dx, y: d.vb.y - dy, w: d.vb.w, h: d.vb.h })
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    // Delay so child click handlers can consult wasDrag()
    setTimeout(() => {
      drag.current = null
    }, 0)
  }
  const wasDrag = () => drag.current?.moved ?? false

  const zoomBy = (scale: number) => {
    stopAutoPan()
    return setVb((v) => {
      const w = Math.min(Math.max(v.w * scale, VIEW_W / 6), VIEW_W * 1.3)
      const h = (w / VIEW_W) * VIEW_H
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h }
    })
  }
  const resetView = () => {
    stopAutoPan()
    setVb({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  }

  /* ---- card-hover map sync (auto-pan to a hovered card's city) ---- */

  // Latest vb without retriggering the focus effect on every user pan.
  const vbRef = useRef(vb)
  vbRef.current = vb
  const autoPanFrame = useRef<number | null>(null)

  function stopAutoPan() {
    if (autoPanFrame.current !== null) {
      cancelAnimationFrame(autoPanFrame.current)
      autoPanFrame.current = null
    }
  }

  const animateVbTo = (target: {
    x: number
    y: number
    w: number
    h: number
  }) => {
    stopAutoPan()
    // Reduced motion: land instantly instead of animating (the locate mark
    // drops its ping under the same preference).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVb(target)
      return
    }
    const from = vbRef.current
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - start) / FOCUS_PAN_ANIMATION_MS, 1)
      const k = easeInOutCubic(t)
      setVb({
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        w: from.w + (target.w - from.w) * k,
        h: from.h + (target.h - from.h) * k,
      })
      autoPanFrame.current = t < 1 ? requestAnimationFrame(step) : null
    }
    autoPanFrame.current = requestAnimationFrame(step)
  }

  const pickingCity = legalCities !== null
  const pickingLink = legalLinks !== null

  useEffect(() => {
    if (!focusCity) return
    // Never yank the map while the player is aiming a board pick.
    if (pickingCity || pickingLink) return
    const pos = cityPos[focusCity as CityId]
    if (!pos) return
    const timer = setTimeout(() => {
      // A gesture in progress wins over the auto-pan.
      if (pointers.current.size > 0) return
      const target = planPanToCity(vbRef.current, pos, {
        w: VIEW_W,
        h: VIEW_H,
      })
      if (target) animateVbTo(target)
    }, FOCUS_PAN_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // animateVbTo is stable in behaviour (refs + setState); listing it would
    // retrigger the debounce on every render.
  }, [focusCity, pickingCity, pickingLink])

  useEffect(() => stopAutoPan, [])

  /* ---- derived game data ---- */

  const builtByCity = useMemo(() => {
    const map = new Map<CityId, BuiltIndustry[]>()
    for (const p of players) {
      for (const ind of p.industries) {
        const list = map.get(ind.location) ?? []
        list.push({ ...ind, owner: p })
        map.set(ind.location, list)
      }
    }
    return map
  }, [players])

  const builtLinks = useMemo(() => {
    const map = new Map<string, { player: Player; type: 'canal' | 'rail' }>()
    for (const p of players) {
      for (const l of p.links) {
        map.set(linkKey(l.from, l.to), { player: p, type: l.type })
        map.set(linkKey(l.to, l.from), { player: p, type: l.type })
      }
    }
    return map
  }, [players])

  const merchantsByCity = useMemo(() => {
    const map = new Map<CityId, Merchant[]>()
    for (const m of merchants) {
      const list = map.get(m.location) ?? []
      list.push(m)
      map.set(m.location, list)
    }
    return map
  }, [merchants])

  const selectedLinkKeys = new Set(
    selectedLinks.flatMap((l) => [
      linkKey(l.from, l.to),
      linkKey(l.to, l.from),
    ]),
  )

  /* ---------------- render ---------------- */

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // NOT role="img": that would flatten the tree and hide the city /
        // route buttons from assistive tech and accessibility tooling.
        role="group"
        aria-label="Game board map"
      >
        <defs>
          <linearGradient id="bb2-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#efe2c0" />
            <stop offset="0.7" stopColor="#e0cea2" />
            <stop offset="1" stopColor="#d0ba89" />
          </linearGradient>
          <linearGradient id="bb2-merchant-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3428" />
            <stop offset="1" stopColor="#2a251b" />
          </linearGradient>
          <filter
            id="bb2-plate-shadow"
            x="-30%"
            y="-30%"
            width="160%"
            height="170%"
          >
            <feDropShadow
              dx="0"
              dy="5"
              stdDeviation="7"
              floodColor="#000000"
              floodOpacity="0.55"
            />
          </filter>
        </defs>

        {/* survey grid */}
        <g stroke="#e7d7b1" strokeOpacity="0.035" strokeWidth="1">
          {Array.from({ length: 11 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={i * 160}
              y1={-40}
              x2={i * 160}
              y2={VIEW_H + 40}
            />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={`h${i}`}
              x1={-40}
              y1={i * 160}
              x2={VIEW_W + 40}
              y2={i * 160}
            />
          ))}
        </g>

        {/* cartouche */}
        <g transform="translate(105, 60)" opacity="0.9" pointerEvents="none">
          <rect
            x="0"
            y="0"
            width="255"
            height="118"
            fill="none"
            stroke="#c39538"
            strokeOpacity="0.55"
            strokeWidth="1.5"
          />
          <rect
            x="6"
            y="6"
            width="243"
            height="106"
            fill="none"
            stroke="#c39538"
            strokeOpacity="0.3"
            strokeWidth="0.8"
          />
          <text
            x="127"
            y="52"
            textAnchor="middle"
            fill="#e6bd63"
            style={{
              fontFamily: 'var(--bb-display)',
              fontWeight: 900,
              fontSize: 34,
              letterSpacing: '0.24em',
            }}
          >
            BRASS
          </text>
          <text
            x="127"
            y="76"
            textAnchor="middle"
            fill="#e7d7b1"
            fillOpacity="0.8"
            style={{
              fontFamily: 'var(--bb-display)',
              fontStyle: 'italic',
              fontSize: 13.5,
            }}
          >
            Birmingham &amp; the West Midlands
          </text>
          <text
            x="127"
            y="96"
            textAnchor="middle"
            fill="#e7d7b1"
            fillOpacity="0.5"
            style={{
              fontFamily: 'var(--bb-body)',
              fontSize: 10,
              letterSpacing: '0.3em',
            }}
          >
            ANNO 1770 — 1870
          </text>
        </g>

        {/* compass rose */}
        <g
          transform="translate(1480, 980)"
          stroke="#c39538"
          strokeOpacity="0.5"
          fill="none"
          pointerEvents="none"
        >
          <circle r="46" strokeWidth="1" />
          <circle r="34" strokeWidth="0.6" strokeOpacity="0.35" />
          <path
            d="M0 -58 L9 -9 L0 0 L-9 -9 Z"
            fill="#c39538"
            fillOpacity="0.55"
            stroke="none"
          />
          <path
            d="M0 58 L9 9 L0 0 L-9 9 Z M-58 0 L-9 -9 L0 0 L-9 9 Z M58 0 L9 -9 L0 0 L9 9 Z"
            fill="#c39538"
            fillOpacity="0.25"
            stroke="none"
          />
          <text
            y="-66"
            textAnchor="middle"
            fill="#c39538"
            fillOpacity="0.7"
            stroke="none"
            style={{ fontFamily: 'var(--bb-display)', fontSize: 18 }}
          >
            N
          </text>
        </g>

        {/* ------------ routes ------------ */}
        <g>
          {connections.map((conn) => {
            const key = linkKey(conn.from, conn.to)
            const types = conn.types as readonly string[]
            const activeThisEra = types.includes(era)
            const built = builtLinks.get(key)
            const { d, mid } = routePath(conn.from, conn.to)
            const isLegal =
              legalLinks?.has(key) ??
              legalLinks?.has(linkKey(conn.to, conn.from)) ??
              false
            const isSelected = selectedLinkKeys.has(key)
            const linkVp =
              vpAnnotations?.links.get(key) ??
              vpAnnotations?.links.get(linkKey(conn.to, conn.from))
            const renderType: 'canal' | 'rail' = built
              ? built.type
              : activeThisEra
                ? (era as 'canal' | 'rail')
                : types.includes('canal')
                  ? 'canal'
                  : 'rail'
            const dimmed =
              (pickingLink && !isLegal && !isSelected) ||
              (vpAnnotations !== null && linkVp === undefined)

            return (
              <g key={key} opacity={dimmed ? 0.3 : 1}>
                {!activeThisEra && !built ? (
                  // ghost — corridor exists but not in this era
                  <path
                    d={d}
                    fill="none"
                    stroke="#e7d7b1"
                    strokeOpacity="0.13"
                    strokeWidth="2.5"
                    strokeDasharray="5 7"
                  />
                ) : renderType === 'canal' ? (
                  <>
                    <path
                      d={d}
                      fill="none"
                      stroke="#12302e"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="#4e9c96"
                      strokeOpacity={built ? 1 : 0.75}
                      strokeWidth="4.5"
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="#9fd4cc"
                      strokeOpacity="0.5"
                      strokeWidth="1.2"
                      strokeDasharray="10 14"
                    />
                  </>
                ) : (
                  <>
                    <path
                      d={d}
                      fill="none"
                      stroke="#331f12"
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="#c2632f"
                      strokeOpacity={built ? 1 : 0.8}
                      strokeWidth="4.5"
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke="#f2e6c8"
                      strokeOpacity="0.65"
                      strokeWidth="1.6"
                      strokeDasharray="1.6 7"
                    />
                  </>
                )}

                {/* legal-target pulse */}
                {(isLegal || isSelected) && (
                  <path
                    d={d}
                    fill="none"
                    stroke={isSelected ? '#e6bd63' : '#e6bd63'}
                    strokeWidth={isSelected ? 4 : 2}
                    className={isSelected ? undefined : 'bb2-target'}
                    strokeOpacity={isSelected ? 1 : 0.9}
                    pointerEvents="none"
                  />
                )}

                {/* built link marker — the player's tile on the route,
                    stamped with the physical game's glyphs: a narrowboat
                    for canals, a locomotive for rails */}
                {built && (
                  <g
                    transform={`translate(${mid.x}, ${mid.y})`}
                    pointerEvents="none"
                  >
                    <rect
                      x="-16"
                      y="-10"
                      width="32"
                      height="20"
                      rx="3.5"
                      fill={PLAYER_FILL[built.player.color]}
                      stroke="#16130f"
                      strokeWidth="1.4"
                      filter="url(#bb2-plate-shadow)"
                    />
                    <g fill="#f2e6c8" stroke="none">
                      {built.type === 'canal' ? (
                        // bespoke narrowboat silhouette (no such icon exists
                        // in any library — see bb-icon-research-f12)
                        <path d="M-10.6 -5.2 h2.4 v3 h6.6 v-3.4 h1.8 v3.4 h1.4 v2 h-12.2 z M-13 1 h26 c-0.7 2.9 -3.2 4.6 -6.4 4.6 h-13.2 c-3.2 0 -5.7 -1.7 -6.4 -4.6 z" />
                      ) : (
                        // delapouite/steam-locomotive (game-icons.net CC BY 3.0)
                        <g transform="translate(-12.5, -12.5) scale(0.04883)">
                          <path d={GAME_ICONS.steamLocomotive.d} />
                        </g>
                      )}
                    </g>
                  </g>
                )}

                {/* game-end: what this route scored for the shown player */}
                {linkVp !== undefined && (
                  <g
                    transform={`translate(${mid.x}, ${mid.y})`}
                    data-vp-link={key}
                  >
                    <VpRoundel vp={linkVp} color={vpColor ?? '#e6bd63'} />
                  </g>
                )}

                {/* fat invisible hit area */}
                {(pickingLink || onLinkClick) && (
                  <path
                    d={d}
                    data-conn={key}
                    data-legal={isLegal || undefined}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="22"
                    role={pickingLink ? 'button' : undefined}
                    aria-label={
                      pickingLink
                        ? `Route ${cities[conn.from]?.name ?? conn.from} — ${cities[conn.to]?.name ?? conn.to}${isLegal ? ' — legal route' : ' — not a legal route'}`
                        : undefined
                    }
                    tabIndex={pickingLink && isLegal ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (pickingLink && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onLinkClick?.(conn.from, conn.to)
                      }
                    }}
                    style={{
                      cursor: isLegal
                        ? 'pointer'
                        : pickingLink
                          ? 'not-allowed'
                          : 'default',
                    }}
                    onClick={() => {
                      if (!wasDrag() && pickingLink) {
                        onLinkClick?.(conn.from, conn.to)
                      }
                    }}
                  />
                )}
              </g>
            )
          })}
        </g>

        {/* the southern Farm Brewery's implicit connection: a spur off the
            kidderminster—worcester corridor (rules p.5 — one tile connects
            all three; no second tile may be placed, so no hit area) */}
        {(() => {
          const { mid } = routePath('kidderminster', 'worcester')
          const fb = cityPos.farmBrewery2
          const linked = builtLinks.has(linkKey('kidderminster', 'worcester'))
          return (
            <path
              d={`M ${mid.x} ${mid.y} L ${fb.x} ${fb.y}`}
              fill="none"
              stroke={linked ? '#4e9c96' : '#7a8b3d'}
              strokeOpacity={linked ? 0.8 : 0.35}
              strokeWidth={linked ? 3.5 : 2}
              strokeDasharray={linked ? undefined : '4 5'}
              pointerEvents="none"
            />
          )
        })()}

        {/* ------------ merchant plates ------------ */}
        {(Object.keys(cities) as CityId[])
          .filter((id) => cities[id].type === 'merchant')
          .map((id) => (
            <MerchantPlate
              key={id}
              cityId={id}
              entries={merchantsByCity.get(id) ?? []}
              dimmed={
                pickingCity ||
                (vpAnnotations !== null && !vpAnnotations.cities.has(id))
              }
              inNetwork={networkCities?.has(id) ?? false}
              networkColor={networkColor}
              located={locatedCity === id}
              vp={vpAnnotations?.cities.get(id)}
              vpColor={vpColor}
            />
          ))}

        {/* ------------ city plates ------------ */}
        {(Object.keys(cities) as CityId[])
          .filter((id) => cities[id].type === 'city')
          .map((id) => {
            const occupants = assignSlots(id, builtByCity.get(id) ?? [])
            const isLegal = legalCities?.has(id) ?? false
            return (
              <CityPlate
                key={id}
                cityId={id}
                occupants={occupants}
                isLegal={isLegal}
                isSelected={selectedCity === id}
                dimmed={
                  (pickingCity && !isLegal && selectedCity !== id) ||
                  (vpAnnotations !== null && !vpAnnotations.cities.has(id))
                }
                inNetwork={networkCities?.has(id) ?? false}
                networkColor={networkColor}
                hoverHint={hoverCities?.has(id) ?? false}
                located={locatedCity === id}
                vp={vpAnnotations?.cities.get(id)}
                vpColor={vpColor}
                onClick={() => {
                  if (!wasDrag() && pickingCity) onCityClick?.(id)
                }}
                clickable={pickingCity}
              />
            )
          })}
      </svg>

      {/* prompt banner — the board's own instruction, high contrast */}
      {prompt && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div
            className="bb2-rise flex items-center gap-2 rounded border px-4 py-2 text-[13px] font-semibold tracking-wide"
            style={{
              background: 'rgba(20, 16, 11, 0.92)',
              borderColor: 'var(--bb-brass)',
              color: 'var(--bb-parchment-bright)',
              boxShadow:
                '0 6px 18px rgba(0,0,0,.5), 0 0 0 1px rgba(230,189,99,.15)',
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: 'var(--bb-brass-bright)' }}
            />
            {prompt}
          </div>
        </div>
      )}

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          className="bb2-board-ctrl"
          onClick={() => zoomBy(1 / 1.3)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="bb2-board-ctrl"
          onClick={() => zoomBy(1.3)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="bb2-board-ctrl"
          onClick={resetView}
          aria-label="Reset view"
          style={{ fontSize: 12 }}
        >
          ⌂
        </button>
      </div>

      {/* legend */}
      <div
        className="absolute bottom-3 left-3 z-10 flex items-center gap-4 rounded border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{
          background: 'rgba(20,16,11,.85)',
          borderColor: 'var(--bb-brass-hairline-soft)',
          color: 'rgba(231,215,177,.75)',
        }}
      >
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#12302e"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#4e9c96"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          Canal
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#331f12"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#c2632f"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#f2e6c8"
              strokeWidth="1.2"
              strokeDasharray="1.4 5"
            />
          </svg>
          Rail
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="#e7d7b1"
              strokeOpacity="0.3"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
          </svg>
          Other era
        </span>
        {networkColor && networkCities && networkCities.size > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-4 rounded-[3px]"
              style={{
                background: `${networkColor}30`,
                border: `1.5px solid ${networkColor}`,
              }}
            />
            Your network
          </span>
        )}
      </div>
    </div>
  )
}

/* ================= city plate ================= */

// Slot arrangement per city, matching the physical board's blocky cities:
// Birmingham is THE big 2x2 square; Coventry, Stoke and Coalbrookdale are
// compact 2+1 blocks. Everything else stays a horizontal strip (default).
// Index order remains reading order (left→right, top→bottom) so slot
// assignment and cityIndustrySlots stay untouched.
const PLATE_GRIDS: Partial<Record<CityId, Array<[number, number]>>> = {
  birmingham: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  coventry: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  stoke: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  coalbrookdale: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
}

function plateGrid(cityId: CityId, slotCount: number): Array<[number, number]> {
  return (
    PLATE_GRIDS[cityId] ??
    Array.from({ length: Math.max(slotCount, 1) }, (_, i) => [i, 0])
  )
}

/**
 * Hover-to-locate spotlight: a teal double ring with an outward ping,
 * visually distinct from the brass legal pulse (colour, motion, rhythm) so
 * it reads as "here it is", not "this is a legal choice". The ping extends
 * well past the plate so a plate half-off the viewport edge still flags
 * itself. Reduced motion keeps the static rings only (theme.css).
 */
function LocateMark({
  plateW,
  plateH,
  rx,
}: {
  plateW: number
  plateH: number
  rx: number
}) {
  return (
    <g pointerEvents="none">
      <rect
        x="-14"
        y="-14"
        width={plateW + 28}
        height={plateH + 28}
        rx={rx + 6}
        fill="none"
        stroke="#8fd8cd"
        strokeWidth="3.5"
        className="bb2-locate-ping"
      />
      <rect
        x="-7"
        y="-7"
        width={plateW + 14}
        height={plateH + 14}
        rx={rx}
        fill="rgba(143,216,205,.14)"
        stroke="#8fd8cd"
        strokeOpacity="0.95"
        strokeWidth="2.5"
      />
    </g>
  )
}

function CityPlate({
  cityId,
  occupants,
  isLegal,
  isSelected,
  dimmed,
  clickable,
  onClick,
  inNetwork = false,
  networkColor = null,
  hoverHint = false,
  located = false,
  vp = undefined,
  vpColor = null,
}: {
  cityId: CityId
  occupants: (BuiltIndustry | null)[]
  isLegal: boolean
  isSelected: boolean
  dimmed: boolean
  clickable: boolean
  onClick: () => void
  inNetwork?: boolean
  networkColor?: string | null
  hoverHint?: boolean
  located?: boolean
  /** Game-end: VP the shown player earned here (undefined = none). */
  vp?: number
  vpColor?: string | null
}) {
  const pos = cityPos[cityId]
  const slots = cityIndustrySlots[cityId] ?? []
  const grid = plateGrid(cityId, slots.length)
  const cols = Math.max(...grid.map(([c]) => c)) + 1
  const rows = Math.max(...grid.map(([, r]) => r)) + 1
  const plateW = cols * SLOT + (cols - 1) * SLOT_GAP + PLATE_PAD * 2
  const plateH = rows * SLOT + (rows - 1) * SLOT_GAP + PLATE_PAD * 2
  const name = cities[cityId].name
  const isFarm = FARM_BREWERIES.has(cityId)

  return (
    <g
      transform={`translate(${pos.x - plateW / 2}, ${pos.y - plateH / 2})`}
      data-city={cityId}
      data-legal={isLegal || undefined}
      data-located={located || undefined}
      opacity={dimmed && !located ? 0.45 : 1}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      aria-label={
        (clickable
          ? `${name}${isLegal ? ' — legal site' : ' — not a legal site'}`
          : name) + (inNetwork ? ' — in your network' : '')
      }
      tabIndex={clickable && isLegal ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        cursor: clickable ? (isLegal ? 'pointer' : 'not-allowed') : 'default',
        transition: 'opacity .2s',
      }}
    >
      {located && (
        <LocateMark plateW={plateW} plateH={plateH} rx={isFarm ? 18 : 12} />
      )}
      {/* hovered-card spotlight — a dashed parchment ring */}
      {hoverHint && (
        <rect
          x="-5.5"
          y="-5.5"
          width={plateW + 11}
          height={plateH + 11}
          rx={isFarm ? 16 : 11}
          fill="rgba(231,215,177,.08)"
          stroke="#e7d7b1"
          strokeOpacity="0.95"
          strokeWidth="2.2"
          strokeDasharray="6 4"
          pointerEvents="none"
        />
      )}
      {/* game-end: this place's VP for the shown player — a tinted band so
          the scoring locations read at a glance, plus the roundel below */}
      {vp !== undefined && (
        <rect
          x="-6"
          y="-6"
          width={plateW + 12}
          height={plateH + 12}
          rx={isFarm ? 17 : 11}
          fill={vpColor ?? '#e6bd63'}
          fillOpacity="0.16"
          stroke={vpColor ?? '#e6bd63'}
          strokeOpacity="0.9"
          strokeWidth="2.2"
          pointerEvents="none"
        />
      )}
      {/* your-network band — sits outside the plate, under the legal ring */}
      {inNetwork && networkColor && (
        <rect
          x="-7"
          y="-7"
          width={plateW + 14}
          height={plateH + 14}
          rx={isFarm ? 18 : 12}
          fill={networkColor}
          fillOpacity="0.13"
          stroke={networkColor}
          strokeOpacity="0.75"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
      <rect
        width={plateW}
        height={plateH}
        rx={isFarm ? 14 : 7}
        fill="url(#bb2-plate)"
        stroke={isSelected ? '#e6bd63' : isFarm ? '#7a8b3d' : '#9c854f'}
        strokeWidth={isSelected ? 3 : 1.4}
        strokeDasharray={isFarm ? '5 3' : undefined}
        filter="url(#bb2-plate-shadow)"
      />
      {(isLegal || isSelected) && (
        <rect
          x="-4"
          y="-4"
          width={plateW + 8}
          height={plateH + 8}
          rx="10"
          fill="none"
          stroke="#e6bd63"
          className={isSelected ? undefined : 'bb2-target'}
          strokeWidth={isSelected ? 2.5 : 2}
          pointerEvents="none"
        />
      )}

      {/* slots — laid out on the city's plate grid */}
      {slots.map((allowed, i) => {
        const [col, row] = grid[i] ?? [i, 0]
        const sx = PLATE_PAD + col * (SLOT + SLOT_GAP)
        const sy = PLATE_PAD + row * (SLOT + SLOT_GAP)
        const occ = occupants[i]
        return (
          <g key={i} transform={`translate(${sx}, ${sy})`}>
            {occ ? (
              <BuiltTile occ={occ} />
            ) : (
              <EmptySlot allowed={allowed as IndustryType[]} />
            )}
          </g>
        )
      })}

      {/* name ribbon */}
      <g
        transform={`translate(${plateW / 2}, ${plateH + 13})`}
        pointerEvents="none"
      >
        <text
          textAnchor="middle"
          fill={isFarm ? '#a9ba6c' : '#e7d7b1'}
          stroke="#12100c"
          strokeWidth="3"
          paintOrder="stroke"
          style={{
            fontFamily: isFarm ? 'var(--bb-display)' : 'var(--bb-body)',
            fontWeight: 600,
            fontSize: isFarm ? 13 : 14.5,
            fontStyle: isFarm ? 'italic' : undefined,
            letterSpacing: isFarm ? '0.03em' : '0.1em',
            textTransform: isFarm ? 'none' : 'uppercase',
          }}
        >
          {name}
        </text>
      </g>

      {/* game-end VP roundel — struck on the plate's top-right corner */}
      {vp !== undefined && (
        <g transform={`translate(${plateW - 2}, -2)`} data-vp-city={cityId}>
          <VpRoundel vp={vp} color={vpColor ?? '#e6bd63'} scale={1.15} />
        </g>
      )}
    </g>
  )
}

function EmptySlot({ allowed }: { allowed: IndustryType[] }) {
  const shown = allowed.slice(0, 2)
  return (
    <g>
      <rect
        width={SLOT}
        height={SLOT}
        rx="5"
        fill="#2a2014"
        fillOpacity="0.32"
        stroke="#8a744a"
        strokeOpacity="0.65"
        strokeWidth="1"
        strokeDasharray={allowed.length ? undefined : '3 3'}
      />
      {shown.map((t, i) => {
        const size = shown.length === 1 ? 30 : 22
        const x = shown.length === 1 ? (SLOT - size) / 2 : 4 + i * (size + 2)
        const y =
          shown.length === 1 ? (SLOT - size) / 2 : i === 0 ? 5 : SLOT - size - 5
        return (
          <g
            key={t}
            transform={`translate(${x}, ${y}) scale(${size / 24})`}
            opacity="0.8"
            style={{ color: '#4a3d29' }}
          >
            <IndustryFragment type={t} />
          </g>
        )
      })}
    </g>
  )
}

/** The •—• link-scoring glyph printed on physical tiles (0, 1 or 2). */
function LinkIcons({
  n,
  ink,
  x,
  y,
}: { n: number; ink: string; x: number; y: number }) {
  if (n <= 0) return null
  const count = Math.min(n, 2)
  return (
    <g
      transform={`translate(${x}, ${y})`}
      stroke={ink}
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      {/* stacked VERTICALLY: side by side they collide with the income
          figure on the narrow tile face */}
      {Array.from({ length: count }, (_, i) => (
        <g key={i} transform={`translate(0, ${(i - (count - 1) / 2) * 6.5})`}>
          <circle cx="0" cy="0" r="1.4" fill={ink} stroke="none" />
          <path d="M1.4 0 H7.6" />
          <circle cx="9" cy="0" r="1.4" fill={ink} stroke="none" />
        </g>
      ))}
    </g>
  )
}

// The tile face mirrors the physical layout: industry + level up top,
// resource cubes riding mid-tile, and the printed stats along the bottom —
// VP in a parchment roundel (left), •—• link icons (centre), income
// advance (right) — above the owner's ribbon.
function BuiltTile({ occ }: { occ: BuiltIndustry }) {
  const fill = occ.flipped ? '#f2e6c8' : INDUSTRY_FILL[occ.type]
  const ink = occ.flipped ? INDUSTRY_FILL[occ.type] : INDUSTRY_INK[occ.type]
  const statInk = occ.flipped ? '#4a3d29' : ink
  const cubes =
    occ.type === 'coal'
      ? { n: occ.coalCubesOnTile, c: '#1d1b18', s: '#e7d7b1' }
      : occ.type === 'iron'
        ? { n: occ.ironCubesOnTile, c: '#d07135', s: '#3a2010' }
        : occ.type === 'brewery'
          ? { n: occ.beerBarrelsOnTile, c: '#e8bc4f', s: '#5c451a' }
          : null

  return (
    <g>
      <rect
        width={SLOT}
        height={SLOT}
        rx="5"
        fill={fill}
        stroke={occ.flipped ? INDUSTRY_FILL[occ.type] : '#16130f'}
        strokeWidth={occ.flipped ? 2.2 : 1.2}
      />
      <g transform="translate(5, 4)" style={{ color: ink }}>
        <IndustryFragment type={occ.type} />
      </g>
      {/* level numeral */}
      <text
        x={SLOT - 5}
        y="13"
        textAnchor="end"
        fill={ink}
        style={{
          fontFamily: 'var(--bb-display)',
          fontWeight: 700,
          fontSize: 11.5,
        }}
      >
        {ROMAN[occ.level] ?? occ.level}
      </text>
      {/* resource cubes riding on the tile */}
      {cubes && cubes.n > 0 && (
        <g>
          {Array.from({ length: Math.min(cubes.n, 5) }, (_, i) => (
            <rect
              key={i}
              x={SLOT - 11}
              y={17 + i * 6.4}
              width="5.6"
              height="5.6"
              rx="1"
              fill={cubes.c}
              stroke={cubes.s}
              strokeWidth="0.8"
            >
              <title>resource cube on tile</title>
            </rect>
          ))}
        </g>
      )}
      {/* printed stats: VP roundel · link icons · income advance.
          Like the physical tile, the scoring side shows ONLY when the
          tile is flipped — an unflipped tile shows its working face. */}
      {occ.flipped && (
        <g>
          <circle
            cx="9.5"
            cy={SLOT - 14}
            r="6.6"
            fill="rgba(74,61,41,.14)"
            stroke="#4a3d29"
            strokeWidth="0.9"
          />
          <text
            x="9.5"
            y={SLOT - 11}
            textAnchor="middle"
            fill="#2a2014"
            style={{
              fontFamily: 'var(--bb-body)',
              fontWeight: 700,
              fontSize: 8.6,
            }}
          >
            {occ.tile.victoryPoints}
            <title>victory points scored</title>
          </text>
          <LinkIcons
            n={occ.tile.linkScoringIcons}
            ink={statInk}
            x={21}
            y={SLOT - 14}
          />
          <text
            x={SLOT - 4}
            y={SLOT - 10.5}
            textAnchor="end"
            fill={statInk}
            style={{
              fontFamily: 'var(--bb-body)',
              fontWeight: 700,
              fontSize: 8.6,
            }}
          >
            {`+${occ.tile.incomeAdvancement}`}
            <title>income advance</title>
          </text>
        </g>
      )}
      {/* flipped seal */}
      {occ.flipped && (
        <g transform={`translate(${SLOT - 9}, 22)`}>
          <circle r="5.6" fill="#c39538" stroke="#7a5c22" strokeWidth="1" />
          <path
            d="M-2.3 0 L-0.5 2 L2.8 -2"
            stroke="#241a08"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {/* owner ribbon */}
      <rect
        x="0"
        y={SLOT - 6}
        width={SLOT}
        height="6"
        rx="2"
        fill={PLAYER_FILL[occ.owner.color]}
        stroke="#16130f"
        strokeWidth="0.8"
      />
    </g>
  )
}

/* ================= merchant plate ================= */

function MerchantPlate({
  cityId,
  entries,
  dimmed,
  inNetwork = false,
  networkColor = null,
  located = false,
  vp = undefined,
  vpColor = null,
}: {
  cityId: CityId
  entries: Merchant[]
  dimmed: boolean
  inNetwork?: boolean
  networkColor?: string | null
  located?: boolean
  /** Game-end: VP the shown player took from this merchant's bonus. */
  vp?: number
  vpColor?: string | null
}) {
  const pos = cityPos[cityId]
  const n = Math.max(entries.length, 2)
  const plateW = n * SLOT + (n - 1) * SLOT_GAP + PLATE_PAD * 2
  const plateH = SLOT + PLATE_PAD * 2
  const name = cities[cityId].name
  const closed = entries.length === 0
  const bonusLabel = (m: Merchant) =>
    m.bonusType === 'money'
      ? `+£${m.bonusValue}`
      : m.bonusType === 'income'
        ? `+${m.bonusValue} INCOME`
        : m.bonusType === 'victoryPoints'
          ? `+${m.bonusValue} VP`
          : 'DEVELOP'

  return (
    <g
      transform={`translate(${pos.x - plateW / 2}, ${pos.y - plateH / 2})`}
      data-city={cityId}
      data-located={located || undefined}
      opacity={dimmed && !located ? 0.45 : closed && !located ? 0.3 : 1}
      style={{ transition: 'opacity .2s' }}
    >
      {located && <LocateMark plateW={plateW} plateH={plateH} rx={12} />}
      {vp !== undefined && (
        <rect
          x="-6"
          y="-6"
          width={plateW + 12}
          height={plateH + 12}
          rx="11"
          fill={vpColor ?? '#e6bd63'}
          fillOpacity="0.16"
          stroke={vpColor ?? '#e6bd63'}
          strokeOpacity="0.9"
          strokeWidth="2.2"
          pointerEvents="none"
        />
      )}
      {inNetwork && networkColor && (
        <rect
          x="-7"
          y="-7"
          width={plateW + 14}
          height={plateH + 14}
          rx="12"
          fill={networkColor}
          fillOpacity="0.13"
          stroke={networkColor}
          strokeOpacity="0.75"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
      <rect
        width={plateW}
        height={plateH}
        rx="7"
        fill="url(#bb2-merchant-plate)"
        stroke="#c39538"
        strokeOpacity="0.6"
        strokeWidth="1.4"
        filter="url(#bb2-plate-shadow)"
      />
      {(closed ? Array.from({ length: n }, () => null) : entries).map(
        (m, i) => {
          const sx = PLATE_PAD + i * (SLOT + SLOT_GAP)
          return (
            <g key={i} transform={`translate(${sx}, ${PLATE_PAD})`}>
              <rect
                width={SLOT}
                height={SLOT}
                rx="5"
                fill="#16130f"
                fillOpacity="0.55"
                stroke="#c39538"
                strokeOpacity={m ? 0.5 : 0.2}
                strokeWidth="1"
                strokeDasharray={m ? undefined : '3 3'}
              />
              {m && m.industryIcons.length > 0 ? (
                m.industryIcons.slice(0, 3).map((t, j) => {
                  const count = Math.min(m.industryIcons.length, 3)
                  const size = count === 1 ? 24 : 15
                  const x =
                    count === 1 ? (SLOT - size) / 2 : 4 + (j % 2) * (size + 4)
                  const y =
                    count === 1
                      ? (SLOT - size) / 2
                      : 3.5 + Math.floor(j / 2) * (size + 4)
                  return (
                    <g
                      key={j}
                      transform={`translate(${x}, ${y}) scale(${size / 24})`}
                      style={{ color: '#e6bd63' }}
                    >
                      <IndustryFragment type={t} />
                    </g>
                  )
                })
              ) : m ? (
                // blank merchant tile — buys nothing
                <text
                  x={SLOT / 2}
                  y={SLOT / 2 + 5}
                  textAnchor="middle"
                  fill="#e7d7b1"
                  fillOpacity="0.35"
                  style={{ fontFamily: 'var(--bb-display)', fontSize: 15 }}
                >
                  ✕
                </text>
              ) : null}
              {/* beer barrel ready at this merchant — drawn as a barrel,
                  not an anonymous dot (captain feedback 2026-07-14) */}
              {m?.hasBeer && (
                <g transform={`translate(${SLOT - 7}, 6.5)`}>
                  <title>
                    Beer barrel available — consumed when selling to this
                    merchant
                  </title>
                  <ellipse
                    cx="0"
                    cy="0"
                    rx="4.2"
                    ry="5.2"
                    fill="#e8bc4f"
                    stroke="#5c451a"
                    strokeWidth="1.2"
                  />
                  <line
                    x1="-4.2"
                    y1="-1.7"
                    x2="4.2"
                    y2="-1.7"
                    stroke="#5c451a"
                    strokeWidth="0.9"
                  />
                  <line
                    x1="-4.2"
                    y1="1.7"
                    x2="4.2"
                    y2="1.7"
                    stroke="#5c451a"
                    strokeWidth="0.9"
                  />
                </g>
              )}
            </g>
          )
        },
      )}

      {/* the two •—• link-scoring icons printed at every merchant location
          (GAME_CONSTANTS.MERCHANT_LINK_ICONS — worth 2 to adjacent links) */}
      <g transform={`translate(${plateW / 2 - 15}, -7)`} pointerEvents="none">
        <title>2 link-scoring icons at this merchant</title>
        {[0, 1].map((i) => (
          <g
            key={i}
            transform={`translate(${i * 17}, 0)`}
            stroke="#c39538"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="0" cy="0" r="1.7" fill="#c39538" stroke="none" />
            <path d="M1.7 0 H9.3" />
            <circle cx="11" cy="0" r="1.7" fill="#c39538" stroke="none" />
          </g>
        ))}
      </g>

      {/* name + bonus */}
      <g
        transform={`translate(${plateW / 2}, ${plateH + 13})`}
        pointerEvents="none"
      >
        <text
          textAnchor="middle"
          fill="#e6bd63"
          stroke="#12100c"
          strokeWidth="3"
          paintOrder="stroke"
          style={{
            fontFamily: 'var(--bb-body)',
            fontWeight: 700,
            fontSize: 14.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {name}
        </text>
        {!closed && entries[0] && (
          <text
            y="14"
            textAnchor="middle"
            fill="#e7d7b1"
            fillOpacity="0.65"
            stroke="#12100c"
            strokeWidth="2.5"
            paintOrder="stroke"
            style={{
              fontFamily: 'var(--bb-body)',
              fontWeight: 600,
              fontSize: 9.5,
              letterSpacing: '0.16em',
            }}
          >
            {bonusLabel(entries[0])}
          </text>
        )}
      </g>

      {/* game-end VP roundel — the bonus this merchant paid out */}
      {vp !== undefined && (
        <g transform={`translate(${plateW - 2}, -2)`} data-vp-city={cityId}>
          <VpRoundel vp={vp} color={vpColor ?? '#e6bd63'} scale={1.15} />
        </g>
      )}
    </g>
  )
}
