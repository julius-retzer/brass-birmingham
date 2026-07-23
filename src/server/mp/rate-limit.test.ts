import { describe, expect, test } from 'vitest'
import {
  acquireSlot,
  allowChat,
  allowJoin,
  CHAT_IP_LIMIT_MAX,
  CHAT_LIMIT_WINDOW_MS,
  CHAT_SEAT_LIMIT_MAX,
  clientIpFrom,
  JOIN_LIMIT_MAX,
  JOIN_LIMIT_WINDOW_MS,
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

// The allow* helpers share process-global maps (HMR-safe by design), so every
// test below uses its OWN ip/seat keys and passes an explicit `now`.

describe('allowJoin — per-IP seat-claim limiter (lobby squatting)', () => {
  test('allows up to the limit inside the window, then 429s', () => {
    const ip = 'join-basic'
    for (let i = 0; i < JOIN_LIMIT_MAX; i++) {
      expect(allowJoin(ip, 0)).toBe(true)
    }
    expect(allowJoin(ip, JOIN_LIMIT_WINDOW_MS - 1)).toBe(false)
  })

  test('the window resets', () => {
    const ip = 'join-reset'
    for (let i = 0; i < JOIN_LIMIT_MAX; i++) expect(allowJoin(ip, 0)).toBe(true)
    expect(allowJoin(ip, JOIN_LIMIT_WINDOW_MS - 1)).toBe(false)
    expect(allowJoin(ip, JOIN_LIMIT_WINDOW_MS)).toBe(true)
  })

  test('addresses are independent buckets', () => {
    for (let i = 0; i < JOIN_LIMIT_MAX; i++) {
      expect(allowJoin('join-a', 0)).toBe(true)
    }
    expect(allowJoin('join-a', 1)).toBe(false)
    expect(allowJoin('join-b', 1)).toBe(true)
  })

  test('HAPPY PATH: a normal table filling up is never limited', () => {
    // A whole 4-player household behind ONE NAT: the host plus three joiners,
    // each of whom also refreshes/reconnects and re-claims a couple of times,
    // and they do it twice over for a second game. Must stay well clear.
    const ip = 'join-household'
    let joins = 0
    for (let game = 0; game < 2; game++) {
      for (let seat = 1; seat <= 3; seat++) {
        for (let attempt = 0; attempt < 3; attempt++) {
          expect(allowJoin(ip, game * 1000)).toBe(true)
          joins++
        }
      }
    }
    expect(joins).toBe(18)
    expect(joins).toBeLessThan(JOIN_LIMIT_MAX)
  })
})

describe('allowChat — per-seat + per-IP message limiter', () => {
  test('a seat may send up to the seat limit, then is refused', () => {
    const ip = 'chat-seat-ip'
    const seat = `${ip}|tok|0`
    for (let i = 0; i < CHAT_SEAT_LIMIT_MAX; i++) {
      expect(allowChat(ip, seat, 0)).toBe(true)
    }
    expect(allowChat(ip, seat, CHAT_LIMIT_WINDOW_MS - 1)).toBe(false)
  })

  test('the window resets', () => {
    const ip = 'chat-reset-ip'
    const seat = `${ip}|tok|0`
    for (let i = 0; i < CHAT_SEAT_LIMIT_MAX; i++) {
      expect(allowChat(ip, seat, 0)).toBe(true)
    }
    expect(allowChat(ip, seat, CHAT_LIMIT_WINDOW_MS - 1)).toBe(false)
    expect(allowChat(ip, seat, CHAT_LIMIT_WINDOW_MS)).toBe(true)
  })

  test('one noisy seat does not silence another seat on the same address', () => {
    const ip = 'chat-shared-ip'
    const loud = `${ip}|tok|0`
    const quiet = `${ip}|tok|1`
    for (let i = 0; i < CHAT_SEAT_LIMIT_MAX; i++) {
      expect(allowChat(ip, loud, 0)).toBe(true)
    }
    expect(allowChat(ip, loud, 1)).toBe(false)
    expect(allowChat(ip, quiet, 1)).toBe(true)
  })

  test('the per-IP ceiling still bounds many seats driven from one address', () => {
    const ip = 'chat-many-seats'
    let sent = 0
    // Enough distinct seats that the IP bucket, not any seat bucket, is what
    // eventually refuses.
    for (let seat = 0; seat < 20 && sent <= CHAT_IP_LIMIT_MAX; seat++) {
      for (let i = 0; i < CHAT_SEAT_LIMIT_MAX; i++) {
        if (!allowChat(ip, `${ip}|tok|${seat}`, 0)) {
          expect(sent).toBe(CHAT_IP_LIMIT_MAX)
          return
        }
        sent++
      }
    }
    throw new Error(`per-IP chat ceiling never applied (sent ${sent})`)
  })

  test('HAPPY PATH: normal conversation pace is never limited', () => {
    // Four seats behind one NAT, each sending a message every ~5s for a
    // minute — a chatty table, still far under both ceilings.
    const ip = 'chat-conversation'
    for (let tick = 0; tick < 12; tick++) {
      for (let seat = 0; seat < 4; seat++) {
        expect(allowChat(ip, `${ip}|tok|${seat}`, tick * 5000)).toBe(true)
      }
    }
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
