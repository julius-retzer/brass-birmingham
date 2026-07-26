import { describe, expect, it } from 'vitest'
import { type CityId, cities, connections } from '~/data/board'
import { VIEW_H, VIEW_W, linkKey } from './board-data'
import {
  type Rect,
  linkMarkerAnchor,
  markerBoxAt,
  plateObstacles,
  plateRect,
  pointAt,
  routeCurve,
} from './marker-anchor'

function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

function occludedBy(from: CityId, to: CityId, at: { x: number; y: number }) {
  const box = markerBoxAt(at)
  return plateObstacles().filter((r) => overlaps(box, r)).length
}

describe('plate boxes', () => {
  const ids = Object.keys(cities) as CityId[]

  it('all sit inside the board viewBox', () => {
    // Anything past the edges is simply not drawn, and merchant plates reach
    // further from their city point than city plates do.
    for (const id of ids) {
      const r = plateRect(id)
      expect(r.x, id).toBeGreaterThanOrEqual(0)
      expect(r.y, id).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w, id).toBeLessThanOrEqual(VIEW_W)
      expect(r.y + r.h, id).toBeLessThanOrEqual(VIEW_H)
    }
  })

  it('never overlap each other', () => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = plateRect(ids[i]!)
        const b = plateRect(ids[j]!)
        expect(overlaps(a, b), `${ids[i]} / ${ids[j]}`).toBe(false)
      }
    }
  })
})

// The bug the captain hit: the boat on the Stoke—Stone canal sat under the
// Stoke plate and its name ribbon.
describe('link marker anchors', () => {
  it('clears the plate that used to hide the Stoke-on-Trent boat', () => {
    const mid = pointAt('stoke', 'stone', 0.5)
    expect(occludedBy('stoke', 'stone', mid)).toBeGreaterThan(0)

    const anchor = linkMarkerAnchor('stoke', 'stone')
    const stoke = plateRect('stoke')
    expect(overlaps(markerBoxAt(anchor), stoke)).toBe(false)
  })

  it('never leaves a marker worse placed than the plain midpoint', () => {
    for (const conn of connections) {
      const mid = pointAt(conn.from, conn.to, 0.5)
      const anchor = linkMarkerAnchor(conn.from, conn.to)
      expect(
        occludedBy(conn.from, conn.to, anchor),
        linkKey(conn.from, conn.to),
      ).toBeLessThanOrEqual(occludedBy(conn.from, conn.to, mid))
    }
  })

  it('finds a fully clear spot on all but the tightest routes', () => {
    const blocked = connections.filter(
      (c) => occludedBy(c.from, c.to, linkMarkerAnchor(c.from, c.to)) > 0,
    )
    // Short hops between two big plates leave no gap at all; those rely on
    // the marker layer painting after the plates instead.
    expect(blocked.map((c) => linkKey(c.from, c.to))).toStrictEqual([
      'stoke|stone',
      'worcester|gloucester',
      'birmingham|redditch',
    ])
  })

  it('leaves a blocked marker mostly in the open', () => {
    // A route with no fully clear spot must still be a marker on the board
    // rather than a marker on a plate, so bound the residual overlap.
    for (const conn of connections) {
      const box = markerBoxAt(linkMarkerAnchor(conn.from, conn.to))
      let covered = 0
      for (const r of plateObstacles()) {
        const ox = Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x)
        const oy = Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y)
        if (ox > 0 && oy > 0) covered += ox * oy
      }
      expect(
        covered / (box.w * box.h),
        linkKey(conn.from, conn.to),
      ).toBeLessThan(0.4)
    }
  })

  it('keeps every anchor on its own route', () => {
    for (const conn of connections) {
      const anchor = linkMarkerAnchor(conn.from, conn.to)
      const { a, c, b } = routeCurve(conn.from, conn.to)
      const near = Array.from({ length: 201 }, (_, i) => i / 200).some((t) => {
        const u = 1 - t
        const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x
        const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y
        return Math.hypot(x - anchor.x, y - anchor.y) < 1
      })
      expect(near, linkKey(conn.from, conn.to)).toBe(true)
    }
  })

  it('stays within the middle of the route, never at a city centre', () => {
    for (const conn of connections) {
      const anchor = linkMarkerAnchor(conn.from, conn.to)
      const lo = pointAt(conn.from, conn.to, 0.16)
      const hi = pointAt(conn.from, conn.to, 0.84)
      const span = Math.hypot(hi.x - lo.x, hi.y - lo.y)
      const from = Math.hypot(anchor.x - lo.x, anchor.y - lo.y)
      const to = Math.hypot(anchor.x - hi.x, anchor.y - hi.y)
      expect(from + to, linkKey(conn.from, conn.to)).toBeLessThan(span + 2)
    }
  })
})
