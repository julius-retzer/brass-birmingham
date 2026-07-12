// Hand-drawn stroke glyphs for industries, resources and actions.
// All icons render on a 24x24 grid, stroke-based for an engraved feel,
// and inherit `currentColor` so surfaces can tint them.
import type { IndustryType } from '~/data/cards'

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function base(
  { size = 16, className, strokeWidth = 1.8 }: IconProps,
  children: React.ReactNode,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/* ---------- industries ---------- */

// Raw 24x24 path fragments, shared between the HTML icons below and the
// SVG board (which wraps them in its own <g stroke=...> transforms).
// Subjects follow the PHYSICAL game's tile iconography (goods crates,
// cotton bale, coal lumps, iron ingots, urn, barrel) drawn in the Atlas's
// engraved single-weight stroke style. Stroke-only — every consumer sets
// its own stroke colour and fill="none".
export function IndustryFragment({ type }: { type: IndustryType }) {
  switch (type) {
    case 'cotton':
      // cotton bale — strapped bale with the raw boll billowing on top
      return (
        <>
          <path d="M4.5 11.5v6.5a1.2 1.2 0 0 0 1.2 1.2h12.6a1.2 1.2 0 0 0 1.2-1.2v-6.5" />
          <path d="M9.4 11.6v7.6M14.6 11.6v7.6" />
          <path d="M4.5 11.5c-2-.6-2.3-3.3-.2-4.2-.1-2.4 2.8-3.5 4.4-2C9.6 3.2 14.4 3.2 15.3 5.3c1.6-1.5 4.5-.4 4.4 2 2.1.9 1.8 3.6-.2 4.2z" />
        </>
      )
    case 'coal':
      // a pile of faceted coal lumps
      return (
        <>
          <path d="M8.7 9.4 12 6.4l3.4 3-0.5 3.6h-5.7z" />
          <path d="M4 17.5l1-3.6 3.7-1 3 2.4-.6 2.2z" />
          <path d="M12.9 17.5l-.6-2.2 3-2.4 3.7 1 1 3.6z" />
          <path d="M12 6.4l-.8 3.4 1.9 3.2" />
        </>
      )
    case 'iron':
      // stacked pig-iron ingots (two below, one atop)
      return (
        <>
          <path d="M3.5 18.5 5.2 14.6h5.4l1.2 3.9zM12.1 18.5l1.3-3.9h5.4l1.7 3.9z" />
          <path d="M7.8 14.6 9.4 10.7h5.2l1.6 3.9" />
          <path d="M9.4 10.7l1 3.9M14.6 10.7l-1 3.9" />
        </>
      )
    case 'manufacturer':
      // stacked goods crates — X-braced crate atop two planked crates
      return (
        <>
          <path d="M3.5 13.2h8.2v6.6H3.5zM12.3 13.2h8.2v6.6h-8.2z" />
          <path d="M7.9 6.2h8.2v7h-8.2z" />
          <path d="M8.3 6.6l7.4 6.2M15.7 6.6l-7.4 6.2" />
          <path d="M3.5 16.8h8.2M12.3 16.8h8.2" />
        </>
      )
    case 'pottery':
      // amphora — necked urn with side handles and a footed base
      return (
        <>
          <path d="M9.2 4.3h5.6" />
          <path d="M10.3 4.3c0 1.6-.8 2.4-1.9 3.3-1.4 1.2-2.2 2.7-2.2 4.5 0 3.4 2.4 5.6 5.8 5.6s5.8-2.2 5.8-5.6c0-1.8-.8-3.3-2.2-4.5-1.1-.9-1.9-1.7-1.9-3.3" />
          <path d="M9.7 17.4c.3 1-.1 1.7-1 2.4h6.6c-.9-.7-1.3-1.4-1-2.4" />
          <path d="M8.4 7.9c-1.9-.6-3 .5-2.1 2.1M15.6 7.9c1.9-.6 3 .5 2.1 2.1" />
        </>
      )
    case 'brewery':
      // oak barrel — bulged staves, two iron hoops, bung
      return (
        <>
          <path d="M7.4 4.5C6.1 6.8 5.5 9.3 5.5 12s.6 5.2 1.9 7.5h9.2c1.3-2.3 1.9-4.8 1.9-7.5s-.6-5.2-1.9-7.5z" />
          <path d="M6.1 8.3h11.8M6.1 15.7h11.8" />
          <path d="M10.3 4.5c-.5 4.8-.5 10.2 0 15M13.7 4.5c.5 4.8.5 10.2 0 15" />
          <circle cx="12" cy="12" r="1.1" />
        </>
      )
  }
}

export function CottonIcon(p: IconProps) {
  return base(p, <IndustryFragment type="cotton" />)
}

export function CoalIcon(p: IconProps) {
  return base(p, <IndustryFragment type="coal" />)
}

export function IronIcon(p: IconProps) {
  return base(p, <IndustryFragment type="iron" />)
}

export function ManufacturerIcon(p: IconProps) {
  return base(p, <IndustryFragment type="manufacturer" />)
}

export function PotteryIcon(p: IconProps) {
  return base(p, <IndustryFragment type="pottery" />)
}

export function BreweryIcon(p: IconProps) {
  return base(p, <IndustryFragment type="brewery" />)
}

export const INDUSTRY_ICONS: Record<
  IndustryType,
  (p: IconProps) => React.ReactNode
> = {
  cotton: CottonIcon,
  coal: CoalIcon,
  iron: IronIcon,
  manufacturer: ManufacturerIcon,
  pottery: PotteryIcon,
  brewery: BreweryIcon,
}

export function IndustryGlyph({
  type,
  ...p
}: IconProps & { type: IndustryType }) {
  const Icon = INDUSTRY_ICONS[type]
  return <>{Icon(p)}</>
}

/* ---------- actions & misc ---------- */

export function BuildIcon(p: IconProps) {
  // trowel & brick
  return base(
    p,
    <>
      <rect x="4" y="14" width="9" height="6" rx="1" />
      <path d="M13.5 10.5 19 5l1.5 1.5-5.5 5.5zM13.5 10.5l-2 2" />
    </>,
  )
}

export function NetworkIcon(p: IconProps) {
  // a junction — one route diverging into two, sleepers ticked across
  return base(
    p,
    <>
      <path d="M7 20.5C7 13.5 9.5 10 12 4M17 20.5C17 13.5 14.5 10 12 4" />
      <path d="M6.2 17.5h3.4M14.4 17.5h3.4M7.2 13.5h3M13.8 13.5h3M9 9.5h6" />
    </>,
  )
}

export function DevelopIcon(p: IconProps) {
  // rising flask / crucible with spark
  return base(
    p,
    <>
      <path d="M9 4h6M10.5 4v5L6 17.5A2 2 0 0 0 7.8 20h8.4a2 2 0 0 0 1.8-2.5L13.5 9V4" />
      <path d="M12 12.5v-2" />
    </>,
  )
}

export function SellIcon(p: IconProps) {
  // scales
  return base(
    p,
    <>
      <path d="M12 4v16M8 20h8M12 6.5 6 8m6-1.5L18 8" />
      <path d="M3.5 13.5 6 8l2.5 5.5a2.7 2.7 0 0 1-5 0zM15.5 13.5 18 8l2.5 5.5a2.7 2.7 0 0 1-5 0z" />
    </>,
  )
}

export function LoanIcon(p: IconProps) {
  // sovereign coin
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.8 9.2c-.6-.8-1.6-1.2-2.7-1.2-1.9 0-3.3 1-3.3 2.2 0 3 6.4 1.3 6.4 4 0 1.3-1.5 2.1-3.2 2.1-1.3 0-2.4-.5-3-1.3M12 6.5V8m0 8v1.5" />
    </>,
  )
}

export function ScoutIcon(p: IconProps) {
  // spyglass
  return base(
    p,
    <>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14 14l6 6" />
      <path d="M7.5 9.5c.4-1.2 1.4-2 2.7-2.2" strokeWidth={1.2} />
    </>,
  )
}

export function PassIcon(p: IconProps) {
  // hourglass
  return base(
    p,
    <>
      <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 3 5.5 4 8.5-1 3-4 4.5-4 8.5M16 3.5c0 4-3 5.5-4 8.5 1 3 4 4.5 4 8.5" />
    </>,
  )
}

export function CanalIcon(p: IconProps) {
  return base(
    p,
    <>
      <path d="M3 9c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
    </>,
  )
}

export function RailIcon(p: IconProps) {
  return base(
    p,
    <>
      <path d="M6 4v16M18 4v16M6 8h12M6 13h12M6 18h12" />
    </>,
  )
}

export function WildIcon(p: IconProps) {
  // compass star
  return base(
    p,
    <>
      <path d="M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z" />
    </>,
  )
}

export function PoundIcon(p: IconProps) {
  return base(
    p,
    <>
      <path d="M15.5 6.5C15 5 13.8 4 12.2 4 10.2 4 9 5.6 9 7.6c0 3-.5 5.4-2 8.4h10M7 12h7M7 20h10c-1.2-1.2-1.6-2.4-1.4-4" />
    </>,
  )
}

export function IncomeIcon(p: IconProps) {
  return base(
    p,
    <>
      <path d="M4 18c3-2 4.5-6 6-6s2.5 3 4 3 3.5-4 6-7" />
      <path d="M16.5 8H20v3.5" />
    </>,
  )
}

export function LaurelIcon(p: IconProps) {
  // victory laurel
  return base(
    p,
    <>
      <path d="M6 4c-1.5 5.5 0 11 6 14 6-3 7.5-8.5 6-14" />
      <path d="M6.5 8.5 9 9.5M6.8 12l2.6.7M8.3 15.2l2.4.4M17.5 8.5 15 9.5M17.2 12l-2.6.7M15.7 15.2l-2.4.4M12 18v3" />
    </>,
  )
}

export function CardsIcon(p: IconProps) {
  return base(
    p,
    <>
      <rect x="4" y="6" width="10" height="14" rx="1.5" />
      <path d="M9 4h10a1.5 1.5 0 0 1 1.5 1.5V18" />
    </>,
  )
}
