import { describe, expect, test } from 'vitest'
import {
  acquireSlot,
  clientIpFrom,
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
