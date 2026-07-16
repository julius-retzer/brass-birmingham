import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type Card } from '../data/cards'
import { getInitialPlayerIndustryTilesWithQuantities } from '../data/industryTiles'
import { gameStore } from './gameStore'

// Card-first flow: pick a hand card BEFORE choosing an action, then the
// machine offers the actions that card can start and carries the card into
// the normal per-action states (captain request 2026-07-16). The action-first
// order stays untouched — these tests pin both directions.

const locationCard: Card = {
  id: 'cf_loc_stoke',
  type: 'location',
  location: 'stoke',
  color: 'blue',
} as Card
const coalCard: Card = {
  id: 'cf_ind_coal',
  type: 'industry',
  industries: ['coal'],
} as Card
const ironCard: Card = {
  id: 'cf_ind_iron',
  type: 'industry',
  industries: ['iron'],
} as Card
const wildLocationCard: Card = {
  id: 'cf_wild_loc',
  type: 'wild_location',
} as Card
const wildIndustryCard: Card = {
  id: 'cf_wild_ind',
  type: 'wild_industry',
} as Card

const setupGame = (hand: Card[]) => {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'Test Player 1',
        money: 30,
        victoryPoints: 0,
        income: 10,
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
      {
        id: '2',
        name: 'Test Player 2',
        money: 30,
        victoryPoints: 0,
        income: 10,
        color: 'green' as const,
        character: 'Eliza Tinsley' as const,
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
    ],
  })
  const playerId = actor.getSnapshot().context.currentPlayerIndex
  actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId, hand })
  return { actor, playerId }
}

const isCardSelected = (actor: ReturnType<typeof createActor>) =>
  actor.getSnapshot().matches({ playing: { action: 'cardSelected' } })

describe('card-first flow — entering and leaving cardSelected', () => {
  test('selecting a card from idle enters cardSelected with the card held', () => {
    const { actor } = setupGame([coalCard, locationCard])
    expect(
      actor.getSnapshot().matches({ playing: { action: 'selectingAction' } }),
    ).toBe(true)
    expect(
      actor.getSnapshot().can({ type: 'SELECT_CARD', cardId: coalCard.id }),
    ).toBe(true)

    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'cardSelected' } })).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)
    // The shared selectCard action auto-picks the buildable tile for
    // industry cards — same context shape as the action-first order.
    expect(snapshot.context.selectedIndustryTile?.type).toBe('coal')
  })

  test('a card id not in the hand cannot start the card-first flow', () => {
    const { actor } = setupGame([coalCard])
    expect(
      actor.getSnapshot().can({ type: 'SELECT_CARD', cardId: 'not_in_hand' }),
    ).toBe(false)

    actor.send({ type: 'SELECT_CARD', cardId: 'not_in_hand' })
    expect(
      actor.getSnapshot().matches({ playing: { action: 'selectingAction' } }),
    ).toBe(true)
    expect(actor.getSnapshot().context.selectedCard).toBeNull()
  })

  test('clicking the held card again deselects it and returns to idle', () => {
    const { actor } = setupGame([coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    expect(isCardSelected(actor)).toBe(true)

    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })

  test('selecting a different card switches the held card in place', () => {
    const { actor } = setupGame([coalCard, ironCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    expect(actor.getSnapshot().context.selectedIndustryTile?.type).toBe('coal')

    actor.send({ type: 'SELECT_CARD', cardId: ironCard.id })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'cardSelected' } })).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(ironCard.id)
    expect(snapshot.context.selectedIndustryTile?.type).toBe('iron')
  })

  test('a bogus card id while holding a card is ignored', () => {
    const { actor } = setupGame([coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })

    actor.send({ type: 'SELECT_CARD', cardId: 'not_in_hand' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'cardSelected' } })).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)
  })

  test('CANCEL from cardSelected returns to idle and clears the selection', () => {
    const { actor } = setupGame([coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })

    actor.send({ type: 'CANCEL' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
    expect(snapshot.context.selectedCard).toBeNull()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
  })

  test('every card-consuming action is offered while a card is held; PASS is not', () => {
    const { actor } = setupGame([coalCard, ironCard, locationCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })

    const snapshot = actor.getSnapshot()
    expect(snapshot.can({ type: 'BUILD' })).toBe(true)
    expect(snapshot.can({ type: 'NETWORK' })).toBe(true)
    expect(snapshot.can({ type: 'DEVELOP' })).toBe(true)
    expect(snapshot.can({ type: 'SELL' })).toBe(true)
    expect(snapshot.can({ type: 'TAKE_LOAN' })).toBe(true)
    expect(snapshot.can({ type: 'SCOUT' })).toBe(true)
    // Pass plays no card — it stays an idle-only choice.
    expect(snapshot.can({ type: 'PASS' })).toBe(false)
  })
})

describe('card-first BUILD — routing matches the card type', () => {
  test('location card goes straight to the industry choice and completes', () => {
    const { actor, playerId } = setupGame([locationCard, coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    actor.send({ type: 'BUILD' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { building: 'selectingIndustryType' } },
      }),
    ).toBe(true)
    // The card is carried in — never re-asked.
    expect(snapshot.context.selectedCard?.id).toBe(locationCard.id)

    // Real location card: site is fixed, so industry choice confirms.
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' })
    snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { building: 'confirmingBuild' } },
      }),
    ).toBe(true)

    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    const player = snapshot.context.players[playerId]!
    expect(
      player.industries.some(
        (i) => i.location === 'stoke' && i.type === 'cotton',
      ),
    ).toBe(true)
    expect(player.hand.some((c) => c.id === locationCard.id)).toBe(false)
  })

  test('industry card goes straight to the site choice and completes', () => {
    const { actor, playerId } = setupGame([coalCard, locationCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'BUILD' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { building: 'selectingLocation' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)
    expect(snapshot.context.selectedIndustryTile?.type).toBe('coal')

    actor.send({ type: 'SELECT_LOCATION', cityId: 'coalbrookdale' })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    const player = snapshot.context.players[playerId]!
    expect(
      player.industries.some(
        (i) => i.location === 'coalbrookdale' && i.type === 'coal',
      ),
    ).toBe(true)
  })

  test('wild location card routes through the industry choice like action-first', () => {
    const { actor } = setupGame([wildLocationCard, coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: wildLocationCard.id })
    actor.send({ type: 'BUILD' })

    const snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { building: 'selectingIndustryType' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(wildLocationCard.id)
  })

  test('wild industry card routes through the industry choice like action-first', () => {
    const { actor } = setupGame([wildIndustryCard, coalCard])
    actor.send({ type: 'SELECT_CARD', cardId: wildIndustryCard.id })
    actor.send({ type: 'BUILD' })

    const snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { building: 'selectingIndustryType' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(wildIndustryCard.id)
  })
})

describe('card-first — remaining actions continue past the card step', () => {
  test('NETWORK goes straight to the link choice and completes', () => {
    const { actor, playerId } = setupGame([coalCard, ironCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'NETWORK' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { networking: 'selectingLink' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)

    actor.send({ type: 'SELECT_LINK', from: 'coalbrookdale', to: 'shrewsbury' })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    const player = snapshot.context.players[playerId]!
    expect(player.links.length).toBe(1)
    expect(player.hand.some((c) => c.id === coalCard.id)).toBe(false)
  })

  test('DEVELOP goes straight to the tile choice and completes', () => {
    const { actor, playerId } = setupGame([coalCard, ironCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'DEVELOP' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { developing: 'selectingTiles' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)

    actor.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['coal'] })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    expect(
      snapshot.context.players[playerId]!.hand.some(
        (c) => c.id === coalCard.id,
      ),
    ).toBe(false)
  })

  test('SELL goes straight to the sale choice with the card carried', () => {
    const { actor } = setupGame([coalCard, ironCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'SELL' })

    const snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({ playing: { action: { selling: 'selectingSale' } } }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)

    // Nothing on the board to sell — cancel unwinds without a discard.
    actor.send({ type: 'CANCEL' })
    expect(
      actor
        .getSnapshot()
        .matches({ playing: { action: { selling: 'selectingCard' } } }),
    ).toBe(true)
  })

  test('TAKE_LOAN goes straight to the confirm and discards the held card', () => {
    const { actor, playerId } = setupGame([coalCard, ironCard])
    const moneyBefore = actor.getSnapshot().context.players[playerId]!.money
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'TAKE_LOAN' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { takingLoan: 'confirmingLoan' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCard?.id).toBe(coalCard.id)

    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    const player = snapshot.context.players[playerId]!
    expect(player.money).toBe(moneyBefore + 30)
    expect(player.hand.some((c) => c.id === coalCard.id)).toBe(false)
  })

  test('SCOUT seeds the discard pick with the held card', () => {
    const { actor, playerId } = setupGame([coalCard, ironCard, locationCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'SCOUT' })

    let snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({
        playing: { action: { scouting: 'selectingCards' } },
      }),
    ).toBe(true)
    expect(snapshot.context.selectedCardsForScout.map((c) => c.id)).toEqual([
      coalCard.id,
    ])
    // The card moved into the scout pick — it is no longer "held".
    expect(snapshot.context.selectedCard).toBeNull()

    actor.send({ type: 'SELECT_CARD', cardId: ironCard.id })
    actor.send({ type: 'SELECT_CARD', cardId: locationCard.id })
    actor.send({ type: 'CONFIRM' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    const player = snapshot.context.players[playerId]!
    expect(player.hand.some((c) => c.type === 'wild_location')).toBe(true)
    expect(player.hand.some((c) => c.type === 'wild_industry')).toBe(true)
    expect(player.hand.some((c) => c.id === coalCard.id)).toBe(false)
  })

  test('SCOUT cancel returns the whole selection to idle', () => {
    const { actor } = setupGame([coalCard, ironCard, locationCard])
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'SCOUT' })
    actor.send({ type: 'CANCEL' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )
    expect(snapshot.context.selectedCardsForScout).toEqual([])
    expect(snapshot.context.selectedCard).toBeNull()
  })
})

describe('action-first flow — unchanged by the card-first entry', () => {
  test('BUILD from idle still asks for the card first', () => {
    const { actor } = setupGame([coalCard, locationCard])
    actor.send({ type: 'BUILD' })

    const snapshot = actor.getSnapshot()
    expect(
      snapshot.matches({ playing: { action: { building: 'selectingCard' } } }),
    ).toBe(true)
    expect(snapshot.context.selectedCard).toBeNull()
  })

  test('action-first loan still works end to end', () => {
    const { actor, playerId } = setupGame([coalCard, ironCard])
    const moneyBefore = actor.getSnapshot().context.players[playerId]!.money
    actor.send({ type: 'TAKE_LOAN' })
    actor.send({ type: 'SELECT_CARD', cardId: coalCard.id })
    actor.send({ type: 'CONFIRM' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.players[playerId]!.money).toBe(moneyBefore + 30)
  })
})
