// Driver contract: model choices are validated by EXECUTION on the engine,
// illegal picks are retried with the error appended (max 3 calls), and a
// deterministic fallback keeps the game moving when the model keeps failing.
import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from '../../store/gameStore'
import {
  MAX_MODEL_CALLS_PER_DECISION,
  aiDecideAndApply,
  tryApplyEvent,
} from './driver'
import { mockProvider } from './provider'
import {
  AI_TIERS,
  type AiChatMessage,
  type AiProvider,
  type AiProviderResult,
} from './types'

const startPlayers = [
  {
    id: '1',
    name: 'Ada',
    color: 'red' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
  {
    id: '2',
    name: 'Brunel',
    color: 'blue' as const,
    character: 'Isambard Kingdom Brunel' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
]

const tier = AI_TIERS.foreman

function freshPersisted(): { persisted: unknown; seatIndex: number } {
  const actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: startPlayers })
  const persisted = actor.getPersistedSnapshot()
  const seatIndex = actor.getSnapshot().context.currentPlayerIndex
  actor.stop()
  return { persisted, seatIndex }
}

const ctxOf = (persisted: unknown) =>
  (
    persisted as {
      context: {
        currentPlayerIndex: number
        actionsRemaining: number
        round: number
        players: Array<{ money: number; income: number; hand: unknown[] }>
      }
    }
  ).context

/** Provider scripted per-call; captures the conversations it was given. */
function scriptedProvider(
  script: Array<Partial<AiProviderResult>>,
): AiProvider & { seen: AiChatMessage[][] } {
  let call = 0
  const seen: AiChatMessage[][] = []
  return {
    seen,
    async decide({ messages }) {
      seen.push(messages.map((m) => ({ ...m })))
      const step = script[Math.min(call, script.length - 1)]
      call += 1
      return {
        choice: null,
        usage: { inputTokens: 100, outputTokens: 20 },
        raw: 'scripted',
        ...step,
      } as AiProviderResult
    },
  }
}

async function runWholeTurn(
  persisted: unknown,
  seatIndex: number,
  provider: AiProvider,
) {
  const outcomes = []
  let current = persisted
  for (let i = 0; i < 40; i++) {
    const ctx = ctxOf(current)
    if (ctx.currentPlayerIndex !== seatIndex) break
    const outcome = await aiDecideAndApply({
      persisted: current,
      seatIndex,
      provider,
      tier,
    })
    outcomes.push(outcome)
    current = outcome.snapshot
  }
  return { outcomes, persisted: current }
}

describe('tryApplyEvent', () => {
  test('accepts a guard-legal event and returns the next snapshot', () => {
    const { persisted } = freshPersisted()
    const result = tryApplyEvent(persisted, { type: 'TAKE_LOAN' })
    expect(result.ok).toBe(true)
    expect(result.next).toBeTruthy()
  })

  test('rejects an event the machine does not accept', () => {
    const { persisted } = freshPersisted()
    const result = tryApplyEvent(persisted, { type: 'CONFIRM' })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('aiDecideAndApply', () => {
  test('mock provider plays a full loan turn: loan → card → auto-confirm', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const { outcomes, persisted: after } = await runWholeTurn(
      persisted,
      seatIndex,
      mockProvider,
    )
    // decision 1: TAKE_LOAN (model), decision 2: card (model),
    // decision 3: confirm (auto — no model call)
    expect(outcomes.map((o) => o.move.event.type)).toEqual([
      'TAKE_LOAN',
      'SELECT_CARD',
      'CONFIRM',
    ])
    expect(outcomes[0]!.rationale).toBe('Mock rationale.')
    expect(outcomes[2]!.auto).toBe(true)
    expect(outcomes[2]!.usage.calls).toBe(0)
    const ctx = ctxOf(after)
    expect(ctx.players[seatIndex]!.money).toBe(47)
    expect(ctx.players[seatIndex]!.income).toBe(-3)
    // turn ended (round 1 has a single action)
    expect(ctx.currentPlayerIndex).not.toBe(seatIndex)
  })

  test('an out-of-range pick is retried with the error appended', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: { moveIndex: 999, rationale: 'nonsense' }, raw: 'try-1' },
      { choice: { moveIndex: 6, rationale: 'passing now' }, raw: 'try-2' },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    expect(outcome.attempts).toBe(2)
    expect(outcome.fallback).toBe(false)
    expect(outcome.usage.calls).toBe(2)
    // the retry conversation contains the first answer and the error
    const retryMessages = provider.seen[1]!
    expect(retryMessages.some((m) => m.content === 'try-1')).toBe(true)
    expect(retryMessages.some((m) => m.content.includes('moveIndex 999'))).toBe(
      true,
    )
  })

  test('an unparseable answer is retried with a parse error', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: null, error: 'The answer was not JSON.', raw: 'gibberish' },
      { choice: { moveIndex: 6, rationale: 'pass' } },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    expect(outcome.attempts).toBe(2)
    expect(
      provider.seen[1]!.some((m) =>
        m.content.includes('The answer was not JSON.'),
      ),
    ).toBe(true)
  })

  test('after 3 failed model calls the deterministic fallback moves the game on', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: { moveIndex: -1, rationale: 'bad' } },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    expect(outcome.attempts).toBe(MAX_MODEL_CALLS_PER_DECISION)
    expect(outcome.fallback).toBe(true)
    expect(outcome.usage.fallbacks).toBe(1)
    expect(outcome.rationale).toBeNull()
    // the fallback applied a real event — the game advanced
    expect(outcome.snapshot).toBeTruthy()
    expect(outcome.move.event.type).toBeTruthy()
  })

  test('usage and cost accumulate across retries', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: null, error: 'nope', raw: 'x' },
      { choice: { moveIndex: 6, rationale: 'pass' } },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    expect(outcome.usage.inputTokens).toBe(200)
    expect(outcome.usage.outputTokens).toBe(40)
    // foreman: $3/MTok in, $15/MTok out
    expect(outcome.usage.costUsd).toBeCloseTo(
      (200 * 3 + 40 * 15) / 1_000_000,
      12,
    )
  })

  test('a gateway-reported cost overrides the static tier table', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: { moveIndex: 6, rationale: 'pass' }, costUsd: 0.00123 },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    expect(outcome.usage.costUsd).toBeCloseTo(0.00123, 10)
  })

  test('forceSafe never consults the model and ends the turn safely', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([]) // would blow up if called
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
      forceSafe: true,
    })
    expect(outcome.usage.calls).toBe(0)
    expect(outcome.move.event.type).toBe('PASS')
    expect(ctxOf(outcome.snapshot).currentPlayerIndex).not.toBe(seatIndex)
  })

  test('a whole turn with a hopeless model still completes via fallbacks', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: null, error: 'never answers', raw: '' },
    ])
    const { outcomes, persisted: after } = await runWholeTurn(
      persisted,
      seatIndex,
      provider,
    )
    expect(ctxOf(after).currentPlayerIndex).not.toBe(seatIndex)
    expect(outcomes.some((o) => o.fallback)).toBe(true)
  })
})

describe('smartness upgrades (captain playtest fixes)', () => {
  test('turn notes are injected into the decision message', async () => {
    const { persisted, seatIndex } = freshPersisted()
    const provider = scriptedProvider([
      { choice: { moveIndex: 6, rationale: 'pass' } },
    ])
    await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
      turnNotes: [
        'Build — place an industry tile — your reasoning: "iron plan"',
        'Cancel and choose a different action — your reasoning: "cannot afford it"',
      ],
    })
    const first = provider.seen[0]![0]!.content
    expect(first).toContain('== YOUR STEPS SO FAR THIS TURN ==')
    expect(first).toContain('cannot afford it')
    expect(first).toContain('Do not retry a plan you cancelled')
  })

  test('a broke player: card picks in BUILD are rejected as dead ends, fallback cancels out', async () => {
    // Reproduces the captain-playtest cancel-loop: £0 in the treasury means
    // NO build can complete anywhere — the driver must refuse the card pick
    // up front (with the engine's reason) instead of letting the model walk
    // in and cancel-loop.
    const actor = createActor(gameStore)
    actor.start()
    actor.send({ type: 'START_GAME', players: startPlayers })
    const seatIndex = actor.getSnapshot().context.currentPlayerIndex
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: seatIndex,
      money: 0,
    })
    // Scripted hand WITHOUT iron: an iron works can self-fund (its excess
    // cubes sell to the market during the build), so it stays viable even
    // at £0 — cotton/pottery/brewery builds all need real money.
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: seatIndex,
      hand: [
        { id: 'cotton_t1', type: 'industry', industries: ['cotton'] },
        { id: 'pottery_t1', type: 'industry', industries: ['pottery'] },
      ] as never,
    })
    actor.send({ type: 'BUILD' })
    const persisted = actor.getPersistedSnapshot()
    actor.stop()

    // the model stubbornly picks the first card every time
    const provider = scriptedProvider([
      { choice: { moveIndex: 0, rationale: 'building anyway' } },
    ])
    const outcome = await aiDecideAndApply({
      persisted,
      seatIndex,
      provider,
      tier,
    })
    // every model attempt was rejected with a dead-end explanation…
    expect(outcome.attempts).toBe(MAX_MODEL_CALLS_PER_DECISION)
    const retry = provider.seen[1]!.map((m) => m.content).join('\n')
    expect(retry).toMatch(/cannot be completed|leads to a build/)
    // …and the fallback backed out of the doomed flow instead of descending
    expect(outcome.fallback).toBe(true)
    expect(outcome.move.event.type).toBe('CANCEL')
  })
})
