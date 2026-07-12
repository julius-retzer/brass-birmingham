// One-off generator for the v2 UI draft: drives a real 3-player game with
// the integration-test greedy policy until the board looks convincingly
// mid-game, then freezes the persisted snapshot into demo-snapshot.ts.
//
// Run manually with:
//   GENERATE_DEMO=1 pnpm vitest run src/components/v2/demo/generate-demo.test.ts
//
// Guarded by GENERATE_DEMO so `pnpm test:all` never rewrites the fixture.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { cities, cityIndustrySlots, connections } from '../../../data/board'
import type { CityId } from '../../../data/board'
import { gameStore } from '../../../store/gameStore'

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

const turnState = (actor: AnyActor) => {
  const c = ctx(actor)
  return {
    actionsRemaining: c.actionsRemaining,
    playerIndex: c.currentPlayerIndex,
    round: c.round,
    era: c.era,
  }
}

const actionConsumed = (
  actor: AnyActor,
  before: ReturnType<typeof turnState>,
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

const unwind = (actor: AnyActor) => {
  for (let i = 0; i < 5 && !isSelectingAction(actor); i++) {
    actor.send({ type: 'CANCEL' } as any)
  }
}

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
      const slots = cityIndustrySlots[card.location as CityId] ?? []
      const types = [...new Set(slots.flat())]
      for (const industryType of types) {
        actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType } as any)
        const snap = actor.getSnapshot() as any
        if (
          snap.matches({ playing: { action: { building: 'confirmingBuild' } } })
        ) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    } else {
      for (const cityId of cityIds) {
        actor.send({ type: 'SELECT_LOCATION', cityId } as any)
        const snap = actor.getSnapshot() as any
        if (
          snap.matches({ playing: { action: { building: 'confirmingBuild' } } })
        ) {
          actor.send({ type: 'CONFIRM' } as any)
          if (actionConsumed(actor, before)) return true
          unwind(actor)
          actor.send({ type: 'BUILD' } as any)
          actor.send({ type: 'SELECT_CARD', cardId: card.id } as any)
        }
      }
    }
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
    actor.send({ type: 'SELECT_LINK', from: conn.from, to: conn.to } as any)
    const snap = actor.getSnapshot() as any
    if (
      snap.matches({ playing: { action: { networking: 'confirmingLink' } } })
    ) {
      actor.send({ type: 'CONFIRM' } as any)
      if (actionConsumed(actor, before)) return true
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

const greedyPolicy = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (trySell(actor)) return true
  if (tryBuild(actor)) return true
  if (tryNetwork(actor)) return true
  if (player.money < 10 && tryLoan(actor)) return true
  return pass(actor)
}

describe('v2 demo snapshot generator', () => {
  test.skipIf(!process.env.GENERATE_DEMO)('generate', () => {
    // The deck shuffle is random; try fresh games until one freezes into a
    // photogenic mid-game frame (rich board AND a full current-player hand).
    let best: { actor: AnyActor; actions: number } | null = null
    for (let attempt = 0; attempt < 30 && !best; attempt++) {
      const actor = createActor(gameStore)
      actor.start()
      actor.send({
        type: 'START_GAME',
        players: [
          { id: '1', name: 'Eliza', color: 'red', character: 'Eliza Tinsley' },
          {
            id: '2',
            name: 'Isambard',
            color: 'blue',
            character: 'Isambard Kingdom Brunel',
          },
          {
            id: '3',
            name: 'George',
            color: 'green',
            character: 'George Stephenson',
          },
        ].map((p) => ({
          ...p,
          money: 17,
          victoryPoints: 0,
          income: 10,
          industryTilesOnMat: {},
        })),
      } as any)

      // Drive until the board reads as convincingly mid-game: several built
      // industries and links, while the draw pile is still healthy so hands
      // stay full (the hand tray is a key draft screen).
      let actions = 0
      const richEnough = () => {
        const c = ctx(actor)
        const built = c.players.flatMap((p: any) => p.industries)
        const links = c.players.flatMap((p: any) => p.links)
        return (
          built.length >= 12 &&
          links.length >= 3 &&
          built.some((i: any) => i.flipped)
        )
      }
      while (
        !richEnough() &&
        actions < 46 &&
        !actor.getSnapshot().matches('gameOver')
      ) {
        if (!isSelectingAction(actor)) unwind(actor)
        greedyPolicy(actor)
        actions++
      }

      const c = ctx(actor)
      if (
        richEnough() &&
        c.era === 'canal' &&
        isSelectingAction(actor) &&
        c.players[c.currentPlayerIndex].hand.length >= 6
      ) {
        best = { actor, actions }
      } else {
        actor.stop()
      }
    }

    expect(best).not.toBeNull()
    if (!best) return

    const persisted = best.actor.getPersistedSnapshot()
    const json = JSON.stringify(persisted, null, 2)
    const outDir = dirname(fileURLToPath(import.meta.url))
    writeFileSync(
      join(outDir, 'demo-snapshot.ts'),
      `// Auto-generated by generate-demo.test.ts (GENERATE_DEMO=1) - do not edit.\n// A real mid-game state (${best.actions} engine-driven actions, 3 players).\nexport const demoSnapshot: unknown = ${json}\n`,
    )
    best.actor.stop()
  })
})
