import { describe, expect, it } from 'vitest'
import { arrangeHand, moveCard, parseHandOrders } from './hand-order'

const hand = (...ids: string[]) => ids.map((id) => ({ id }))
const ids = (cards: { id: string }[]) => cards.map((c) => c.id)

describe('arrangeHand', () => {
  it('leaves the engine order alone when nothing has been arranged', () => {
    const h = hand('a', 'b', 'c')
    expect(arrangeHand(h, undefined)).toBe(h)
    expect(arrangeHand(h, [])).toBe(h)
  })

  it('applies the remembered order', () => {
    expect(ids(arrangeHand(hand('a', 'b', 'c'), ['c', 'a', 'b']))).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('appends cards the order has never seen (an end-of-turn refill)', () => {
    // The player arranged c,a; then drew d and e — they land after, in the
    // engine's own order, and the chosen part is untouched.
    expect(ids(arrangeHand(hand('a', 'c', 'd', 'e'), ['c', 'a', 'b']))).toEqual(
      ['c', 'a', 'd', 'e'],
    )
  })

  it('skips ids that have left the hand without disturbing the rest', () => {
    // 'b' was played: the order around it survives.
    expect(ids(arrangeHand(hand('a', 'c'), ['c', 'b', 'a']))).toEqual([
      'c',
      'a',
    ])
  })

  it('never emits a card twice, even for a corrupted order', () => {
    expect(ids(arrangeHand(hand('a', 'b'), ['b', 'b', 'a']))).toEqual([
      'b',
      'a',
    ])
  })

  it('does not mutate the hand it is given', () => {
    const h = hand('a', 'b', 'c')
    arrangeHand(h, ['c', 'b', 'a'])
    expect(ids(h)).toEqual(['a', 'b', 'c'])
  })
})

describe('moveCard', () => {
  it('moves left and right', () => {
    expect(moveCard(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(moveCard(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
  })

  it('clamps a target beyond either end', () => {
    expect(moveCard(['a', 'b', 'c'], 'b', -5)).toEqual(['b', 'a', 'c'])
    expect(moveCard(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b'])
  })

  it('returns the same array (no write) when nothing moves', () => {
    const list = ['a', 'b', 'c']
    expect(moveCard(list, 'b', 1)).toBe(list)
    expect(moveCard(list, 'zzz', 0)).toBe(list)
  })

  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c']
    moveCard(list, 'a', 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('parseHandOrders', () => {
  it('reads a stored map of player id → card ids', () => {
    expect(parseHandOrders('{"p1":["a","b"],"p2":[]}')).toEqual({
      p1: ['a', 'b'],
      p2: [],
    })
  })

  it('reads anything unrecognisable as "no orders"', () => {
    expect(parseHandOrders(null)).toEqual({})
    expect(parseHandOrders('')).toEqual({})
    expect(parseHandOrders('not json')).toEqual({})
    expect(parseHandOrders('["a"]')).toEqual({})
    expect(parseHandOrders('null')).toEqual({})
  })

  it('drops entries that are not lists of card ids', () => {
    expect(parseHandOrders('{"p1":["a"],"p2":3,"p3":[1,2]}')).toEqual({
      p1: ['a'],
    })
  })
})

describe('the arrange → move → arrange round trip', () => {
  it('keeps a chosen arrangement stable across a draw and a discard', () => {
    // Player drags 'c' to the front.
    let order = moveCard(
      ids(arrangeHand(hand('a', 'b', 'c'), undefined)),
      'c',
      0,
    )
    expect(order).toEqual(['c', 'a', 'b'])

    // End of turn: 'a' was played, 'd' drawn — engine order is b, c, d.
    const after = arrangeHand(hand('b', 'c', 'd'), order)
    expect(ids(after)).toEqual(['c', 'b', 'd'])

    // Another move works off the arranged list, not the engine's.
    order = moveCard(ids(after), 'd', 0)
    expect(ids(arrangeHand(hand('b', 'c', 'd'), order))).toEqual([
      'd',
      'c',
      'b',
    ])
  })
})
