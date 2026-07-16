// Resource source choice — the player picks WHERE beer and iron come from.
//
// The rules make both a choice ("any" of the listed sources), and it is a
// consequential one: draining a brewery flips it and advances ITS OWNER's
// income, and the merchant's barrel is the only way to collect its bonus.
// Omitting the choice must reproduce the engine's historic auto-pick exactly —
// that default is what every other suite in this repo pins.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type Merchant, gameStore } from './gameStore'
import {
  beerChoiceForSale,
  ironChoiceForConfirm,
} from './shared/resourceSources'

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
    ],
  })
  return { actor }
}

const cottonTile = {
  id: 'cotton_1',
  type: 'cotton' as const,
  level: 1,
  canBuildInCanalEra: true,
  canBuildInRailEra: true,
  incomeAdvancement: 2,
  incomeSpaces: 2,
  victoryPoints: 3,
  beerRequired: 1,
  cost: 10,
  linkScoringIcons: 1,
  coalRequired: 0,
  ironRequired: 0,
  beerProduced: 0,
  coalProduced: 0,
  ironProduced: 0,
  hasLightbulbIcon: false,
  quantity: 3,
}

const breweryTile = {
  ...cottonTile,
  id: 'brewery_1',
  type: 'brewery' as const,
  beerRequired: 0,
  beerProduced: 1,
  incomeAdvancement: 4,
  incomeSpaces: 4,
}

const ironTile = {
  ...cottonTile,
  id: 'iron_1',
  type: 'iron' as const,
  beerRequired: 0,
  ironProduced: 4,
  incomeAdvancement: 3,
  incomeSpaces: 3,
}

const makeIndustry = (location: string, tile: any, extra: object = {}) => ({
  location: location as any,
  type: tile.type,
  level: tile.level,
  flipped: false,
  tile: tile as any,
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
  ...extra,
})

const gloucesterMerchant = (overrides: Partial<Merchant> = {}): Merchant => ({
  location: 'gloucester',
  industryIcons: ['cotton', 'manufacturer'],
  bonusType: 'money',
  bonusValue: 5,
  hasBeer: true,
  ...overrides,
})

const buildLinkToGloucester = (actor: any) => {
  const snapshot = actor.getSnapshot()
  actor.send({ type: 'NETWORK' })
  actor.send({
    type: 'SELECT_CARD',
    cardId:
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
        .id,
  })
  actor.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' })
  actor.send({ type: 'CONFIRM' })
}

const passCurrentPlayer = (actor: any) => {
  const snapshot = actor.getSnapshot()
  actor.send({ type: 'PASS' })
  actor.send({
    type: 'SELECT_CARD',
    cardId:
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
        .id,
  })
  actor.send({ type: 'CONFIRM' })
}

/**
 * Round 1: player 0 links worcester–gloucester, player 1 passes. Round 2 opens
 * with the passer (spent least) on turn — they are the seller.
 */
const setupSellBoard = (
  opponentIndustries: any[] = [],
  sellerIndustries: any[] = [],
) => {
  const { actor } = setupGame()
  buildLinkToGloucester(actor)
  passCurrentPlayer(actor)

  const sellerIndex = actor.getSnapshot().context.currentPlayerIndex
  const opponentIndex = sellerIndex === 0 ? 1 : 0

  actor.send({ type: 'TEST_SET_MERCHANTS', merchants: [gloucesterMerchant()] })
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: sellerIndex,
    money: 20,
    income: 10,
    industries: [makeIndustry('worcester', cottonTile), ...sellerIndustries],
  })
  if (opponentIndustries.length > 0) {
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      industries: opponentIndustries,
    })
  }

  const openSell = () => {
    const snapshot = actor.getSnapshot()
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[sellerIndex]!.hand[0]!.id,
    })
  }

  return { actor, sellerIndex, opponentIndex, openSell }
}

describe('Resource source choice - beer on sell', () => {
  test('a two-barrel sale takes each barrel from a different source (mixed allocation)', () => {
    // A 2-beer tile: the beer step stays open until both barrels are assigned,
    // so a mixed allocation (own brewery + merchant) is reached by two picks —
    // there is no homogeneous-only limitation. Built inline so the ONLY cotton
    // at worcester is the 2-beer one (setupSellBoard always adds a 1-beer one).
    const { actor } = setupGame()
    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)
    const sellerIndex = actor.getSnapshot().context.currentPlayerIndex
    const opponentIndex = sellerIndex === 0 ? 1 : 0
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      money: 20,
      income: 10,
      industries: [
        makeIndustry('worcester', { ...cottonTile, beerRequired: 2 }),
        makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 }),
      ],
    })
    // A connected opponent brewery gives a THIRD barrel, so with 2 required
    // the player genuinely chooses WHICH two (3 available > 2 = a real choice).
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      industries: [
        makeIndustry('gloucester', breweryTile, { beerBarrelsOnTile: 1 }),
      ],
    })
    const openSell = () => {
      actor.send({ type: 'SELL' })
      actor.send({
        type: 'SELECT_CARD',
        cardId: actor.getSnapshot().context.players[sellerIndex]!.hand[0]!.id,
      })
    }
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    // Two barrels required, so the step does NOT auto-close after one pick.
    expect(
      actor.getSnapshot().matches({
        playing: { action: { selling: 'choosingBeerSource' } },
      }),
    ).toBe(true)

    const sellerId = actor.getSnapshot().context.players[sellerIndex]!.id
    // Barrel 1 from the own brewery…
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'brewery', ownerId: sellerId, location: 'worcester' },
    })
    // …still open (1 of 2 assigned)…
    expect(
      actor.getSnapshot().matches({
        playing: { action: { selling: 'choosingBeerSource' } },
      }),
    ).toBe(true)
    // …barrel 2 from the merchant, which closes the step and executes.
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'merchant', location: 'gloucester' },
    })
    actor.send({ type: 'CONFIRM' })

    const snap = actor.getSnapshot()
    const seller = snap.context.players[sellerIndex]!
    // Own brewery drained + merchant barrel taken (£5 bonus): a genuine mix.
    // The opponent's brewery — the third, unchosen source — is left alone.
    expect(
      seller.industries.find((i) => i.type === 'brewery')!.beerBarrelsOnTile,
    ).toBe(0)
    expect(
      snap.context.merchants.find((m) => m.location === 'gloucester')!.hasBeer,
    ).toBe(false)
    expect(
      snap.context.players[opponentIndex]!.industries.find(
        (i) => i.type === 'brewery',
      )!.beerBarrelsOnTile,
    ).toBe(1)
    expect(seller.money).toBe(25) // 20 + £5 merchant bonus
    expect(seller.industries.find((i) => i.type === 'cotton')!.flipped).toBe(
      true,
    )
  })

  test('choosing merchant beer collects the bonus and spares the own brewery', () => {
    const { actor, sellerIndex, openSell } = setupSellBoard(
      [],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    // Own brewery vs the merchant's barrel: a real choice, so the machine asks
    expect(
      actor.getSnapshot().matches({
        playing: { action: { selling: 'choosingBeerSource' } },
      }),
    ).toBe(true)
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'merchant', location: 'gloucester' },
    })
    actor.send({ type: 'CONFIRM' })

    const snapshot = actor.getSnapshot()
    const seller = snapshot.context.players[sellerIndex]!
    const brewery = seller.industries.find((i) => i.type === 'brewery')!

    // The merchant's barrel went, so its £5 bonus came with it
    expect(
      snapshot.context.merchants.find((m) => m.location === 'gloucester')!
        .hasBeer,
    ).toBe(false)
    expect(seller.money).toBe(25)

    // ...and the brewery kept its barrel for a later sale
    expect(brewery.beerBarrelsOnTile).toBe(1)
    expect(brewery.flipped).toBe(false)
    expect(seller.industries.find((i) => i.type === 'cotton')!.flipped).toBe(
      true,
    )
  })

  test('one possible source is never asked about — the engine just takes it', () => {
    const { actor, sellerIndex, openSell } = setupSellBoard(
      [],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    // No merchant barrel: the seller's own brewery is the only beer in reach
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant({ hasBeer: false })],
    })
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    // choosingBeerSource is entered and left in the same tick — the flow never
    // stops, exactly as it behaved before the choice existed
    expect(
      actor.getSnapshot().matches({
        playing: { action: { selling: 'selectingSale' } },
      }),
    ).toBe(true)
    actor.send({ type: 'CONFIRM' })

    const snapshot = actor.getSnapshot()
    const seller = snapshot.context.players[sellerIndex]!
    const brewery = seller.industries.find((i) => i.type === 'brewery')!

    expect(brewery.beerBarrelsOnTile).toBe(0)
    expect(brewery.flipped).toBe(true)
    expect(seller.money).toBe(20) // no merchant bonus to collect
  })

  test("choosing a connected opponent's brewery flips THEIR tile and advances THEIR income", () => {
    const { actor, sellerIndex, opponentIndex, openSell } = setupSellBoard(
      [makeIndustry('gloucester', breweryTile, { beerBarrelsOnTile: 1 })],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )

    const opponentId = actor.getSnapshot().context.players[opponentIndex]!.id
    const incomeSpaceBefore =
      actor.getSnapshot().context.players[opponentIndex]!.incomeSpace
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'brewery', ownerId: opponentId, location: 'gloucester' },
    })
    actor.send({ type: 'CONFIRM' })

    const snapshot = actor.getSnapshot()
    const opponentBrewery = snapshot.context.players[
      opponentIndex
    ]!.industries.find((i) => i.type === 'brewery')!
    const ownBrewery = snapshot.context.players[sellerIndex]!.industries.find(
      (i) => i.type === 'brewery',
    )!

    // Their barrel, their flip, their income
    expect(opponentBrewery.beerBarrelsOnTile).toBe(0)
    expect(opponentBrewery.flipped).toBe(true)
    expect(
      snapshot.context.players[opponentIndex]!.incomeSpace,
    ).toBeGreaterThan(incomeSpaceBefore)

    // The seller's own beer survives for a later sale
    expect(ownBrewery.beerBarrelsOnTile).toBe(1)
    expect(ownBrewery.flipped).toBe(false)
  })

  test('the machine refuses a source it never offered, and moves nothing', () => {
    const { actor, sellerIndex, openSell } = setupSellBoard(
      [],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    // Nobody has a brewery at birmingham, and oxford's merchant is not the one
    // being sold to — neither is on offer, so neither can be picked.
    for (const source of [
      { kind: 'brewery', ownerId: '1', location: 'birmingham' },
      { kind: 'merchant', location: 'oxford' },
    ] as const) {
      const pick = { type: 'SELECT_BEER_SOURCE', source } as const
      expect(actor.getSnapshot().can(pick)).toBe(false)
      actor.send(pick)
    }

    const snapshot = actor.getSnapshot()
    expect(snapshot.status).toBe('active') // never throws inside assign
    expect(snapshot.context.chosenBeerSources).toEqual([])
    // Still waiting on a real answer; nothing flipped, no action consumed
    expect(
      snapshot.matches({
        playing: { action: { selling: 'choosingBeerSource' } },
      }),
    ).toBe(true)
    expect(
      snapshot.context.players[sellerIndex]!.industries.find(
        (i) => i.type === 'cotton',
      )!.flipped,
    ).toBe(false)
  })

  test('cancelling the beer step drops the staged sale and flips nothing', () => {
    const { actor, sellerIndex, openSell } = setupSellBoard(
      [],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    openSell()

    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.send({ type: 'CANCEL' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.pendingSale).toBeNull()
    expect(snapshot.context.chosenBeerSources).toEqual([])
    expect(
      snapshot.matches({ playing: { action: { selling: 'selectingSale' } } }),
    ).toBe(true)
    expect(
      snapshot.context.players[sellerIndex]!.industries.find(
        (i) => i.type === 'cotton',
      )!.flipped,
    ).toBe(false)
    // The card is still in hand — cancelling the step costs nothing
    expect(snapshot.context.salesMadeThisAction).toBe(0)
  })
})

describe('Resource source choice - beer on the double rail link', () => {
  const railBoard = () => {
    const { actor } = setupGame()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })

    const snapshot = actor.getSnapshot()
    const builderIndex = snapshot.context.currentPlayerIndex
    const opponentIndex = builderIndex === 0 ? 1 : 0

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: builderIndex,
      money: 60,
      industries: [
        makeIndustry('birmingham', breweryTile, { beerBarrelsOnTile: 2 }),
        makeIndustry(
          'birmingham',
          { ...ironTile, type: 'coal' },
          {
            coalCubesOnTile: 4,
          },
        ),
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      // At the second link's endpoint, so it is connected to where the beer is
      // needed (distance 0) even before the link is placed
      industries: [
        makeIndustry('wolverhampton', breweryTile, { beerBarrelsOnTile: 1 }),
      ],
    })

    // Establish a network, then line up the double build
    const hand = actor.getSnapshot().context.players[builderIndex]!.hand
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'CONFIRM' })

    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[builderIndex]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    actor.send({
      type: 'SELECT_SECOND_LINK',
      from: 'birmingham',
      to: 'wolverhampton',
    })

    return { actor, builderIndex, opponentIndex }
  }

  test("choosing the opponent's brewery drains theirs, not the builder's", () => {
    const { actor, builderIndex, opponentIndex } = railBoard()
    const opponentId = actor.getSnapshot().context.players[opponentIndex]!.id

    expect(
      actor.getSnapshot().matches({
        playing: { action: { networking: 'choosingDoubleLinkBeer' } },
      }),
    ).toBe(true)

    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: {
        kind: 'brewery',
        ownerId: opponentId,
        location: 'wolverhampton',
      },
    })
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })

    const snapshot = actor.getSnapshot()
    expect(
      snapshot.context.players[opponentIndex]!.industries.find(
        (i) => i.type === 'brewery',
      )!.beerBarrelsOnTile,
    ).toBe(0)
    expect(
      snapshot.context.players[builderIndex]!.industries.find(
        (i) => i.type === 'brewery',
      )!.beerBarrelsOnTile,
    ).toBe(2)
    expect(snapshot.context.players[builderIndex]!.links.length).toBe(3)
  })

  test('merchant beer is never on offer for a network action (rules p.9)', () => {
    const { actor } = railBoard()
    const merchantBeer = {
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'merchant', location: 'gloucester' },
    } as const

    // The step offers breweries only — the machine refuses the pick outright
    expect(actor.getSnapshot().can(merchantBeer)).toBe(false)
    actor.send(merchantBeer)

    expect(actor.getSnapshot().context.chosenBeerSources).toEqual([])
    expect(
      actor.getSnapshot().matches({
        playing: { action: { networking: 'choosingDoubleLinkBeer' } },
      }),
    ).toBe(true)
  })

  test('beer reachability is judged after both rails are placed (provisional network)', () => {
    // Opponent brewery sits at nuneaton. The builder's second link ends at
    // wolverhampton, which only reaches nuneaton THROUGH the two rails being
    // built (wolverhampton–birmingham–coventry–nuneaton). Before placement
    // wolverhampton is isolated, so the brewery is only reachable — and only
    // consumable — once both rails are down, exactly as execution sees it.
    const { actor } = setupGame()
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    const builderIndex = actor.getSnapshot().context.currentPlayerIndex
    const opponentIndex = builderIndex === 0 ? 1 : 0

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: builderIndex,
      money: 60,
      industries: [
        makeIndustry('birmingham', breweryTile, { beerBarrelsOnTile: 2 }),
        makeIndustry(
          'birmingham',
          { ...ironTile, type: 'coal' },
          {
            coalCubesOnTile: 4,
          },
        ),
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      industries: [
        makeIndustry('nuneaton', breweryTile, { beerBarrelsOnTile: 1 }),
      ],
    })
    const opponentId = actor.getSnapshot().context.players[opponentIndex]!.id

    // Network: birmingham–coventry, then the double coventry–nuneaton +
    // birmingham–wolverhampton (second link ends at wolverhampton).
    const hand = actor.getSnapshot().context.players[builderIndex]!.hand
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'CONFIRM' })
    actor.send({ type: 'NETWORK' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[builderIndex]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'coventry', to: 'nuneaton' })
    actor.send({ type: 'CHOOSE_DOUBLE_LINK_BUILD' })
    actor.send({
      type: 'SELECT_SECOND_LINK',
      from: 'birmingham',
      to: 'wolverhampton',
    })

    // Own beer (birmingham) plus the opponent's nuneaton brewery — reachable
    // ONLY via the provisional both-rails network — are both offered.
    const step = actor.getSnapshot()
    expect(
      step.can({
        type: 'SELECT_BEER_SOURCE',
        source: { kind: 'brewery', ownerId: opponentId, location: 'nuneaton' },
      }),
    ).toBe(true)

    // And it consumes: pick the opponent's, confirm, their brewery flips.
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: { kind: 'brewery', ownerId: opponentId, location: 'nuneaton' },
    })
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' })
    const after = actor.getSnapshot()
    const oppBrewery = after.context.players[opponentIndex]!.industries.find(
      (i) => i.type === 'brewery',
    )!
    expect(oppBrewery.beerBarrelsOnTile).toBe(0)
    expect(after.context.players[builderIndex]!.links.length).toBe(3)
  })

  test('cancelling after a pick and re-selecting re-asks the beer source', () => {
    const { actor, opponentIndex } = railBoard()
    const opponentId = actor.getSnapshot().context.players[opponentIndex]!.id

    const inBeerStep = () =>
      actor.getSnapshot().matches({
        playing: { action: { networking: 'choosingDoubleLinkBeer' } },
      })

    // Pick the opponent's brewery, then change your mind and cancel out
    expect(inBeerStep()).toBe(true)
    actor.send({
      type: 'SELECT_BEER_SOURCE',
      source: {
        kind: 'brewery',
        ownerId: opponentId,
        location: 'wolverhampton',
      },
    })
    expect(
      actor.getSnapshot().matches({
        playing: { action: { networking: 'confirmingDoubleLink' } },
      }),
    ).toBe(true)
    actor.send({ type: 'CANCEL' })

    // The stale pick must not skip the re-ask (regression: it used to land
    // straight back in confirmingDoubleLink and consume from the old brewery).
    expect(actor.getSnapshot().context.chosenBeerSources).toEqual([])
    actor.send({
      type: 'SELECT_SECOND_LINK',
      from: 'birmingham',
      to: 'wolverhampton',
    })
    expect(inBeerStep()).toBe(true)
    expect(actor.getSnapshot().context.chosenBeerSources).toEqual([])
  })
})

describe('Resource source choice - iron on build', () => {
  test('a location-card build routes through the iron step (does not skip it)', () => {
    // Regression: a location-card build sent SELECT_INDUSTRY_TYPE straight to
    // confirmingBuild, bypassing choosingIronSource — so an iron-requiring
    // build never asked where the iron came from. The site being fixed by the
    // card must not skip the iron question.
    const { actor } = setupGame()
    const builderIndex = actor.getSnapshot().context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: builderIndex,
      hand: [
        {
          id: 'loc_bham',
          type: 'location',
          location: 'birmingham',
          color: 'blue',
        },
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: builderIndex,
      money: 50,
    })

    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'loc_bham' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'manufacturer' })

    // The choosingIronSource step was entered — its entry stamps pendingIronStep.
    // (Before the fix the step was skipped, so this stayed null.) Manufacturer
    // L1 needs no iron, so it then auto-skips to the confirm — the point is the
    // step is on the path now; the "stop when iron is needed + a choice exists"
    // behaviour is pinned by the develop iron tests below.
    expect(actor.getSnapshot().context.pendingIronStep).toBe('build')
  })
})

describe('Resource source choice - iron on develop', () => {
  test("choosing an opponent's iron works drains theirs and flips it for them", () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()
    const developerIndex = snapshot.context.currentPlayerIndex
    const opponentIndex = developerIndex === 0 ? 1 : 0

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: developerIndex,
      money: 30,
      industries: [
        makeIndustry('birmingham', ironTile, { ironCubesOnTile: 1 }),
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: opponentIndex,
      industries: [makeIndustry('dudley', ironTile, { ironCubesOnTile: 1 })],
    })

    const opponentId = actor.getSnapshot().context.players[opponentIndex]!.id
    const hand = actor.getSnapshot().context.players[developerIndex]!.hand

    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton'] })
    expect(
      actor.getSnapshot().matches({
        playing: { action: { developing: 'choosingIronSource' } },
      }),
    ).toBe(true)
    actor.send({
      type: 'SELECT_IRON_SOURCE',
      source: { kind: 'ironworks', ownerId: opponentId, location: 'dudley' },
    })
    actor.send({ type: 'CONFIRM' })

    const after = actor.getSnapshot()
    const opponentWorks = after.context.players[opponentIndex]!.industries[0]!
    const ownWorks = after.context.players[developerIndex]!.industries[0]!

    expect(opponentWorks.ironCubesOnTile).toBe(0)
    expect(opponentWorks.flipped).toBe(true)
    // The developer's own cube is still there — that is the whole point
    expect(ownWorks.ironCubesOnTile).toBe(1)
    expect(ownWorks.flipped).toBe(false)
    // Works iron is free either way
    expect(after.context.players[developerIndex]!.money).toBe(30)
  })

  test('a lone iron works is never asked about — the flow does not stop', () => {
    const { actor } = setupGame()
    const developerIndex = actor.getSnapshot().context.currentPlayerIndex

    // Exactly one unflipped works on the board: nothing to choose between
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 30,
      industries: [
        makeIndustry('birmingham', ironTile, { ironCubesOnTile: 1 }),
      ],
    })
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, industries: [] })

    const hand = actor.getSnapshot().context.players[developerIndex]!.hand
    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton'] })

    // choosingIronSource was entered and left in the same tick
    expect(
      actor.getSnapshot().matches({
        playing: { action: { developing: 'confirmingDevelop' } },
      }),
    ).toBe(true)
    actor.send({ type: 'CONFIRM' })

    const after = actor.getSnapshot()
    expect(after.context.players[0]!.industries[0]!.ironCubesOnTile).toBe(0)
    // Works iron is free — the market was never touched
    expect(after.context.players[developerIndex]!.money).toBe(30)
  })

  test('the market is not an alternative to a works — it is a fallback (rules p.5)', () => {
    const { actor } = setupGame()
    const developerIndex = actor.getSnapshot().context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      money: 30,
      industries: [
        makeIndustry('birmingham', ironTile, { ironCubesOnTile: 1 }),
      ],
    })
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, industries: [] })

    // A develop of one tile with one works available: the works, and only it
    actor.send({ type: 'DEVELOP' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[developerIndex]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['cotton'] })
    const offered = ironChoiceForConfirm(
      actor.getSnapshot().context,
      actor.getSnapshot().context.players[developerIndex]!,
      'develop',
    )!
    expect(offered.options.map((o) => o.source.kind)).toEqual(['ironworks'])
    expect(
      actor.getSnapshot().can({
        type: 'SELECT_IRON_SOURCE',
        source: { kind: 'market' },
      }),
    ).toBe(false)
  })
})

describe('Resource source choice - the engine answers what a step is asking', () => {
  test('beerChoiceForSale reports the barrel count, the sources and their consequences', () => {
    const { actor, sellerIndex, opponentIndex } = setupSellBoard(
      [makeIndustry('gloucester', breweryTile, { beerBarrelsOnTile: 1 })],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    const context = actor.getSnapshot().context
    const seller = context.players[sellerIndex]!

    const choice = beerChoiceForSale(context, seller, {
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })!

    // The tile's barrel count comes from the engine — no caller counts it
    expect(choice.required).toBe(1)
    expect(choice.hasChoice).toBe(true)

    const own = choice.options.find((o) => o.own)!
    expect(own.source).toEqual({
      kind: 'brewery',
      ownerId: seller.id,
      location: 'worcester',
    })
    expect(own.flipsOwnerTile).toBe(true)

    const opponent = choice.options.find(
      (o) => o.source.kind === 'brewery' && !o.own,
    )!
    expect(opponent.ownerName).toBe(context.players[opponentIndex]!.name)

    // Merchant beer flips nothing, and carries the bonus it pays
    const merchant = choice.options.find((o) => o.source.kind === 'merchant')!
    expect(merchant.flipsOwnerTile).toBe(false)
    expect(merchant.merchantBonus).toEqual({ type: 'money', value: 5 })
  })

  test('beerChoiceForSale reports no choice when one source must supply it all', () => {
    // No merchant barrel and no opponent brewery: the seller's own is the only
    // beer in reach, so there is nothing to ask.
    const { actor, sellerIndex } = setupSellBoard(
      [],
      [makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 })],
    )
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant({ hasBeer: false })],
    })

    const context = actor.getSnapshot().context
    const choice = beerChoiceForSale(context, context.players[sellerIndex]!, {
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })!

    expect(choice.options).toHaveLength(1)
    expect(choice.hasChoice).toBe(false)
  })

  test('ironChoiceForConfirm prices a develop from the engine, not the caller', () => {
    const { actor } = setupGame()
    const developerIndex = actor.getSnapshot().context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: developerIndex,
      money: 30,
      industries: [
        makeIndustry('birmingham', ironTile, { ironCubesOnTile: 1 }),
      ],
    })
    const hand = actor.getSnapshot().context.players[developerIndex]!.hand
    actor.send({ type: 'DEVELOP' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['cotton', 'coal'],
    })

    const context = actor.getSnapshot().context
    const choice = ironChoiceForConfirm(
      context,
      context.players[developerIndex]!,
      'develop',
    )!

    // Two scrapped tiles = two cubes. One works can only give one, but the
    // market is NOT offered alongside it (rules p.5) — the planner falls back
    // to the market for the cube the works cannot cover.
    expect(choice.required).toBe(2)
    expect(choice.options.map((o) => o.source.kind)).toEqual(['ironworks'])
    expect(choice.hasChoice).toBe(false)
  })
})
