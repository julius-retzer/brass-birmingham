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
export function IndustryFragment({ type }: { type: IndustryType }) {
  switch (type) {
    case 'cotton':
      // cotton boll — three lobes on a stem
      return (
        <>
          <circle cx="9" cy="9" r="3.4" />
          <circle cx="15" cy="9" r="3.4" />
          <circle cx="12" cy="13.5" r="3.6" />
          <path d="M12 17.2V21M12 21l-2.4 -1.7M12 21l2.4-1.7" />
        </>
      )
    case 'coal':
      // faceted coal lump
      return (
        <>
          <path d="M12 3.5 19 8l-1.5 8.5L12 20.5 6.5 16.5 5 8z" />
          <path d="M12 3.5 10 11l4.5 2M10 11l-3.5 5.5M10 11 5 8" />
        </>
      )
    case 'iron':
      // anvil
      return (
        <path d="M4 8h13c1.8 0 3-1 3.5-2.5-1 4.5-3.5 6-6.5 6.5v4h2.5v3h-9v-3H10v-4C7 12 4.5 10.5 4 8z" />
      )
    case 'manufacturer':
      // cog
      return (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 4.5v2.4M12 17.1v2.4M4.5 12h2.4M17.1 12h2.4M6.7 6.7l1.7 1.7M15.6 15.6l1.7 1.7M17.3 6.7l-1.7 1.7M8.4 15.6l-1.7 1.7" />
        </>
      )
    case 'pottery':
      // urn
      return (
        <path d="M9 4h6M10.5 4c0 2-2.8 3-2.8 6.5 0 3 1.6 4.6 1.6 6.5 0 1.6-1 2.3-2 3h9.4c-1-0.7-2-1.4-2-3 0-1.9 1.6-3.5 1.6-6.5C15.8 7 13.5 6 13.5 4" />
      )
    case 'brewery':
      // barrel
      return (
        <>
          <path d="M8 4.5h8c1 2.2 1.5 4.7 1.5 7.5s-.5 5.3-1.5 7.5H8c-1-2.2-1.5-4.7-1.5-7.5S7 6.7 8 4.5z" />
          <path d="M6.8 9h10.4M6.8 15h10.4M12 4.5v15" />
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
  // two nodes, one route
  return base(
    p,
    <>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M7.5 16.5c3-3 6-3 9-9" strokeDasharray="3 2.4" />
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
