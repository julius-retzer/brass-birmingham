import { describe, expect, test } from 'vitest'
import {
  acquireSlot,
  clientIpFrom,
  MAX_TRACKED_KEYS,
  takeFromWindow,
  type WindowEntry,
} from './rate-limit'

describe('takeFromWindow — fixed-window create limiter', () => {
  test('allows up to max within the window, then refuses', () => {
    const map = new Map<string, WindowEntry>()
    for (let i = 0; i < 3; i++) {
      expect(takeFromWindow(map, 'ip', 3, 1000, 0)).toBe(true)
    }
    expect(takeFromWindow(map, 'ip', 3, 1000, 500)).toBe(false)
  })

  test('window expiry resets the count', () => {
    const map = new Map<string, WindowEntry>()
    expect(takeFromWindow(map, 'ip', 1, 1000, 0)).toBe(true)
    expect(takeFromWindow(map, 'ip', 1, 1000, 999)).toBe(false)
    expect(takeFromWindow(map, 'ip', 1, 1000, 1000)).toBe(true)
  })

  test('keys are independent buckets', () => {
    const map = new Map<string, WindowEntry>()
    expect(takeFromWindow(map, 'a', 1, 1000, 0)).toBe(true)
    expect(takeFromWindow(map, 'a', 1, 1000, 1)).toBe(false)
    expect(takeFromWindow(map, 'b', 1, 1000, 1)).toBe(true)
  })

  test('fails closed when the map is full of still-active keys (overflow)', () => {
    const map = new Map<string, WindowEntry>()
    // Fill the tracker with distinct keys whose windows are all still active.
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      expect(takeFromWindow(map, `ip-${i}`, 1, 1000, 0)).toBe(true)
    }
    expect(map.size).toBe(MAX_TRACKED_KEYS)
    // A brand-new key while every window is active: prune frees nothing, so we
    // must refuse rather than grow the map past the bound.
    expect(takeFromWindow(map, 'overflow', 1, 1000, 500)).toBe(false)
    expect(map.size).toBe(MAX_TRACKED_KEYS)
    // Once some windows expire, prune reclaims room and a new key is admitted.
    expect(takeFromWindow(map, 'overflow', 1, 1000, 1000)).toBe(true)
    expect(map.size).toBeLessThanOrEqual(MAX_TRACKED_KEYS)
  })
})

describe('acquireSlot — concurrent stream cap', () => {
  test('caps concurrent holders and frees on release', () => {
    const map = new Map<string, number>()
    const a = acquireSlot(map, 'ip', 2)
    const b = acquireSlot(map, 'ip', 2)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(acquireSlot(map, 'ip', 2)).toBeNull()
    a!()
    expect(acquireSlot(map, 'ip', 2)).not.toBeNull()
  })

  test('release is idempotent — double-release cannot free a foreign slot', () => {
    const map = new Map<string, number>()
    const a = acquireSlot(map, 'ip', 2)!
    const b = acquireSlot(map, 'ip', 2)
    expect(b).not.toBeNull()
    a()
    a() // second call must be a no-op
    expect(map.get('ip')).toBe(1)
    const c = acquireSlot(map, 'ip', 2)
    expect(c).not.toBeNull()
    expect(acquireSlot(map, 'ip', 2)).toBeNull()
  })

  test('map entry is removed when the last slot frees (no leak)', () => {
    const map = new Map<string, number>()
    const a = acquireSlot(map, 'ip', 4)!
    a()
    expect(map.has('ip')).toBe(false)
  })
})

describe('clientIpFrom', () => {
  test('takes the first x-forwarded-for entry', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    })
    expect(clientIpFrom(req)).toBe('203.0.113.9')
  })

  test("falls back to a shared 'local' bucket without the header", () => {
    expect(clientIpFrom(new Request('http://x'))).toBe('local')
  })
})
