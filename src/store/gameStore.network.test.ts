// Network Actions Tests - Link building and network mechanics
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
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

const buildNetworkAction = (
  actor: ReturnType<typeof createActor>,
  from = 'birmingham',
  to = 'coventry',
) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  const cardToUse = currentPlayer.hand[0] // Use any card for network

  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToUse?.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })

  return { cardUsed: cardToUse, from, to }
}

describe('Game Store - Network Actions', () => {
  test('basic link building - canal era', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = initialPlayer.money

    const { cardUsed, from, to } = buildNetworkAction(
      actor,
      'birmingham',
      'coventry',
    )
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!
    const builtLink = updatedPlayer.links.find(
      (link) =>
        (link.from === from && link.to === to) ||
        (link.from === to && link.to === from),
    )

    expect(builtLink).toBeDefined()
    expect(builtLink!.type).toBe('canal')
    expect(updatedPlayer.money).toBeLessThan(initialMoney) // Link costs money
    expect(snapshot.context.discardPile).toContainEqual(cardUsed)
  })

  test('rail era - coal consumption for links', () => {
    const { actor } = setupGame()

    // Advance to rail era by ending canal era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Add coal source for rail link building
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      industries: [
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
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
          coalCubesOnTile: 2, // Provide coal for building
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    })

    const initialCoalMarket = [...snapshot.context.coalMarket]

    const { from, to } = buildNetworkAction(
      actor,
      'birmingham',
      'wolverhampton',
    )
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!
    const builtLink = updatedPlayer.links.find(
      (link) =>
        (link.from === from && link.to === to) ||
        (link.from === to && link.to === from),
    )

    expect(builtLink).toBeDefined()
    expect(builtLink!.type).toBe('rail')

    // Coal should be consumed for rail links from connected mine
    const coalMine = snapshot.context.players[currentPlayerId]!.industries.find((i) => i.type === 'coal')
    expect(coalMine).toBeDefined()
    expect(coalMine!.coalCubesOnTile).toBeLessThan(2) // Should have consumed at least 1 coal
  })

  test('network adjacency requirement', () => {
    const { actor } = setupGame()

    // First build a link to establish network
    buildNetworkAction(actor, 'birmingham', 'coventry')

    // Pass to next player's turn
    let snapshot = actor.getSnapshot()
    if (snapshot.context.actionsRemaining > 0) {
      actor.send({ type: 'PASS' })
      actor.send({
        type: 'SELECT_CARD',
        cardId: snapshot.context.players[0]!.hand[0]!.id,
      })
      actor.send({ type: 'CONFIRM' })
    }

    // Now build adjacent link
    buildNetworkAction(actor, 'coventry', 'nuneaton')
    snapshot = actor.getSnapshot()

    const player =
      snapshot.context.players[
        snapshot.context.currentPlayerIndex === 0 ? 0 : 1
      ]!
    const links = player.links

    // Should have built second link connected to first
    expect(links.length).toBe(1)
    const link = links[0]!
    expect(
      (link.from === 'coventry' && link.to === 'nuneaton') ||
        (link.from === 'nuneaton' && link.to === 'coventry'),
    ).toBe(true)
  })

  test('double rail link building - complete TDD implementation', () => {
    const { actor } = setupGame()

    // RULE: In Rail Era, can build 2 rail links for £15 + 1 beer + 2 coal
    // Advance to rail era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    // Set up player with brewery for beer source and sufficient money
    const currentPlayerId = snapshot.context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 50,
      industries: [
        {
          location: 'birmingham',
          type: 'brewery',
          level: 2,
          flipped: false,
          tile: {
            id: 'brewery_2',
            type: 'brewery',
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
            beerProduced: 1, // 1 beer in Canal, 2 in Rail
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 1,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 2, // 2 beer barrels in Rail Era
        },
        // Add coal mine for initial rail link building
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
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
          coalCubesOnTile: 3, // Enough coal for initial setup + test
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    })

    // Build initial network to establish connectivity
    buildNetworkAction(actor, 'birmingham', 'coventry')
    snapshot = actor.getSnapshot()

    // Record initial state
    const initialMoney = snapshot.context.players[currentPlayerId]!.money
    const initialCoalMarket = [...snapshot.context.coalMarket]
    const initialBeerBarrels = snapshot.context.players[currentPlayerId]!.industries.find((i) => i.type === 'brewery')!.beerBarrelsOnTile
    const initialLinksCount = snapshot.context.players[currentPlayerId]!.links.length
    const initialCoalCubes = snapshot.context.players[currentPlayerId]!.industries.find((i) => i.type === 'coal')!.coalCubesOnTile

    // Start network action for double link building
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: { networking: 'selectingCard' } } })).toBe(true)

    // Select card for network action
    const card = snapshot.context.players[currentPlayerId]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: { networking: 'selectingLink' } } })).toBe(true)

    // Select first link (adjacent to existing network)
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: { networking: 'confirmingLink' } } })).toBe(true)

    // Choose to build double link (Rail Era only)
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: { networking: 'selectingSecondLink' } } })).toBe(true)

    // Select second link (can be anywhere in network, doesn't need to be adjacent to first link)
    actor.send({ type: 'SELECT_SECOND_LINK', from: 'birmingham', to: 'wolverhampton' })
    snapshot = actor.getSnapshot()
    console.log('State after SELECT_SECOND_LINK:', snapshot.value)
    console.log('selectedSecondLink:', snapshot.context.selectedSecondLink)
    expect(snapshot.matches({ playing: { action: { networking: 'confirmingDoubleLink' } } })).toBe(true)

    // Execute double network action
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    snapshot = actor.getSnapshot()

    // Verify action completed successfully
    expect(snapshot.matches({ playing: { action: 'selectingAction' } }) || 
           snapshot.context.currentPlayerIndex !== currentPlayerId).toBe(true)

    // Verify 2 rail links were built
    const finalLinksCount = snapshot.context.players[currentPlayerId]!.links.length
    expect(finalLinksCount).toBe(initialLinksCount + 2)

    // Verify correct link types and connections
    const newLinks = snapshot.context.players[currentPlayerId]!.links.slice(initialLinksCount)
    expect(newLinks).toHaveLength(2)
    expect(newLinks.every(link => link.type === 'rail')).toBe(true)

    // Verify first link: coventry <-> nuneaton
    const firstLink = newLinks.find(link => 
      (link.from === 'coventry' && link.to === 'nuneaton') ||
      (link.from === 'nuneaton' && link.to === 'coventry')
    )
    expect(firstLink).toBeDefined()

    // Verify second link: birmingham <-> wolverhampton
    const secondLink = newLinks.find(link => 
      (link.from === 'birmingham' && link.to === 'wolverhampton') ||
      (link.from === 'wolverhampton' && link.to === 'birmingham')
    )
    expect(secondLink).toBeDefined()

    // Verify cost: £15 for double rail links per RULES
    const moneySpent = initialMoney - snapshot.context.players[currentPlayerId]!.money
    expect(moneySpent).toBeGreaterThanOrEqual(15) // £15 + coal costs

    // Verify beer consumption: 1 beer consumed per RULES
    const finalBeerBarrels = snapshot.context.players[currentPlayerId]!.industries.find((i) => i.type === 'brewery')!.beerBarrelsOnTile
    expect(finalBeerBarrels).toBe(initialBeerBarrels - 1)

    // Verify coal consumption: 2 coal (1 per link) per RULES from connected mine
    const coalMine = snapshot.context.players[currentPlayerId]!.industries.find((i) => i.type === 'coal')
    expect(coalMine).toBeDefined()
    const coalConsumed = initialCoalCubes - coalMine!.coalCubesOnTile
    expect(coalConsumed).toBe(2)

    // Verify card was discarded
    expect(snapshot.context.discardPile).toContainEqual(card)
  })

  test('single rail link building - cost £5 + 1 coal', () => {
    const { actor } = setupGame()

    // RULE: Single rail link costs £5 + 1 coal (no beer required)
    // Advance to rail era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    // Set up player with sufficient money and coal mine for coal access
    const currentPlayerId = snapshot.context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 20,
      industries: [
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
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
          coalCubesOnTile: 3, // Enough coal for initial setup + test (was 2)
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }
      ],
    })

    // Build initial network to establish connectivity
    buildNetworkAction(actor, 'birmingham', 'coventry')
    snapshot = actor.getSnapshot()

    // Record initial state
    const initialMoney = snapshot.context.players[currentPlayerId]!.money
    const initialCoalMarket = [...snapshot.context.coalMarket]
    const initialLinksCount = snapshot.context.players[currentPlayerId]!.links.length

    // Start network action for single link building
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()

    // Select card for network action
    const card = snapshot.context.players[currentPlayerId]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })

    // Select single link (adjacent to existing network)
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })

    // Confirm single link (not choosing double link option)
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()

    // Verify 1 rail link was built
    const finalLinksCount = snapshot.context.players[currentPlayerId]!.links.length
    expect(finalLinksCount).toBe(initialLinksCount + 1)

    // Verify correct link type and connection
    const newLinks = snapshot.context.players[currentPlayerId]!.links.slice(initialLinksCount)
    expect(newLinks).toHaveLength(1)
    expect(newLinks[0]!.type).toBe('rail')

    // Verify cost: £5 for single rail link per RULES (coal from connected mine is free)
    const moneySpent = initialMoney - snapshot.context.players[currentPlayerId]!.money
    expect(moneySpent).toBe(5) // Only £5 link cost, no coal cost from connected mine

    // Verify coal consumption: 1 coal per RULES (should come from connected coal mine, not market)
    const coalMineAfter = snapshot.context.players[currentPlayerId]!.industries.find(i => i.type === 'coal')
    expect(coalMineAfter).toBeDefined()
    expect(coalMineAfter!.coalCubesOnTile).toBe(1) // Started with 3, first link consumed 1, second link consumed 1, leaving 1

    // Verify no coal consumed from market (since we have connected mine)
    const coalMarketConsumed = initialCoalMarket.reduce(
      (sum, level, i) => sum + (level.cubes - snapshot.context.coalMarket[i]!.cubes),
      0,
    )
    expect(coalMarketConsumed).toBe(0)

    // Verify no beer consumption for single link
    expect(snapshot.context.players[currentPlayerId]!.industries.filter(i => i.type === 'brewery')).toHaveLength(0)

    // Verify card was discarded
    expect(snapshot.context.discardPile).toContainEqual(card)
  })

  test('network validation - requires valid connections', () => {
    const { actor } = setupGame()

    // Try to build network
    actor.send({ type: 'NETWORK' })
    let snapshot = actor.getSnapshot()

    // Should be in network building state
    expect(snapshot.matches({ playing: { action: 'networking' } })).toBe(true)

    // Select card
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })

    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'networking' } })).toBe(true)
  })

  test('network costs vary by era', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    // Canal era link cost should be £3
    const canalMoney = snapshot.context.players[0]!.money
    buildNetworkAction(actor, 'birmingham', 'coventry')
    snapshot = actor.getSnapshot()
    const canalCost = canalMoney - snapshot.context.players[0]!.money

    // Complete turn to get to next round
    if (snapshot.context.actionsRemaining > 0) {
      actor.send({ type: 'PASS' })
      actor.send({
        type: 'SELECT_CARD',
        cardId: snapshot.context.players[0]!.hand[0]!.id,
      })
      actor.send({ type: 'CONFIRM' })
    }

    // Pass player 2's turn
    actor.send({ type: 'PASS' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[1]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    // Should be in round 2 now with 2 actions per player
    snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBeGreaterThanOrEqual(2)

    // Canal links should cost £3 per RULES
    expect(canalCost).toBe(3)
  })

  test('double rail sequence - correct build order and resource consumption', () => {
    const { actor } = setupGame()

    // RULE TEST: Validate the exact sequence - build first rail, consume first coal, 
    // build second rail, consume second coal, consume beer from second rail connection
    
    // Advance to Rail Era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    const currentPlayerId = snapshot.context.currentPlayerIndex
    
    // Set up complex scenario with multiple coal sources and beer sources
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 100,
      industries: [
        // Own brewery at Birmingham (should be usable for beer)
        {
          location: 'birmingham',
          type: 'brewery',
          level: 2,
          flipped: false,
          tile: {
            id: 'brewery_2',
            type: 'brewery',
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
          beerBarrelsOnTile: 2, // 2 beer available
        },
        // Add coal mine at birmingham for initial rail link building
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1_birmingham',
            type: 'coal',
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
          coalCubesOnTile: 1, // 1 coal for initial setup
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        // Coal mine at Coventry (should be closest to first link)
        {
          location: 'coventry',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
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
          coalCubesOnTile: 2, // 2 coal available
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }
      ],
    })

    // Set up opponent with brewery at wolverhampton (should be usable if connected to second rail)
    const opponentId = currentPlayerId === 0 ? 1 : 0
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentId,
      industries: [
        {
          location: 'wolverhampton',
          type: 'brewery',
          level: 1,
          flipped: false,
          tile: {
            id: 'brewery_1_opponent',
            type: 'brewery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 4,
            victoryPoints: 2,
            cost: 5,
            incomeSpaces: 4,
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
          beerBarrelsOnTile: 1, // 1 beer available from opponent
        }
      ],
    })

    // Establish network - build initial link to start network
    buildNetworkAction(actor, 'birmingham', 'coventry')
    snapshot = actor.getSnapshot()

    // Record initial state for tracking changes
    const initialMoney = snapshot.context.players[currentPlayerId]!.money
    const initialCoalMarket = [...snapshot.context.coalMarket]
    
    // Track coal cubes before action
    const coventryCoalBefore = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'coventry' && i.type === 'coal')?.coalCubesOnTile || 0
    const birminghamBeerBefore = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'birmingham' && i.type === 'brewery')?.beerBarrelsOnTile || 0

    // Start double rail link action
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    
    const card = snapshot.context.players[currentPlayerId]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    
    // Select first link: coventry <-> nuneaton
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    
    // Select second link: birmingham <-> wolverhampton (should connect to opponent's brewery)
    actor.send({ type: 'SELECT_SECOND_LINK', from: 'birmingham', to: 'wolverhampton' })
    
    // Execute the double network action
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    snapshot = actor.getSnapshot()

    // VERIFY SEQUENCE RESULTS:

    // 1. Both rail links should be built
    const finalLinks = snapshot.context.players[currentPlayerId]!.links
    const newLinks = finalLinks.slice(-2) // Get the 2 newest links
    expect(newLinks).toHaveLength(2)
    expect(newLinks.every(link => link.type === 'rail')).toBe(true)

    // 2. First coal should have been consumed from Coventry coal mine (closest to first link)
    const coventryCoalAfter = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'coventry' && i.type === 'coal')?.coalCubesOnTile || 0
    expect(coventryCoalAfter).toBeLessThan(coventryCoalBefore) // Coal was consumed from mine

    // 3. Second coal consumption (should be from closest source to second link after first is built)
    const totalCoalConsumed = initialCoalMarket.reduce(
      (sum, level, i) => sum + (level.cubes - snapshot.context.coalMarket[i]!.cubes),
      0,
    ) + (coventryCoalBefore - coventryCoalAfter)
    expect(totalCoalConsumed).toBe(2) // Exactly 2 coal consumed

    // 4. Beer should be consumed (preference: own brewery, then connected opponent brewery)
    const birminghamBeerAfter = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'birmingham' && i.type === 'brewery')?.beerBarrelsOnTile || 0
    expect(birminghamBeerAfter).toBe(birminghamBeerBefore - 1) // Own brewery beer consumed

    // 5. Total cost should be £15 + coal costs
    const totalSpent = initialMoney - snapshot.context.players[currentPlayerId]!.money
    expect(totalSpent).toBeGreaterThanOrEqual(15) // At least £15 for the links plus coal costs

    // 6. Card should be discarded
    expect(snapshot.context.discardPile).toContainEqual(card)
  })

  test('double rail beer consumption - opponent brewery must be connected to second rail', () => {
    const { actor } = setupGame()

    // RULE TEST: Opponent breweries can only be used if connected to the second rail endpoint
    
    // Advance to Rail Era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    
    const currentPlayerId = snapshot.context.currentPlayerIndex
    const opponentId = currentPlayerId === 0 ? 1 : 0

    // Set up scenario: current player has NO own breweries but needs coal for rail link building
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 100,
      industries: [
        // Add coal mine for initial rail link building
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
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
          coalCubesOnTile: 3, // Enough coal for initial setup + test
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ], // No breweries, but has coal
    })

    // Set up opponent with brewery NOT connected to any planned rail endpoints
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentId,
      industries: [
        {
          location: 'stoke', // Not connected to planned rail links
          type: 'brewery',
          level: 1,
          flipped: false,
          tile: {
            id: 'brewery_1_opponent',
            type: 'brewery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 4,
            victoryPoints: 2,
            cost: 5,
            incomeSpaces: 4,
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
          beerBarrelsOnTile: 1,
        }
      ],
    })

    // Establish minimal network
    buildNetworkAction(actor, 'birmingham', 'coventry')

    // Try to build double rail that cannot access beer
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    const card = snapshot.context.players[currentPlayerId]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    
    snapshot = actor.getSnapshot()
    console.log('After card selection:', snapshot.value)
    
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    snapshot = actor.getSnapshot()
    console.log('After first link selection:', snapshot.value)
    
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    snapshot = actor.getSnapshot()
    console.log('After choosing double link:', snapshot.value)
    
    // Second rail to wolverhampton (opponent brewery at stoke is NOT connected)
    actor.send({ type: 'SELECT_SECOND_LINK', from: 'birmingham', to: 'wolverhampton' })
    snapshot = actor.getSnapshot()
    console.log('After second link selection:', snapshot.value)

    // This should fail because no brewery is reachable from second rail
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    
    // The action should fail and the state machine should remain in a state indicating failure
    // Since the error is thrown in the XState action, we check if the action actually succeeded
    snapshot = actor.getSnapshot()
    
    // Verify that the double rail action did NOT succeed
    // The state should not have advanced past the networking state if the action failed
    const linksAfterAttempt = snapshot.context.players[currentPlayerId]!.links.length
    
    // Since the action should have failed, no new links should be built
    // (The initial network has 1 link, double rail should add 2 more if successful)
    expect(linksAfterAttempt).toBe(1) // Only the initial birmingham-coventry link
  })

  test('double rail coal consumption - different closest coal after network changes', () => {
    const { actor } = setupGame()

    // RULE TEST: Second coal consumption considers the network state AFTER first rail is built
    
    // Advance to Rail Era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    
    const currentPlayerId = actor.getSnapshot().context.currentPlayerIndex

    // Set up complex coal scenario
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 100,
      industries: [
        // Own brewery for beer
        {
          location: 'birmingham',
          type: 'brewery',
          level: 1,
          flipped: false,
          tile: {
            id: 'brewery_1',
            type: 'brewery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 4,
            victoryPoints: 2,
            cost: 5,
            incomeSpaces: 4,
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
          beerBarrelsOnTile: 1,
        },
        // Add coal mine at birmingham for initial rail link building
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1_birmingham',
            type: 'coal',
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
          coalCubesOnTile: 1, // 1 coal for initial setup
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        // Coal mine at coventry (initially closest to first link)
        {
          location: 'coventry',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1_coventry',
            type: 'coal',
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
          coalCubesOnTile: 1,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        // Coal mine at wolverhampton (becomes closest to second link after it's built)
        {
          location: 'wolverhampton',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1_wolverhampton',
            type: 'coal',
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
          coalCubesOnTile: 1,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }
      ],
    })

    // Establish initial network
    buildNetworkAction(actor, 'birmingham', 'coventry')
    let snapshot = actor.getSnapshot()

    // Track coal before action
    const coventryCoalBefore = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'coventry')?.coalCubesOnTile || 0
    const wolverhamptonCoalBefore = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'wolverhampton')?.coalCubesOnTile || 0

    // Build double rail: coventry->nuneaton, birmingham->wolverhampton
    actor.send({ type: 'NETWORK' })
    const card = snapshot.context.players[currentPlayerId]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: card.id })
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    actor.send({ type: 'SELECT_SECOND_LINK', from: 'birmingham', to: 'wolverhampton' })
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    
    snapshot = actor.getSnapshot()

    // Verify different coal mines were used
    const coventryCoalAfter = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'coventry')?.coalCubesOnTile || 0
    const wolverhamptonCoalAfter = snapshot.context.players[currentPlayerId]!.industries
      .find(i => i.location === 'wolverhampton')?.coalCubesOnTile || 0

    // First coal should come from coventry (closest to first link)
    expect(coventryCoalAfter).toBe(coventryCoalBefore - 1)
    
    // Second coal should come from wolverhampton (closest to second link after it's built)
    expect(wolverhamptonCoalAfter).toBe(wolverhamptonCoalBefore - 1)

    // Total coal consumed should be exactly 2
    const totalCoalConsumed = (coventryCoalBefore - coventryCoalAfter) + 
                              (wolverhamptonCoalBefore - wolverhamptonCoalAfter)
    expect(totalCoalConsumed).toBe(2)
  })

  test('rail era scenario - no coal available, coal market connection required', () => {
    const { actor } = setupGame()

    // RULE TEST: Rail Era - market fallback price requires connection to merchants
    // This test verifies that the £8 fallback is only available when connected to markets

    // Advance to Rail Era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up scenario: player with no coal mines, trying to build from a location
    // that is NOT connected to any merchant markets
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 100,
      industries: [], // No coal mines - clean slate
    })

    // For this test, we simulate the scenario where the regular coal market (£1-7) is exhausted
    // but the player is not connected to any merchants, so cannot use the £8 fallback
    
    // The key insight: If the player builds from a non-merchant location and the market is empty,
    // they cannot access the fallback price, so coal consumption should fail
    
    // However, in the current setup, there's still coal in the market, so the action will succeed.
    // This test validates that the coal consumption logic correctly handles the scenario where:
    // 1. No connected coal mines
    // 2. Market has coal available OR player is connected to merchants for fallback

    // Try to build a rail link from birmingham to coventry
    // Birmingham is NOT a merchant location, so this should fail due to no coal access
    try {
      buildNetworkAction(actor, 'birmingham', 'coventry')
      
      // If we get here, the action succeeded when it should have failed
      snapshot = actor.getSnapshot()
      const links = snapshot.context.players[currentPlayerId]!.links
      
      // This should fail, so force test failure with diagnostic info
      console.log('Links built:', links)
      expect(links.length).toBe(0) // Should have failed to build
      
    } catch (error) {
      // This is expected - rail link should fail without merchant connection
      expect(error).toBeDefined()
    }
    
    // Verify no links were built due to lack of merchant connection for coal
    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[currentPlayerId]!.links.length).toBe(0)
    
    // This validates that coal market access now requires merchant connection:
    // - No connected coal mines available
    // - No connection to merchants (warrington, gloucester, oxford, nottingham, shrewsbury)
    // - Therefore, no coal can be purchased and rail link fails
  })
})
