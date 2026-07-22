// Regression tests for the merchant "Develop" beer bonus (Gloucester).
//
// Selling to the Gloucester merchant and drinking its beer lets the player
// remove one of their LOWEST-level tiles from the Player Mat, for no iron cost
// (rules p.6). The tile removed is the lowest of the CHOSEN industry track; a
// Pottery tile showing the lightbulb icon may never be developed.
//
// Pinned here: a genuine choice (2+ developable tracks) pauses at
// choosingDevelopTile and removes exactly the picked track's lowest tile; a
// single option auto-applies with no prompt; and a lightbulb Pottery is never
// offered.
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { IndustryType } from '../data/cards'
import type { IndustryTileWithQuantity } from '../data/industryTiles'
import { type Merchant, gameStore } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []
afterEach(() => {
  activeActors.forEach((a) => {
    try {
      a.stop()
    } catch {
      // ignore
    }
  })
  activeActors = []
})

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

const makeIndustry = (location: string) => ({
  location: location as never,
  type: cottonTile.type,
  level: cottonTile.level,
  flipped: false,
  tile: cottonTile as never,
  coalCubesOnTile: 0,
  ironCubesOnTile: 0,
  beerBarrelsOnTile: 0,
})

const gloucesterDevelopMerchant = (): Merchant => ({
  location: 'gloucester',
  industryIcons: ['cotton', 'manufacturer'],
  bonusType: 'develop',
  bonusValue: 1,
  hasBeer: true,
})

// A minimal mat tile for the develop options.
const matTile = (
  type: IndustryType,
  level: number,
  hasLightbulbIcon = false,
  quantityAvailable = 1,
): IndustryTileWithQuantity => ({
  quantityAvailable,
  tile: {
    id: `${type}_${level}`,
    type,
    level,
    hasLightbulbIcon,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
  } as IndustryTileWithQuantity['tile'],
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
  return actor
}

// Build a canal link worcester <-> gloucester with the current player so the
// sold industry is connected to the merchant.
const buildLinkToGloucester = (actor: ReturnType<typeof createActor>) => {
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

const passCurrentPlayer = (actor: ReturnType<typeof createActor>) => {
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

const startSaleToGloucester = (
  actor: ReturnType<typeof createActor>,
  mat: Record<string, IndustryTileWithQuantity[]>,
) => {
  buildLinkToGloucester(actor)
  passCurrentPlayer(actor)

  let snapshot = actor.getSnapshot()
  const seller = snapshot.context.currentPlayerIndex

  actor.send({
    type: 'TEST_SET_MERCHANTS',
    merchants: [gloucesterDevelopMerchant()],
  })
  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: seller,
    industries: [makeIndustry('worcester')],
    money: 20,
    income: 10,
    industryTilesOnMat: mat as never,
  })

  snapshot = actor.getSnapshot()
  actor.send({ type: 'SELL' })
  actor.send({
    type: 'SELECT_CARD',
    cardId: snapshot.context.players[seller]!.hand[0]!.id,
  })
  actor.send({
    type: 'SELECT_SALE',
    location: 'worcester',
    industryType: 'cotton',
    merchant: 'gloucester',
  })
  return seller
}

const matQty = (
  actor: ReturnType<typeof createActor>,
  seller: number,
  type: IndustryType,
) =>
  actor
    .getSnapshot()
    .context.players[seller]!.industryTilesOnMat[type]!.reduce(
      (sum: number, t: IndustryTileWithQuantity) => sum + t.quantityAvailable,
      0,
    )

describe('merchant develop bonus — tile choice', () => {
  test('two developable tracks pause at choosingDevelopTile and remove exactly the chosen track', () => {
    const actor = setupGame()
    const seller = startSaleToGloucester(actor, {
      coal: [matTile('coal', 1)],
      iron: [matTile('iron', 1)],
    })

    // The sale flipped, but the develop bonus stops for a choice.
    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { selling: 'choosingDevelopTile' } },
      } as never),
    ).toBe(true)
    expect(snapshot.context.pendingDevelopChoice?.remaining).toBe(1)
    // CONFIRM is not reachable until the pick is made.
    expect(snapshot.can({ type: 'CONFIRM' } as never)).toBe(false)

    // Pick iron: only the iron tile leaves the mat.
    expect(matQty(actor, seller, 'coal')).toBe(1)
    expect(matQty(actor, seller, 'iron')).toBe(1)
    actor.send({ type: 'SELECT_DEVELOP_TILE', industryType: 'iron' })

    snapshot = actor.getSnapshot()
    expect(matQty(actor, seller, 'coal')).toBe(1)
    expect(matQty(actor, seller, 'iron')).toBe(0)
    expect(snapshot.context.pendingDevelopChoice).toBeNull()
    // Back at selectingSale, able to confirm the Sell action.
    expect(
      snapshot.matches({
        playing: { action: { selling: 'selectingSale' } },
      } as never),
    ).toBe(true)
    expect(
      snapshot.context.logs.some((l: { message: string }) =>
        l.message.includes('developed a level 1 iron tile'),
      ),
    ).toBe(true)

    actor.send({ type: 'CONFIRM' })
    expect(matQty(actor, seller, 'coal')).toBe(1)
  })

  test('a single developable track auto-applies with no prompt', () => {
    const actor = setupGame()
    const seller = startSaleToGloucester(actor, {
      coal: [matTile('coal', 2), matTile('coal', 1)],
    })

    const snapshot = actor.getSnapshot()
    // No pause: skipped straight through to selectingSale.
    expect(
      snapshot.matches({
        playing: { action: { selling: 'selectingSale' } },
      } as never),
    ).toBe(true)
    expect(snapshot.context.pendingDevelopChoice).toBeNull()
    // The lowest coal tile (level 1) was removed automatically.
    const coal = snapshot.context.players[seller]!.industryTilesOnMat.coal!
    expect(
      coal.find((t: IndustryTileWithQuantity) => t.tile.level === 1)!
        .quantityAvailable,
    ).toBe(0)
    expect(
      coal.find((t: IndustryTileWithQuantity) => t.tile.level === 2)!
        .quantityAvailable,
    ).toBe(1)
    expect(
      snapshot.context.logs.some((l: { message: string }) =>
        l.message.includes('developed a level 1 coal tile'),
      ),
    ).toBe(true)
  })

  test('a lightbulb Pottery is never offered; only the other track is developed', () => {
    const actor = setupGame()
    // pottery lowest is a lightbulb tile → pottery not developable, so cotton
    // is the ONLY option and auto-applies (no choice).
    const seller = startSaleToGloucester(actor, {
      pottery: [matTile('pottery', 1, true), matTile('pottery', 2)],
      cotton: [matTile('cotton', 1)],
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.pendingDevelopChoice).toBeNull()
    // Pottery untouched (both tiles remain), cotton's tile removed.
    expect(matQty(actor, seller, 'pottery')).toBe(2)
    expect(matQty(actor, seller, 'cotton')).toBe(0)
  })
})
