// Round summary tests — the engine-produced record of a completed round that
// drives the UI's round-end curtain (spends, order switch, income).
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const player = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `P${id}`,
  color: (['red', 'blue', 'green', 'purple'] as const)[Number(id) - 1]!,
  character: (
    [
      'Richard Arkwright',
      'Eliza Tinsley',
      'Isambard Kingdom Brunel',
      'George Stephenson',
    ] as const
  )[Number(id) - 1]!,
  money: 30,
  victoryPoints: 0,
  income: 10,
  industryTilesOnMat: {} as any,
  ...extra,
})

const setup = (count = 2, extra: Record<string, unknown> = {}) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: Array.from({ length: count }, (_, i) =>
      player(String(i + 1), extra),
    ),
  })
  return { actor }
}

/** Current player passes once — consumes one action, spending £0. */
const pass = (actor: ReturnType<typeof createActor>) => {
  const s: any = actor.getSnapshot()
  const p = s.context.players[s.context.currentPlayerIndex]!
  actor.send({ type: 'PASS' })
  actor.send({ type: 'SELECT_CARD', cardId: p.hand[0]!.id })
  actor.send({ type: 'CONFIRM' })
}

/**
 * Pass away the current player's WHOLE turn — round 1 grants one action but
 * every later round grants two, so a single pass would not end the turn.
 */
const passTurn = (actor: ReturnType<typeof createActor>) => {
  const seat = (actor.getSnapshot() as any).context.currentPlayerIndex
  while ((actor.getSnapshot() as any).context.currentPlayerIndex === seat) {
    const before = actor.getSnapshot()
    pass(actor)
    if (actor.getSnapshot() === before) break // guard against a stuck loop
  }
}

/** Current player builds a canal link — spends £3. */
const buildLink = (
  actor: ReturnType<typeof createActor>,
  from: string,
  to: string,
) => {
  const s: any = actor.getSnapshot()
  const p = s.context.players[s.context.currentPlayerIndex]!
  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: p.hand[0]!.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })
}

describe('Game Store - round summary', () => {
  test('is null at setup and stays null mid-round', () => {
    const { actor } = setup()
    expect(actor.getSnapshot().context.roundSummary).toBeNull()

    pass(actor) // player 1 of 2 — round not complete yet
    expect(actor.getSnapshot().context.currentPlayerIndex).toBe(1)
    expect(actor.getSnapshot().context.roundSummary).toBeNull()
  })

  test('records the completed round, its spends and the resulting order', () => {
    const { actor } = setup()

    buildLink(actor, 'worcester', 'gloucester') // P1 spends £3
    pass(actor) // P2 spends £0

    const summary = actor.getSnapshot().context.roundSummary!
    expect(summary).not.toBeNull()
    // The round that just ENDED, not the new one.
    expect(summary.round).toBe(1)
    expect(actor.getSnapshot().context.round).toBe(2)
    expect(summary.era).toBe('canal')
    expect(summary.previousOrder).toEqual(['1', '2'])
    expect(summary.spending).toEqual({ '1': 3, '2': 0 })
    // Least spender leads the next round — and the summary agrees with the
    // order the engine actually installed.
    expect(summary.newOrder).toEqual(['2', '1'])
    expect(actor.getSnapshot().context.turnOrder).toEqual(['2', '1'])
    expect(summary.eraEnded).toBe(false)
  })

  test('spends survive the reset that clears playerSpending', () => {
    const { actor } = setup()
    buildLink(actor, 'worcester', 'gloucester')
    pass(actor)

    // The live tracker is reset for the new round; the summary keeps the
    // record the curtain renders from.
    expect(actor.getSnapshot().context.playerSpending).toEqual({})
    expect(actor.getSnapshot().context.roundSummary!.spending).toEqual({
      '1': 3,
      '2': 0,
    })
  })

  test('records income settlement as the real money delta', () => {
    const { actor } = setup()
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: 5 })
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, income: -2 })

    const before = actor.getSnapshot().context.players.map((p) => p.money)
    pass(actor)
    pass(actor)

    const s = actor.getSnapshot()
    const summary = s.context.roundSummary!
    expect(summary.income).toEqual({ '1': 5, '2': -2 })
    // The recorded delta reconciles against the players' actual money.
    s.context.players.forEach((p, i) => {
      expect(p.money - before[i]!).toBe(summary.income[p.id])
    })
  })

  test('equal spends keep relative order and are still reported', () => {
    const { actor } = setup(3)
    pass(actor)
    pass(actor)
    pass(actor)

    const summary = actor.getSnapshot().context.roundSummary!
    expect(summary.spending).toEqual({ '1': 0, '2': 0, '3': 0 })
    expect(summary.previousOrder).toEqual(['1', '2', '3'])
    expect(summary.newOrder).toEqual(['1', '2', '3'])
  })

  test('4-player game reports every seat', () => {
    const { actor } = setup(4)
    buildLink(actor, 'worcester', 'gloucester') // P1 £3
    pass(actor) // P2 £0
    buildLink(actor, 'birmingham', 'dudley') // P3 £3
    pass(actor) // P4 £0

    const summary = actor.getSnapshot().context.roundSummary!
    expect(summary.spending).toEqual({ '1': 3, '2': 0, '3': 3, '4': 0 })
    // £0 spenders first (stable by previous position), then the £3 spenders.
    expect(summary.newOrder).toEqual(['2', '4', '1', '3'])
    expect(actor.getSnapshot().context.turnOrder).toEqual(['2', '4', '1', '3'])
  })

  test('a later round overwrites the previous summary', () => {
    const { actor } = setup()
    passTurn(actor)
    passTurn(actor)
    expect(actor.getSnapshot().context.roundSummary!.round).toBe(1)

    passTurn(actor)
    passTurn(actor)
    const summary = actor.getSnapshot().context.roundSummary!
    expect(summary.round).toBe(2)
    expect(actor.getSnapshot().context.round).toBe(3)
  })

  test('flags the round whose end exhausts the deck as the era end', () => {
    const { actor } = setup()
    // Empty the draw pile and leave each player exactly one card, so the
    // round that plays them out is the era's last.
    actor.send({ type: 'TEST_SET_DRAW_PILE', drawPile: [] } as any)
    const s: any = actor.getSnapshot()
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [s.context.players[0]!.hand[0]!],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [s.context.players[1]!.hand[0]!],
    })

    pass(actor)
    pass(actor)

    expect(actor.getSnapshot().context.roundSummary!.eraEnded).toBe(true)
  })
})
