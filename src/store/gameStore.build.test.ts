// Build Actions Tests - Industry building and basic build mechanics  
import { describe, expect, test, afterEach } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach(actor => {
    try { actor.stop() } catch {}
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  
  const players = [
    { id: '1', name: 'Player 1', color: 'red' as const, character: 'Richard Arkwright' as const },
    { id: '2', name: 'Player 2', color: 'blue' as const, character: 'Eliza Tinsley' as const }
  ]
  
  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const buildIndustryAction = (actor: ReturnType<typeof createActor>, industryType: string = 'coal', location: string = 'birmingham') => {
  // Set player to have suitable card and money
  actor.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
    hand: [{
      id: `${industryType}_test`,
      type: 'industry',
      industries: [industryType],
    }],
  })
  
  actor.send({
    type: 'TEST_SET_PLAYER_STATE', 
    playerId: 0,
    money: 50 // Ensure enough money
  })

  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId: `${industryType}_test` })
  actor.send({ type: 'SELECT_LOCATION', cityId: location })
  actor.send({ type: 'CONFIRM' })

  return { industryCard: { id: `${industryType}_test`, type: 'industry', industries: [industryType] } }
}

describe('Game Store - Build Actions', () => {
  test('build industry - basic mechanics', () => {
    const { actor } = setupGame()
    
    const { industryCard } = buildIndustryAction(actor, 'coal')
    const snapshot = actor.getSnapshot()
    
    const updatedPlayer = snapshot.context.players[0]!
    const builtIndustry = updatedPlayer.industries[0]
    
    expect(builtIndustry).toBeDefined()
    expect(builtIndustry!.type).toBe('coal')
    expect(builtIndustry!.location).toBe('birmingham')
    expect(snapshot.context.discardPile.length).toBe(1)
    expect(snapshot.context.discardPile[0]!.id).toBe('coal_test')
  })

  test('build industry - player state updates', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    
    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = 50 // Set by buildIndustryAction
    
    buildIndustryAction(actor, 'coal')
    snapshot = actor.getSnapshot()
    
    const updatedPlayer = snapshot.context.players[0]!
    
    // Money should be deducted (coal mine costs money)
    expect(updatedPlayer.money).toBeLessThan(initialMoney)
    // Should have built industry
    expect(updatedPlayer.industries.length).toBe(1)
    // Actions should be decremented 
    expect(snapshot.context.actionsRemaining).toBeLessThanOrEqual(1)
  })

  test('build industry - different industry types', () => {
    // Test each industry type in separate games to avoid turn complexity
    const industryTypes = ['coal', 'iron', 'cotton', 'brewery']
    
    industryTypes.forEach(industryType => {
      const { actor } = setupGame()
      
      buildIndustryAction(actor, industryType, 'birmingham')
      const snapshot = actor.getSnapshot()
      
      const builtIndustry = snapshot.context.players[0]!.industries[0]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(industryType)
      
      actor.stop()
    })
  })

  test('build validation - requires card and location', () => {
    const { actor } = setupGame()
    
    // Try to build without proper setup
    actor.send({ type: 'BUILD' })
    let snapshot = actor.getSnapshot()
    
    // Should be in building action
    expect(snapshot.matches({ playing: { action: 'building' } })).toBe(true)
    
    // Select card 
    actor.send({ type: 'SELECT_CARD', cardId: actor.getSnapshot().context.players[0]!.hand[0]!.id })
    snapshot = actor.getSnapshot()
    
    // Should still be in building flow (industry type selection or location selection)
    expect(snapshot.matches({ playing: { action: 'building' } })).toBe(true)
  })

  test('automatic market selling - coal mine connected to merchant', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    
    const initialCoalMarket = [...snapshot.context.coalMarket]
    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = 50
    
    // Build coal mine at Stoke (should be connected to merchant)
    buildIndustryAction(actor, 'coal', 'stoke')
    snapshot = actor.getSnapshot()
    
    const playerAfterBuild = snapshot.context.players[0]!
    const coalMine = playerAfterBuild.industries.find(i => i.type === 'coal')!
    
    // Coal should be added to market (automatic selling)
    const totalMarketIncrease = snapshot.context.coalMarket.reduce(
      (sum, level, i) => sum + (level.cubes - initialCoalMarket[i]!.cubes),
      0
    )
    expect(totalMarketIncrease).toBeGreaterThan(0)
    
    // Player should earn money from sales
    expect(playerAfterBuild.money).toBeGreaterThan(initialMoney - coalMine.tile.cost)
  })
})