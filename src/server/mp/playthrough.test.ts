// A realistic two-seat networked opening driven ENTIRELY through `applyIntent`
// — every event passes the same whitelist/turn/guard path as a production
// POST /api/mp/act, and no TEST_* event ever fires. The script is adaptive
// (the deck and the merchant tiles shuffle per game), yet it always reaches
// BOTH source pickers:
//   - selling.choosingBeerSource   (own brewery vs the merchant's barrel)
//   - developing.choosingIronSource (two unflipped iron works on the board)
// This is the exact move plan e2e/mp-playthrough.spec.ts replays through the
// UI in two real browsers; validating it here keeps that (DB-backed, slower)
// journey honest and pins the engine side without a database.
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import { pendingDevelopBonusChoice } from '../../store/shared/developBonus'
import {
  pendingBeerChoice,
  pendingIronChoice,
} from '../../store/shared/resourceSources'
import {
  pickBreweryCity,
  pickCottonPlan,
  pickIronPlan,
} from '../../test/mp-opening-plan'
import { applyIntent } from './intent'

/* ----- the wire ----- */

type Ctx = ReturnType<
  ReturnType<typeof createActor<typeof gameStore>>['getSnapshot']
>['context']

interface Table {
  state: unknown
  ctx: () => Ctx
  /** State value as a searchable string, e.g. to spot 'choosingBeerSource'. */
  at: () => string
  send: (seat: number, event: Record<string, unknown>) => void
  refuse: (seat: number, event: Record<string, unknown>) => string
}

const startTable = (): Table => {
  const actor = createActor(gameStore)
  actor.subscribe({ error: () => {} })
  actor.start()
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'Ada',
        color: 'red',
        character: 'Richard Arkwright',
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {},
      },
      {
        id: '2',
        name: 'Brunel',
        color: 'blue',
        character: 'Eliza Tinsley',
        money: 17,
        victoryPoints: 0,
        income: 10,
        industryTilesOnMat: {},
      },
    ],
  } as never)
  const table: Table = {
    state: actor.getPersistedSnapshot(),
    ctx: () => (table.state as { context: Ctx }).context,
    at: () => JSON.stringify((table.state as { value: unknown }).value),
    send: (seat, event) => {
      const res = applyIntent(table.state, seat, event as never)
      expect(
        res.ok,
        `seat ${seat} sent ${JSON.stringify(event)} and was refused: ${
          (res as { error?: string }).error
        } (at ${table.at()})`,
      ).toBe(true)
      table.state = (res as { next: unknown }).next
    },
    refuse: (seat, event) => {
      const res = applyIntent(table.state, seat, event as never)
      expect(res.ok, `expected a refusal for ${JSON.stringify(event)}`).toBe(
        false,
      )
      return (res as { error: string }).error
    },
  }
  actor.stop()
  return table
}

/* ----- hand access (this is the seat's OWN hand — visible on its wire) ----- */

const hand = (ctx: Ctx, seat: number) => ctx.players[seat]!.hand

const plainCardId = (ctx: Ctx, seat: number): string => {
  const card = hand(ctx, seat).find((c) => !c.type.startsWith('wild'))
  expect(card, 'a non-wild card to discard').toBeDefined()
  return card!.id
}

const wildCardId = (
  ctx: Ctx,
  seat: number,
  type: 'wild_location' | 'wild_industry',
): string => {
  const card = hand(ctx, seat).find((c) => c.type === type)
  expect(card, `${type} in hand (scout should have granted it)`).toBeDefined()
  return card!.id
}

/* ----- the playthrough ----- */

const unflippedIronWorks = (ctx: Ctx) =>
  ctx.players
    .flatMap((p) => p.industries)
    .filter((i) => i.type === 'iron' && !i.flipped && i.ironCubesOnTile > 0)

describe('networked playthrough — wire-legal events only, both pickers reached', () => {
  test('two seats open realistically; the seller faces the beer AND iron questions', () => {
    const table = startTable()
    const SELLER = 0
    const RIVAL = 1

    const cotton = pickCottonPlan(table.ctx().merchants)
    expect(
      cotton,
      'a beer-holding cotton merchant with an adjacent mill site',
    ).not.toBeNull()
    if (!cotton) return

    const iron = pickIronPlan(new Set([cotton.mill]))
    expect(iron, 'two linked iron-works sites near a merchant').not.toBeNull()
    if (!iron) return

    const brewery = pickBreweryCity(
      new Set([cotton.mill, iron.first, iron.second]),
    )
    expect(brewery, 'a brewery city clear of the other sites').toBeDefined()
    if (!brewery) return

    /** Answer an iron question if the machine stopped to ask one. */
    const answerIronIfAsked = () => {
      if (!table.at().includes('choosingIronSource')) return
      const choice = pendingIronChoice(table.ctx() as never)
      expect(choice?.options[0]).toBeDefined()
      table.send(SELLER, {
        type: 'SELECT_IRON_SOURCE',
        source: choice!.options[0]!.source,
      })
    }

    // Each closure performs ONE action for its seat. `ready` gates on public
    // board state; an unready seat passes and retries next turn.
    type Step = { ready?: () => boolean; run: (seat: number) => void }

    const buildWithWild = (
      seat: number,
      cardType: 'wild_location' | 'wild_industry',
      industryType: string,
      cityId: string,
      onIronStep?: () => void,
    ) => {
      table.send(seat, { type: 'BUILD' })
      table.send(seat, {
        type: 'SELECT_CARD',
        cardId: wildCardId(table.ctx(), seat, cardType),
      })
      table.send(seat, { type: 'SELECT_INDUSTRY_TYPE', industryType })
      table.send(seat, { type: 'SELECT_LOCATION', cityId })
      onIronStep?.()
      table.send(seat, { type: 'CONFIRM' })
    }

    const network = (seat: number, from: string, to: string) => {
      table.send(seat, { type: 'NETWORK' })
      table.send(seat, {
        type: 'SELECT_CARD',
        cardId: plainCardId(table.ctx(), seat),
      })
      table.send(seat, { type: 'SELECT_LINK', from, to })
      table.send(seat, { type: 'CONFIRM' })
    }

    const loan = (seat: number) => {
      table.send(seat, { type: 'TAKE_LOAN' })
      table.send(seat, {
        type: 'SELECT_CARD',
        cardId: plainCardId(table.ctx(), seat),
      })
      table.send(seat, { type: 'CONFIRM' })
    }

    const scout = (seat: number) => {
      table.send(seat, { type: 'SCOUT' })
      for (let i = 0; i < 3; i++) {
        table.send(seat, {
          type: 'SELECT_CARD',
          cardId: hand(table.ctx(), seat).filter(
            (c) => !c.type.startsWith('wild'),
          )[i]!.id,
        })
      }
      table.send(seat, { type: 'CONFIRM' })
    }

    let beerOptionsSeen = 0
    let ironOptionsSeen = 0

    const sellerSteps: Step[] = [
      { run: (s) => network(s, cotton.mill, cotton.merchant) },
      { run: loan },
      { run: scout },
      {
        run: (s) =>
          buildWithWild(s, 'wild_location', 'brewery', brewery, () =>
            answerIronIfAsked(),
          ),
      },
      { run: (s) => buildWithWild(s, 'wild_industry', 'cotton', cotton.mill) },
      {
        // The headline: staging the sale must STOP at the beer question.
        // Merchants are PER-SLOT entries (a location can appear twice, one
        // slot blank) — gate on the cotton-buying slot, not the first entry.
        ready: () =>
          table
            .ctx()
            .merchants.some(
              (m) =>
                m.location === cotton.merchant &&
                m.hasBeer &&
                m.industryIcons.includes('cotton'),
            ),
        run: (s) => {
          table.send(s, { type: 'SELL' })
          table.send(s, {
            type: 'SELECT_CARD',
            cardId: plainCardId(table.ctx(), s),
          })
          table.send(s, {
            type: 'SELECT_SALE',
            location: cotton.mill,
            industryType: 'cotton',
            merchant: cotton.merchant,
          })
          expect(
            table.at(),
            'the sale must stop at the beer question, not auto-pick',
          ).toContain('choosingBeerSource')

          const choice = pendingBeerChoice(table.ctx() as never)
          expect(choice?.hasChoice).toBe(true)
          beerOptionsSeen = choice!.options.length
          expect(beerOptionsSeen).toBeGreaterThanOrEqual(2)

          // A forged pick — a brewery nobody built — is refused BY NAME.
          const error = table.refuse(s, {
            type: 'SELECT_BEER_SOURCE',
            source: { kind: 'brewery', ownerId: '1', location: 'birmingham' },
          })
          expect(error).toBe(
            'That beer source is not available for this action.',
          )

          // The legal pick executes the sale on the last (only) barrel.
          const barrelsBefore = table
            .ctx()
            .merchants.filter(
              (m) => m.location === cotton.merchant && m.hasBeer,
            ).length
          table.send(s, {
            type: 'SELECT_BEER_SOURCE',
            source: { kind: 'merchant', location: cotton.merchant },
          })
          const me = table.ctx().players[s]!
          expect(
            me.industries.find(
              (i) => i.location === cotton.mill && i.type === 'cotton',
            )!.flipped,
          ).toBe(true)
          expect(
            table
              .ctx()
              .merchants.filter(
                (m) => m.location === cotton.merchant && m.hasBeer,
              ).length,
          ).toBe(barrelsBefore - 1)
          // Selling to a develop merchant (Gloucester) grants a develop bonus:
          // with a full mat the wire stops here for the tile choice. Send the
          // pick before confirming — a CONFIRM would be refused mid-choice.
          if (table.at().includes('choosingDevelopTile')) {
            const develop = pendingDevelopBonusChoice(
              table.ctx().players[s]!.industryTilesOnMat,
              table.ctx().pendingDevelopChoice?.remaining,
            )
            expect(develop?.hasChoice).toBe(true)
            table.send(s, {
              type: 'SELECT_DEVELOP_TILE',
              industryType: develop!.options[0]!.industryType,
            })
          }
          table.send(s, { type: 'CONFIRM' })
        },
      },
      {
        // Develop only once BOTH rival works stand — that's what makes iron a
        // genuine question (the market is never offered while works hold iron).
        ready: () => unflippedIronWorks(table.ctx()).length >= 2,
        run: (s) => {
          table.send(s, { type: 'DEVELOP' })
          table.send(s, {
            type: 'SELECT_CARD',
            cardId: plainCardId(table.ctx(), s),
          })
          const mat = table.ctx().players[s]!.industryTilesOnMat
          const developable = (
            Object.keys(mat) as Array<keyof typeof mat>
          ).find(
            (t) =>
              t !== 'pottery' &&
              (mat[t] ?? []).some(
                (tile) =>
                  (tile as { quantityAvailable: number }).quantityAvailable > 0,
              ),
          )
          expect(developable).toBeDefined()
          table.send(s, {
            type: 'SELECT_TILES_FOR_DEVELOP',
            industryTypes: [developable],
          })
          expect(
            table.at(),
            'the develop must stop at the iron question, not auto-pick',
          ).toContain('choosingIronSource')

          const choice = pendingIronChoice(table.ctx() as never)
          expect(choice?.hasChoice).toBe(true)
          ironOptionsSeen = choice!.options.length
          expect(ironOptionsSeen).toBeGreaterThanOrEqual(2)
          // Rules p.5: the market is a fallback, never an alternative.
          expect(
            choice!.options.every((o) => o.source.kind === 'ironworks'),
          ).toBe(true)

          const rivals =
            choice!.options.find((o) => !o.own) ?? choice!.options[0]!
          table.send(s, { type: 'SELECT_IRON_SOURCE', source: rivals.source })
          table.send(s, { type: 'CONFIRM' })
        },
      },
    ]

    const rivalSteps: Step[] = [
      { run: (s) => network(s, iron.first, iron.market) },
      { run: loan },
      { run: scout },
      { run: (s) => buildWithWild(s, 'wild_location', 'iron', iron.first) },
      ...iron.extensionLinks.map((link) => ({
        run: (s: number) => network(s, link.from, link.to),
      })),
      { run: (s) => buildWithWild(s, 'wild_industry', 'iron', iron.second) },
    ]

    const queues: Record<number, Step[]> = { 0: sellerSteps, 1: rivalSteps }
    // Sanity: only a seat whose turn it is may act — the wire refuses others.
    expect(
      table.refuse(1 - table.ctx().currentPlayerIndex, { type: 'BUILD' }),
    ).toMatch(/^Not your turn/)

    for (
      let guard = 0;
      (queues[SELLER]!.length > 0 || queues[RIVAL]!.length > 0) && guard < 80;
      guard++
    ) {
      // The opening must resolve well inside the Canal Era — an era flip
      // wipes level-1 tiles and would turn the rest of the script into noise.
      expect(table.ctx().era, 'script must finish before the era ends').toBe(
        'canal',
      )
      const seat = table.ctx().currentPlayerIndex
      const queue = queues[seat]!
      const step = queue[0]
      if (!step || (step.ready && !step.ready())) {
        table.send(seat, { type: 'PASS' })
        continue
      }
      queue.shift()
      step.run(seat)
    }

    // The loop must have drained BOTH scripts — a stall means a step's
    // preconditions can never be met, which is exactly what this test hunts.
    expect(queues[SELLER]).toHaveLength(0)
    expect(queues[RIVAL]).toHaveLength(0)
    expect(beerOptionsSeen).toBeGreaterThanOrEqual(2)
    expect(ironOptionsSeen).toBeGreaterThanOrEqual(2)
  })
})
