// Captain bug report 2026-07-15: the Build wizard reached an ENABLED
// confirm for BREWERY at BIRMINGHAM (no brewery slot). The machine's
// location-card transition bypassed canSelectIndustryType (guard order),
// so `can(SELECT_INDUSTRY_TYPE)` said yes and surfaced (multiplayer, no
// deep probes) as a live confirm button. These tests pin the fixed guard
// on every wizard path.
//
// Follow-up 2026-07-21: the "execution backstop" the original comment
// relied on did NOT exist — buildIndustryTile (the placement primitive)
// validated era/overbuild/resources/funds but NOT slot-type
// compatibility, so any caller reaching it would drop a brewery onto
// Birmingham. It now rejects a slotless placement; pinned below.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { buildIndustryTile } from './build/buildActions'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
].map((p) => ({
  ...p,
  money: 30,
  victoryPoints: 0,
  income: 10,
  industryTilesOnMat: {},
}))

type AnySnap = {
  can: (e: unknown) => boolean
  matches: (s: unknown) => boolean
  context: {
    lastError: string | null
    players: Array<{ industries: Array<{ type: string; location: string }> }>
  }
}

const startWithHand = (hand: unknown[]) => {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: PLAYERS } as never)
  actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand } as never)
  return actor
}

const locationCard = (id: string, location: string) => ({
  id,
  type: 'location',
  location,
  color: 'other',
  minPlayers: 2,
})

const snap = (a: ReturnType<typeof createActor>) =>
  a.getSnapshot() as unknown as AnySnap

describe('build wizard slot guard (brewery@Birmingham bug)', () => {
  it('location card: an industry without a slot at the city is refused at the INDUSTRY step', () => {
    const a = startWithHand([locationCard('birmingham_x', 'birmingham')])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'birmingham_x' } as never)

    // Birmingham has no brewery, coal, cotton-free... its slots allow
    // cotton/manufacturer/iron only — brewery must be refused HERE.
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' }),
    ).toBe(false)

    // Forcing the event anyway must NOT move the machine to confirm.
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as never)
    expect(
      snap(a).matches({
        playing: { action: { building: 'selectingIndustryType' } },
      }),
    ).toBe(true)

    // A slot-compatible industry still passes (cotton needs no coal).
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' }),
    ).toBe(true)
    a.stop()
  })

  it('location card: brewery at a city WITH a brewery slot builds end-to-end', () => {
    // Burton has a dedicated brewery slot; brewery L1 needs 1 iron, always
    // purchasable from the market.
    const a = startWithHand([locationCard('burton_x', 'burton')])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'burton_x' } as never)
    expect(
      snap(a).can({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' }),
    ).toBe(true)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as never)
    a.send({ type: 'CONFIRM' } as never)
    const s = snap(a)
    expect(s.context.lastError).toBeNull()
    expect(s.context.players[0]!.industries).toStrictEqual([
      expect.objectContaining({ type: 'brewery', location: 'burton' }),
    ])
    a.stop()
  })

  it('industry card path already refuses a slotless site at the SITE step', () => {
    const a = startWithHand([
      {
        id: 'brewery_card_x',
        type: 'industry',
        industries: ['brewery'],
        minPlayers: 2,
      },
    ])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'brewery_card_x' } as never)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as never)
    expect(snap(a).can({ type: 'SELECT_LOCATION', cityId: 'birmingham' })).toBe(
      false,
    )
    expect(snap(a).can({ type: 'SELECT_LOCATION', cityId: 'burton' })).toBe(
      true,
    )
    a.stop()
  })

  it('wild-location card: brewery is refused at every slotless city', () => {
    // Wild location can pick ANY city, so it must still be blocked from a
    // brewery at a city with no brewery slot (Birmingham).
    const a = startWithHand([{ id: 'wl_1', type: 'wild_location' }])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'wl_1' } as never)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as never)
    expect(snap(a).can({ type: 'SELECT_LOCATION', cityId: 'birmingham' })).toBe(
      false,
    )
    // ...but a real brewery city is reachable.
    expect(snap(a).can({ type: 'SELECT_LOCATION', cityId: 'burton' })).toBe(
      true,
    )
    a.stop()
  })

  it('placement primitive REJECTS brewery@Birmingham (the real execution backstop)', () => {
    // buildIndustryTile is the tile-placement primitive: era, overbuild,
    // resources and funds were validated, but slot-type compatibility was
    // NOT — so calling it with a brewery + Birmingham silently placed a
    // brewery on a city that has no brewery slot. It must throw instead.
    const a = startWithHand([])
    const ctx = a.getSnapshot().context as never as {
      players: Array<{
        hand: unknown[]
        industryTilesOnMat: Record<string, Array<{ tile: unknown }>>
      }>
    }
    const player = ctx.players[0]!
    const breweryTile = player.industryTilesOnMat.brewery![0]!.tile
    const context = {
      ...ctx,
      era: 'canal',
      selectedLocation: 'birmingham',
      selectedIndustryTile: breweryTile,
    } as never

    expect(() =>
      buildIndustryTile(context, player as never, breweryTile as never, [], []),
    ).toThrow(/no compatible slot/)
    a.stop()
  })

  it('placement primitive still allows a legal Birmingham build (cotton)', () => {
    const a = startWithHand([])
    const ctx = a.getSnapshot().context as never as {
      players: Array<{
        hand: unknown[]
        industryTilesOnMat: Record<string, Array<{ tile: unknown }>>
      }>
    }
    const player = ctx.players[0]!
    const cottonTile = player.industryTilesOnMat.cotton![0]!.tile
    const context = {
      ...ctx,
      era: 'canal',
      selectedCard: locationCard('birmingham_x', 'birmingham'),
      selectedLocation: 'birmingham',
      selectedIndustryTile: cottonTile,
    } as never

    const result = buildIndustryTile(
      context,
      player as never,
      cottonTile as never,
      [],
      [],
    )
    expect(
      result.updatedPlayer.industries.some(
        (i) => i.type === 'cotton' && i.location === 'birmingham',
      ),
    ).toBe(true)
    a.stop()
  })

  it('execution backstop: a full CONFIRM of a legal build still succeeds', () => {
    const a = startWithHand([locationCard('birmingham_x', 'birmingham')])
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'birmingham_x' } as never)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'cotton' } as never)
    a.send({ type: 'CONFIRM' } as never)
    expect(snap(a).context.lastError).toBeNull()
    expect(snap(a).context.players[0]!.industries).toHaveLength(1)
    a.stop()
  })
})
