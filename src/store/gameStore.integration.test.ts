// Full-game integration tests: drive complete games from START_GAME to
// gameOver purely through the machine's event surface. The driver plays a
// simple but legal policy (sell > build > network > loan > pass) and relies
// on the machine's guards to reject illegal moves - it never uses TRIGGER_*
// or TEST_* events, so era transitions and game end must fire automatically.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { cities, cityIndustrySlots, connections } from '../data/board'
import type { CityId } from '../data/board'
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

const PLAYER_TEMPLATES = [
  { id: '1', name: 'Alice', color: 'red' as const, character: 'Richard Arkwright' as const },
  { id: '2', name: 'Bob', color: 'blue' as const, character: 'Eliza Tinsley' as const },
  { id: '3', name: 'Carol', color: 'green' as const, character: 'Robert Owen' as const },
]

const startGame = (playerCount: number) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  const players = PLAYER_TEMPLATES.slice(0, playerCount).map((p) => ({
    ...p,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as any,
  }))
  actor.send({ type: 'START_GAME', players } as any)
  return actor
}

type AnyActor = ReturnType<typeof createActor>

const ctx = (actor: AnyActor) => (actor.getSnapshot() as any).context
const currentPlayer = (actor: AnyActor) => {
  const c = ctx(actor)
  return c.players[c.currentPlayerIndex]
}
const isSelectingAction = (actor: AnyActor) =>
  (actor.getSnapshot() as any).matches({
    playing: { action: 'selectingAction' },
  })

// Returns true if an action was consumed (actionsRemaining dropped, the
// turn/round advanced, or the game ended)
const actionConsumed = (
  actor: AnyActor,
  before: { actionsRemaining: number; playerIndex: number; round: number; era: string },
) => {
  const snap = actor.getSnapshot() as any
  if (snap.matches('gameOver')) return true
  const c = snap.context
  return (
    c.currentPlayerIndex !== before.playerIndex ||
    c.round !== before.round ||
    c.era !== before.era ||
    c.actionsRemaining < before.actionsRemaining
  )
}

const turnState = (actor: AnyActor) => {
  const c = ctx(actor)
  return {
    actionsRemaining: c.actionsRemaining,
    playerIndex: c.currentPlayerIndex,
    round: c.round,
    era: c.era,
  }
}

// Back out of any half-finished action flow (guards can leave us in a
// confirming sub-state whose only exit is CANCEL)
const unwind = (actor: AnyActor) => {
  for (let i = 0; i < 5 && !isSelectingAction(actor); i++) {
    actor.send({ type: 'CANCEL' } as any)
  }
}

// --- Policy steps -----------------------------------------------------------

const trySell = (actor: AnyActor): boolean => {
  const c = ctx(actor)
  const player = currentPlayer(actor)

  const sellable = player.industries.filter(
    (i: any) =>
      !i.flipped && ['cotton', 'manufacturer', 'pottery'].includes(i.type),
  )
  if (sellable.length === 0 || player.hand.length === 0) return false

  const before = turnState(actor)
  actor.send({ type: 'SELL' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)

  // Attempt every industry x merchant combination; guards reject bad ones
  for (const industry of sellable) {
    for (const merchant of c.merchants) {
      if (!merchant.industryIcons.includes(industry.type)) continue
      actor.send({
        type: 'SELECT_SALE',
        location: industry.location,
        industryType: industry.type,
        merchant: merchant.location,
      } as any)
    }
  }

  if (ctx(actor).salesMadeThisAction > 0) {
    actor.send({ type: 'CONFIRM' } as any)
    return actionConsumed(actor, before)
  }

  // Nothing sellable was accepted - back out
  unwind(actor)
  return false
}

const tryBuild = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (player.money < 8 || player.hand.length === 0) return false

  const cityIds = Object.keys(cities).filter(
    (id) => (cities as any)[id].type === 'city',
  ) as CityId[]

  for (const card of player.hand) {
    if (card.type !== 'location' && card.type !== 'industry') continue

    const before = turnState(actor)
    actor.send({ type: 'BUILD' } as any)
    actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)

    if (card.type === 'location') {
      // Try each industry type the location's slots allow
      const slots = cityIndustrySlots[card.location as CityId] ?? []
      const types = [...new Set(slots.flat())]
      for (const industryType of types) {
        actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
        const snap = actor.getSnapshot() as any
        if (snap.matches({ playing: { action: { building: 'confirmingBuild' } } })) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          // Build failed or was guard-blocked - restart the flow cleanly
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    } else {
      // Industry card: try candidate locations; guards filter invalid ones
      for (const cityId of cityIds) {
        actor.send({ type: 'SELECT_LOCATION', cityId } as any)
        const snap = actor.getSnapshot() as any
        if (snap.matches({ playing: { action: { building: 'confirmingBuild' } } })) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    }

    // Back out of this card's build flow
    unwind(actor)
  }
  return false
}

const tryNetwork = (actor: AnyActor): boolean => {
  const c = ctx(actor)
  const player = currentPlayer(actor)
  if (player.money < 10 || player.hand.length === 0) return false

  const candidates = connections.filter((conn) =>
    (conn.types as readonly string[]).includes(c.era),
  )

  const before = turnState(actor)
  actor.send({ type: 'NETWORK' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)

  for (const conn of candidates) {
    actor.send({
      type: 'SELECT_LINK',
      from: conn.from,
      to: conn.to,
    } as any)
    const snap = actor.getSnapshot() as any
    if (
      snap.matches({ playing: { action: { networking: 'confirmingLink' } } })
    ) {
      actor.send({ type: 'CONFIRM' } as any)
      if (actionConsumed(actor, before)) return true
      // Rejected or guard-blocked - restart the flow with a fresh hand read
      unwind(actor)
      actor.send({ type: 'NETWORK' } as any)
      actor.send({
        type: 'SELECT_CARD',
        cardId: currentPlayer(actor).hand[0].id,
      } as any)
    }
  }

  unwind(actor)
  return false
}

const tryLoan = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (player.hand.length === 0) return false
  const before = turnState(actor)
  actor.send({ type: 'TAKE_LOAN' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({ type: 'CONFIRM' } as any)
  if (actionConsumed(actor, before)) return true
  unwind(actor)
  return false
}

const pass = (actor: AnyActor): boolean => {
  const before = turnState(actor)
  actor.send({ type: 'PASS' } as any)
  return actionConsumed(actor, before)
}

type Policy = (actor: AnyActor) => boolean

const greedyPolicy: Policy = (actor) => {
  const player = currentPlayer(actor)
  if (trySell(actor)) return true
  if (tryBuild(actor)) return true
  if (tryNetwork(actor)) return true
  if (player.money < 10 && tryLoan(actor)) return true
  return pass(actor)
}

const passOnlyPolicy: Policy = (actor) => pass(actor)

// Drive a game to completion with the given per-turn policy
const playFullGame = (actor: AnyActor, policy: Policy, maxActions = 1500) => {
  let actions = 0
  let stuckCount = 0

  while (!actor.getSnapshot().matches('gameOver') && actions < maxActions) {
    expect((actor.getSnapshot() as any).status).toBe('active')
    if (!isSelectingAction(actor)) {
      throw new Error(
        `Not in selectingAction after ${actions} actions: ${JSON.stringify((actor.getSnapshot() as any).value)} era=${ctx(actor).era} round=${ctx(actor).round} lastError=${ctx(actor).lastError}`,
      )
    }

    const acted = policy(actor)
    actions++

    if (!acted) {
      stuckCount++
      expect(stuckCount).toBeLessThan(3)
    } else {
      stuckCount = 0
    }
  }

  return actions
}

// --- Tests ------------------------------------------------------------------

describe('Brass Birmingham - Full Game Integration', () => {
  test('complete 2-player game runs from START_GAME to gameOver with a winner (mixed actions)', () => {
    const actor = startGame(2)

    let snap = actor.getSnapshot() as any
    expect(snap.context.era).toBe('canal')
    expect(snap.context.round).toBe(1)
    expect(snap.context.actionsRemaining).toBe(1)
    expect(snap.context.players[0].hand).toHaveLength(8)
    expect(snap.context.players[0].money).toBe(17)
    expect(snap.context.players[0].income).toBe(10)

    const actions = playFullGame(actor, greedyPolicy)

    snap = actor.getSnapshot() as any
    expect(snap.matches('gameOver')).toBe(true)
    expect(actions).toBeLessThan(1500)

    const c = snap.context

    // Both era transitions fired automatically (no TRIGGER_* events sent)
    expect(c.logs.some((l: any) => l.message === 'Canal Era ended')).toBe(true)
    expect(c.logs.some((l: any) => l.message === 'Rail Era started')).toBe(true)
    expect(c.logs.some((l: any) => l.message === 'Rail Era ended')).toBe(true)
    expect(c.logs.some((l: any) => l.message.includes('Game Over'))).toBe(true)
    expect(c.era).toBe('rail')

    // Deck and hands fully exhausted
    expect(c.drawPile).toHaveLength(0)
    c.players.forEach((p: any) => expect(p.hand).toHaveLength(0))

    // A winner is declared and it is the player with the most VPs
    // (ties broken by income, then money)
    expect(c.winners).not.toBeNull()
    expect(c.winners.length).toBeGreaterThanOrEqual(1)
    const ranked = [...c.players].sort(
      (a: any, b: any) =>
        b.victoryPoints - a.victoryPoints ||
        b.income - a.income ||
        b.money - a.money,
    ) as any[]
    expect(c.winners).toContain(ranked[0].id)

    // Sanity on final player state
    c.players.forEach((p: any) => {
      expect(p.victoryPoints).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(p.money)).toBe(true)
      expect(p.income).toBeGreaterThanOrEqual(-10)
      // Links were scored and removed in final era scoring
      expect(p.links).toHaveLength(0)
    })
  }, 30000)

  test('complete 3-player game reaches gameOver (pass-only variant)', () => {
    const actor = startGame(3)

    const actions = playFullGame(actor, passOnlyPolicy)

    const snap = actor.getSnapshot() as any
    expect(snap.matches('gameOver')).toBe(true)
    expect(actions).toBeLessThan(1500)

    const c = snap.context
    expect(c.logs.some((l: any) => l.message === 'Canal Era ended')).toBe(true)
    expect(c.winners).not.toBeNull()
    expect(c.drawPile).toHaveLength(0)
    c.players.forEach((p: any) => expect(p.hand).toHaveLength(0))

    // A pass-only game builds nothing: everyone ends on 0 VP and the game
    // is a draw between all players (equal VP, income, money)
    expect(c.winners).toHaveLength(3)
    c.players.forEach((p: any) => expect(p.victoryPoints).toBe(0))
  }, 30000)

  test('game handles invalid actions gracefully during integration', () => {
    const actor = startGame(2)

    expect(() => {
      actor.send({ type: 'BUILD' } as any)
      actor.send({ type: 'CONFIRM' } as any) // No card selected
    }).not.toThrow()

    expect(() => {
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' } as any)
      actor.send({ type: 'CONFIRM' } as any)
    }).not.toThrow()

    expect((actor.getSnapshot() as any).status).toBe('active')
  })
})
