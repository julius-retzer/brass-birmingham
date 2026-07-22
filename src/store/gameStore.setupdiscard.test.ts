// Official setup deals each player a face-down starting Discard Pile
// (rules l.401-402): 8 cards to hand PLUS 1 to discard. We model one shared
// discard pile, so this is N cards dealt into it, bringing the post-setup draw
// deck to the official 22/27/28 for 2/3/4 players. These tests pin the counts
// and the downstream effect the fix was for: with the official deck, a 3-player
// no-scout game hits deck-death on a round boundary, so hands stay even.
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

const COLORS = ['red', 'blue', 'green', 'yellow'] as const
const CHARACTERS = [
  'Richard Arkwright',
  'Eliza Tinsley',
  'Isambard Kingdom Brunel',
  'George Stephenson',
] as const

const makePlayers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `P${i + 1}`,
    color: COLORS[i]!,
    character: CHARACTERS[i]!,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as any,
  }))

const startGame = (count: number) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  actor.send({ type: 'START_GAME', players: makePlayers(count) })
  return actor
}

// Pass one action with the current player's first card. Only valid when it is
// that player's action step and they hold a card.
const passOneAction = (actor: ReturnType<typeof createActor>) => {
  const s = actor.getSnapshot() as any
  const player = s.context.players[s.context.currentPlayerIndex]
  actor.send({ type: 'PASS' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({ type: 'CONFIRM' } as any)
}

describe('Setup — starting discard pile (rules l.402)', () => {
  test.each([
    [2, 22],
    [3, 27],
    [4, 28],
  ])(
    '%i-player setup: N cards in discard, official draw deck remains',
    (count, expectedDraw) => {
      const s = startGame(count).getSnapshot() as any

      // Each player got a full 8-card hand.
      s.context.players.forEach((p: any) => expect(p.hand).toHaveLength(8))
      // One face-down card per player seeded the shared discard pile.
      expect(s.context.discardPile).toHaveLength(count)
      // Official post-setup draw deck.
      expect(s.context.drawPile).toHaveLength(expectedDraw)
      // No cards created or lost: 8*N in hands + N in discard + deck.
      expect(
        8 * count + s.context.discardPile.length + s.context.drawPile.length,
      ).toBe(8 * count + count + expectedDraw)
    },
  )
})

describe('Setup discard → even deck-death for a 3-player no-scout game', () => {
  test('first post-exhaustion round starts with even hands, exhaustion logs once', () => {
    const actor = startGame(3)

    // Record deck size + hand sizes at the start of each round as pass-only
    // play burns the deck. Stop once every hand has emptied (or as a safety
    // cap) — we never Scout, so nothing leaves the draw deck early.
    const roundStarts: { round: number; deck: number; hands: number[] }[] = []
    const snapshotRoundStart = () => {
      const s = actor.getSnapshot() as any
      roundStarts.push({
        round: s.context.round,
        deck: s.context.drawPile.length,
        hands: s.context.players.map((p: any) => p.hand.length),
      })
    }

    snapshotRoundStart()
    let lastRound = 1
    let guard = 0
    while (guard++ < 3000) {
      const s = actor.getSnapshot() as any
      if (s.context.era !== 'canal') break
      if (!s.matches({ playing: { action: 'selectingAction' } })) break
      const player = s.context.players[s.context.currentPlayerIndex]
      if (player.hand.length === 0) break
      passOneAction(actor)
      const after = actor.getSnapshot() as any
      if (after.context.round !== lastRound && after.context.era === 'canal') {
        lastRound = after.context.round
        snapshotRoundStart()
      }
    }

    // The deck runs out exactly at a round boundary with the official 27-card
    // deck, so the first round that begins with the deck empty shows even
    // hands (the divergence the fix addresses).
    const firstEmpty = roundStarts.find((r) => r.deck === 0)
    expect(firstEmpty).toBeDefined()
    const hands = firstEmpty!.hands
    expect(new Set(hands).size).toBe(1)
    expect(hands[0]).toBe(8)

    // And the round after it stays even as hands shrink together.
    const nextRound = roundStarts.find((r) => r.round === firstEmpty!.round + 1)
    expect(nextRound).toBeDefined()
    expect(new Set(nextRound!.hands).size).toBe(1)
    expect(nextRound!.hands[0]).toBe(6)

    // The exhaustion notice fires exactly once for the era, on the >0 → 0
    // transition — never again while the deck stays empty.
    const s = actor.getSnapshot() as any
    const exhaustionLines = s.context.logs.filter((l: any) =>
      /^Draw deck exhausted/.test(l.message),
    )
    expect(exhaustionLines).toHaveLength(1)
  })
})
