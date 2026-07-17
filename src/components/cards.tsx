'use client'

// Real card faces for the hand — parchment stock, region-coloured bands for
// location cards, engraved industry glyphs for industry cards, and a dark
// compass-star face for wilds. Replaces v1's text-button hand.
import { useLayoutEffect, useRef, useState } from 'react'
import { type CityId, cities } from '~/data/board'
import { type Card as GameCard, type IndustryType } from '~/data/cards'
import { CardsIcon, IndustryFragment, WildIcon } from './icons'
import { CityName } from './locate'

/**
 * A card name that shrinks to fit the card's fixed width. Long single-word
 * names (Wolverhampton, Kidderminster) can't wrap and would otherwise spill
 * past the 108px card edge; this steps the font down until the widest line
 * fits. Multi-word names still wrap naturally at their spaces, so they keep
 * the full size — the shrink only kicks in when a word is itself too wide.
 * Measured in layout px (transform-independent), so the magnified lens copy
 * fits identically then scales up with the card.
 */
function FitText({
  text,
  max,
  min = 9,
  className,
}: {
  text: string
  max: number
  min?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(max)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let s = max
    el.style.fontSize = `${s}px`
    // scrollWidth > clientWidth only when an unbreakable word overflows the
    // box — wrapping lines never do, so multi-word names are left untouched.
    while (s > min && el.scrollWidth > el.clientWidth) {
      s -= 0.5
      el.style.fontSize = `${s}px`
    }
    setSize(s)
  }, [text, max, min])

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontSize: `${size}px`, display: 'block', width: '100%' }}
    >
      {text}
    </span>
  )
}

/**
 * A location's engraved emblem: a gabled Midlands mill house — arched door,
 * lit windows — beside a tall works chimney trailing smoke. Reads as a place
 * AND keeps the industrial theme, in the same single-ink engraving style as
 * the rest of the card art.
 */
function LocationEmblem() {
  const ink = 'rgba(74,61,41,.82)'
  const faint = 'rgba(74,61,41,.5)'
  return (
    <svg width="50" height="32" viewBox="0 0 50 32" fill="none" aria-hidden>
      {/* smoke from the chimney */}
      <path
        d="M39 10.5c-1.5-1.6 1.2-2.6-.3-4.3M41.4 10.2c-1.3-1.5 1-2.5-.3-4"
        stroke={faint}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* mill house body + gable roof */}
      <path
        d="M9 30V16l11-8 11 8v14"
        fill="rgba(74,61,41,.05)"
        stroke={ink}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* eaves line */}
      <path
        d="M7.5 16.5h25"
        stroke={ink}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* arched door */}
      <path
        d="M17 30v-4.2a3 3 0 0 1 6 0V30"
        stroke={ink}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* windows */}
      <path
        d="M11.8 19.5h3.4v3.2h-3.4zM24.8 19.5h3.4v3.2h-3.4z"
        fill="rgba(74,61,41,.12)"
        stroke={faint}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* works chimney + cap */}
      <path
        d="M37 30V13.5h4V30M35.8 13.5h6.4"
        stroke={ink}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ground */}
      <path d="M4 30h43" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const REGION_BAND: Record<string, string> = {
  blue: '#45719d',
  teal: '#4e9c96',
  other: '#8a744a',
}

const INDUSTRY_TINT: Record<IndustryType, string> = {
  cotton: '#b3a27c',
  coal: '#3b3833',
  iron: '#b05c26',
  manufacturer: '#a5433a',
  pottery: '#b08e1d',
  brewery: '#6d7c36',
}

const INDUSTRY_LABEL: Record<IndustryType, string> = {
  cotton: 'Cotton Mill',
  coal: 'Coal Mine',
  iron: 'Iron Works',
  manufacturer: 'Manufacturer',
  pottery: 'Pottery',
  brewery: 'Brewery',
}

export function cardTitle(card: GameCard): string {
  switch (card.type) {
    case 'location':
      return cities[card.location as CityId]?.name ?? card.location
    case 'industry':
      return card.industries.map((i) => INDUSTRY_LABEL[i]).join(' / ')
    case 'wild_location':
      return 'Wild Location'
    case 'wild_industry':
      return 'Wild Industry'
  }
}

function Flourish({ color = 'rgba(74,61,41,.5)' }: { color?: string }) {
  return (
    <svg width="54" height="10" viewBox="0 0 54 10" fill="none" aria-hidden>
      <path
        d="M2 5h16M36 5h16M27 1.5 30.5 5 27 8.5 23.5 5z"
        stroke={color}
        strokeWidth="1.2"
      />
    </svg>
  )
}

export interface CardFaceProps {
  card: GameCard
  className?: string
}

/** The visual face of a card — sized by the .bb2-card class (108x156). */
export function CardFaceContent({ card }: { card: GameCard }) {
  if (card.type === 'wild_location' || card.type === 'wild_industry') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-between py-3">
        <span
          className="text-[8px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          Wild
        </span>
        <span style={{ color: 'var(--bb-brass-bright)' }}>
          <WildIcon size={44} strokeWidth={1.4} />
        </span>
        <div className="flex flex-col items-center gap-1 px-1 text-center">
          <span
            className="bb2-display text-[13px] font-bold leading-tight"
            style={{ color: 'var(--bb-brass-bright)' }}
          >
            {card.type === 'wild_location' ? 'Any Location' : 'Any Industry'}
          </span>
          <span
            className="text-[8px] uppercase tracking-[0.2em]"
            style={{ color: 'rgba(231,215,177,.5)' }}
          >
            Scouted
          </span>
        </div>
      </div>
    )
  }

  if (card.type === 'location') {
    const band = REGION_BAND[card.color] ?? REGION_BAND.other
    const name = cities[card.location as CityId]?.name ?? card.location
    return (
      <div className="flex h-full w-full flex-col items-center">
        {/* region band */}
        <div
          className="flex h-[26px] w-full items-center justify-center"
          style={{
            background: `linear-gradient(180deg, ${band}, ${band}cc)`,
            borderBottom: '1px solid rgba(42,32,20,.4)',
          }}
        >
          <span
            className="text-[8px] font-bold uppercase tracking-[0.3em]"
            style={{ color: '#f2e6c8' }}
          >
            Location
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
          <LocationEmblem />
          <FitText
            text={name}
            max={15}
            className="bb2-display font-bold leading-[1.05] text-[color:var(--bb-ink)]"
          />
          <Flourish />
        </div>
      </div>
    )
  }

  // industry card
  const types = card.industries
  return (
    <div className="flex h-full w-full flex-col items-center">
      <div
        className="flex h-[26px] w-full items-center justify-center"
        style={{
          background:
            'linear-gradient(180deg, rgba(74,61,41,.85), rgba(74,61,41,.65))',
          borderBottom: '1px solid rgba(42,32,20,.4)',
        }}
      >
        <span
          className="text-[8px] font-bold uppercase tracking-[0.3em]"
          style={{ color: '#f2e6c8' }}
        >
          Industry
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 text-center">
        <div className="flex items-center justify-center gap-1">
          {types.slice(0, 2).map((t) => (
            <svg
              key={t}
              width={types.length > 1 ? 34 : 44}
              height={types.length > 1 ? 34 : 44}
              viewBox="0 0 24 24"
              fill="none"
              stroke={INDUSTRY_TINT[t]}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: INDUSTRY_TINT[t] }}
              aria-hidden
            >
              <IndustryFragment type={t} />
            </svg>
          ))}
        </div>
        <FitText
          text={types.map((t) => INDUSTRY_LABEL[t]).join(' or ')}
          max={13}
          className="bb2-display font-bold leading-[1.1] text-[color:var(--bb-ink)]"
        />
        <Flourish />
      </div>
    </div>
  )
}

/** Face-down card back. */
export function CardBack({ className }: { className?: string }) {
  return (
    <div className={`bb2-card bb2-card-back ${className ?? ''}`}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2">
        <span style={{ color: 'var(--bb-brass)' }}>
          <CardsIcon size={30} strokeWidth={1.4} />
        </span>
        <span
          className="bb2-display text-[16px] font-black tracking-[0.3em]"
          style={{ color: 'var(--bb-brass)' }}
        >
          BRASS
        </span>
      </div>
    </div>
  )
}

/** A small inline card chip for confirmation summaries. */
export function CardChip({ card }: { card: GameCard }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[12px] font-semibold"
      style={{
        borderColor: 'var(--bb-brass-hairline)',
        background: 'rgba(195,149,56,.1)',
        color: 'var(--bb-parchment-bright)',
      }}
    >
      <CardsIcon size={11} />
      {card.type === 'location' ? (
        // A location card names a city — hovering it finds it on the map.
        <CityName cityId={card.location} focusable={false} />
      ) : (
        cardTitle(card)
      )}
    </span>
  )
}
