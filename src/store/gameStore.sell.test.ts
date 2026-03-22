// Sell Actions Tests - Resource selling and income generation
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
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

  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const setupSellTest = (actor: ReturnType<typeof createActor>, playerId = 0) => {
  // Provide a sellable cotton industry connected to a merchant (Warrington) via Stoke
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId,
    industries: [
      {
        location: 'stoke',
        type: 'cotton',
        level: 1,
        flipped: false,
        tile: {
          id: 'cotton_1',
          type: 'cotton',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          incomeAdvancement: 2,
          victoryPoints: 3,
          beerRequired: 1,
          cost: 10,
        },
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ],
    money: 20,
    income: 10,
  })
}

describe('Game Store - Sell Actions', () => {
  test('sell action - basic mechanics (flip, income, merchant beer, money bonus)', () => {
    const { actor } = setupGame()

    let snapshot = actor.getSnapshot()
    const initialActions = snapshot.context.actionsRemaining
    const initialDiscard = snapshot.context.discardPile.length
    const initialPlayerIndex = snapshot.context.currentPlayerIndex

    // Player 0 creates canal link Stoke <-> Warrington for connectivity
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId:
        snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
          .id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'stoke', to: 'warrington' })
    actor.send({ type: 'CONFIRM' })

    // After network, it's player 1's turn - pass to get back to player 0
    snapshot = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()
    const p1Card =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: p1Card.id })
    actor.send({ type: 'CONFIRM' })

    // Now round 2 - set up sell test for current player
    snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex
    setupSellTest(actor, currentPlayerId)

    const initialMoney = snapshot.context.players[currentPlayerId]!.money
    const initialIncome = snapshot.context.players[currentPlayerId]!.income

    // Perform sell action
    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    const cardToUse =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[currentPlayerId]!

    // Industry should be flipped
    const cotton = updatedPlayer.industries.find((i) => i.type === 'cotton')!
    expect(cotton.flipped).toBe(true)

    // Income should have increased by incomeAdvancement (clamped in machine)
    expect(updatedPlayer.income).toBeGreaterThan(initialIncome)

    // Discard pile should include the used cards (network + pass + sell = 3 cards)
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 3)

    // Turn should have advanced to next player after action completes
    expect(snapshot.context.currentPlayerIndex).not.toBe(initialPlayerIndex)

    // Merchant at Warrington beer should have been consumed (hasBeer toggled)
    const warrington = snapshot.context.merchants.find(
      (m) => m.location === 'warrington',
    )!
    expect(warrington.hasBeer).toBe(false)

    // Money bonus (+£5) from Warrington merchant
    // setupSellTest sets money to 20, so we should have 20 + 5 = 25
    expect(updatedPlayer.money).toBe(25)
  })

  test('sell action - requires card selection (guard)', () => {
    const { actor } = setupGame()
    setupSellTest(actor)

    // Start selling but do not select a card
    actor.send({ type: 'SELL' })
    const before = actor.getSnapshot()
    actor.send({ type: 'CONFIRM' })
    const after = actor.getSnapshot()

    // Still in selling state (guard blocked)
    expect(after.matches({ playing: { action: 'selling' } })).toBe(true)
    // No discard occurred
    expect(after.context.discardPile.length).toBe(
      before.context.discardPile.length,
    )
  })

  test('sell action - cancel returns to action selection', () => {
    const { actor } = setupGame()
    setupSellTest(actor)

    actor.send({ type: 'SELL' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selling' } })).toBe(true)

    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
  })

  test('sell action - flip and income increase without asserting money if no money bonus', () => {
    const { actor } = setupGame()

    // Player 0 creates canal link Stoke <-> Warrington for connectivity
    actor.send({ type: 'NETWORK' })
    let snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId:
        snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
          .id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'stoke', to: 'warrington' })
    actor.send({ type: 'CONFIRM' })

    // After network, it's player 1's turn - pass to get back to player 0
    snapshot = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()
    const p1Card =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: p1Card.id })
    actor.send({ type: 'CONFIRM' })

    // Now round 2 - set up pottery for the current player
    snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Provide a pottery at Stoke for the current player
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      industries: [
        {
          location: 'stoke',
          type: 'pottery',
          level: 1,
          flipped: false,
          tile: {
            id: 'pottery_1',
            type: 'pottery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 1,
            victoryPoints: 2,
            beerRequired: 1,
            cost: 12,
            incomeSpaces: 1,
            linkScoringIcons: 0,
            coalRequired: 1,
            ironRequired: 0,
            beerProduced: 0,
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: true,
            quantity: 1,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
      income: 5,
      money: 10,
    })

    snapshot = actor.getSnapshot()
    const initialIncome = snapshot.context.players[currentPlayerId]!.income

    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    const cardToUse =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const pottery = snapshot.context.players[currentPlayerId]!.industries.find(
      (i) => i.type === 'pottery',
    )!
    expect(pottery.flipped).toBe(true)
    expect(snapshot.context.players[currentPlayerId]!.income).toBeGreaterThan(
      initialIncome,
    )
  })

  test('sell action - insufficient beer logs error and makes no state changes', () => {
    const { actor } = setupGame()

    // Player 0 creates canal link to warrington for merchant connectivity
    actor.send({ type: 'NETWORK' })
    let snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'stoke', to: 'warrington' })
    actor.send({ type: 'CONFIRM' })

    // Player 1 passes
    snapshot = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    // Now set up the current player with a cotton that requires beer, but merchant beer is already consumed
    snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Cotton requires 1 beer but we'll make sure no beer is available
    // First consume the warrington merchant beer by doing one sell
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      industries: [
        {
          location: 'stoke',
          type: 'cotton',
          level: 3,
          flipped: false,
          tile: {
            id: 'cotton_3',
            type: 'cotton',
            level: 3,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 3,
            victoryPoints: 5,
            beerRequired: 2, // Requires 2 beer - merchant only has 1
            cost: 16,
            incomeSpaces: 1,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerProduced: 0,
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 1,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
      money: 20,
      income: 10,
    })

    snapshot = actor.getSnapshot()
    const moneyBefore = snapshot.context.players[currentPlayerId]!.money
    const incomeBefore = snapshot.context.players[currentPlayerId]!.income

    // Attempt sell - should fail due to insufficient beer
    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    const cardToUse = snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    // Should log error about insufficient beer
    expect(
      snapshot.context.logs.some(
        (l) => l.type === 'error' && l.message.includes('insufficient beer'),
      ),
    ).toBe(true)

    // No state changes should have been made (money, income unchanged)
    const cotton = snapshot.context.players[currentPlayerId]!.industries.find(
      (i) => i.type === 'cotton',
    )!
    expect(cotton.flipped).toBe(false)
  })

  test('sell action - merchant income bonus increases player income', () => {
    // Need 3+ players for Oxford (income bonus)
    const actor = createActor(gameStore)
    activeActors.push(actor)
    actor.start()
    actor.send({
      type: 'START_GAME',
      players: [
        { id: '1', name: 'P1', color: 'red' as const, character: 'Richard Arkwright' as const, money: 50, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
        { id: '2', name: 'P2', color: 'blue' as const, character: 'Eliza Tinsley' as const, money: 17, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
        { id: '3', name: 'P3', color: 'green' as const, character: 'Isambard Kingdom Brunel' as const, money: 17, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
      ],
    })

    let snapshot = actor.getSnapshot()
    // Verify Oxford merchant exists with income bonus
    const oxfordMerchant = snapshot.context.merchants.find(m => m.location === 'oxford')
    expect(oxfordMerchant).toBeDefined()
    expect(oxfordMerchant!.bonusType).toBe('income')

    const currentPlayerId = snapshot.context.currentPlayerIndex
    // Build canal link from birmingham to oxford
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[currentPlayerId]!.hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'oxford' })
    actor.send({ type: 'CONFIRM' })

    // Other players pass
    for (let i = 1; i < 3; i++) {
      snapshot = actor.getSnapshot()
      actor.send({ type: 'PASS' })
      snapshot = actor.getSnapshot()
      actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
      actor.send({ type: 'CONFIRM' })
    }

    // Now current player should be back for round 2
    snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Place cotton at birmingham (connected to oxford)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industries: [{
        location: 'birmingham',
        type: 'cotton',
        level: 1,
        flipped: false,
        tile: {
          id: 'cotton_1_income_test',
          type: 'cotton',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          incomeAdvancement: 2,
          victoryPoints: 3,
          beerRequired: 1,
          cost: 10,
          incomeSpaces: 1,
          linkScoringIcons: 1,
          coalRequired: 0,
          ironRequired: 0,
          beerProduced: 0,
          coalProduced: 0,
          ironProduced: 0,
          hasLightbulbIcon: false,
          quantity: 3,
        },
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      }],
      income: 5,
    })

    snapshot = actor.getSnapshot()
    const incomeBefore = snapshot.context.players[pid]!.income

    // Sell cotton (oxford merchant provides income bonus +2)
    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[pid]!

    // Cotton should be flipped
    expect(updatedPlayer.industries.find(i => i.type === 'cotton')!.flipped).toBe(true)

    // Income should increase by tile incomeAdvancement (2) + merchant income bonus (2) = 4 more than initial
    // (incomeBefore was 5, +2 from tile + +2 from merchant bonus = 9)
    expect(updatedPlayer.income).toBe(incomeBefore + 2 + 2)
  })

  test('sell action - merchant VP bonus increases player victory points', () => {
    // Need 4 players for Nottingham (VP bonus)
    const actor = createActor(gameStore)
    activeActors.push(actor)
    actor.start()
    actor.send({
      type: 'START_GAME',
      players: [
        { id: '1', name: 'P1', color: 'red' as const, character: 'Richard Arkwright' as const, money: 50, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
        { id: '2', name: 'P2', color: 'blue' as const, character: 'Eliza Tinsley' as const, money: 17, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
        { id: '3', name: 'P3', color: 'green' as const, character: 'Isambard Kingdom Brunel' as const, money: 17, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
        { id: '4', name: 'P4', color: 'yellow' as const, character: 'George Stephenson' as const, money: 17, victoryPoints: 0, income: 10, industryTilesOnMat: {} as any },
      ],
    })

    let snapshot = actor.getSnapshot()
    // Verify Nottingham merchant exists with VP bonus
    const nottinghamMerchant = snapshot.context.merchants.find(m => m.location === 'nottingham')
    expect(nottinghamMerchant).toBeDefined()
    expect(nottinghamMerchant!.bonusType).toBe('victoryPoints')

    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Build canal link from belper to nottingham
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[currentPlayerId]!.hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'belper', to: 'nottingham' })
    actor.send({ type: 'CONFIRM' })

    // Other players pass
    for (let i = 1; i < 4; i++) {
      snapshot = actor.getSnapshot()
      actor.send({ type: 'PASS' })
      snapshot = actor.getSnapshot()
      actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
      actor.send({ type: 'CONFIRM' })
    }

    snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Place cotton at belper (connected to nottingham)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industries: [{
        location: 'belper',
        type: 'cotton',
        level: 1,
        flipped: false,
        tile: {
          id: 'cotton_1_vp_test',
          type: 'cotton',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          incomeAdvancement: 2,
          victoryPoints: 3,
          beerRequired: 1,
          cost: 10,
          incomeSpaces: 1,
          linkScoringIcons: 1,
          coalRequired: 0,
          ironRequired: 0,
          beerProduced: 0,
          coalProduced: 0,
          ironProduced: 0,
          hasLightbulbIcon: false,
          quantity: 3,
        },
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      }],
      victoryPoints: 0,
    })

    snapshot = actor.getSnapshot()
    const vpBefore = snapshot.context.players[pid]!.victoryPoints

    // Sell cotton (nottingham merchant provides VP bonus +2)
    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[pid]!

    // Cotton should be flipped
    expect(updatedPlayer.industries.find(i => i.type === 'cotton')!.flipped).toBe(true)

    // VP should increase by merchant VP bonus (+2)
    expect(updatedPlayer.victoryPoints).toBe(vpBefore + 2)
  })

  test('sell action - merchant develop bonus removes lowest tile from mat', () => {
    const { actor } = setupGame()

    // Gloucester has develop bonus in 2-player games
    // Build link worcester -> gloucester for connectivity
    actor.send({ type: 'NETWORK' })
    let snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' })
    actor.send({ type: 'CONFIRM' })

    // Player 1 passes
    snapshot = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const pid = snapshot.context.currentPlayerIndex

    // Place cotton at worcester (connected to gloucester)
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: pid,
      industries: [{
        location: 'worcester',
        type: 'cotton',
        level: 1,
        flipped: false,
        tile: {
          id: 'cotton_1_dev_test',
          type: 'cotton',
          level: 1,
          canBuildInCanalEra: true,
          canBuildInRailEra: true,
          incomeAdvancement: 2,
          victoryPoints: 3,
          beerRequired: 1,
          cost: 10,
          incomeSpaces: 1,
          linkScoringIcons: 1,
          coalRequired: 0,
          ironRequired: 0,
          beerProduced: 0,
          coalProduced: 0,
          ironProduced: 0,
          hasLightbulbIcon: false,
          quantity: 3,
        },
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      }],
      industryTilesOnMat: {
        cotton: [
          { tile: { id: 'cotton_mat_1', type: 'cotton', level: 1, canBuildInCanalEra: true, canBuildInRailEra: true, incomeAdvancement: 2, victoryPoints: 3, beerRequired: 1, cost: 10, incomeSpaces: 1, linkScoringIcons: 1, coalRequired: 0, ironRequired: 0, beerProduced: 0, coalProduced: 0, ironProduced: 0, hasLightbulbIcon: false, quantity: 3 }, quantityAvailable: 2 },
        ],
        coal: [],
        iron: [],
        manufacturer: [],
        pottery: [],
        brewery: [],
      } as any,
      money: 20,
    })

    snapshot = actor.getSnapshot()
    const matBefore = snapshot.context.players[pid]!.industryTilesOnMat
    const cottonTileBefore = (matBefore.cotton || [])[0]
    const qtyBefore = cottonTileBefore ? cottonTileBefore.quantityAvailable : 0

    // Sell cotton (gloucester merchant provides develop bonus)
    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELECT_CARD', cardId: snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const updatedPlayer = snapshot.context.players[pid]!

    // Cotton should be flipped
    expect(updatedPlayer.industries.find(i => i.type === 'cotton')!.flipped).toBe(true)

    // Develop bonus: lowest tile should have quantity decremented
    const matAfter = updatedPlayer.industryTilesOnMat
    const cottonTileAfter = (matAfter.cotton || [])[0]
    expect(cottonTileAfter).toBeDefined()
    expect(cottonTileAfter!.quantityAvailable).toBe(qtyBefore - 1)
  })

  test('sell action - requires connectivity to a merchant that buys the industry', () => {
    const { actor } = setupGame()
    // Place cotton at Birmingham which is not connected to any merchant in simplified graph
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'birmingham',
          type: 'cotton',
          level: 1,
          flipped: false,
          tile: {
            id: 'cotton_bham_1',
            type: 'cotton',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 2,
            victoryPoints: 3,
            beerRequired: 1,
            cost: 10,
            incomeSpaces: 1,
            linkScoringIcons: 1,
            coalRequired: 1,
            ironRequired: 0,
            beerProduced: 0,
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 3,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
      money: 20,
      income: 10,
    })

    let snapshot = actor.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialDiscard = snapshot.context.discardPile.length

    actor.send({ type: 'SELL' })
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    const cotton = snapshot.context.players[0]!.industries.find(
      (i) => i.type === 'cotton',
    )!
    // Should not have flipped due to missing connectivity
    expect(cotton.flipped).toBe(false)
    // Money unchanged and discard not increased
    expect(snapshot.context.players[0]!.money).toBe(initialMoney)
    expect(snapshot.context.discardPile.length).toBe(initialDiscard)
    // Logs should include an error about cannot sell
    expect(
      snapshot.context.logs.some(
        (l) => l.type === 'error' && l.message.includes('Cannot sell'),
      ),
    ).toBe(true)
  })
})
