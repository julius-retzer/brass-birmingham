// Shared hover-preview highlight-set computation for the v2 board map.
//
// Hovering a hand card previews its build targets on the map: a location
// card spotlights its printed city; an industry card spotlights every city
// with a matching industry slot inside the hovering player's network
// (anywhere while they have no presence yet). This is a soft ORIENTATION
// hint — final build legality is still decided by the machine when the flow
// actually starts. The logic is shared verbatim by the hotseat surface
// (`v2-game.tsx`) and the networked surface (`mp/mp-game.tsx`) so the two
// never drift.
import { type CityId, cityIndustrySlots } from '../../data/board'
import type { Card } from '../../data/cards'

/**
 * Cities to spotlight while `hoveredCard` is hovered, given the hovering
 * player's `networkCities`. Returns `null` when there is nothing to preview
 * (no card hovered, or a wild card that could go anywhere).
 */
export function computeHoverCities(
  hoveredCard: Card | null,
  networkCities: ReadonlySet<CityId> | null,
): Set<string> | null {
  if (!hoveredCard) return null
  if (hoveredCard.type === 'location') {
    return new Set<string>([hoveredCard.location])
  }
  if (hoveredCard.type !== 'industry') return null // wilds: anywhere
  const network = networkCities ?? new Set<CityId>()
  const anywhere = network.size === 0
  const set = new Set<string>()
  for (const [cityId, slots] of Object.entries(cityIndustrySlots)) {
    if (!anywhere && !network.has(cityId as CityId)) continue
    if (
      slots.some((slot) => hoveredCard.industries.some((t) => slot.includes(t)))
    ) {
      set.add(cityId)
    }
  }
  return set
}
