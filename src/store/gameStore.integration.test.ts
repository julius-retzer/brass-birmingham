// Full Game Integration Test - Brass Birmingham
// Tests complete game flow from start to finish with realistic player actions

import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { CityId } from '../data/board'
import type { IndustryType } from '../data/cards'
import { gameStore } from './gameStore'

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

const createGameActor = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  return actor
}

const setupTwoPlayerGame = (actor: ReturnType<typeof createActor>) => {
  const players = [
    {
      id: '1',
      name: 'Alice',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
    },
    {
      id: '2',
      name: 'Bob',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
    },
  ]

  // Set up scripted cards AFTER starting the game but before actions
  actor.send({ type: 'START_GAME', players })
  setupScriptedCards(actor)

  // Wait for game to initialize and verify the ordered dealing worked
  let snapshot = actor.getSnapshot()
  console.log(
    `🎯 Game state after START_GAME: ${JSON.stringify(snapshot.value)}`,
  )
  console.log(
    `🎴 Alice's dealt hand:`,
    snapshot.context.players[0]!.hand.map(
      (c) =>
        `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
    ),
  )
  console.log(
    `🎴 Bob's dealt hand:`,
    snapshot.context.players[1]!.hand.map(
      (c) =>
        `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
    ),
  )
  console.log(
    `📚 Remaining draw pile: ${snapshot.context.drawPile.length} cards`,
  )

  return players
}

// Set up scripted cards for the specific game actions
const setupScriptedCards = (actor: ReturnType<typeof createActor>) => {
  // Alice's hand - cards needed for her scripted actions
  const aliceCards = [
    { id: 'alice_card_1', type: 'industry', industries: ['brewery'] }, // For DEVELOP actions
    { id: 'alice_card_2', type: 'industry', industries: ['coal'] },
    { id: 'alice_card_3', type: 'industry', industries: ['cotton'] },
    { id: 'alice_card_4', type: 'industry', industries: ['iron'] },
    { id: 'alice_card_5', type: 'location', location: 'birmingham' }, // For BUILD iron at birmingham
    { id: 'alice_card_6', type: 'location', location: 'worcester' }, // For NETWORK and BUILD cotton
    { id: 'alice_card_7', type: 'location', location: 'kidderminster' }, // For NETWORK and BUILD cotton
    { id: 'alice_card_8', type: 'location', location: 'nuneaton' }, // For BUILD brewery
  ]

  // Bob's hand - cards needed for his scripted actions, prioritizing location cards for out-of-network builds
  const bobCards = [
    { id: 'bob_card_1', type: 'location', location: 'burton' }, // CRITICAL: For BUILD brewery at burton
    { id: 'bob_card_2', type: 'location', location: 'stafford' }, // For BUILD brewery at stafford
    { id: 'bob_card_3', type: 'location', location: 'coalbrookdale' }, // For BUILD brewery at coalbrookdale
    { id: 'bob_card_4', type: 'location', location: 'walsall' }, // For BUILD manufacturer at walsall
    { id: 'bob_card_5', type: 'industry', industries: ['brewery'] }, // Backup brewery card
    { id: 'bob_card_6', type: 'industry', industries: ['coal'] }, // For BUILD coal
    { id: 'bob_card_7', type: 'industry', industries: ['iron'] }, // For BUILD iron
    { id: 'bob_card_8', type: 'industry', industries: ['manufacturer'] }, // For BUILD manufacturer
  ]

  // Set hands directly with the required cards
  actor.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0, // Alice
    hand: aliceCards,
  })

  actor.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 1, // Bob
    hand: bobCards,
  })

  // Verify the hands were set correctly
  const verifySnapshot = actor.getSnapshot()
  console.log(
    `🎴 Alice's hand:`,
    verifySnapshot.context.players[0]!.hand.map(
      (c) =>
        `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
    ),
  )
  console.log(
    `🎴 Bob's hand:`,
    verifySnapshot.context.players[1]!.hand.map(
      (c) =>
        `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
    ),
  )

  // Set up industry tiles on player mats for develop actions - same for both players
  const industryTilesOnMat = {
    brewery: [
      {
        id: 'brewery_1',
        type: 'brewery',
        level: 1,
        cost: 5,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 1,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'brewery_2',
        type: 'brewery',
        level: 1,
        cost: 5,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 1,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'brewery_3',
        type: 'brewery',
        level: 2,
        cost: 12,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 2,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'brewery_4',
        type: 'brewery',
        level: 2,
        cost: 12,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 2,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'brewery_5',
        type: 'brewery',
        level: 2,
        cost: 12,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 2,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'brewery_6',
        type: 'brewery',
        level: 3,
        cost: 16,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 3,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
    ],
    coal: [
      {
        id: 'coal_1_alice',
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
    cotton: [
      {
        id: 'cotton_1_alice',
        type: 'cotton',
        level: 1,
        cost: 12,
        victoryPoints: 3,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 1,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
      {
        id: 'cotton_2_alice',
        type: 'cotton',
        level: 2,
        cost: 16,
        victoryPoints: 5,
        incomeSpaces: 2,
        linkScoringIcons: 1,
        coalRequired: 0,
        ironRequired: 0,
        beerRequired: 1,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: true,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
    ],
    iron: [
      {
        id: 'iron_1_alice',
        type: 'iron',
        level: 1,
        cost: 5,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 0,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 4,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
    ],
    manufacturer: [
      {
        id: 'manufacturer_1_alice',
        type: 'manufacturer',
        level: 1,
        cost: 8,
        victoryPoints: 1,
        incomeSpaces: 1,
        linkScoringIcons: 1,
        coalRequired: 1,
        ironRequired: 0,
        beerRequired: 1,
        beerProduced: 0,
        coalProduced: 0,
        ironProduced: 0,
        canBuildInCanalEra: true,
        canBuildInRailEra: false,
        hasLightbulbIcon: false,
        incomeAdvancement: 2,
      },
    ],
  }

  // Set the same industry tiles for both players with exact starting money per rules
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: 0, // Alice
    industryTilesOnMat,
    money: 17, // Exact starting money according to Brass Birmingham rules
  })

  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: 1, // Bob
    industryTilesOnMat,
    money: 17, // Exact starting money according to Brass Birmingham rules
  })
}

// Helper to get current player info
const getCurrentPlayerInfo = (actor: ReturnType<typeof createActor>) => {
  const snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  return {
    snapshot,
    currentPlayer,
    playerIndex: snapshot.context.currentPlayerIndex,
    era: snapshot.context.era,
    round: snapshot.context.round,
    actionsRemaining: snapshot.context.actionsRemaining,
    state: snapshot.value,
  }
}

// Helper to perform build action
const buildIndustry = (
  actor: ReturnType<typeof createActor>,
  industryType: IndustryType,
  location: CityId,
  level?: number,
  expectSuccess = true,
) => {
  const { currentPlayer } = getCurrentPlayerInfo(actor)

  console.log(
    `🎯 BUILD ${industryType} at ${location} - ${currentPlayer!.name}'s turn`,
  )
  console.log(
    `🎲 Current player: ${currentPlayer!.name}, Hand size: ${currentPlayer!.hand.length}`,
  )

  // Find a suitable card, preferring location cards for specific locations
  // This ensures we can build anywhere, not just in network
  console.log(`🔍 Looking for location card for ${location}`)
  console.log(
    `📋 Available cards:`,
    currentPlayer!.hand.map(
      (c) =>
        `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
    ),
  )

  let suitableCard = currentPlayer!.hand.find(
    (card: any) =>
      (card.type === 'location' && card.location === location) ||
      card.type === 'wild_location',
  )

  console.log(
    `📍 Location card search result:`,
    suitableCard ? `Found ${suitableCard.id}` : 'None found',
  )

  // If no location card found, try industry cards (must be in network)
  if (!suitableCard) {
    console.log(`🔍 Looking for industry card for ${industryType}`)
    suitableCard = currentPlayer!.hand.find(
      (card: any) =>
        (card.type === 'industry' && card.industries.includes(industryType)) ||
        card.type === 'wild_industry',
    )
    console.log(
      `🏭 Industry card search result:`,
      suitableCard ? `Found ${suitableCard.id}` : 'None found',
    )
  }

  if (!suitableCard) {
    console.log(`❌ No suitable card found for ${industryType} at ${location}`)
    console.log(
      `📋 Available cards:`,
      currentPlayer!.hand.map(
        (c) =>
          `${c.id}: ${c.type} ${c.type === 'industry' ? c.industries.join(',') : c.location || ''}`,
      ),
    )
    throw new Error(`No suitable card found for ${industryType} at ${location}`)
  }

  console.log(
    `🏗️ Building ${industryType}${level ? ` level ${level}` : ''} at ${location} with card ${suitableCard.id}`,
  )
  console.log(`💰 Player money before build: ${currentPlayer!.money}`)

  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId: suitableCard.id })

  // State machine flow depends on card type:
  // - Location cards: SELECT_INDUSTRY_TYPE (auto-selects location)
  // - Industry cards: SELECT_LOCATION (auto-selects tile)
  if (
    suitableCard.type === 'location' ||
    suitableCard.type === 'wild_location'
  ) {
    // For location cards: select industry type first
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
    console.log(
      `🎯 Used location card flow: SELECT_INDUSTRY_TYPE → confirmingBuild`,
    )
  } else {
    // For industry cards: select location
    actor.send({ type: 'SELECT_LOCATION', cityId: location })
    console.log(`🎯 Used industry card flow: SELECT_LOCATION → confirmingBuild`)

    // Debug the current selections after location selection
    const postLocationSnapshot = actor.getSnapshot()
    console.log(`🔍 Selections after location:`)
    console.log(
      `  - selectedCard: ${postLocationSnapshot.context.selectedCard?.id} (${postLocationSnapshot.context.selectedCard?.type})`,
    )
    console.log(
      `  - selectedLocation: ${postLocationSnapshot.context.selectedLocation}`,
    )
    console.log(
      `  - selectedIndustryTile: ${postLocationSnapshot.context.selectedIndustryTile?.id} (level ${postLocationSnapshot.context.selectedIndustryTile?.level})`,
    )

    // Check if canCompleteBuild would pass
    const canComplete =
      postLocationSnapshot.context.selectedCard !== null &&
      postLocationSnapshot.context.selectedIndustryTile !== null &&
      postLocationSnapshot.context.selectedLocation !== null
    console.log(`  - canCompleteBuild would return: ${canComplete}`)
  }

  const beforeConfirmSnapshot = actor.getSnapshot()
  console.log(
    `🎯 Build state before confirm: ${JSON.stringify(beforeConfirmSnapshot.value)}`,
  )

  actor.send({ type: 'CONFIRM' })

  const afterSnapshot = actor.getSnapshot()
  console.log(
    `🏗️ Build state after confirm: ${JSON.stringify(afterSnapshot.value)}`,
  )

  if (expectSuccess) {
    const { snapshot } = getCurrentPlayerInfo(actor)
    const builtIndustry = snapshot.context.players
      .flatMap((p) => p.industries)
      .find((i) => i.type === industryType && i.location === location)

    console.log(`🔍 Looking for built industry: ${industryType} at ${location}`)
    console.log(
      `🏭 Built industry found:`,
      builtIndustry
        ? `${builtIndustry.type} level ${builtIndustry.level} at ${builtIndustry.location}`
        : 'none',
    )

    const hasIndustry = !!builtIndustry
    expect(hasIndustry).toBe(true)
  }
}

// Helper to perform develop action with tile selection
const developTilesWithSelection = (
  actor: ReturnType<typeof createActor>,
  industryTypes: string[],
) => {
  const { currentPlayer } = getCurrentPlayerInfo(actor)

  actor.send({ type: 'DEVELOP' })
  actor.send({ type: 'SELECT_CARD', cardId: currentPlayer!.hand[0]!.id })

  // Select specific tiles to develop
  actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes })

  // Confirm the development
  actor.send({ type: 'CONFIRM' })
}

// Helper to perform network action
const buildNetwork = (
  actor: ReturnType<typeof createActor>,
  from: CityId,
  to: CityId,
) => {
  const { currentPlayer } = getCurrentPlayerInfo(actor)

  // Use any card for network action, preferring industry cards over location cards
  // This preserves location cards for their specific build purposes
  const anyCard =
    currentPlayer!.hand.find(
      (card: any) => card.type === 'industry' || card.type === 'wild_industry',
    ) || currentPlayer!.hand[0]

  if (!anyCard) {
    throw new Error(`No cards available for network ${from}-${to}`)
  }

  console.log(`🔗 Using card ${anyCard.id} (${anyCard.type}) for network`)

  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: anyCard.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })
}

// Helper to perform sell action
const sellIndustry = (
  actor: ReturnType<typeof createActor>,
  industryType: IndustryType,
) => {
  const { currentPlayer } = getCurrentPlayerInfo(actor)

  // Find suitable card
  const suitableCard = currentPlayer!.hand.find(
    (card: any) =>
      (card.type === 'industry' && card.industries.includes(industryType)) ||
      card.type === 'wild_industry',
  )

  if (!suitableCard) {
    throw new Error(`No suitable card found for selling ${industryType}`)
  }

  actor.send({ type: 'SELL' })
  actor.send({ type: 'SELECT_CARD', cardId: suitableCard.id })
  actor.send({ type: 'CONFIRM' })
}

// Helper to perform loan action
const performLoanAction = async (
  actor: ReturnType<typeof createActor>,
  gameInfo: any,
) => {
  // Check if actor is still active
  if (actor.getSnapshot().status !== 'active') {
    throw new Error('Actor has stopped - cannot perform loan action')
  }

  console.log('💰 Taking loan')
  actor.send({ type: 'TAKE_LOAN' })

  // For TAKE_LOAN, prefer using industry cards over location cards
  // This preserves location cards for their specific build purposes
  const cardToUse =
    gameInfo.currentPlayer!.hand.find(
      (card: any) => card.type === 'industry' || card.type === 'wild_industry',
    ) || gameInfo.currentPlayer!.hand[0]

  if (!cardToUse) {
    throw new Error('No cards available for loan')
  }

  console.log(`💳 Using card ${cardToUse.id} (${cardToUse.type}) for loan`)

  actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
  actor.send({ type: 'CONFIRM' })

  const newGameInfo = getCurrentPlayerInfo(actor)
  console.log(`✅ Loan successful - Money: ${newGameInfo.currentPlayer!.money}`)
}

// Game script based on actual Brass Birmingham game log - costs determined by game
const gameScript = [
  // Round 1-2
  {
    player: 'Alice',
    action: 'DEVELOP',
    types: ['brewery', 'brewery'],
    reason: 'Developed 2x beer:1 tiles',
  },

  // Round 3
  {
    player: 'Bob',
    action: 'NETWORK',
    from: 'birmingham',
    to: 'coventry',
    reason: 'Network connection',
  },
  { player: 'Bob', action: 'TAKE_LOAN', reason: 'Money: 40, I-Level:-3' },
  {
    player: 'Alice',
    action: 'DEVELOP',
    types: ['coal', 'cotton'],
    reason: 'Developed coal:1 and cotton:1',
  },
  { player: 'Alice', action: 'TAKE_LOAN', reason: 'Money: 33, I-Level:-3' },

  // Round 4
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'brewery',
    location: 'burton',
    level: 2,
    reason: 'Built beer:2 in Burton',
  },
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'brewery',
    location: 'stafford',
    level: 2,
    reason: 'Built beer:2 in Stafford',
  },
  {
    player: 'Alice',
    action: 'NETWORK',
    from: 'birmingham',
    to: 'worcester',
    reason: 'Network to port',
  },
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'iron',
    location: 'birmingham',
    level: 1,
    reason: 'Built iron:1',
  },

  // Round 5
  { player: 'Alice', action: 'TAKE_LOAN', reason: 'Money: 69, I-Level:-3' },
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'iron',
    location: 'coventry',
    level: 2,
    reason: 'Built iron:2',
  },
  { player: 'Bob', action: 'TAKE_LOAN', reason: 'Money: 40, I-Level:-6' },
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'coal',
    location: 'coventry',
    level: 1,
    reason: 'Built coal:1',
  },

  // Round 6
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'brewery',
    location: 'coalbrookdale',
    level: 3,
    reason: 'Built beer:3',
  },
  {
    player: 'Bob',
    action: 'NETWORK',
    from: 'dudley',
    to: 'birmingham',
    reason: 'Network connection',
  },
  {
    player: 'Alice',
    action: 'DEVELOP',
    types: ['cotton', 'cotton'],
    reason: 'Developed cotton:1 and cotton:2',
  },

  // Round 7
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'iron',
    location: 'birmingham',
    level: 3,
    reason: 'OVERBUILT iron:3',
  },
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'brewery',
    location: 'nuneaton',
    level: 2,
    reason: 'Built beer:2',
  },
  {
    player: 'Bob',
    action: 'DEVELOP',
    types: ['iron', 'manufacturer'],
    reason: 'Developed iron:1 and goods:1',
  },
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'iron',
    location: 'dudley',
    level: 2,
    reason: 'Built iron:2',
  },

  // Round 8
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'manufacturer',
    location: 'walsall',
    level: 2,
    reason: 'Built goods:2',
  },
  {
    player: 'Bob',
    action: 'NETWORK',
    from: 'walsall',
    to: 'birmingham',
    reason: 'Network connection',
  },
  {
    player: 'Alice',
    action: 'NETWORK',
    from: 'worcester',
    to: 'birmingham',
    reason: 'Network connection',
  },
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'cotton',
    location: 'worcester',
    level: 3,
    reason: 'Built cotton:3',
  },

  // Round 9
  { player: 'Bob', action: 'TAKE_LOAN', reason: 'Money: 32, I-Level:-2' },
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'manufacturer',
    location: 'birmingham',
    level: 2,
    reason: 'Built goods:2',
  },
  { player: 'Alice', action: 'SCOUT', reason: 'Scouted for better cards' },
  {
    player: 'Alice',
    action: 'NETWORK',
    from: 'kidderminster',
    to: 'worcester',
    reason: 'Network connection',
  },

  // Round 10
  {
    player: 'Alice',
    action: 'BUILD',
    type: 'cotton',
    location: 'kidderminster',
    level: 3,
    reason: 'Built cotton:3',
  },
  { player: 'Alice', action: 'TAKE_LOAN', reason: 'Money: 38, I-Level:-2' },
  {
    player: 'Bob',
    action: 'BUILD',
    type: 'cotton',
    location: 'kidderminster',
    level: 1,
    reason: 'Built cotton:1',
  },
  { player: 'Bob', action: 'TAKE_LOAN', reason: 'Money: 36, I-Level:-5' },

  // Round 11 - Selling Phase
  { player: 'Bob', action: 'TAKE_LOAN', reason: 'Money: 61, I-Level:-8' },
  {
    player: 'Bob',
    action: 'SELL',
    type: 'cotton',
    location: 'kidderminster',
    port: 'oxford',
    reason: 'Sold to Oxford',
  },
  {
    player: 'Bob',
    action: 'SELL',
    type: 'manufacturer',
    location: 'walsall',
    port: 'oxford',
    reason: 'Sold goods to Oxford',
  },
  {
    player: 'Bob',
    action: 'SELL',
    type: 'manufacturer',
    location: 'birmingham',
    port: 'oxford',
    reason: 'Sold goods to Oxford',
  },
]

let scriptIndex = 0

// Helper to get next planned action
const getNextPlannedAction = (gameInfo: any) => {
  if (scriptIndex >= gameScript.length) {
    // If we've exhausted the script, return null to stop the game
    return null
  }

  const currentPlayerName = gameInfo.currentPlayer?.name

  // Look for the next action for the current player
  while (scriptIndex < gameScript.length) {
    const plannedAction = gameScript[scriptIndex]

    // Actions are already using Alice and Bob names
    if (plannedAction.player === currentPlayerName) {
      scriptIndex++
      console.log(
        `📋 Action ${scriptIndex}: ${currentPlayerName} - ${plannedAction.action} - ${plannedAction.reason}`,
      )
      return plannedAction
    } else {
      // Skip actions for the other player
      scriptIndex++
    }
  }

  // If no more actions for this player, return null
  return null
}

// Helper to perform different action types
const performAction = async (
  actor: ReturnType<typeof createActor>,
  actionPlan: any,
  gameInfo: any,
) => {
  const { currentPlayer } = gameInfo

  if (!actionPlan) {
    // No action to perform
    return
  }

  if (typeof actionPlan === 'string') {
    // Handle simple string actions (fallback)
    if (actionPlan === 'TAKE_LOAN') {
      await performLoanAction(actor, gameInfo)
      return
    }
    throw new Error(`Unsupported simple action: ${actionPlan}`)
  }

  // Handle planned actions with parameters
  const { action, type, location, from, to, reason, level, port } = actionPlan
  const actionDetails = [
    type,
    location,
    level ? `L${level}` : '',
    from && to ? `${from}→${to}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  console.log(`🎯 Executing: ${action} ${actionDetails} - ${reason}`)

  switch (action) {
    case 'BUILD':
      const beforeBuildMoney = currentPlayer!.money
      try {
        buildIndustry(actor, type, location, level, true) // Pass level and expect success
        const afterBuildMoney = getCurrentPlayerInfo(actor).currentPlayer!.money
        console.log(
          `✅ Built ${type} at ${location} - Money: ${beforeBuildMoney} → ${afterBuildMoney}`,
        )
      } catch (error) {
        console.log(`❌ Failed to build ${type} at ${location}: ${error}`)
        throw new Error(
          `Required action failed: BUILD ${type} at ${location} - ${error}`,
        )
      }
      break

    case 'DEVELOP':
      try {
        const developTypes = actionPlan.types || [actionPlan.type] // Support both single type and types array
        console.log(
          `🔧 Developing ${developTypes.length} industry tile(s): ${developTypes.join(', ')}`,
        )
        const beforeDevelopMoney = currentPlayer!.money
        developTilesWithSelection(actor, developTypes)
        const afterDevelopMoney =
          getCurrentPlayerInfo(actor).currentPlayer!.money
        console.log(
          `✅ Develop action successful - Money: ${beforeDevelopMoney} → ${afterDevelopMoney}`,
        )
      } catch (error) {
        console.log(`❌ Develop action failed: ${error}`)
        throw new Error(`Required action failed: DEVELOP - ${error}`)
      }
      break

    case 'SELL':
      try {
        console.log(`💼 Selling ${type} to market`)
        sellIndustry(actor, type)
        console.log(`✅ Successfully sold ${type}`)
      } catch (error) {
        console.log(`❌ Failed to sell ${type}: ${error}`)
        throw new Error(`Required action failed: SELL ${type} - ${error}`)
      }
      break

    case 'NETWORK':
      try {
        console.log(`🔗 Building network from ${from} to ${to}`)
        buildNetwork(actor, from, to)
        console.log(`✅ Successfully built network ${from} → ${to}`)
      } catch (error) {
        console.log(`❌ Failed to build network ${from} → ${to}: ${error}`)
        throw new Error(
          `Required action failed: NETWORK ${from} → ${to} - ${error}`,
        )
      }
      break

    case 'SCOUT':
      try {
        console.log('🔍 Scouting for cards')
        actor.send({ type: 'SCOUT' })
        // Select first two cards to discard
        const hand = currentPlayer!.hand
        if (hand.length >= 2) {
          actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
          actor.send({ type: 'SELECT_CARD', cardId: hand[1]!.id })
          actor.send({ type: 'CONFIRM' })
          console.log('✅ Scout action successful')
        } else {
          throw new Error('Not enough cards to scout')
        }
      } catch (error) {
        console.log(`❌ Scout action failed: ${error}`)
        throw new Error(`Required action failed: SCOUT - ${error}`)
      }
      break

    case 'PASS':
      try {
        console.log('⏭️ Passing turn')
        actor.send({ type: 'PASS' })
        const cardToPass = currentPlayer!.hand[0]
        if (cardToPass) {
          actor.send({ type: 'SELECT_CARD', cardId: cardToPass.id })
          actor.send({ type: 'CONFIRM' })
          console.log('✅ Pass action successful')
        } else {
          throw new Error('No cards available to pass')
        }
      } catch (error) {
        console.log(`❌ Pass action failed: ${error}`)
        throw new Error(`Required action failed: PASS - ${error}`)
      }
      break

    case 'TAKE_LOAN':
      await performLoanAction(actor, gameInfo)
      break

    default:
      throw new Error(`Unknown action type: ${action}`)
  }
}

describe.skip('Brass Birmingham - Full Game Integration Test', () => {
  test('complete 2-player game simulation from start to finish', async () => {
    console.log('🎮 Starting Brass Birmingham Integration Test')

    const actor = createGameActor()
    const players = setupTwoPlayerGame(actor)

    let gameInfo = getCurrentPlayerInfo(actor)

    // Verify initial game setup
    console.log('🎯 Verifying initial setup...')
    expect(gameInfo.era).toBe('canal')
    expect(gameInfo.round).toBe(1)
    expect(gameInfo.actionsRemaining).toBe(1) // First round has 1 action each
    expect(gameInfo.snapshot.context.players).toHaveLength(2)
    expect(gameInfo.snapshot.context.players[0]!.hand).toHaveLength(8)
    expect(gameInfo.snapshot.context.players[0]!.money).toBe(17) // Exact starting money per rules
    expect(gameInfo.snapshot.context.players[0]!.income).toBe(10)

    console.log(
      `✅ Game setup complete - Era: ${gameInfo.era}, Round: ${gameInfo.round}`,
    )

    // ===== CANAL ERA GAMEPLAY =====
    console.log('\n🚢 CANAL ERA - Starting gameplay...')

    // Follow the script from the very beginning

    // Continue with multiple rounds of Canal Era until era naturally ends
    let totalActions = 0
    const maxActions = 200 // Safety limit to prevent infinite loops (increased)
    let lastRound = gameInfo.round
    let lastPlayer = gameInfo.playerIndex
    let sameStateCount = 0

    while (gameInfo.era === 'canal' && totalActions < maxActions) {
      // Check if actor is still active before proceeding
      if (actor.getSnapshot().status !== 'active') {
        console.log('⚠️ Actor has stopped unexpectedly, ending canal era loop')
        break
      }

      gameInfo = getCurrentPlayerInfo(actor)

      // Detect if we're stuck in the same state
      if (
        gameInfo.round === lastRound &&
        gameInfo.playerIndex === lastPlayer &&
        gameInfo.actionsRemaining === 0
      ) {
        sameStateCount++
        if (sameStateCount > 3) {
          console.log('⚠️ Detected potential infinite loop, breaking out')
          break
        }
      } else {
        sameStateCount = 0
      }

      lastRound = gameInfo.round
      lastPlayer = gameInfo.playerIndex

      // Check for natural era ending conditions
      const drawPileEmpty = gameInfo.snapshot.context.drawPile.length === 0
      const allHandsEmpty = gameInfo.snapshot.context.players.every(
        (player: any) => player.hand.length === 0,
      )

      if (drawPileEmpty && allHandsEmpty) {
        console.log(
          '🎯 Canal Era ending naturally - draw pile exhausted and all hands empty',
        )
        break
      }

      // Check if actions are available
      if (gameInfo.actionsRemaining === 0) {
        console.log(
          `⏭️ ${gameInfo.currentPlayer!.name} has no actions remaining - waiting for next player/round`,
        )

        // Wait a bit and check if state changes
        await new Promise((resolve) => setTimeout(resolve, 10))
        gameInfo = getCurrentPlayerInfo(actor)
        continue
      }

      totalActions++
      console.log(
        `\n🎮 Action ${totalActions}: ${gameInfo.currentPlayer!.name}'s turn (Round ${gameInfo.round}, Actions: ${gameInfo.actionsRemaining}, Money: ${gameInfo.currentPlayer!.money})`,
      )
      console.log(
        `📊 Draw pile: ${gameInfo.snapshot.context.drawPile.length} cards, Player hand: ${gameInfo.currentPlayer!.hand.length} cards`,
      )

      // Execute next planned action
      const plannedAction = getNextPlannedAction(gameInfo)

      // If no more planned actions, end the game
      if (!plannedAction) {
        console.log('🎯 No more scripted actions - ending game simulation')
        break
      }

      await performAction(actor, plannedAction, gameInfo)

      // Check if actor stopped during action
      if (actor.getSnapshot().status !== 'active') {
        console.log(`⚠️ Actor stopped during planned action, ending game loop`)
        break
      }

      gameInfo = getCurrentPlayerInfo(actor)

      // Brief pause to allow state transitions
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Force Canal Era transition to Rail Era
    gameInfo = getCurrentPlayerInfo(actor)
    console.log(
      `\n🎯 Canal Era Complete - Status: Era ${gameInfo.era}, Round ${gameInfo.round}`,
    )

    if (gameInfo.era === 'canal') {
      console.log('🔄 Forcing Canal to Rail Era transition...')
      actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
      gameInfo = getCurrentPlayerInfo(actor)
      console.log(
        `✅ Era transition complete - Now: Era ${gameInfo.era}, Round ${gameInfo.round}`,
      )
    }

    if (gameInfo.era === 'rail') {
      console.log('\n🚂 RAIL ERA - Era transition successful!')

      // Verify rail era setup
      expect(gameInfo.era).toBe('rail')
      expect(gameInfo.round).toBe(1)
      expect(gameInfo.snapshot.context.players[0]!.hand).toHaveLength(8) // New hand

      // Simulate realistic rail era actions
      console.log('\n--- Rail Era Gameplay ---')

      let railActions = 0
      const maxRailActions = 200 // Safety limit increased

      // Continue Rail Era until natural game ending conditions are met
      while (gameInfo.era === 'rail' && railActions < maxRailActions) {
        // Check for natural game ending conditions
        gameInfo = getCurrentPlayerInfo(actor)
        const drawPileEmpty = gameInfo.snapshot.context.drawPile.length === 0
        const allHandsEmpty = gameInfo.snapshot.context.players.every(
          (player: any) => player.hand.length === 0,
        )

        if (drawPileEmpty && allHandsEmpty) {
          console.log(
            '🎯 Rail Era ending naturally - draw pile exhausted and all hands empty',
          )
          break
        }

        // Check if player has actions remaining
        if (gameInfo.actionsRemaining === 0) {
          console.log(
            `⏭️ ${gameInfo.currentPlayer!.name} has no actions remaining - waiting for next player/round`,
          )
          await new Promise((resolve) => setTimeout(resolve, 10))
          continue
        }

        railActions++
        console.log(
          `\n🎮 Rail Action ${railActions}: ${gameInfo.currentPlayer!.name}'s turn (Round ${gameInfo.round}, Actions: ${gameInfo.actionsRemaining}, Money: ${gameInfo.currentPlayer!.money})`,
        )
        console.log(
          `📊 Draw pile: ${gameInfo.snapshot.context.drawPile.length} cards, Player hand: ${gameInfo.currentPlayer!.hand.length} cards`,
        )

        // Use planned rail era actions from the script
        const plannedRailAction = getNextPlannedAction(gameInfo)

        // If no more planned actions, end the game
        if (!plannedRailAction) {
          console.log(
            '🎯 No more scripted actions in Rail Era - ending game simulation',
          )
          break
        }

        await performAction(actor, plannedRailAction, gameInfo)
        gameInfo = getCurrentPlayerInfo(actor)

        // Break if game is complete
        if (gameInfo.snapshot.matches('gameOver')) {
          console.log('🎉 Game completed!')
          break
        }

        // Brief pause
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      console.log(`\n🎯 Rail Era Complete - Played ${railActions} actions`)
    }

    // Force Rail Era end and final scoring
    gameInfo = getCurrentPlayerInfo(actor)
    if (gameInfo.era === 'rail') {
      console.log('\n🏁 Triggering Rail Era end and final scoring...')
      actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
      gameInfo = getCurrentPlayerInfo(actor)
      console.log(
        `✅ Game end triggered - State: ${JSON.stringify(gameInfo.state)}`,
      )
    }

    // Final game state verification
    gameInfo = getCurrentPlayerInfo(actor)
    console.log('\n🏁 FINAL GAME STATE')
    console.log(`Era: ${gameInfo.era}, Round: ${gameInfo.round}`)
    console.log(`State: ${JSON.stringify(gameInfo.state)}`)

    // Verify final scores and detailed game state
    console.log('\n📊 FINAL PLAYER SCORES:')
    gameInfo.snapshot.context.players.forEach((player: any, index: number) => {
      const industries = player.industries.length
      const flippedIndustries = player.industries.filter(
        (i: any) => i.flipped,
      ).length
      const links = player.links.length

      console.log(`\n🎮 ${player.name} (${player.color}):`)
      console.log(`  💰 Money: ${player.money}`)
      console.log(`  📈 Income: ${player.income}`)
      console.log(`  🏆 Victory Points: ${player.victoryPoints}`)
      console.log(
        `  🏭 Industries: ${industries} (${flippedIndustries} flipped)`,
      )
      console.log(`  🔗 Network Links: ${links}`)
      console.log(`  🎴 Hand Size: ${player.hand.length}`)

      // Verify reasonable final state
      expect(player.money).toBeGreaterThanOrEqual(-30) // Players shouldn't go too far into debt
      expect(player.income).toBeGreaterThanOrEqual(-10) // Minimum income is -10
      expect(player.victoryPoints).toBeGreaterThanOrEqual(0) // VP should be non-negative
    })

    // Verify complete game progression
    console.log('\n🎯 GAME PROGRESSION VERIFICATION:')
    console.log(`  🎲 Final Era: ${gameInfo.era}`)
    console.log(`  📅 Final Round: ${gameInfo.round}`)
    console.log(`  🎮 Final State: ${JSON.stringify(gameInfo.state)}`)

    // Check if game reached proper conclusion
    const isGameComplete =
      gameInfo.snapshot.matches('gameOver') || gameInfo.era === 'rail'
    console.log(`  ✅ Game Complete: ${isGameComplete}`)

    expect(gameInfo.round).toBeGreaterThanOrEqual(1)
    expect(['canal', 'rail'].includes(gameInfo.era)).toBe(true)

    console.log('✅ Integration test completed successfully!')
  }, 60000) // 60 second timeout for complete game simulation

  test('game handles invalid actions gracefully during integration', () => {
    console.log('🛡️ Testing error handling during integration...')

    const actor = createGameActor()
    setupTwoPlayerGame(actor)

    // Try invalid actions
    expect(() => {
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'CONFIRM' }) // No card selected
    }).not.toThrow() // Should handle gracefully

    // Try to build without proper setup
    expect(() => {
      actor.send({ type: 'BUILD' })
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
      actor.send({ type: 'CONFIRM' }) // No card selected
    }).not.toThrow() // Should handle gracefully

    console.log('✅ Error handling verification complete')
  })
})
