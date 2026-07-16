// The multiplayer server must tell a refused player exactly what is missing —
// never a generic "that action is not legal right now" (captain, 2026-07-16).
//
// These drive `applyIntent`, the pure decision seam `actInGame` wraps, so the
// wire contract is pinned without a database.
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type Merchant, gameStore } from '../../store/gameStore'
import { applyIntent } from './intent'

const players = [
  {
    id: '1',
    name: 'Ada',
    color: 'red' as const,
    character: 'Richard Arkwright' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
  {
    id: '2',
    name: 'Brunel',
    color: 'blue' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
]

/** A started game, driven through `send`, handed back as a persisted snapshot. */
const game = () => {
  const actor = createActor(gameStore)
  actor.subscribe({ error: () => {} })
  actor.start()
  actor.send({ type: 'START_GAME', players })
  return actor
}

const cottonTile = {
  id: 'cotton_1',
  type: 'cotton' as const,
  level: 1,
  canBuildInCanalEra: true,
  canBuildInRailEra: true,
  incomeAdvancement: 2,
  incomeSpaces: 2,
  victoryPoints: 3,
  beerRequired: 1,
  cost: 10,
  linkScoringIcons: 1,
  coalRequired: 0,
  ironRequired: 0,
  beerProduced: 0,
  coalProduced: 0,
  ironProduced: 0,
  hasLightbulbIcon: false,
  quantity: 3,
}

const gloucesterMerchant = (overrides: Partial<Merchant> = {}): Merchant => ({
  location: 'gloucester',
  industryIcons: ['cotton', 'manufacturer'],
  bonusType: 'money',
  bonusValue: 5,
  hasBeer: true,
  ...overrides,
})

describe('applyIntent — a refusal names what is missing', () => {
  test('wrong turn names whose turn it is', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    const otherSeat = idx === 0 ? 1 : 0
    const active = actor.getSnapshot().context.players[idx]!

    const res = applyIntent(actor.getPersistedSnapshot(), otherSeat, {
      type: 'BUILD',
    })
    actor.stop()

    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toBe(
      `Not your turn — waiting on ${active.name}.`,
    )
  })

  test('money-short link refusal quotes treasury and cost', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 2 })
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[idx]!.hand[0]!.id,
    })

    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'SELECT_LINK',
      from: 'worcester',
      to: 'gloucester',
    })
    actor.stop()

    expect(res.ok).toBe(false)
    // £2 treasury, £3 canal link — both amounts must be in the message.
    expect((res as { error: string }).error).toBe(
      'Not enough money: you have £2, a canal link costs £3.',
    )
  })

  test('missing beer refusal names the beer, not "invalid sale"', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex

    // Link worcester–gloucester so the mill reaches the merchant: the sale
    // must fail on BEER alone, not on connection.
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[idx]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' })
    actor.send({ type: 'CONFIRM' })

    const seller = actor.getSnapshot().context.currentPlayerIndex
    // No brewery anywhere and a beerless merchant → nothing can supply beer.
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant({ hasBeer: false })],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seller,
      money: 20,
      industries: [
        {
          location: 'worcester',
          type: 'cotton',
          level: 1,
          flipped: false,
          tile: cottonTile,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        } as never,
      ],
    })
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[seller]!.hand[0]!.id,
    })

    const res = applyIntent(actor.getPersistedSnapshot(), seller, {
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.stop()

    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toBe(
      'Needs 1 beer — no connected brewery has beer.',
    )
  })

  test('no-connection link refusal names the unreachable city', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex

    // Put a tile on the board so the virgin-board "build anywhere" exception
    // no longer applies, then reach for a link nowhere near it.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      money: 30,
      industries: [
        {
          location: 'worcester',
          type: 'cotton',
          level: 1,
          flipped: false,
          tile: cottonTile,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        } as never,
      ],
    })
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[idx]!.hand[0]!.id,
    })

    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'SELECT_LINK',
      from: 'walsall',
      to: 'wolverhampton',
    })
    actor.stop()

    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toBe(
      'No canal connection to wolverhampton: neither walsall nor wolverhampton is in your network.',
    )
  })

  test('a legal move is accepted and returns the next snapshot', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex

    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'BUILD',
    })
    actor.stop()

    expect(res.ok).toBe(true)
    expect((res as { next: unknown }).next).toBeDefined()
  })

  test('TEST_* events are refused outright', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      money: 999,
    })
    actor.stop()
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toContain('is not allowed')
  })

  test('a refusal never persists the engine error into shared state', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 2 })
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[idx]!.hand[0]!.id,
    })
    const before = actor.getPersistedSnapshot()

    const res = applyIntent(before, idx, {
      type: 'SELECT_LINK',
      from: 'worcester',
      to: 'gloucester',
    })
    actor.stop()

    expect(res.ok).toBe(false)
    // No `next` to persist → lastError can never reach another seat's frame.
    expect(res).not.toHaveProperty('next')
  })
})
