// Sell Actions Tests - player-chosen industry + merchant, multi-sell, beer
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type Merchant, gameStore } from './gameStore'

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

const manufacturerTile = {
  ...cottonTile,
  id: 'manufacturer_1',
  type: 'manufacturer' as const,
  beerRequired: 0,
}

const makeIndustry = (
  location: string,
  tile: typeof cottonTile | typeof manufacturerTile,
) => ({
  location: location as any,
  type: tile.type,
  level: tile.level,
  flipped: false,
  tile: tile as any,
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
})

const gloucesterMerchant = (overrides: Partial<Merchant> = {}): Merchant => ({
  location: 'gloucester',
  industryIcons: ['cotton', 'manufacturer'],
  bonusType: 'money',
  bonusValue: 5,
  hasBeer: true,
  ...overrides,
})

// Build a canal link worcester <-> gloucester with the current player so the
// industry location is connected to the merchant (virgin-board exception
// allows building anywhere)
const buildLinkToGloucester = (actor: any) => {
  let snapshot = actor.getSnapshot()
  actor.send({ type: 'NETWORK' })
  snapshot = actor.getSnapshot()
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

describe('Game Store - Sell Actions', () => {
  test('sell action - player picks industry and merchant; beer comes from that merchant with bonus', () => {
    const { actor } = setupGame()

    // Round 1: P0 builds the link, P1 passes
    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)

    // Round 2: the passer (spent least) goes first
    let snapshot = actor.getSnapshot()
    const sellerIndex = snapshot.context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [makeIndustry('worcester', cottonTile)],
      money: 20,
      income: 10,
    })

    snapshot = actor.getSnapshot()
    const initialDiscard = snapshot.context.discardPile.length
    const initialIncome = snapshot.context.players[sellerIndex]!.income

    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[sellerIndex]!.hand[0]!.id,
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const seller = snapshot.context.players[sellerIndex]!

    // Industry flipped, income advanced
    expect(seller.industries[0]!.flipped).toBe(true)
    // The sale advances the marker by SPACES (this fixture tile: +2):
    // level 10 = space 30, +2 spaces = space 32 = level 11.
    expect(seller.income).toBe(11)
    expect(seller.incomeSpace).toBe(32)

    // Merchant beer consumed from the merchant sold to, money bonus applied
    const merchant = snapshot.context.merchants.find(
      (m) => m.location === 'gloucester',
    )!
    expect(merchant.hasBeer).toBe(false)
    expect(seller.money).toBe(25) // 20 + £5 bonus

    // One card discarded for the whole Sell action, one action consumed
    // (round 2 grants 2 actions, so the seller still has 1 left)
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 1)
    expect(snapshot.context.currentPlayerIndex).toBe(sellerIndex)
    expect(snapshot.context.actionsRemaining).toBe(1)
  })

  test('sell action - multiple industries flipped in a single Sell action', () => {
    const { actor } = setupGame()

    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)

    let snapshot = actor.getSnapshot()
    const sellerIndex = snapshot.context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [
        makeIndustry('worcester', cottonTile),
        makeIndustry('worcester', manufacturerTile),
      ],
      money: 20,
      income: 10,
    })

    snapshot = actor.getSnapshot()
    const initialActions = snapshot.context.actionsRemaining
    const initialDiscard = snapshot.context.discardPile.length

    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[sellerIndex]!.hand[0]!.id,
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'manufacturer',
      merchant: 'gloucester',
    })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()
    const seller = snapshot.context.players[sellerIndex]!

    expect(seller.industries.every((i) => i.flipped)).toBe(true)
    // One action + one card for both sales
    expect(snapshot.context.discardPile.length).toBe(initialDiscard + 1)
    const actionsUsed =
      snapshot.context.currentPlayerIndex === sellerIndex
        ? initialActions - snapshot.context.actionsRemaining
        : 1
    expect(actionsUsed).toBeLessThanOrEqual(1)
  })

  test('mid-sell card switch is refused once an industry has flipped (sales are irreversible)', () => {
    const { actor } = setupGame()

    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)

    let snapshot = actor.getSnapshot()
    const sellerIndex = snapshot.context.currentPlayerIndex

    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [
        makeIndustry('worcester', cottonTile),
        makeIndustry('worcester', manufacturerTile),
      ],
      money: 20,
      income: 10,
    })

    actor.send({ type: 'SELL' })
    snapshot = actor.getSnapshot()
    const discardCard = snapshot.context.players[sellerIndex]!.hand[0]!.id
    const otherCard = snapshot.context.players[sellerIndex]!.hand[1]!.id
    actor.send({ type: 'SELECT_CARD', cardId: discardCard })
    // One sale flips the cotton mill — the action is now partially committed.
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    snapshot = actor.getSnapshot()
    expect(snapshot.context.salesMadeThisAction).toBe(1)
    expect(
      snapshot.matches({ playing: { action: { selling: 'selectingSale' } } }),
    ).toBe(true)

    // A flipped sale cannot be abandoned by switching cards — the shortcut is
    // refused so no half-applied sale can be walked away from.
    expect(snapshot.can({ type: 'SELECT_CARD', cardId: otherCard })).toBe(false)
    actor.send({ type: 'SELECT_CARD', cardId: otherCard })
    snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({ playing: { action: { selling: 'selectingSale' } } }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(discardCard)
  })

  test('sell action - CONFIRM without a completed sale is blocked (guard)', () => {
    const { actor } = setupGame()

    actor.send({ type: 'SELL' })
    const snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId:
        snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
          .id,
    })
    const before = actor.getSnapshot()
    actor.send({ type: 'CONFIRM' })
    const after = actor.getSnapshot()

    // Still in selling state - no sale was made so CONFIRM is blocked
    expect(after.matches({ playing: { action: 'selling' } })).toBe(true)
    expect(after.context.discardPile.length).toBe(
      before.context.discardPile.length,
    )
  })

  test('sell action - cancel returns to action selection', () => {
    const { actor } = setupGame()

    actor.send({ type: 'SELL' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selling' } })).toBe(true)

    actor.send({ type: 'CANCEL' })
    snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
  })

  test('sell action - rejected when not connected to the chosen merchant', () => {
    const { actor } = setupGame()

    // No links built - worcester is not connected to gloucester
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant()],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [makeIndustry('worcester', cottonTile)],
      money: 20,
      income: 10,
    })

    let snapshot = actor.getSnapshot()
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[0]!.hand[0]!.id,
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    snapshot = actor.getSnapshot()
    // Guard rejects the sale - nothing flipped, still selecting a sale
    expect(snapshot.context.players[0]!.industries[0]!.flipped).toBe(false)
    expect(snapshot.context.salesMadeThisAction).toBe(0)
    expect(snapshot.matches({ playing: { action: 'selling' } })).toBe(true)
  })

  test('sell action - rejected when the merchant does not buy that good', () => {
    const { actor } = setupGame()

    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)

    let snapshot = actor.getSnapshot()
    const sellerIndex = snapshot.context.currentPlayerIndex

    // Merchant only buys pottery
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant({ industryIcons: ['pottery'] })],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [makeIndustry('worcester', cottonTile)],
      money: 20,
      income: 10,
    })

    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[sellerIndex]!.hand[0]!.id,
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[sellerIndex]!.industries[0]!.flipped).toBe(
      false,
    )
    expect(snapshot.context.salesMadeThisAction).toBe(0)
  })

  test('sell action - rejected when required beer is unavailable', () => {
    const { actor } = setupGame()

    buildLinkToGloucester(actor)
    passCurrentPlayer(actor)

    let snapshot = actor.getSnapshot()
    const sellerIndex = snapshot.context.currentPlayerIndex

    // Merchant has no beer and the player has no breweries
    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [gloucesterMerchant({ hasBeer: false })],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [makeIndustry('worcester', cottonTile)],
      money: 20,
      income: 10,
    })

    snapshot = actor.getSnapshot()
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[sellerIndex]!.hand[0]!.id,
    })
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    snapshot = actor.getSnapshot()
    expect(snapshot.context.players[sellerIndex]!.industries[0]!.flipped).toBe(
      false,
    )
    expect(snapshot.context.salesMadeThisAction).toBe(0)
  })
})
