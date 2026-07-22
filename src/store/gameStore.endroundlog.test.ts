// End-of-round journal tests — the round boundary now reports the new turn
// order (who spent what) and each player's income level alongside the money
// collected or paid, listed in the order players will act next round.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { parseJournalEntry } from '../components/journal-model'
import type { PlayerRef } from '../components/journal-model'
import type { LogEntryType } from './gameStore'
import { gameStore } from './gameStore'

const entry = (message: string, type: LogEntryType) => ({
  message,
  type,
  timestamp: new Date('2026-07-22T12:00:00Z'),
})

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const player = (id: string) => ({
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
})

const setup = (count = 3) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: Array.from({ length: count }, (_, i) => player(String(i + 1))),
  })
  return { actor }
}

const pass = (actor: ReturnType<typeof createActor>) => {
  const s: any = actor.getSnapshot()
  const p = s.context.players[s.context.currentPlayerIndex]!
  actor.send({ type: 'PASS' })
  actor.send({ type: 'SELECT_CARD', cardId: p.hand[0]!.id })
  actor.send({ type: 'CONFIRM' })
}

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

const messages = (actor: ReturnType<typeof createActor>) =>
  (actor.getSnapshot() as any).context.logs.map(
    (l: any) => l.message,
  ) as string[]

const indexOfMatch = (msgs: string[], re: RegExp) =>
  msgs.findIndex((m) => re.test(m))

describe('Game Store - end-of-round journal', () => {
  test('logs the new turn order with each spend, least spender first', () => {
    const { actor } = setup(3)

    buildLink(actor, 'worcester', 'gloucester') // P1 spends £3
    pass(actor) // P2 spends £0
    pass(actor) // P3 spends £0

    // £0 spenders keep their relative order, then the £3 spender.
    expect((actor.getSnapshot() as any).context.turnOrder).toEqual([
      '2',
      '3',
      '1',
    ])

    const line = messages(actor).find((m) => /^Turn order/.test(m))
    expect(line).toBeDefined()
    expect(line).toBe(
      'Turn order set by spending, least first: P2 £0, P3 £0, P1 £3',
    )
  })

  test('reports each income level and the money settled, in new turn order', () => {
    const { actor } = setup(3)
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: 5 }) // P1
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, income: 12 }) // P2
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 2,
      income: -2,
      money: 30,
    }) // P3 pays

    buildLink(actor, 'worcester', 'gloucester') // P1 £3
    pass(actor) // P2 £0
    pass(actor) // P3 £0

    const msgs = messages(actor)

    // Each line carries the income level as well as the money change.
    expect(msgs).toContain('P2 collected £12 income (income level 12)')
    expect(msgs).toContain('P1 collected £5 income (income level 5)')
    expect(msgs).toContain('P3 paid £2 negative income (income level -2)')

    // Listed in the NEW turn order: P2, then P3, then P1.
    const iP2 = indexOfMatch(msgs, /^P2 collected/)
    const iP3 = indexOfMatch(msgs, /^P3 paid/)
    const iP1 = indexOfMatch(msgs, /^P1 collected/)
    expect(iP2).toBeGreaterThanOrEqual(0)
    expect(iP2).toBeLessThan(iP3)
    expect(iP3).toBeLessThan(iP1)

    // The turn-order line leads the block, above the income lines.
    const iOrder = indexOfMatch(msgs, /^Turn order/)
    expect(iOrder).toBeGreaterThanOrEqual(0)
    expect(iOrder).toBeLessThan(iP2)
  })

  test('the income-level fragment renders as a chip in the journal', () => {
    const players: PlayerRef[] = [{ name: 'P2', color: 'blue' }]

    const collected = parseJournalEntry(
      entry('P2 collected £12 income (income level 12)', 'info'),
      players,
    )
    expect(collected.kind).toBe('income')
    expect(collected.main).toBe('collected £12 income')
    expect(collected.chips).toContainEqual({
      text: 'income level 12',
      tone: 'income',
    })

    const paid = parseJournalEntry(
      entry('P2 paid £2 negative income (income level -2)', 'info'),
      players,
    )
    expect(paid.main).toBe('paid £2 negative income')
    expect(paid.chips).toContainEqual({
      text: 'income level −2',
      tone: 'penalty',
    })
  })

  test('a shortfall keeps both the income-level and shortfall chips', () => {
    const players: PlayerRef[] = [{ name: 'P1', color: 'red' }]
    const item = parseJournalEntry(
      entry(
        'P1 paid £6 negative income (income level -6, shortfall: £3)',
        'info',
      ),
      players,
    )
    expect(item.main).toBe('paid £6 negative income')
    expect(item.chips).toContainEqual({
      text: 'income level −6',
      tone: 'penalty',
    })
    expect(item.chips).toContainEqual({
      text: 'shortfall: £3',
      tone: 'penalty',
    })
  })

  test('no income or turn-order block on the final game round', () => {
    const { actor } = setup(2)
    // Empty the draw pile and leave each player one card, so this round is the
    // rail-era end — the game's final round, where no income is collected.
    actor.send({ type: 'TEST_SET_ERA', era: 'rail' } as any)
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

    const msgs = messages(actor)
    expect(msgs.some((m) => /income level/.test(m))).toBe(false)
    expect(msgs.some((m) => /^Turn order/.test(m))).toBe(false)
  })
})
