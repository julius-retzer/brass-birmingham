// The move plan for the "realistic networked opening" playthrough, computed
// from PUBLIC state (board data + the shuffled merchant tiles). Shared by the
// offline wire test (src/server/mp/playthrough.test.ts) and the two-browser
// UI journey (e2e/mp-playthrough.spec.ts) so both replay the SAME opening:
//   - the seller links a cotton-buying merchant, mills beside it, brews
//     anywhere, and sells into a genuine beer-source choice
//   - the rival stands up TWO iron works near a merchant (market coal), which
//     turns the seller's develop into a genuine iron-source choice
// These helpers only read board DATA and choose sites; every rule stays with
// the engine — each move is validated by the machine's own guards when sent.
import { cities, cityIndustrySlots, connections } from '../data/board'

export interface MerchantSlot {
  location: string
  hasBeer: boolean
  industryIcons: string[]
}

export const canalNeighbors = (city: string): string[] =>
  connections
    .filter(
      (c) =>
        (c.from === city || c.to === city) &&
        (c.types as readonly string[]).includes('canal'),
    )
    .map((c) => (c.from === city ? c.to : c.from))

export const hasSlotFor = (city: string, industry: string): boolean =>
  ((cityIndustrySlots as Record<string, string[][]>)[city] ?? []).some((slot) =>
    slot.includes(industry),
  )

export const isRegularCity = (city: string): boolean =>
  (cities as Record<string, { type: string }>)[city]?.type === 'city'

export const MERCHANT_LOCATIONS = Object.keys(cities).filter(
  (id) => (cities as Record<string, { type: string }>)[id]?.type === 'merchant',
)

/** The merchant this seat sells cotton to, and the adjacent city to mill it. */
export const pickCottonPlan = (merchants: MerchantSlot[]) => {
  for (const m of merchants) {
    if (!m.hasBeer || !m.industryIcons.includes('cotton')) continue
    const city = canalNeighbors(m.location).find(
      (c) => isRegularCity(c) && hasSlotFor(c, 'cotton'),
    )
    if (city) return { merchant: m.location, mill: city }
  }
  return null
}

/**
 * Two iron-works sites wired to a merchant (for market coal), plus every canal
 * link needed to reach them. The second site is found by growing the network
 * one canal link at a time (BFS), because some shuffles leave no iron slot
 * directly beside the first — the rival simply builds a couple more links.
 */
export const pickIronPlan = (avoid: Set<string>) => {
  for (const q of MERCHANT_LOCATIONS) {
    const first = canalNeighbors(q).find(
      (c) => isRegularCity(c) && hasSlotFor(c, 'iron') && !avoid.has(c),
    )
    if (!first) continue

    // BFS outward from the {first, q} network along canal edges.
    const parent = new Map<string, string>()
    const queue = [first, q]
    const seen = new Set(queue)
    let second: string | null = null
    while (queue.length > 0 && !second) {
      const here = queue.shift()!
      for (const next of canalNeighbors(here)) {
        if (seen.has(next)) continue
        seen.add(next)
        parent.set(next, here)
        if (
          next !== first &&
          isRegularCity(next) &&
          hasSlotFor(next, 'iron') &&
          !avoid.has(next)
        ) {
          second = next
          break
        }
        queue.push(next)
      }
    }
    if (!second) continue

    const extensionLinks: Array<{ from: string; to: string }> = []
    for (let at = second; parent.has(at); at = parent.get(at)!) {
      extensionLinks.unshift({ from: parent.get(at)!, to: at })
    }
    if (extensionLinks.length > 3) continue // keep the opening realistic
    return { market: q, first, second, extensionLinks }
  }
  return null
}

export const pickBreweryCity = (avoid: Set<string>) =>
  Object.keys(cityIndustrySlots).find(
    (c) => isRegularCity(c) && hasSlotFor(c, 'brewery') && !avoid.has(c),
  )

/** Display name for a location id, as the UI renders it. */
export const cityDisplayName = (id: string): string =>
  (cities as Record<string, { name: string }>)[id]?.name ?? id
