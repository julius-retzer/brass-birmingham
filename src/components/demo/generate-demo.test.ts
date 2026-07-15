// One-off generator for the UI demo fixtures: drives a real 3-player game with
// the integration-test greedy policy until the board looks convincingly
// mid-game, then freezes the persisted snapshot into demo-snapshot.ts.
//
// Run manually with:
//   GENERATE_DEMO=1 pnpm vitest run src/components/demo/generate-demo.test.ts
//
// Guarded by GENERATE_DEMO so `pnpm test:all` never rewrites the fixture.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { cities, cityIndustrySlots, connections } from '../../data/board'
import type { CityId } from '../../data/board'
import { gameStore } from '../../store/gameStore'

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
  // The audited income economy is tight (start = level 0): loan like a
  // real ironmaster whenever cash runs low and the -10 floor allows it.
  if (player.money < 14 && tryLoan(actor)) return true
  return pass(actor)
}

// Clone an actor from its in-memory persisted snapshot (Infinity survives —
// no JSON round trip) so conditions can be probed without disturbing it.
const cloneActor = (actor: AnyActor): AnyActor => {
  const probe = createActor(gameStore, {
    snapshot: actor.getPersistedSnapshot() as never,
  })
  probe.start()
  return probe
}

// All SELECT_SALE events the machine's own guards accept right now.
const saleOptions = (actor: AnyActor) => {
  const c = ctx(actor)
  const snap = actor.getSnapshot() as any
  const player = currentPlayer(actor)
  const opts: Array<{
    type: 'SELECT_SALE'
    location: string
    industryType: string
    merchant: string
  }> = []
  for (const ind of player.industries) {
    if (ind.flipped) continue
    for (const m of c.merchants) {
      const ev = {
        type: 'SELECT_SALE' as const,
        location: ind.location,
        industryType: ind.type,
        merchant: m.location,
      }
      if (
        snap.can(ev) &&
        !opts.some(
          (o) =>
            o.location === ev.location &&
            o.industryType === ev.industryType &&
            o.merchant === ev.merchant,
        )
      ) {
        opts.push(ev)
      }
    }
  }
  return opts
}

// Can the current player sell TWO industries in a single Sell action?
const multiSalePossible = (actor: AnyActor): boolean => {
  const player = currentPlayer(actor)
  if (player.hand.length === 0) return false
  const probe = cloneActor(actor)
  probe.send({ type: 'SELL' } as any)
  probe.send({
    type: 'SELECT_CARD',
    cardId: currentPlayer(probe).hand[0].id,
  } as any)
  const first = saleOptions(probe)
  if (first.length === 0) {
    probe.stop()
    return false
  }
  probe.send(first[0] as any)
  const second = saleOptions(probe)
  probe.stop()
  return second.length >= 1
}

// Would a single PASS from this state end the Canal Era?
const passEndsCanalEra = (actor: AnyActor): boolean => {
  const probe = cloneActor(actor)
  probe.send({ type: 'PASS' } as any)
  const flipped = ctx(probe).era === 'rail'
  probe.stop()
  return flipped
}

// How many consecutive PASS actions reach gameOver from here? null if more
// than maxPasses (or the machine leaves selectingAction unexpectedly).
const passesToGameOver = (actor: AnyActor, maxPasses = 8): number | null => {
  const probe = cloneActor(actor)
  for (let i = 1; i <= maxPasses; i++) {
    probe.send({ type: 'PASS' } as any)
    if (probe.getSnapshot().matches('gameOver')) {
      probe.stop()
      return i
    }
    if (!isSelectingAction(probe)) {
      probe.stop()
      return null
    }
  }
  probe.stop()
  return null
}

const START_PLAYERS = [
  { id: '1', name: 'Eliza', color: 'red', character: 'Eliza Tinsley' },
  {
    id: '2',
    name: 'Isambard',
    color: 'blue',
    character: 'Isambard Kingdom Brunel',
  },
  { id: '3', name: 'George', color: 'green', character: 'George Stephenson' },
].map((p) => ({
  ...p,
  money: 17,
  victoryPoints: 0,
  income: 10,
  industryTilesOnMat: {},
}))

const startFreshGame = (): AnyActor => {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: START_PLAYERS } as any)
  return actor
}

const writeFixture = (name: string, header: string, actor: AnyActor) => {
  const persisted = actor.getPersistedSnapshot()
  const json = JSON.stringify(persisted, null, 2)
  const outDir = dirname(fileURLToPath(import.meta.url))
  const exportName = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
  writeFileSync(
    join(outDir, `demo-snapshot-${name}.ts`),
    `// Auto-generated by generate-demo.test.ts (GENERATE_DEMO=1) - do not edit.\n// ${header}\nexport const demoSnapshot${exportName.charAt(0).toUpperCase() + exportName.slice(1)}: unknown = ${json}\n`,
  )
}

// Probe (without committing) whether the current player could reach the
// double-link rail build from this exact state.
// A double build is only usable if some (first, second) PAIR completes —
// merely offering CHOOSE_DOUBLE_LINK_BUILD is not enough (the second rail
// needs its own coal reach and the £15 + beer must be payable). Dry-run
// the full flow on clones; return the first completable pair.
const findCompletableDoublePair = (
  actor: AnyActor,
): { first: [string, string]; second: [string, string] } | null => {
  const player = currentPlayer(actor)
  if (player.hand.length === 0) return null
  const rails = connections.filter((c) =>
    (c.types as readonly string[]).includes('rail'),
  )
  for (const first of rails) {
    for (const second of rails) {
      if (first === second) continue
      const probe = cloneActor(actor)
      probe.send({ type: 'NETWORK' } as any)
      probe.send({
        type: 'SELECT_CARD',
        cardId: currentPlayer(probe).hand[0].id,
      } as any)
      probe.send({
        type: 'SELECT_LINK',
        from: first.from,
        to: first.to,
      } as any)
      probe.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' } as any)
      probe.send({
        type: 'SELECT_SECOND_LINK',
        from: second.from,
        to: second.to,
      } as any)
      const snap = probe.getSnapshot() as any
      let ok = false
      if (
        snap.matches({
          playing: { action: { networking: 'confirmingDoubleLink' } },
        }) &&
        snap.can({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
      ) {
        probe.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' } as any)
        ok = ctx(probe).lastError === null
      }
      probe.stop()
      if (ok) {
        return {
          first: [first.from, first.to],
          second: [second.from, second.to],
        }
      }
    }
  }
  return null
}

const canReachDoubleLink = (actor: AnyActor): boolean =>
  findCompletableDoublePair(actor) !== null

describe('demo snapshot generator', () => {
  test.skipIf(!process.env.GENERATE_DEMO)('generate rail-era fixture', () => {
    // Freeze a rail-era mid-game frame where the double-link network flow is
    // actually reachable, so the UI can be hand-verified in a browser.
    let best: { actor: AnyActor; actions: number } | null = null
    for (let attempt = 0; attempt < 40 && !best; attempt++) {
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

      let actions = 0
      while (actions < 400 && !actor.getSnapshot().matches('gameOver')) {
        if (!isSelectingAction(actor)) unwind(actor)
        const c = ctx(actor)
        if (
          c.era === 'rail' &&
          isSelectingAction(actor) &&
          currentPlayer(actor).money >= 20 &&
          currentPlayer(actor).hand.length >= 3 &&
          canReachDoubleLink(actor)
        ) {
          best = { actor, actions }
          break
        }
        greedyPolicy(actor)
        actions++
      }
      if (!best) actor.stop()
    }

    expect(best).not.toBeNull()
    if (!best) return
    expect(ctx(best.actor).era).toBe('rail')
    console.log(
      'rail fixture completable double pair:',
      JSON.stringify(findCompletableDoublePair(best.actor)),
    )

    const persisted = best.actor.getPersistedSnapshot()
    const json = JSON.stringify(persisted, null, 2)
    const outDir = dirname(fileURLToPath(import.meta.url))
    writeFileSync(
      join(outDir, 'demo-snapshot-rail.ts'),
      `// Auto-generated by generate-demo.test.ts (GENERATE_DEMO=1) - do not edit.\n// A real rail-era state (${best.actions} engine-driven actions, 3 players)\n// frozen at a point where the double-link network flow is reachable.\nexport const demoSnapshotRail: unknown = ${json}\n`,
    )
    best.actor.stop()
  })

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
          // thresholds tuned for the audited (tighter) income economy
          built.length >= 8 &&
          links.length >= 1 &&
          built.some((i: any) => i.flipped)
        )
      }
      while (
        !richEnough() &&
        actions < 70 &&
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
        c.players[c.currentPlayerIndex].hand.length >= 5
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

  test.skipIf(!process.env.GENERATE_DEMO)('generate sell fixture', () => {
    // Freeze at a state where the current player can flip TWO industries in
    // one Sell action (multi-sale) — probed through the machine's own guards.
    // Defer selling so sellable industries can ACCUMULATE — the greedy
    // policy would flip them one at a time and never reach a multi-sale.
    const hoardingPolicy = (actor: AnyActor): boolean => {
      const player = currentPlayer(actor)
      if (tryBuild(actor)) return true
      if (tryNetwork(actor)) return true
      if (player.money < 14 && tryLoan(actor)) return true
      if (trySell(actor)) return true
      return pass(actor)
    }
    let found: AnyActor | null = null
    for (let attempt = 0; attempt < 100 && !found; attempt++) {
      const actor = startFreshGame()
      let actions = 0
      while (actions < 260 && !actor.getSnapshot().matches('gameOver')) {
        if (!isSelectingAction(actor)) unwind(actor)
        if (
          isSelectingAction(actor) &&
          ctx(actor).era === 'canal' &&
          multiSalePossible(actor)
        ) {
          found = actor
          break
        }
        hoardingPolicy(actor)
        actions++
      }
      if (!found) actor.stop()
    }

    expect(found).not.toBeNull()
    if (!found) return
    writeFixture(
      'sell',
      'Frozen where the current player can multi-sell (2+ industries in one Sell action).',
      found,
    )
    found.stop()
  })

  test.skipIf(!process.env.GENERATE_DEMO)('generate era-end fixture', () => {
    // Freeze one PASS away from the Canal Era ending.
    let found: AnyActor | null = null
    for (let attempt = 0; attempt < 20 && !found; attempt++) {
      const actor = startFreshGame()
      let actions = 0
      while (actions < 400 && !actor.getSnapshot().matches('gameOver')) {
        if (!isSelectingAction(actor)) unwind(actor)
        if (
          isSelectingAction(actor) &&
          ctx(actor).era === 'canal' &&
          passEndsCanalEra(actor)
        ) {
          found = actor
          break
        }
        if (ctx(actor).era === 'rail') break // overshot
        greedyPolicy(actor)
        actions++
      }
      if (!found) actor.stop()
    }

    expect(found).not.toBeNull()
    if (!found) return
    writeFixture(
      'era-end',
      'Frozen one PASS before the Canal Era ends (era scoring + Rail Era start).',
      found,
    )
    found.stop()
  })

  test.skipIf(!process.env.GENERATE_DEMO)('generate wilds fixture', () => {
    // Freeze where the current player HOLDS both wild cards (post-Scout)
    // with money to build — for exercising wild-card build flows in e2e.
    const tryScout = (actor: AnyActor): boolean => {
      const c = ctx(actor)
      const player = currentPlayer(actor)
      if (player.hand.length < 6) return false
      if (
        player.hand.some(
          (card: any) =>
            card.type === 'wild_location' || card.type === 'wild_industry',
        )
      ) {
        return false
      }
      if (c.wildLocationPile.length === 0 || c.wildIndustryPile.length === 0) {
        return false
      }
      const before = turnState(actor)
      actor.send({ type: 'SCOUT' } as any)
      actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
      actor.send({ type: 'SELECT_CARD', cardId: player.hand[1].id } as any)
      actor.send({ type: 'SELECT_CARD', cardId: player.hand[2].id } as any)
      actor.send({ type: 'CONFIRM' } as any)
      if (actionConsumed(actor, before)) return true
      unwind(actor)
      return false
    }

    let found: AnyActor | null = null
    for (let attempt = 0; attempt < 30 && !found; attempt++) {
      const actor = startFreshGame()
      let actions = 0
      while (actions < 200 && !actor.getSnapshot().matches('gameOver')) {
        if (!isSelectingAction(actor)) unwind(actor)
        const p = currentPlayer(actor)
        if (
          isSelectingAction(actor) &&
          ctx(actor).era === 'canal' &&
          p.money >= 20 &&
          p.hand.some((card: any) => card.type === 'wild_location') &&
          p.hand.some((card: any) => card.type === 'wild_industry')
        ) {
          found = actor
          break
        }
        if (!tryScout(actor)) greedyPolicy(actor)
        actions++
      }
      if (!found) actor.stop()
    }

    expect(found).not.toBeNull()
    if (!found) return
    writeFixture(
      'wilds',
      'Frozen with both wild cards in the current hand (build-with-wilds flows).',
      found,
    )
    found.stop()
  })

  test.skipIf(!process.env.GENERATE_DEMO)('generate game-end fixture', () => {
    // Freeze a few PASSes from gameOver so a UI test can play the actual
    // final turns (round income, rail-era end, scoring, winner).
    let found: { actor: AnyActor; passes: number } | null = null
    for (let attempt = 0; attempt < 20 && !found; attempt++) {
      const actor = startFreshGame()
      let actions = 0
      while (actions < 1500 && !actor.getSnapshot().matches('gameOver')) {
        if (!isSelectingAction(actor)) unwind(actor)
        if (isSelectingAction(actor) && ctx(actor).era === 'rail') {
          const passes = passesToGameOver(actor)
          if (passes !== null && passes >= 3) {
            // Require a DECISIVE ending: a unique winner with real points
            // (a barren all-zero tie makes a useless capstone journey).
            const probe = cloneActor(actor)
            for (let i = 0; i < passes; i++) {
              probe.send({ type: 'PASS' } as any)
            }
            const end = ctx(probe)
            const winners = end.winners ?? []
            const topVp = Math.max(
              ...end.players.map((p: any) => p.victoryPoints),
            )
            probe.stop()
            if (winners.length === 1 && topVp > 0) {
              found = { actor, passes }
              break
            }
          }
        }
        greedyPolicy(actor)
        actions++
      }
      if (!found) actor.stop()
    }

    expect(found).not.toBeNull()
    if (!found) return
    writeFixture(
      'game-end',
      `Frozen ${found.passes} PASS actions before gameOver (drive the real ending through the UI).`,
      found.actor,
    )
    found.actor.stop()
  })
})
