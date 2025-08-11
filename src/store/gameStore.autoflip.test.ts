// Auto-flip and Resource Priority Tests
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

const setup = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  const players = [
    {
      id: '1',
      name: 'P1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
    },
    {
      id: '2',
      name: 'P2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
    },
  ]
  actor.send({ type: 'START_GAME', players })
  return { actor }
}

describe('Game Store - Auto flipping and resource priority', () => {
  test('iron works flips when its last iron is consumed during develop', () => {
    const { actor } = setup()

    // Give current player an iron works with 1 iron cube remaining + tiles to develop
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'birmingham',
          type: 'iron',
          level: 1,
          flipped: false,
          tile: {
            id: 'iron_1',
            type: 'iron',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 2,
            victoryPoints: 1,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 1,
          beerBarrelsOnTile: 0,
        },
      ],
      industryTilesOnMat: {
        coal: [
          {
            id: 'coal_1',
            type: 'coal',
            level: 1,
            cost: 5,
            victoryPoints: 1,
            incomeSpaces: 1,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerRequired: 0,
            beerProduced: 0,
            coalProduced: 2,
            ironProduced: 0,
            canBuildInCanalEra: true,
            canBuildInRailEra: false,
            hasLightbulbIcon: false,
            incomeAdvancement: 2,
          },
        ],
      },
    })

    const s0 = actor.getSnapshot()
    const initialHandCard = s0.context.players[0]!.hand[0]!
    // Perform develop (uses 1 iron via consumeIronFromSources)
    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: initialHandCard.id })
    actor.send({ type: 'CONFIRM' }) // Move to confirmingDevelop state
    actor.send({ type: 'CONFIRM' }) // Actually execute the develop action

    const s1 = actor.getSnapshot()
    const industry = s1.context.players[0]!.industries[0]!
    expect(industry.type).toBe('iron')
    expect(industry.flipped).toBe(true)
  })

  test('develop consumes iron from iron works before iron market (free first)', () => {
    const { actor } = setup()

    // Provide an iron works with 1 iron cube so develop should be free + tiles to develop
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 50,
      industries: [
        {
          location: 'birmingham',
          type: 'iron',
          level: 1,
          flipped: false,
          tile: {
            id: 'iron_1',
            type: 'iron',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 0,
            victoryPoints: 0,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 1,
          beerBarrelsOnTile: 0,
        },
      ],
      industryTilesOnMat: {
        coal: [
          {
            id: 'coal_1',
            type: 'coal',
            level: 1,
            cost: 5,
            victoryPoints: 1,
            incomeSpaces: 1,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerRequired: 0,
            beerProduced: 0,
            coalProduced: 2,
            ironProduced: 0,
            canBuildInCanalEra: true,
            canBuildInRailEra: false,
            hasLightbulbIcon: false,
            incomeAdvancement: 2,
          },
        ],
      },
    })

    let s = actor.getSnapshot()
    const startMoney = s.context.players[0]!.money
    const card = s.context.players[0]!.hand[0]!

    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'CONFIRM' }) // Move to confirmingDevelop state
    actor.send({ type: 'CONFIRM' }) // Actually execute the develop action

    s = actor.getSnapshot()
    const endMoney = s.context.players[0]!.money

    // Should not have spent money on iron (free from iron works)
    expect(endMoney).toBe(startMoney)
  })

  test('develop consumes from iron market when no iron works available (cost > 0)', () => {
    const { actor } = setup()

    // Ensure no iron works; keep money to observe cost; add tiles to develop
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 50,
      industries: [],
      industryTilesOnMat: {
        coal: [
          {
            id: 'coal_1',
            type: 'coal',
            level: 1,
            cost: 5,
            victoryPoints: 1,
            incomeSpaces: 1,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerRequired: 0,
            beerProduced: 0,
            coalProduced: 2,
            ironProduced: 0,
            canBuildInCanalEra: true,
            canBuildInRailEra: false,
            hasLightbulbIcon: false,
            incomeAdvancement: 2,
          },
        ],
      },
    })

    let s = actor.getSnapshot()
    const startMoney = s.context.players[0]!.money
    const card = s.context.players[0]!.hand[0]!

    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'CONFIRM' }) // Move to confirmingDevelop state
    actor.send({ type: 'CONFIRM' }) // Actually execute the develop action

    s = actor.getSnapshot()
    const endMoney = s.context.players[0]!.money

    // Should have spent money buying iron from market
    expect(endMoney).toBeLessThan(startMoney)
  })
})
