// The disabled-confirm reason is the engine's own definite reason, never a
// generic "needs X, Y, Z" list and never an "X or Y". This drives a real actor
// to a disabled "Lay both tracks" double-rail confirm and asserts the wired
// reason (disabledActionReason) is exactly what explainRefusal reports.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { CityId } from '~/data/board'
import { type GameEvent, type GameState, gameStore } from '~/store/gameStore'
import { explainRefusal } from '~/store/refusal'
import { pendingCoalChoice } from '~/store/shared/resourceSources'
import { disabledActionReason } from './action-reason'

let actors: ReturnType<typeof createActor>[] = []
afterEach(() => {
  actors.forEach((a) => {
    try {
      a.stop()
    } catch {}
  })
  actors = []
})

const resolveCoalTies = (actor: ReturnType<typeof createActor>) => {
  for (let guard = 0; guard < 8; guard++) {
    const choice = pendingCoalChoice(actor.getSnapshot().context as GameState)
    if (!choice?.hasChoice || !choice.options[0]) break
    actor.send({ type: 'SELECT_COAL_SOURCE', source: choice.options[0].source })
  }
}

// A brewery (beer) plus a coal mine, so the whole double-rail path is legal
// until we deliberately break one requirement.
const industriesWithBeerAndCoal =
  (): GameState['players'][number]['industries'] => [
    {
      location: 'birmingham',
      type: 'brewery' as const,
      level: 2,
      flipped: false,
      tile: {
        id: 'brewery_2',
        type: 'brewery' as const,
        level: 2,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        incomeAdvancement: 5,
        victoryPoints: 5,
        cost: 7,
        incomeSpaces: 5,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 1,
        coalProduced: 0,
        ironProduced: 0,
        hasLightbulbIcon: false,
        quantity: 1,
      },
      coalCubesOnTile: 0,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 2,
    },
    {
      location: 'birmingham',
      type: 'coal' as const,
      level: 1,
      flipped: false,
      tile: {
        id: 'coal_1',
        type: 'coal' as const,
        level: 1,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        incomeAdvancement: 4,
        victoryPoints: 1,
        cost: 5,
        incomeSpaces: 4,
        linkScoringIcons: 1,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 0,
        coalProduced: 2,
        ironProduced: 0,
        hasLightbulbIcon: false,
        quantity: 2,
      },
      coalCubesOnTile: 3,
      ironCubesOnTile: 0,
      beerBarrelsOnTile: 0,
    },
  ]

/** Drive a fresh actor to the disabled double-rail "Lay both tracks" confirm. */
const reachConfirmingDoubleLink = () => {
  const actor = createActor(gameStore)
  actors.push(actor)
  actor.subscribe({ error: () => {} })
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'P1',
        color: 'red',
        character: 'Richard Arkwright',
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
      {
        id: '2',
        name: 'P2',
        color: 'blue',
        character: 'Eliza Tinsley',
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {} as never,
      },
    ],
  })

  actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
  const playerId = actor.getSnapshot().context.currentPlayerIndex
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId,
    money: 50,
    industries: industriesWithBeerAndCoal(),
  })

  // Establish a rail link so a second link has network to build off.
  const card = actor.getSnapshot().context.players[playerId]!.hand[0]!
  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
  actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
  actor.send({ type: 'CONFIRM' })
  resolveCoalTies(actor)

  // Start the double-rail flow: first link, then the second.
  const card2 = actor.getSnapshot().context.players[playerId]!.hand[0]!
  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: card2.id })
  actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
  actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
  actor.send({
    type: 'SELECT_SECOND_LINK',
    from: 'birmingham',
    to: 'wolverhampton',
  })

  return { actor, playerId }
}

const EXECUTE: GameEvent = { type: 'EXECUTE_DOUBLE_NETWORK_ACTION' }
const GENERIC = 'Two rails cannot be laid from here.'

describe('disabled action reason', () => {
  test('reaches the double-rail confirm and it is legal when funded', () => {
    const { actor } = reachConfirmingDoubleLink()
    const snap = actor.getSnapshot()
    expect(
      snap.matches({
        playing: { action: { networking: 'confirmingDoubleLink' } },
      } as never),
    ).toBe(true)
    expect(snap.can(EXECUTE)).toBe(true)
  })

  test('disabled double-rail confirm shows the engine reason, not the generic list', () => {
    const { actor, playerId } = reachConfirmingDoubleLink()
    // Knock money below the £15 double-rail cost while everything else is fine.
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId, money: 14 })
    const snap = actor.getSnapshot()

    expect(snap.can(EXECUTE)).toBe(false)

    const engineReason = explainRefusal(snap, EXECUTE)
    const wired = disabledActionReason(snap, EXECUTE, GENERIC)

    // The dock renders exactly what the engine reports.
    expect(wired).toBe(engineReason)
    // Definite, specific — not the generic requirement list, and never an "or".
    expect(wired).not.toBe(GENERIC)
    expect(wired).not.toMatch(/\bor\b/i)
    expect(wired).toContain('14')
  })

  test('a coal-starved double rail names coal on the first link (repro shape)', () => {
    const { actor } = reachConfirmingDoubleLink()
    const live = actor.getSnapshot()
    const first = live.context.selectedLink!

    // Surgery: strip every coal source (no connected mine, empty market) while
    // keeping beer reachable. EXECUTE's refusal case reads only context, so a
    // context-only snapshot stand-in is enough to exercise explainDoubleLink.
    const starved = {
      ...live,
      context: {
        ...live.context,
        coalMarket: [],
        players: live.context.players.map((p) => ({
          ...p,
          industries: p.industries.filter((i) => i.type !== 'coal'),
        })),
      },
    } as typeof live

    const reason = explainRefusal(starved, EXECUTE)
    expect(reason).toContain('coal')
    expect(reason).toContain(first.from as CityId)
    expect(reason).toContain(first.to as CityId)
    expect(reason).not.toMatch(/\bor\b/i)
  })
})
