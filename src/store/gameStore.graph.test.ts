// Statechart-SHAPE regression tests.
//
// Every other engine suite pins BEHAVIOUR: given this fixture and these
// events, expect this outcome. This one pins the machine's shape — it walks
// the real chart with @xstate/graph and asserts invariants over every wizard
// state it can reach, so a new action flow is covered the day it is added
// rather than the day someone remembers to hand-write its cases.
//
// The alphabet comes from `candidateMoves` (the AI's own candidate generator)
// so payload-bearing events carry real, fixture-derived payloads — card ids
// from the dealt hand, real cities, real connections. Legality is left to
// `filterEvents: (s, e) => s.can(e)`, which is the engine's own guards, so the
// traversal only ever walks transitions a real player could take.
import { createActor, initialTransition, transition } from 'xstate'
import { getShortestPaths } from 'xstate/graph'
import { describe, expect, it } from 'vitest'
import { connections } from '../data/board'
import { candidateMoves } from '../server/ai/legal-moves'
import { type GameEvent, type GameStoreSnapshot, gameStore } from './gameStore'

/** A 2-player table, dealt and started by the machine itself. */
function startedGame(): GameStoreSnapshot {
  const [initial] = initialTransition(gameStore)
  const [started] = transition(gameStore, initial, {
    type: 'START_GAME',
    players: [
      { id: 'p1', name: 'Alice', color: 'red' },
      { id: 'p2', name: 'Bob', color: 'blue' },
    ],
  } as never)
  return started as GameStoreSnapshot
}

const stateValue = (s: GameStoreSnapshot) => JSON.stringify(s.value)

/**
 * The wizard states: everything under `playing.action` that is not the action
 * chooser itself. These are the states a player can get stranded in.
 */
const isWizardState = (s: GameStoreSnapshot) =>
  s.matches({ playing: 'action' } as never) &&
  !s.matches({ playing: { action: 'selectingAction' } } as never)

/**
 * Walk the real chart from a started game.
 *
 * The state space has to be bounded or it is effectively infinite: context
 * (money, hands, the whole board) is part of a snapshot, so a context-keyed
 * traversal treats "selectingAction with £30" and "selectingAction with £29"
 * as different nodes and never terminates — with the full candidate alphabet
 * it blows the limit immediately. These are SHAPE tests, so nodes are keyed on
 * the state VALUE alone: each distinct wizard state is visited once, by
 * whichever context reached it first. `stopWhen` additionally cuts a path off
 * once the turn passes to the other seat (the invariants here are about one
 * player's action, not about turn order), and `limit` is a hard backstop.
 */
function sweep(from: GameStoreSnapshot) {
  const seat = from.context.currentPlayerIndex
  return getShortestPaths(gameStore, {
    fromState: from as never,
    events: (state) =>
      candidateMoves(state as GameStoreSnapshot).map((m) => m.event) as never[],
    filterEvents: (state, event) =>
      (state as GameStoreSnapshot).can(event as never),
    serializeState: (state) => stateValue(state as GameStoreSnapshot),
    stopWhen: (state) =>
      (state as GameStoreSnapshot).context.currentPlayerIndex !== seat,
    limit: 5000,
  })
}

describe('statechart shape: what the chart itself guarantees', () => {
  const started = startedGame()

  it('the sweep reaches a broad slice of the action wizard', () => {
    const paths = sweep(started)
    const values = new Set(paths.map((p) => stateValue(p.state as never)))
    const wizards = paths.filter((p) => isWizardState(p.state as never))
    console.log(
      `[graph] ${paths.length} paths, ${values.size} distinct state values, ` +
        `${wizards.length} wizard states`,
    )
    // Floors, not targets: they exist so the sweep cannot silently collapse to
    // nothing (a bad fixture, an alphabet regression) and quietly pass every
    // invariant below. Raise them if the chart genuinely grows.
    expect(values.size).toBeGreaterThanOrEqual(15)
    expect(wizards.length).toBeGreaterThanOrEqual(12)
    // Each top-level action must be reachable from a fresh table.
    for (const branch of [
      'building',
      'developing',
      'selling',
      'networking',
      'takingLoan',
      'scouting',
    ]) {
      expect(
        paths.some((p) =>
          (p.state as GameStoreSnapshot).matches({
            playing: { action: branch },
          } as never),
        ),
        `no path reaches playing.action.${branch}`,
      ).toBe(true)
    }
  })

  it('every reachable wizard state can CANCEL back to the action chooser, without consuming the action', () => {
    const paths = sweep(started)
    const violations: string[] = []
    const checked = new Set<string>()

    for (const path of paths) {
      const state = path.state as GameStoreSnapshot
      if (!isWizardState(state)) continue
      const key = stateValue(state)
      if (checked.has(key)) continue
      checked.add(key)

      // Unwind: CANCEL repeatedly until we are back at the chooser.
      let s = state
      let hops = 0
      while (
        hops < 6 &&
        !s.matches({ playing: { action: 'selectingAction' } } as never)
      ) {
        if (!s.can({ type: 'CANCEL' } as never)) break
        s = transition(
          gameStore,
          s as never,
          {
            type: 'CANCEL',
          } as never,
        )[0] as GameStoreSnapshot
        hops++
      }
      if (!s.matches({ playing: { action: 'selectingAction' } } as never)) {
        violations.push(`${key}: no CANCEL route back (stuck after ${hops})`)
        continue
      }
      // Unwinding must not have cost the player their action or their turn.
      if (s.context.actionsRemaining !== state.context.actionsRemaining) {
        violations.push(
          `${key}: CANCEL consumed an action ` +
            `(${state.context.actionsRemaining} → ${s.context.actionsRemaining})`,
        )
      }
      if (s.context.currentPlayerIndex !== state.context.currentPlayerIndex) {
        violations.push(`${key}: CANCEL passed the turn`)
      }
    }

    console.log(`[graph] CANCEL-unwind: ${checked.size} wizard states checked`)
    expect(checked.size).toBeGreaterThan(10)
    expect(violations).toEqual([])
  })

  it('no reachable state is a dead end: some legal event always exists', () => {
    const paths = sweep(started)
    const stuck = paths
      .filter((p) => {
        const s = p.state as GameStoreSnapshot
        if (s.status === 'done') return false
        return candidateMoves(s).every((m) => !s.can(m.event as never))
      })
      .map((p) => stateValue(p.state as never))
    expect([...new Set(stuck)]).toEqual([])
  })

  it('CANCEL is never offered at the action chooser (nothing to unwind)', () => {
    const paths = sweep(started)
    const offending = paths
      .filter((p) => {
        const s = p.state as GameStoreSnapshot
        return (
          s.matches({ playing: { action: 'selectingAction' } } as never) &&
          s.can({ type: 'CANCEL' } as never)
        )
      })
      .map((p) => stateValue(p.state as never))
    expect([...new Set(offending)]).toEqual([])
  })

  it('the source-choice steps auto-skip transparently when there is no real choice', () => {
    // CLAUDE.md states the choosing states are entered and skipped invisibly
    // when <2 materially distinct sources exist. If that ever stopped being
    // transparent, a sweep would surface a settled snapshot sitting in one of
    // them with no choice to make — assert it never does.
    const paths = sweep(started)
    const stalled = paths
      .filter((p) => {
        const s = p.state as GameStoreSnapshot
        const inChoice =
          s.matches({
            playing: { action: { building: 'choosingIronSource' } },
          } as never) ||
          s.matches({
            playing: { action: { developing: 'choosingIronSource' } },
          } as never) ||
          s.matches({
            playing: { action: { selling: 'choosingBeerSource' } },
          } as never)
        if (!inChoice) return false
        // Settled here => there must be a real pick available to make.
        return !candidateMoves(s).some(
          (m) =>
            (m.event.type === 'SELECT_IRON_SOURCE' ||
              m.event.type === 'SELECT_BEER_SOURCE') &&
            s.can(m.event as never),
        )
      })
      .map((p) => stateValue(p.state as never))
    expect([...new Set(stalled)]).toEqual([])
  })

  it('never accepts a route that is not a real edge carrying the current era', () => {
    // The era and board-graph checks moved OUT of the UI/AI filters and into
    // `canBuildLink`. The alphabet now offers every connection in both eras, so
    // this sweep is what proves the guard — not a caller — does the rejecting.
    const paths = sweep(started)
    const violations: string[] = []
    for (const p of paths) {
      const s = p.state as GameStoreSnapshot
      if (s.status === 'done') continue
      for (const move of candidateMoves(s)) {
        const event = move.event as GameEvent
        if (
          event.type !== 'SELECT_LINK' &&
          event.type !== 'SELECT_SECOND_LINK'
        ) {
          continue
        }
        if (!s.can(event as never)) continue
        const conn = connections.find(
          (c) =>
            (c.from === event.from && c.to === event.to) ||
            (c.from === event.to && c.to === event.from),
        )
        if (!conn) {
          violations.push(`${event.from}-${event.to} is not a board edge`)
        } else if (!(conn.types as readonly string[]).includes(s.context.era)) {
          violations.push(
            `${event.from}-${event.to} accepted in the ${s.context.era} era`,
          )
        }
      }
    }
    expect([...new Set(violations)]).toEqual([])
  })

  it('every accepted build site is confirmable (no dead confirm)', () => {
    // canSelectLocation owns completability, so a site the machine offers must
    // survive through to a CONFIRM the machine also accepts.
    const paths = sweep(started)
    const violations: string[] = []
    let checked = 0
    for (const p of paths) {
      const s = p.state as GameStoreSnapshot
      if (
        s.status === 'done' ||
        !s.matches({
          playing: { action: { building: 'selectingLocation' } },
        } as never)
      ) {
        continue
      }
      for (const move of candidateMoves(s)) {
        const event = move.event as GameEvent
        if (event.type !== 'SELECT_LOCATION') continue
        if (!s.can(event as never)) continue
        checked += 1
        const after = transition(gameStore, s as never, event as never)[0] as
          | GameStoreSnapshot
          | undefined
        if (!after?.can({ type: 'CONFIRM' } as never)) {
          violations.push(`${event.cityId} offered but CONFIRM refused`)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect([...new Set(violations)]).toEqual([])
  })

  it('the alphabet stays honest: every candidate event is one the machine declares', () => {
    // candidateMoves is hand-maintained; if an event type is renamed in the
    // machine the generator would silently stop reaching that branch. Compare
    // against the chart's own declared event types.
    const declared = new Set<string>(gameStore.events)
    const generated = new Set(
      candidateMoves(started).map((m) => (m.event as GameEvent).type),
    )
    const unknown = [...generated].filter((t) => !declared.has(t))
    expect(unknown).toEqual([])
  })
})

describe('the chart boots and ends where it says it does', () => {
  it('a fresh machine starts in setup and only START_GAME leaves it', () => {
    const [initial] = initialTransition(gameStore)
    expect(initial.matches('setup' as never)).toBe(true)
    const s = initial as GameStoreSnapshot
    for (const e of [
      { type: 'BUILD' },
      { type: 'PASS' },
      { type: 'CONFIRM' },
      { type: 'CANCEL' },
    ]) {
      expect(s.can(e as never), `${e.type} must not leave setup`).toBe(false)
    }
    expect(startedGame().matches({ playing: 'action' } as never)).toBe(true)
  })

  it('gameOver is declared final, and is the only final state', () => {
    // A real game only reaches gameOver through the nextPlayer era-end guards
    // (TRIGGER_RAIL_ERA_END is an action, not a target — it logs the end but
    // does not move the chart), so assert the shape from the chart itself.
    const finals = Object.entries(gameStore.states)
      .filter(([, node]) => node.type === 'final')
      .map(([id]) => id)
    expect(finals).toEqual(['gameOver'])
  })

  it('a finished game accepts nothing further', () => {
    const done = gameStore.resolveState({
      value: 'gameOver',
      context: startedGame().context,
      status: 'done',
    })
    expect(done.status).toBe('done')
    for (const e of [
      { type: 'BUILD' },
      { type: 'PASS' },
      { type: 'CONFIRM' },
    ]) {
      expect(
        done.can(e as never),
        `${e.type} must not revive a finished game`,
      ).toBe(false)
    }
  })
})
