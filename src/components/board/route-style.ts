// Pure styling for the southern Farm Brewery's implicit spur.
//
// farmBrewery2 has no connection edge of its own — the kidderminster–worcester
// corridor connects all three locations (rules p.5, see
// linkConnectedLocations in data/board.ts). The board draws a short visual
// spur from that corridor to the brewery, and the spur MUST read with the same
// era/type as the corridor it belongs to: a built rail link is orange, a built
// canal link teal. It must never fall back to a canal graphic just because the
// underlying edge supports canal — that was the rail-era bug where a built rail
// link painted the spur canal-teal (#4e9c96 == the canal main stroke).

export type RouteType = 'canal' | 'rail'

export interface FarmSpurStyle {
  stroke: string
  strokeOpacity: number
  strokeWidth: number
  strokeDasharray?: string
}

// The route palette, shared with the corridor rendering in board-map.tsx.
const CANAL_STROKE = '#4e9c96'
const RAIL_STROKE = '#c2632f'
// Unbuilt spur: an era-neutral olive "potential connection" hint, deliberately
// distinct from any real (teal canal / orange rail) link graphic.
const POTENTIAL_STROKE = '#7a8b3d'

/**
 * Stroke style for the farmBrewery2 spur, derived from the kidderminster–
 * worcester corridor's BUILT type. A built link mirrors its own type's colour;
 * an unbuilt corridor shows the era-neutral potential hint (never a canal
 * graphic).
 */
export function farmBrewerySpurStyle(
  builtType: RouteType | null,
): FarmSpurStyle {
  if (builtType) {
    return {
      stroke: builtType === 'canal' ? CANAL_STROKE : RAIL_STROKE,
      strokeOpacity: 0.8,
      strokeWidth: 3.5,
    }
  }
  return {
    stroke: POTENTIAL_STROKE,
    strokeOpacity: 0.35,
    strokeWidth: 2,
    strokeDasharray: '4 5',
  }
}
