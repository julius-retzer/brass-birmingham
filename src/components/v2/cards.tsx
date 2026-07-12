'use client'

// Real card faces for the hand — parchment stock, region-coloured bands for
// location cards, engraved industry glyphs for industry cards, and a dark
// compass-star face for wilds. Replaces v1's text-button hand.
import { type CityId, cities } from '~/data/board'
import { type Card as GameCard, type IndustryType } from '~/data/cards'
import { CardsIcon, IndustryFragment, WildIcon } from './icons'

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
          {/* rooftop engraving */}
          <svg
            width="44"
            height="26"
            viewBox="0 0 44 26"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 24V14l6-5v5M10 24V14m0-5 8-6 8 6M18 24V11m8 13V11m6 13V12l6-4v16M2 24h40"
              stroke="rgba(74,61,41,.75)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="bb2-display text-[15px] font-bold leading-[1.05] text-[color:var(--bb-ink)]">
            {name}
          </span>
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
              aria-hidden
            >
              <IndustryFragment type={t} />
            </svg>
          ))}
        </div>
        <span className="bb2-display text-[13px] font-bold leading-[1.1] text-[color:var(--bb-ink)]">
          {types.map((t) => INDUSTRY_LABEL[t]).join(' or ')}
        </span>
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
      {cardTitle(card)}
    </span>
  )
}
