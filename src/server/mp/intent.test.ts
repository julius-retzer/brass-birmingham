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

  // e10d6e8 moved affordability INTO the guards, so develop's iron shortfall
  // fails at can() — a boolean — exactly like the link case.
  test('develop refused for iron money names the shortfall', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 1 })
    actor.send({ type: 'DEVELOP' })
    let snap = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId: snap.context.players[idx]!.hand[0]!.id,
    })
    snap = actor.getSnapshot()
    const tile = snap.context.players[idx]!.industryTilesOnMat
    const anyType = (Object.keys(tile) as Array<keyof typeof tile>).find(
      (k) => (tile[k]?.length ?? 0) > 0,
    )
    // Asserted, not skipped: if the fixture ever stops offering a developable
    // tile this test must fail loudly rather than pass having checked nothing.
    expect(anyType).toBeDefined()
    actor.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: [anyType!],
    })

    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'CONFIRM',
    })
    actor.stop()

    // £1 cannot buy the iron, so the guard must refuse — and say why.
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toMatch(/Not enough money|iron/i)
    expect((res as { error: string }).error).not.toBe(
      'That action is not legal right now.',
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

  // Path 2: the guard ACCEPTS and execution fails. The engine's actions never
  // throw — they set lastError and refuse to consume the action. The pre-fix
  // server persisted that snapshot and answered ok; these pin that it now
  // refuses, verbatim, and keeps nothing.
  test('an execution failure is reported verbatim and consumes nothing', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    // £2 buys no industry tile: build's funds check lives in execution
    // (buildIndustryTile), past the guard.
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 2 })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: idx,
      hand: [
        {
          id: 'loc_birmingham_1',
          type: 'location',
          location: 'birmingham',
          color: 'other',
        },
      ],
    })
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'loc_birmingham_1' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' })

    const before = actor.getPersistedSnapshot()
    const moneyBefore = actor.getSnapshot().context.players[idx]!.money
    const res = applyIntent(before, idx, { type: 'CONFIRM' })
    actor.stop()

    expect(res.ok).toBe(false)
    // The engine's own words, naming the shortfall — not "Build action failed".
    expect((res as { error: string }).error).toContain('Insufficient funds')
    expect((res as { error: string }).error).toContain('£2')
    expect(res).not.toHaveProperty('next')
    expect(moneyBefore).toBe(2)
  })

  // A record written by the PRE-FIX server can already carry a lastError.
  // Only a NEWLY set one may refuse the move, or the next legal action would
  // be rejected with a stale, wrong reason.
  test('a stale lastError on an old record does not refuse the next legal move', () => {
    const actor = game()
    const idx = actor.getSnapshot().context.currentPlayerIndex
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: idx, money: 2 })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: idx,
      hand: [
        {
          id: 'loc_birmingham_2',
          type: 'location',
          location: 'birmingham',
          color: 'other',
        },
      ],
    })
    // Produce a real lastError, then persist it the way the old server did.
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'loc_birmingham_2' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' })
    actor.send({ type: 'CONFIRM' })
    const stale = actor.getSnapshot().context.lastError
    expect(stale).not.toBeNull() // the record now carries a stale reason

    // TAKE_LOAN is legal and does not clear lastError — the exact seam.
    const res = applyIntent(actor.getPersistedSnapshot(), idx, {
      type: 'TAKE_LOAN',
    })
    actor.stop()

    expect(res.ok).toBe(true)
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

describe('applyIntent — source-choice picks over the wire', () => {
  // Round 1: seat 0 links worcester–gloucester, seat 1 passes. Round 2 opens on
  // the passer (spent least) — the seller — with worcester connected to the
  // gloucester merchant via seat 0's link (network is shared).
  const connectedSellBoard = () => {
    const actor = game()
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[0]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' })
    actor.send({ type: 'CONFIRM' })

    actor.send({ type: 'PASS' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[1]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    const seller = actor.getSnapshot().context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seller,
      money: 20,
      income: 10,
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
        {
          location: 'worcester',
          type: 'brewery',
          level: 1,
          flipped: false,
          tile: { ...cottonTile, type: 'brewery', beerRequired: 0 },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 1,
        } as never,
      ],
    })
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[seller]!.hand[0]!.id,
    })
    return { actor, seller }
  }

  test('a legitimate beer-source pick is accepted and executes the sale', () => {
    const { actor, seller } = connectedSellBoard()

    // SELECT_SALE stages it (own brewery vs the merchant barrel = a choice).
    const staged = applyIntent(actor.getPersistedSnapshot(), seller, {
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.stop()
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    // The pick used to be refused by the whitelist, hard-stucking the player.
    const picked = applyIntent((staged as { next: unknown }).next, seller, {
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'merchant', location: 'gloucester' },
    })
    expect(picked.ok).toBe(true)
    if (!picked.ok) return

    // The merchant barrel was taken (bonus £5) and the cotton flipped.
    const done = createActor(gameStore, {
      snapshot: (picked as { next: unknown }).next as never,
    })
    done.start()
    const ctx = done.getSnapshot().context
    done.stop()
    expect(ctx.players[seller]!.money).toBe(25)
    expect(
      ctx.players[seller]!.industries.find((i) => i.type === 'cotton')!.flipped,
    ).toBe(true)
    expect(
      ctx.merchants.find((m) => m.location === 'gloucester')!.hasBeer,
    ).toBe(false)
  })

  test('a beer source the step never offered is refused with a reason', () => {
    const { actor, seller } = connectedSellBoard()
    const staged = applyIntent(actor.getPersistedSnapshot(), seller, {
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.stop()
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    // Nobody has a brewery at birmingham — the pick is refused, not defaulted.
    const res = applyIntent((staged as { next: unknown }).next, seller, {
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'brewery', ownerId: '1', location: 'birmingham' },
    })
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toBe(
      'That beer source is not available for this action.',
    )
  })
})
