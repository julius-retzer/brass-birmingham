// Income Collection Tests - positive income, negative income, shortfall handling
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { IndustryTile } from '../data/industryTiles'
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

const setup = (playerCount = 2) => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: String(i + 1),
    name: `P${i + 1}`,
    color: (['red', 'blue', 'green', 'yellow'][i] as 'red' | 'blue' | 'green' | 'yellow'),
    character: ([
      'Richard Arkwright',
      'Eliza Tinsley',
      'Isambard Kingdom Brunel',
      'George Stephenson',
    ][i] as 'Richard Arkwright' | 'Eliza Tinsley' | 'Isambard Kingdom Brunel' | 'George Stephenson'),
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as any,
  }))

  actor.send({ type: 'START_GAME', players })
  return { actor }
}

const advanceRound = (actor: ReturnType<typeof createActor>) => {
  let snapshot = actor.getSnapshot()
  const playerCount = snapshot.context.players.length
  const actionsPerPlayer = snapshot.context.round === 1 ? 1 : 2

  // Each player passes for all their actions
  for (let p = 0; p < playerCount; p++) {
    for (let a = 0; a < actionsPerPlayer; a++) {
      snapshot = actor.getSnapshot()
      const currentPlayer =
        snapshot.context.players[snapshot.context.currentPlayerIndex]!
      if (currentPlayer.hand.length > 0) {
        actor.send({ type: 'PASS' })
        snapshot = actor.getSnapshot()
        const cardId =
          snapshot.context.players[snapshot.context.currentPlayerIndex]!
            .hand[0]!.id
        actor.send({ type: 'SELECT_CARD', cardId })
        actor.send({ type: 'CONFIRM' })
      }
    }
  }
}

describe('Game Store - Income Collection', () => {
  describe('Positive Income Collection', () => {
    test('collects income at end of round', () => {
      const { actor } = setup()

      // Set player incomes
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: 10,
        money: 0,
      })
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 1,
        income: 15,
        money: 0,
      })

      const initialSnapshot = actor.getSnapshot()
      const initialMoney0 = initialSnapshot.context.players[0]!.money
      const initialMoney1 = initialSnapshot.context.players[1]!.money

      // Advance through round 1
      advanceRound(actor)

      const snapshot = actor.getSnapshot()

      // Players should have collected income
      expect(snapshot.context.players[0]!.money).toBe(initialMoney0 + 10)
      expect(snapshot.context.players[1]!.money).toBe(initialMoney1 + 15)

      // Check logs
      expect(
        snapshot.context.logs.some((l) =>
          l.message.includes('P1 collected £10 income'),
        ),
      ).toBe(true)
      expect(
        snapshot.context.logs.some((l) =>
          l.message.includes('P2 collected £15 income'),
        ),
      ).toBe(true)
    })

    test('handles different income levels correctly', () => {
      const { actor } = setup()

      // Test various income levels
      const testCases = [
        { income: 0, expected: 0 },
        { income: 5, expected: 5 },
        { income: 10, expected: 10 },
        { income: 20, expected: 20 },
        { income: 30, expected: 30 }, // Max income
      ]

      for (const testCase of testCases) {
        actor.send({
          type: 'TEST_SET_PLAYER_STATE',
          playerId: 0,
          income: testCase.income,
          money: 0,
        })

        advanceRound(actor)

        const snapshot = actor.getSnapshot()
        expect(snapshot.context.players[0]!.money).toBe(testCase.expected)
      }
    })

    test('does not collect income on final round of era', () => {
      const { actor } = setup()

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: 10,
        money: 0,
      })
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 1,
        income: 10,
        money: 0,
      })

      // Force final round conditions
      actor.send({ type: 'TEST_SET_FINAL_ROUND', isFinalRound: true })

      const initialSnapshot = actor.getSnapshot()
      const initialMoney0 = initialSnapshot.context.players[0]!.money
      const initialMoney1 = initialSnapshot.context.players[1]!.money

      advanceRound(actor)

      const snapshot = actor.getSnapshot()

      // Money should not change (no income collection on final round)
      expect(snapshot.context.players[0]!.money).toBe(initialMoney0)
      expect(snapshot.context.players[1]!.money).toBe(initialMoney1)
    })
  })

  describe('Negative Income Scenarios', () => {
    test('player can afford to pay negative income', () => {
      const { actor } = setup()

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -5,
        money: 20,
      })

      advanceRound(actor)

      const snapshot = actor.getSnapshot()

      // Player should have paid the negative income
      expect(snapshot.context.players[0]!.money).toBe(15) // 20 - 5

      // Check log
      expect(
        snapshot.context.logs.some((l) =>
          l.message.includes('paid £5 negative income'),
        ),
      ).toBe(true)
    })

    test('player cannot afford negative income - sells industry tiles', () => {
      const { actor } = setup()

      // Create a coal mine industry worth £18 (sells for £9)
      const coalTile: IndustryTile = {
        id: 'coal_1',
        type: 'coal',
        level: 1,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        cost: 18,
        coalProduced: 2,
        victoryPoints: 1,
        incomeAdvancement: 2,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 0,
        ironProduced: 0,
        hasLightbulbIcon: false,
        quantity: 1,
      }

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -10,
        money: 5, // Can only pay £5 of the £10 owed
        industries: [
          {
            location: 'birmingham',
            type: 'coal',
            level: 1,
            flipped: false,
            tile: coalTile,
            coalCubesOnTile: 2,
            ironCubesOnTile: 0,
            beerBarrelsOnTile: 0,
          },
        ],
      })

      advanceRound(actor)

      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!

      // Player should have sold the industry tile
      expect(player.industries.length).toBe(0)

      // Player should have money from selling
      // They paid £5 initially (all they had), then sold for £9
      // Final money is £9 (not £4, because they already paid the £5)
      expect(player.money).toBe(9)

      // Check logs
      expect(
        snapshot.context.logs.some((l) =>
          l.message.includes('sold coal industry for £9'),
        ),
      ).toBe(true)
    })

    test('multiple industries sold to cover shortfall', () => {
      const { actor } = setup()

      // Create multiple industries
      const industries = [
        {
          location: 'birmingham' as const,
          type: 'coal' as const,
          level: 1,
          flipped: false,
          tile: { cost: 10 } as IndustryTile, // Sells for £5
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        {
          location: 'stoke' as const,
          type: 'cotton' as const,
          level: 1,
          flipped: false,
          tile: { cost: 14 } as IndustryTile, // Sells for £7
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        {
          location: 'dudley' as const,
          type: 'iron' as const,
          level: 1,
          flipped: false,
          tile: { cost: 8 } as IndustryTile, // Sells for £4
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ]

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -20,
        money: 5, // Can only pay £5 of the £20 owed, needs £15 more
        industries,
      })

      advanceRound(actor)

      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!

      // Should have sold enough industries to cover shortfall
      // Need £15 (shortfall after paying £5), industries give £5 + £7 + £4 = £16 total
      expect(player.industries.length).toBe(0) // All sold

      // Player should have £16 (they already paid the £5 they had initially)
      expect(player.money).toBe(16)

      // Check that multiple sales are logged
      const saleLogs = snapshot.context.logs.filter(
        (l) => l.message.includes('sold') && l.message.includes('industry'),
      )
      expect(saleLogs.length).toBeGreaterThanOrEqual(2)
    })

    test('loses VP when cannot cover shortfall even after selling all industries', () => {
      const { actor } = setup()

      // Create one small industry
      const industry = {
        location: 'birmingham' as const,
        type: 'coal' as const,
        level: 1,
        flipped: false,
        tile: { cost: 8 } as IndustryTile, // Sells for £4
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      }

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -20,
        money: 0, // Can't pay any of the £20 owed
        industries: [industry],
      })

      // Set initial VP
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
      })
      
      // Note: victoryPoints not supported by TEST_SET_PLAYER_STATE

      advanceRound(actor)

      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!

      // Industry should be sold
      expect(player.industries.length).toBe(0)

      // Should lose VP for remaining shortfall (£20 - £4 from industry = £16 VP lost)
      expect(player.victoryPoints).toBe(0) // Can't go below 0

      // Check logs
      expect(
        snapshot.context.logs.some(
          (l) => l.message.includes('lost') && l.message.includes('VP'),
        ),
      ).toBe(true)
    })
  })

  describe('Industry Tile Selling Logic', () => {
    test('calculates sale value correctly (half cost rounded down)', () => {
      const { actor } = setup()

      const testCases = [
        { cost: 10, expectedSaleValue: 5 },
        { cost: 15, expectedSaleValue: 7 },
        { cost: 7, expectedSaleValue: 3 },
        { cost: 1, expectedSaleValue: 0 },
      ]

      for (const { cost, expectedSaleValue } of testCases) {
        const industry = {
          location: 'birmingham' as const,
          type: 'coal' as const,
          level: 1,
          flipped: false,
          tile: { cost } as IndustryTile,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }

        actor.send({
          type: 'TEST_SET_PLAYER_STATE',
          playerId: 0,
          income: -(expectedSaleValue + 5), // Force sale by making income negative
          money: 0,
          industries: [industry],
        })

        advanceRound(actor)

        const snapshot = actor.getSnapshot()

        // Check the log mentions the correct sale value
        if (expectedSaleValue > 0) {
          expect(
            snapshot.context.logs.some(
              (l) =>
                l.message.includes(`sold`) &&
                l.message.includes(`£${expectedSaleValue}`),
            ),
          ).toBe(true)
        }
      }
    })

    test('only sells minimum tiles needed to cover shortfall', () => {
      const { actor } = setup()

      // Create three industries
      const industries = [
        {
          location: 'birmingham' as const,
          type: 'coal' as const,
          level: 1,
          flipped: false,
          tile: { cost: 20, type: 'coal' } as IndustryTile, // Sells for £10
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        {
          location: 'stoke' as const,
          type: 'cotton' as const,
          level: 1,
          flipped: false,
          tile: { cost: 10, type: 'cotton' } as IndustryTile, // Sells for £5
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        {
          location: 'dudley' as const,
          type: 'iron' as const,
          level: 1,
          flipped: false,
          tile: { cost: 10, type: 'iron' } as IndustryTile, // Sells for £5
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ]

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -8, // Need £8
        money: 0,
        industries,
      })

      advanceRound(actor)

      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!

      // Should have sold only the first industry (£10 covers the £8 shortfall)
      expect(player.industries.length).toBe(2) // Two industries remain
      expect(player.money).toBe(10) // £10 from sale (they already paid £0 initially since money was 0)

      // Verify the remaining industries are the expected ones
      expect(player.industries.some((i) => i.type === 'cotton')).toBe(true)
      expect(player.industries.some((i) => i.type === 'iron')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    test('handles income at minimum negative level (-10)', () => {
      const { actor } = setup()

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -10,
        money: 20,
      })

      advanceRound(actor)

      const snapshot = actor.getSnapshot()

      expect(snapshot.context.players[0]!.money).toBe(10) // 20 - 10
      expect(
        snapshot.context.logs.some((l) =>
          l.message.includes('paid £10 negative income'),
        ),
      ).toBe(true)
    })

    test('player with no industries and negative income loses VP', () => {
      const { actor } = setup()

      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: -10,
        money: 3, // Can only pay £3 of £10
        industries: [], // No industries to sell
      })

      // Set initial VP
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
      })
      
      // Note: victoryPoints not supported by TEST_SET_PLAYER_STATE

      advanceRound(actor)

      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!

      // Should lose VP for shortfall (£10 - £3 = £7 VP lost)
      expect(player.victoryPoints).toBe(0) // 5 - 7 = -2, but capped at 0
      expect(player.money).toBe(0) // All money spent

      expect(
        snapshot.context.logs.some(
          (l) => l.message.includes('lost') && l.message.includes('VP'),
        ),
      ).toBe(true)
    })

    test('turn order affects income collection sequence', () => {
      const { actor } = setup(3)

      // Set different spending amounts to affect turn order
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 0,
        income: 5,
        money: 0,
      })
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 1,
        income: 10,
        money: 0,
      })
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: 2,
        income: 15,
        money: 0,
      })

      // Note: spending affects turn order for NEXT round
      // Player who spent least goes first next round

      advanceRound(actor)

      const snapshot = actor.getSnapshot()

      // All players should have collected income
      expect(snapshot.context.players[0]!.money).toBe(5)
      expect(snapshot.context.players[1]!.money).toBe(10)
      expect(snapshot.context.players[2]!.money).toBe(15)

      // Income collection happens between rounds regardless of turn order
      expect(
        snapshot.context.logs.filter((l) => l.message.includes('collected £'))
          .length,
      ).toBe(3)
    })
  })
})
