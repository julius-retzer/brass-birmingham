// Develop-via-mat: the guard on SELECT_TILES_FOR_DEVELOP and the staged
// re-pick that lets the player mat act as the picking surface.
//
// The event used to be unguarded — any industryTypes payload was accepted and
// silently trimmed inside the assign. The mat UI needs the machine to answer
// "may I pick this tile?" per candidate (engine-owned legality), and to accept
// a REPLACEMENT pick while already sitting on the iron/confirm step so a
// second mat click can grow a one-tile develop into a two-tile one without
// cancelling. Money/iron affordability deliberately stays on CONFIRM
// (pinned by gameStore.money.test.ts) — this guard owns tile legality only.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { IndustryType } from '~/data/cards'
import { gameStore } from './gameStore'
import { explainRefusal } from './refusal'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {
      // Ignore errors during cleanup
    }
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'Player 1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
      {
        id: '2',
        name: 'Player 2',
        color: 'blue' as const,
        character: 'Eliza Tinsley' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
    ],
  })
  return { actor }
}

const snap = (actor: ReturnType<typeof createActor>) =>
  actor.getSnapshot() as ReturnType<
    ReturnType<typeof createActor<typeof gameStore>>['getSnapshot']
  >

/** Enter the develop tile step with a card already discarded. */
const enterTileStep = (actor: ReturnType<typeof createActor>) => {
  const s = snap(actor)
  const idx = s.context.currentPlayerIndex
  const card = s.context.players[idx]!.hand[0]!
  actor.send({ type: 'DEVELOP' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
  return idx
}

const pickEvent = (industryTypes: IndustryType[]) =>
  ({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes }) as const

const matQuantity = (
  actor: ReturnType<typeof createActor>,
  idx: number,
  type: IndustryType,
) =>
  (snap(actor).context.players[idx]!.industryTilesOnMat[type] ?? []).reduce(
    (n: number, t: { quantityAvailable: number }) => n + t.quantityAvailable,
    0,
  )

describe('canSelectTilesForDevelop — the per-tile legality guard', () => {
  test('a developable industry is accepted; empty and oversized picks are not', () => {
    const { actor } = setupGame()
    enterTileStep(actor)
    const s = snap(actor)
    expect(s.can(pickEvent(['coal']))).toBe(true)
    expect(s.can(pickEvent(['coal', 'iron']))).toBe(true)
    expect(s.can(pickEvent([]))).toBe(false)
    expect(s.can(pickEvent(['coal', 'iron', 'cotton']))).toBe(false)
  })

  test('fresh-mat pottery is NOT developable — its lowest tile is a lightbulb', () => {
    const { actor } = setupGame()
    enterTileStep(actor)
    // The fresh mat holds pottery 1 (lightbulb), 2, 3 (lightbulb), 4, 5.
    // Develop always removes the LOWEST tile, and pottery 1 is a lightbulb
    // that may only be BUILT away (rulebook p.7) — so the whole track is
    // off-limits to Develop and levels II/IV are never offered while I is
    // still on the mat (the captain's reported bug).
    const s = snap(actor)
    expect(s.can(pickEvent(['pottery']))).toBe(false)
    expect(s.can(pickEvent(['pottery', 'pottery']))).toBe(false)
    expect(explainRefusal(s as never, pickEvent(['pottery']) as never)).toMatch(
      /lightbulb/i,
    )
  })

  test('once pottery I is built away, II is developable but III (lightbulb) caps it at one', () => {
    const { actor } = setupGame()
    const idx0 = snap(actor).context.currentPlayerIndex
    const mat = snap(actor).context.players[idx0]!.industryTilesOnMat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx0,
      industryTilesOnMat: {
        ...mat,
        pottery: (mat.pottery ?? []).map(
          (t: { tile: { level: number }; quantityAvailable: number }) =>
            t.tile.level === 1 ? { ...t, quantityAvailable: 0 } : t,
        ),
      },
    } as never)
    enterTileStep(actor)
    const s = snap(actor)
    expect(s.can(pickEvent(['pottery']))).toBe(true)
    expect(s.can(pickEvent(['pottery', 'pottery']))).toBe(false)
  })

  test('an industry whose only remaining tiles are lightbulb pottery is refused, with the rulebook reason', () => {
    const { actor } = setupGame()
    const s0 = snap(actor)
    const idx = s0.context.currentPlayerIndex
    const mat = s0.context.players[idx]!.industryTilesOnMat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      industryTilesOnMat: {
        ...mat,
        pottery: (mat.pottery ?? []).filter(
          (t: { tile: { hasLightbulbIcon: boolean } }) =>
            t.tile.hasLightbulbIcon,
        ),
      },
    } as never)
    enterTileStep(actor)
    const s = snap(actor)
    const event = pickEvent(['pottery'])
    expect(s.can(event)).toBe(false)
    expect(explainRefusal(s as never, event as never)).toMatch(/lightbulb/i)
  })

  test('picking the same industry more times than it has developable tiles is refused, and says so', () => {
    const { actor } = setupGame()
    const s0 = snap(actor)
    const idx = s0.context.currentPlayerIndex
    const mat = s0.context.players[idx]!.industryTilesOnMat
    // Leave exactly ONE developable cotton tile.
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      industryTilesOnMat: {
        ...mat,
        cotton: (mat.cotton ?? [])
          .slice(0, 1)
          .map((t: { quantityAvailable: number }) => ({
            ...t,
            quantityAvailable: 1,
          })),
      },
    } as never)
    enterTileStep(actor)
    const s = snap(actor)
    expect(s.can(pickEvent(['cotton']))).toBe(true)
    const twice = pickEvent(['cotton', 'cotton'])
    expect(s.can(twice)).toBe(false)
    expect(explainRefusal(s as never, twice as never)).toMatch(/only .*1|one/i)
  })

  test('an industry with no tiles left on the mat is refused by name', () => {
    const { actor } = setupGame()
    const s0 = snap(actor)
    const idx = s0.context.currentPlayerIndex
    const mat = s0.context.players[idx]!.industryTilesOnMat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      industryTilesOnMat: { ...mat, brewery: [] },
    } as never)
    enterTileStep(actor)
    const s = snap(actor)
    const event = pickEvent(['brewery'])
    expect(s.can(event)).toBe(false)
    expect(explainRefusal(s as never, event as never)).toMatch(/no brewery/i)
  })
})

describe('staged re-pick — a mat click grows or shrinks the develop in place', () => {
  test('a second pick from the confirm step replaces the staged tiles and both are scrapped on CONFIRM', () => {
    const { actor } = setupGame()
    const idx = enterTileStep(actor)
    const coalBefore = matQuantity(actor, idx, 'coal')
    const ironBefore = matQuantity(actor, idx, 'iron')

    actor.send(pickEvent(['coal']) as never)
    // No iron works on the board — the iron step auto-skips to the confirm.
    expect(
      snap(actor).matches({
        playing: { action: { developing: 'confirmingDevelop' } },
      } as never),
    ).toBe(true)

    // The second mat click: replace [coal] with [coal, iron] without cancel.
    expect(snap(actor).can(pickEvent(['coal', 'iron']))).toBe(true)
    actor.send(pickEvent(['coal', 'iron']) as never)
    expect(snap(actor).context.selectedTilesForDevelop).toEqual([
      'coal',
      'iron',
    ])
    expect(
      snap(actor).matches({
        playing: { action: { developing: 'confirmingDevelop' } },
      } as never),
    ).toBe(true)

    actor.send({ type: 'CONFIRM' })
    expect(snap(actor).context.lastError).toBeNull()
    expect(matQuantity(actor, idx, 'coal')).toBe(coalBefore - 1)
    expect(matQuantity(actor, idx, 'iron')).toBe(ironBefore - 1)
  })

  test('a smaller re-pick unstages: [coal, iron] shrinks back to [iron]', () => {
    const { actor } = setupGame()
    enterTileStep(actor)
    actor.send(pickEvent(['coal', 'iron']) as never)
    actor.send(pickEvent(['iron']) as never)
    expect(snap(actor).context.selectedTilesForDevelop).toEqual(['iron'])
  })

  test('re-picking while the iron question is open resets the chosen sources', () => {
    const { actor } = setupGame()
    const s0 = snap(actor)
    const developerIndex = s0.context.currentPlayerIndex
    const opponentIndex = developerIndex === 0 ? 1 : 0
    const ironTile = {
      id: 'iron_1',
      type: 'iron' as const,
      level: 1,
      canBuildInCanalEra: true,
      canBuildInRailEra: true,
      incomeAdvancement: 2,
      incomeSpaces: 2,
      victoryPoints: 1,
      cost: 5,
      linkScoringIcons: 1,
      coalRequired: 1,
      ironRequired: 0,
      beerRequired: 0,
      beerProduced: 0,
      coalProduced: 0,
      ironProduced: 4,
      hasLightbulbIcon: false,
      quantity: 1,
    }
    const works = (location: string) => ({
      location,
      type: 'iron' as const,
      level: 1,
      flipped: false,
      tile: ironTile,
      coalCubesOnTile: 0,
      ironCubesOnTile: 2,
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: developerIndex,
      money: 30,
      industries: [works('birmingham')],
    } as never)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      industries: [works('dudley')],
    } as never)

    const developerId = snap(actor).context.players[developerIndex]!.id
    enterTileStep(actor)
    actor.send(pickEvent(['cotton']) as never)
    // Two unflipped works: the machine stops on the iron question.
    expect(
      snap(actor).matches({
        playing: { action: { developing: 'choosingIronSource' } },
      } as never),
    ).toBe(true)
    actor.send({
      type: 'SELECT_IRON_SOURCE',
      source: {
        kind: 'ironworks',
        ownerId: developerId,
        location: 'birmingham',
      },
    } as never)

    // Growing the develop reopens the question from scratch — a stale pick
    // must not survive into a different iron requirement.
    actor.send(pickEvent(['cotton', 'cotton']) as never)
    const after = snap(actor)
    expect(
      after.matches({
        playing: { action: { developing: 'choosingIronSource' } },
      } as never),
    ).toBe(true)
    expect(after.context.chosenIronSources).toEqual([])
    expect(after.context.selectedTilesForDevelop).toEqual(['cotton', 'cotton'])
  })

  test('CANCEL from the confirm step unwinds to the tile step consuming nothing', () => {
    const { actor } = setupGame()
    const idx = enterTileStep(actor)
    const actionsBefore = snap(actor).context.actionsRemaining
    const coalBefore = matQuantity(actor, idx, 'coal')

    actor.send(pickEvent(['coal']) as never)
    actor.send({ type: 'CANCEL' })
    const s = snap(actor)
    expect(
      s.matches({
        playing: { action: { developing: 'selectingTiles' } },
      } as never),
    ).toBe(true)
    expect(s.context.selectedTilesForDevelop).toEqual([])
    expect(s.context.actionsRemaining).toBe(actionsBefore)
    expect(matQuantity(actor, idx, 'coal')).toBe(coalBefore)
    // The held card is still in play — cancel did not eat it.
    expect(s.context.selectedCard).not.toBeNull()
  })
})
