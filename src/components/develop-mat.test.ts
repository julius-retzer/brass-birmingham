// The develop-mode mat view — machine-driven, no DOM (vitest runs node env).
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '~/store/gameStore'
import { developMatView, stagedRemovals } from './develop-mat'

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

const snap = (actor: ReturnType<typeof createActor>) =>
  actor.getSnapshot() as never as Parameters<typeof developMatView>[0]

const enterTileStep = (actor: ReturnType<typeof createActor>) => {
  const s = actor.getSnapshot() as never as Parameters<typeof developMatView>[0]
  const card = s.context.players[s.context.currentPlayerIndex]!.hand[0]!
  actor.send({ type: 'DEVELOP' })
  actor.send({ type: 'SELECT_CARD', cardId: card.id })
}

describe('developMatView', () => {
  test('null outside the develop tile steps', () => {
    const actor = setupGame()
    expect(developMatView(snap(actor))).toBeNull()
    actor.send({ type: 'DEVELOP' })
    // Card step: the hand tray is the surface, not the mat.
    expect(developMatView(snap(actor))).toBeNull()
  })

  test('tile step: picks delegate to the guard, events carry staged + one', () => {
    const actor = setupGame()
    enterTileStep(actor)
    const view = developMatView(snap(actor))!
    expect(view.step).toBe('tiles')
    expect(view.staged).toEqual([])
    expect(view.canPick('coal')).toBe(true)
    expect(view.pickEvent('coal')).toEqual({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal'],
    })
  })

  test('a staged pick grows the next pick event; unstaging the last is a CANCEL', () => {
    const actor = setupGame()
    enterTileStep(actor)
    actor.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal'],
    })
    // No iron works on a fresh board — the iron step auto-skips to confirm.
    const view = developMatView(snap(actor))!
    expect(view.step).toBe('confirm')
    expect(view.staged).toEqual(['coal'])
    expect(view.pickEvent('iron')).toEqual({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal', 'iron'],
    })
    expect(view.unstageEvent(0)).toEqual({ type: 'CANCEL' })
    expect(view.canConfirm).toBe(true)

    actor.send({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal', 'iron'],
    })
    const two = developMatView(snap(actor))!
    expect(two.staged).toEqual(['coal', 'iron'])
    // A third pick is refused by the machine, with the engine's reason.
    expect(two.canPick('cotton')).toBe(false)
    expect(two.pickReason('cotton')).toMatch(/at most two/i)
    expect(two.unstageEvent(1)).toEqual({
      type: 'SELECT_TILES_FOR_DEVELOP',
      industryTypes: ['coal'],
    })
  })

  test('a lightbulb-only pottery track is refused with the rulebook reason', () => {
    const actor = setupGame()
    const s0 = snap(actor)
    const idx = s0.context.currentPlayerIndex
    const mat = s0.context.players[idx]!.industryTilesOnMat
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: idx,
      industryTilesOnMat: {
        ...mat,
        pottery: (mat.pottery ?? []).filter(
          (t: { tile: { hasLightbulbIcon: boolean } }) =>
            t.tile.hasLightbulbIcon,
        ),
      },
    } as never)
    enterTileStep(actor)
    const view = developMatView(snap(actor))!
    expect(view.canPick('pottery')).toBe(false)
    expect(view.pickReason('pottery')).toMatch(/lightbulb/i)
  })
})

describe('stagedRemovals — the preview of which tiles peel off', () => {
  const mat = {
    coal: [
      {
        tile: {
          id: 'coal_1',
          level: 1,
          type: 'coal' as const,
          hasLightbulbIcon: false,
        },
        quantityAvailable: 1,
      },
      {
        tile: {
          id: 'coal_2',
          level: 2,
          type: 'coal' as const,
          hasLightbulbIcon: false,
        },
        quantityAvailable: 2,
      },
    ],
    pottery: [
      {
        tile: {
          id: 'pottery_1',
          level: 1,
          type: 'pottery' as const,
          hasLightbulbIcon: true,
        },
        quantityAvailable: 1,
      },
      {
        tile: {
          id: 'pottery_2',
          level: 2,
          type: 'pottery' as const,
          hasLightbulbIcon: false,
        },
        quantityAvailable: 1,
      },
    ],
  }

  test('two picks of one track walk up the levels, lowest first', () => {
    expect(stagedRemovals(mat, ['coal', 'coal'])).toEqual([
      { type: 'coal', tileId: 'coal_1', level: 1 },
      { type: 'coal', tileId: 'coal_2', level: 2 },
    ])
  })

  test('lightbulb pottery is skipped — the pick lands on the level 2', () => {
    expect(stagedRemovals(mat, ['pottery'])).toEqual([
      { type: 'pottery', tileId: 'pottery_2', level: 2 },
    ])
  })

  test('quantity is respected: a second pick of the same tile id needs stock', () => {
    expect(stagedRemovals(mat, ['pottery', 'pottery'])).toEqual([
      { type: 'pottery', tileId: 'pottery_2', level: 2 },
    ])
  })
})
