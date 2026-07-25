// Multiplayer service tests: server authority, seat security, and — most
// importantly — that a seat's view NEVER contains another player's cards.
import { beforeAll, describe, expect, test, vi } from 'vitest'
import {
  buildRecoveryLink,
  parseRecoveryHash,
} from '../components/mp/recovery-link'
import {
  CHAT_MAX_LENGTH,
  CHAT_TAIL_LIMIT,
  actInGame,
  createGame,
  getChatDelta,
  getGameView,
  joinGame,
  releaseSeat,
  sendChat,
  setSeatReady,
  startGame,
} from '../server/mp/game'
import {
  appendChatMessage,
  loadChatSince,
  loadGame,
  loadOpenLobbies,
  loadRecentChat,
  loadVersionAndSeq,
  saveGame,
} from '../server/mp/store'
import { ensureTestSchema } from '../test/db-schema'

// Every test here drives several sequential round-trips to a real (network)
// DB, so the global 5s per-test timeout — sized for the in-memory engine
// suite — is too tight, especially under parallel load. Raise it for this
// file only.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// The store is DB-backed (Neon/Postgres); set DATABASE_URL to a dev branch.
// We provision the schema once per run; rows are left in the dev branch (the
// per-run branch lifecycle cleans them up — the automatic TTL sweep is
// disabled by default now, see sweepStaleGames).
beforeAll(async () => {
  await ensureTestSchema()
})

// A ready-to-play game: create, join every open seat, ready everyone up, and
// let the host start it. The lobby no longer auto-starts on a full table, so
// the whole suite drives the real start handoff through this helper.
async function freshGame() {
  const host = await createGame('Ada', 2)
  const guest = await joinGame(host.token, 'Brunel')
  await setSeatReady(host.token, 0, host.seatSecret, true)
  await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)
  const started = await startGame(host.token, host.seatSecret)
  expect(started.ok).toBe(true)
  return { host, guest }
}

type Ctx = {
  players: Array<{ hand: Array<{ id: string }>; name: string }>
  drawPile: Array<{ id: string }>
  currentPlayerIndex: number
  selectedCard: { id: string } | null
  selectedLink: unknown
  selectedSecondLink: unknown
  selectedLocation: unknown
  selectedIndustryTile: unknown
  selectedTilesForDevelop: unknown[]
  pendingSale: unknown
  chosenBeerSources: unknown[]
  chosenIronSources: unknown[]
  chosenCoalSources: unknown[]
  pendingIronStep: unknown
  pendingCoalStep: unknown
}
const ctxOf = (view: { snapshot: unknown }) =>
  (view.snapshot as { context: Ctx }).context

/** Every field holding an action's in-progress picks — the hidden zone. */
const selectionFieldsOf = (ctx: Ctx) => ({
  selectedCard: ctx.selectedCard,
  selectedLink: ctx.selectedLink,
  selectedSecondLink: ctx.selectedSecondLink,
  selectedLocation: ctx.selectedLocation,
  selectedIndustryTile: ctx.selectedIndustryTile,
  selectedTilesForDevelop: ctx.selectedTilesForDevelop,
  pendingSale: ctx.pendingSale,
  chosenBeerSources: ctx.chosenBeerSources,
  chosenIronSources: ctx.chosenIronSources,
  chosenCoalSources: ctx.chosenCoalSources,
  pendingIronStep: ctx.pendingIronStep,
  pendingCoalStep: ctx.pendingCoalStep,
})

describe('multiplayer: lifecycle and authority', () => {
  test('create → join fills seats and starts the engine', async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.phase).toBe('playing')
    expect(view?.you).toBe(0)
    expect(view?.seats.map((s) => s.name)).toEqual(['Ada', 'Brunel'])
    expect(guest.seatId).toBe(1)
    // durability: the record round-trips through the DB store
    const record = await loadGame(host.token)
    expect(record?.phase).toBe('playing')
    expect(record?.snapshot).toBeTruthy()
  })

  test('the lobby waits for ready-up + an explicit host start', async () => {
    const host = await createGame('Ada', 2)
    // a filled table is NOT auto-started anymore
    const guest = await joinGame(host.token, 'Brunel')
    let view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.phase).toBe('lobby')
    expect(view?.seats.every((s) => s.claimed)).toBe(true)
    expect(view?.seats.every((s) => s.ready)).toBe(false)

    // host cannot start until everyone is ready
    const early = await startGame(host.token, host.seatSecret)
    expect(early).toMatchObject({ ok: false })
    expect((await getGameView(host.token, 0, host.seatSecret))?.phase).toBe(
      'lobby',
    )

    // ready-up flips the public flag and is toggleable
    await setSeatReady(host.token, 0, host.seatSecret, true)
    await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)
    view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.seats.map((s) => s.ready)).toEqual([true, true])
    await setSeatReady(host.token, guest.seatId, guest.seatSecret, false)
    expect(
      (await getGameView(host.token, 0, host.seatSecret))?.seats[1]?.ready,
    ).toBe(false)
    await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)

    // only the host may start
    const notHost = await startGame(host.token, guest.seatSecret)
    expect(notHost).toMatchObject({ ok: false })

    // host start hands off into the existing play path
    const started = await startGame(host.token, host.seatSecret)
    expect(started.ok).toBe(true)
    expect((await getGameView(host.token, 0, host.seatSecret))?.phase).toBe(
      'playing',
    )
  })

  test('a started game cannot be re-joined or re-started (race guards)', async () => {
    const { host } = await freshGame() // already playing — every seat claimed
    // A started game is full, so a would-be joiner finds no open seat. This is
    // the same guard that resolves two players racing the last lobby slot.
    await expect(joinGame(host.token, 'Latecomer')).rejects.toThrow(
      /No open seats/i,
    )
    const restart = await startGame(host.token, host.seatSecret)
    expect(restart).toMatchObject({ ok: false })
  })

  test('capacity holds: the last open seat admits exactly one player', async () => {
    const host = await createGame('Ada', 2)
    await joinGame(host.token, 'Brunel') // fills the only open seat
    await expect(joinGame(host.token, 'Third')).rejects.toThrow(
      /No open seats/i,
    )
  })

  test('open lobbies are discoverable, and leave the list once full', async () => {
    const host = await createGame('Ada', 3)
    const lobbies = await loadOpenLobbies()
    const mine = lobbies.find((l) => l.token === host.token)
    expect(mine).toMatchObject({
      host: 'Ada',
      capacity: 3,
      claimed: 1,
      open: true,
    })
    // fill it — a full lobby is no longer joinable, so it drops off the list
    await joinGame(host.token, 'Brunel')
    await joinGame(host.token, 'Watt')
    const after = await loadOpenLobbies()
    expect(after.find((l) => l.token === host.token)).toBeUndefined()
  })

  test('acting requires the right secret, the right turn, a whitelisted event', async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    const current = ctxOf(view!).currentPlayerIndex

    // wrong secret
    expect(
      await actInGame(host.token, 0, 'not-the-secret-aaaaaaaa', {
        type: 'PASS',
      }),
    ).toEqual({ ok: false, error: 'Not your seat' })

    // not your turn (the seat that is NOT current tries to act)
    const wrongSeat = current === 0 ? 1 : 0
    const wrongCreds = wrongSeat === 0 ? host : { ...guest, token: host.token }
    expect(
      (
        await actInGame(host.token, wrongSeat, wrongCreds.seatSecret, {
          type: 'PASS',
        })
      ).ok,
    ).toBe(false)

    // TEST_* events are not accepted off the wire
    const rightCreds = current === 0 ? host : guest
    const res = await actInGame(host.token, current, rightCreds.seatSecret, {
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [],
    })
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toMatch(/not allowed/)
  })

  test('a legal action executes on the engine, persists, and bumps the version', async () => {
    const { host, guest } = await freshGame()
    let view = await getGameView(host.token, 0, host.seatSecret)
    const v0 = view!.version
    const current = ctxOf(view!).currentPlayerIndex
    const creds = current === 0 ? host : guest

    // Loan through the full flow: TAKE_LOAN → SELECT_CARD → CONFIRM
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'TAKE_LOAN',
        })
      ).ok,
    ).toBe(true)
    view = await getGameView(host.token, current, creds.seatSecret)
    const ownHand = ctxOf(view!).players[current]!.hand
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'SELECT_CARD',
          cardId: ownHand[0]!.id,
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'CONFIRM',
        })
      ).ok,
    ).toBe(true)

    view = await getGameView(host.token, current, creds.seatSecret)
    expect(view!.version).toBeGreaterThan(v0)
    const money = (
      view!.snapshot as { context: { players: Array<{ money: number }> } }
    ).context.players[current]!.money
    expect(money).toBe(47) // £17 + £30 loan
  })

  test("act returns the actor's own fresh view + version (DB-as-bus fast path)", async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    const v0 = view!.version
    const current = ctxOf(view!).currentPlayerIndex
    const other = current === 0 ? 1 : 0
    const creds = current === 0 ? host : guest
    const otherCreds = other === 0 ? host : guest

    const res = await actInGame(host.token, current, creds.seatSecret, {
      type: 'TAKE_LOAN',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')

    // The response carries the engine's OWN authoritative view + bumped
    // version, so the client applies its result in POST time (no poll wait).
    expect(res.version).toBeGreaterThan(v0)
    expect(res.view.version).toBe(res.version)
    expect(res.view.you).toBe(current)

    // Same viewFor path as an SSE frame — hidden info stays filtered: the
    // actor's OWN act-response never contains another seat's real cards.
    const rctx = ctxOf(res.view)
    expect(
      rctx.players[current]!.hand.every((c) => !c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(
      rctx.players[other]!.hand.every((c) => c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(rctx.drawPile.every((c) => c.id.startsWith('hidden-'))).toBe(true)

    // Wire-level: none of the other seat's REAL card ids leak into any card
    // zone of the actor's response view.
    const otherView = await getGameView(
      host.token,
      other,
      otherCreds.seatSecret,
    )
    const otherRealHand = ctxOf(otherView!).players[other]!.hand.map(
      (c) => c.id,
    )
    const actorZones = [
      ...rctx.players.flatMap((p) => p.hand),
      ...rctx.drawPile,
    ].map((c) => c.id)
    for (const id of otherRealHand) {
      expect(actorZones).not.toContain(id)
    }
  })

  test('chat returns the sender view + the new message, WITHOUT bumping the engine version', async () => {
    const { host } = await freshGame()
    const before = await getGameView(host.token, 0, host.seatSecret)
    const res = await sendChat(host.token, 0, host.seatSecret, 'well played')
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('unreachable')
    // Chat is normalized out of the game row: the returned version is the
    // UNCHANGED engine version (no full-state frame), and the sender's own
    // view already carries the new line in its bounded tail.
    expect(res.version).toBe(before!.version)
    expect(res.view.version).toBe(res.version)
    expect(res.view.messages.at(-1)?.text).toBe('well played')
  })

  test('a seated player can release a seat; a new player reclaims it', async () => {
    const { host } = await freshGame()
    // A stranger with no valid seat secret is refused (negative guard).
    await expect(
      releaseSeat(host.token, 'wrong-secret-aaaaaaaa', 1),
    ).rejects.toThrow(/not seated/i)
    await releaseSeat(host.token, host.seatSecret, 1)
    const rejoined = await joinGame(host.token, 'Watt')
    expect(rejoined.seatId).toBe(1)
    const view = await getGameView(host.token, 1, rejoined.seatSecret)
    expect(view?.you).toBe(1)
    expect(view?.snapshot).toBeTruthy()
  })

  // Recovery model (c)+(d): a host who loses their browser storage no longer
  // bricks the table. This is the exact repro from the multiplayer-gaps report
  // (host runs `localStorage.clear()` mid-game) turned into a regression test —
  // seat 0's secret is unrecoverable, but a seated peer frees the seat and the
  // host re-claims it fresh, host powers transferring in the meantime.
  test('a locked-out host is recovered by a seated peer (release seat 0 + reclaim)', async () => {
    const { host, guest } = await freshGame()

    // The game is live and it is seat 0's turn.
    const before = await getGameView(host.token, 0, host.seatSecret)
    expect(before?.phase).toBe('playing')
    expect(before?.hostSeatId).toBe(0)

    // Host clears storage: the seat-0 secret is GONE. `host.seatSecret` is now
    // a value nobody holds. The seat is still `claimed` server-side (the server
    // can't detect a lost secret), so seat 0 cannot act and — before this fix —
    // could never be released. The peer (guest, seat 1) recovers it with THEIR
    // OWN secret, not the lost host secret.
    await releaseSeat(host.token, guest.seatSecret, 0)

    // Host powers transfer to the next seated human while seat 0 sits open.
    const afterRelease = await getGameView(host.token, 1, guest.seatSecret)
    expect(afterRelease?.hostSeatId).toBe(1)
    expect(afterRelease?.seats[0]!.claimed).toBe(false)

    // The locked-out host re-claims seat 0 from the invite link with a FRESH
    // secret; the game is playable again and host powers return to seat 0.
    const reclaimed = await joinGame(host.token, 'Ada')
    expect(reclaimed.seatId).toBe(0)
    const recovered = await getGameView(host.token, 0, reclaimed.seatSecret)
    expect(recovered?.you).toBe(0)
    expect(recovered?.hostSeatId).toBe(0)
    expect(recovered?.snapshot).toBeTruthy()
    // The old (lost) secret is dead; the fresh one authenticates.
    const stale = await getGameView(host.token, 0, host.seatSecret)
    expect(stale?.you).toBeNull()
  })

  // Negative: a non-seated actor (no valid secret at ANY seat) can neither
  // release a seat nor seize host powers. Only genuinely seated players recover.
  test('a stranger cannot release seats or seize host powers', async () => {
    const { host } = await freshGame()
    await expect(
      releaseSeat(host.token, 'not-a-real-secret-xx', 0),
    ).rejects.toThrow(/not seated/i)
    // seat 0 stays claimed and the host keeps host powers
    const view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.seats[0]!.claimed).toBe(true)
    expect(view?.hostSeatId).toBe(0)
  })

  // (d) in the lobby: if the host vacates before start, the inherited host can
  // still start the game — host power does not die with a vacated seat 0.
  test('host transfer lets the next seated player start when seat 0 is vacated', async () => {
    const host = await createGame('Ada', 2)
    const guest = await joinGame(host.token, 'Brunel')
    await setSeatReady(host.token, 0, host.seatSecret, true)
    await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)

    // The host leaves the lobby: the guest (seat 1) frees seat 0.
    await releaseSeat(host.token, guest.seatSecret, 0)

    // The old host secret can no longer start; guests aren't blocked as before.
    const staleStart = await startGame(host.token, host.seatSecret)
    expect(staleStart.ok).toBe(false)

    // Not everyone is ready/claimed after the release, so start still refuses —
    // but with the readiness reason, proving the guest is AUTHORIZED as host.
    const guestStart = await startGame(host.token, guest.seatSecret)
    expect(guestStart.ok).toBe(false)
    if (!guestStart.ok) {
      expect(guestStart.error).not.toMatch(/host/i)
    }
    const lobby = await getGameView(host.token, 1, guest.seatSecret)
    expect(lobby?.hostSeatId).toBe(1)
  })
})

// The personal recovery link ("seat key"). It carries the EXISTING per-seat
// secret in a URL fragment — no new credential, no new endpoint — so these
// tests drive the real link builder/parser against the real seat auth and
// prove the round trip end to end. The client-side half (storage write, URL
// scrubbing, malformed input) is pinned offline in
// `src/components/mp/recovery-link.test.ts`.
describe('multiplayer: personal seat recovery links', () => {
  /** What a clean browser does with a pasted recovery URL: parse the
   *  fragment and present whatever it finds to the ordinary seat auth. */
  const openInCleanBrowser = (link: string) =>
    parseRecoveryHash(new URL(link).hash)

  test('every seated player — not just the host — round-trips their own seat', async () => {
    const { host, guest } = await freshGame()
    const origin = 'https://brass.example'

    for (const seat of [
      { seatId: 0, seatSecret: host.seatSecret, name: 'Ada' },
      { seatId: guest.seatId, seatSecret: guest.seatSecret, name: 'Brunel' },
    ]) {
      const link = buildRecoveryLink(origin, host.token, seat)
      // the link addresses this game and hides the credential in the fragment
      expect(link.startsWith(`${origin}/g/${host.token}#`)).toBe(true)

      const restored = openInCleanBrowser(link)
      expect(restored).toEqual({
        seatId: seat.seatId,
        seatSecret: seat.seatSecret,
      })

      // …and those credentials authenticate THAT seat, with its own hand.
      const view = await getGameView(
        host.token,
        restored!.seatId,
        restored!.seatSecret,
      )
      expect(view?.you).toBe(seat.seatId)
      expect(ctxOf(view!).players[seat.seatId]!.name).toBe(seat.name)
    }
  })

  test('a restored seat can act — it is the same credential, not a read-only pass', async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    const current = ctxOf(view!).currentPlayerIndex
    const seat =
      current === 0
        ? { seatId: 0, seatSecret: host.seatSecret }
        : { seatId: guest.seatId, seatSecret: guest.seatSecret }

    const restored = openInCleanBrowser(
      buildRecoveryLink('https://brass.example', host.token, seat),
    )!
    // A full action flow driven entirely from the recovered credentials.
    expect(
      (
        await actInGame(host.token, restored.seatId, restored.seatSecret, {
          type: 'TAKE_LOAN',
        })
      ).ok,
    ).toBe(true)
    const mine = await getGameView(
      host.token,
      restored.seatId,
      restored.seatSecret,
    )
    expect(
      (
        await actInGame(host.token, restored.seatId, restored.seatSecret, {
          type: 'SELECT_CARD',
          cardId: ctxOf(mine!).players[current]!.hand[0]!.id,
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await actInGame(host.token, restored.seatId, restored.seatSecret, {
          type: 'CONFIRM',
        })
      ).ok,
    ).toBe(true)
  })

  test('a tampered secret is refused, and the refusal says nothing about which half was wrong', async () => {
    const { host } = await freshGame()
    const good = buildRecoveryLink('https://brass.example', host.token, {
      seatId: 0,
      seatSecret: host.seatSecret,
    })

    // One character flipped in the secret — everything else identical.
    const flipped = host.seatSecret.startsWith('a')
      ? `b${host.seatSecret.slice(1)}`
      : `a${host.seatSecret.slice(1)}`
    const tampered = good.replace(host.seatSecret, flipped)
    expect(tampered).not.toBe(good)

    const refusals = await Promise.all(
      [
        // right seat, wrong secret
        { seatId: 0, seatSecret: flipped },
        // wrong seat, right secret (seat 1's key would not be seat 0's)
        { seatId: 1, seatSecret: host.seatSecret },
        // pure invention
        { seatId: 0, seatSecret: 'not-a-real-secret-at-all' },
      ].map((c) => getGameView(host.token, c.seatId, c.seatSecret)),
    )

    // Every failure mode answers IDENTICALLY: an unauthenticated view. No
    // error string, no seat hint, nothing that narrows the search.
    for (const refused of refusals) {
      expect(refused?.you).toBeNull()
      expect(refused?.snapshot).toBeNull()
    }
    expect(JSON.stringify(refusals[0])).toBe(JSON.stringify(refusals[2]))

    // …and the untampered link still works, so this is the secret failing and
    // not the whole game being unreachable.
    const ok = openInCleanBrowser(good)!
    expect((await getGameView(host.token, ok.seatId, ok.seatSecret))?.you).toBe(
      0,
    )
  })

  test('an invite link grants an OPEN seat only — never an occupied one', async () => {
    const host = await createGame('Ada', 2)
    // Anyone holding just the token (the invite link) is anonymous: no seat.
    const anonymous = await getGameView(host.token, null, null)
    expect(anonymous?.you).toBeNull()
    expect(anonymous?.seats[0]!.claimed).toBe(true)

    // It takes the one open seat…
    const guest = await joinGame(host.token, 'Brunel')
    expect(guest.seatId).toBe(1)
    // …and then grants nothing at all: the occupied seats stay occupied.
    await expect(joinGame(host.token, 'Interloper')).rejects.toThrow(
      /no open seats/i,
    )
    const still = await getGameView(host.token, 1, guest.seatSecret)
    expect(still?.you).toBe(1)
  })

  test('#88 intact: releasing a seat kills its old recovery link', async () => {
    const { host, guest } = await freshGame()
    const hostKey = openInCleanBrowser(
      buildRecoveryLink('https://brass.example', host.token, {
        seatId: 0,
        seatSecret: host.seatSecret,
      }),
    )!
    expect(
      (await getGameView(host.token, hostKey.seatId, hostKey.seatSecret))?.you,
    ).toBe(0)

    // A seated peer frees seat 0 (the existing recovery model).
    await releaseSeat(host.token, guest.seatSecret, 0)

    // The recovery link that used to open that seat is now inert — the seat
    // has no secretHash at all, so the credential matches nothing.
    expect(
      (await getGameView(host.token, hostKey.seatId, hostKey.seatSecret))?.you,
    ).toBeNull()
  })
})

describe('multiplayer: hidden information never crosses the wire', () => {
  test("a seat's view redacts other hands, the draw pile, and foreign selections", async () => {
    const { host, guest } = await freshGame()

    const hostView = await getGameView(host.token, 0, host.seatSecret)
    const guestView = await getGameView(host.token, 1, guest.seatSecret)
    const hostCtx = ctxOf(hostView!)
    const guestCtx = ctxOf(guestView!)

    // own hands are real
    expect(
      hostCtx.players[0]!.hand.every((c) => !c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(
      guestCtx.players[1]!.hand.every((c) => !c.id.startsWith('hidden-')),
    ).toBe(true)
    // foreign hands are placeholders of the SAME LENGTH (guards need counts)
    expect(
      hostCtx.players[1]!.hand.every((c) => c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(
      guestCtx.players[0]!.hand.every((c) => c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(guestCtx.players[0]!.hand).toHaveLength(
      hostCtx.players[0]!.hand.length,
    )
    // the draw pile is never shipped (only its size)
    expect(guestCtx.drawPile.every((c) => c.id.startsWith('hidden-'))).toBe(
      true,
    )

    // Wire-level: walk the exact payload the guest receives and assert every
    // card in a hidden zone (foreign hands, draw pile, foreign selections)
    // is a placeholder. NOTE a naive string-contains check false-positives:
    // industry CARD ids share the id namespace with the public industry
    // TILE definitions on every player mat (e.g. "brewery_3").
    const wire = JSON.parse(JSON.stringify(guestView)) as {
      snapshot: { context: Ctx & { selectedCard: { id: string } | null } }
    }
    const wireCtx = wire.snapshot.context
    const hiddenZones = [
      ...wireCtx.players.flatMap((p, i) => (i === 1 ? [] : p.hand)),
      ...wireCtx.drawPile,
      ...(wireCtx.selectedCard ? [wireCtx.selectedCard] : []),
    ]
    expect(hiddenZones.length).toBeGreaterThan(0)
    for (const card of hiddenZones) {
      expect(card.id).toMatch(/^hidden-/)
    }
    // and host's real hand ids appear nowhere among any card zone of the view
    const allCardZones = [
      ...wireCtx.players.flatMap((p) => p.hand),
      ...wireCtx.drawPile,
    ].map((c) => c.id)
    for (const card of hostCtx.players[0]!.hand) {
      expect(allCardZones.filter((id) => id === card.id)).toHaveLength(0)
    }
  })

  test("an opponent's in-progress selection never reaches the other seats", async () => {
    const { host, guest } = await freshGame()
    const start = await getGameView(host.token, 0, host.seatSecret)
    const current = ctxOf(start!).currentPlayerIndex
    const other = current === 0 ? 1 : 0
    const creds = current === 0 ? host : guest
    const otherCreds = other === 0 ? host : guest

    // Take a Network action as far as a chosen route: every step here is a
    // persisted intent that bumps `version` and broadcasts to BOTH seats.
    const act = (event: Record<string, unknown> & { type: string }) =>
      actInGame(host.token, current, creds.seatSecret, event)
    expect((await act({ type: 'NETWORK' })).ok).toBe(true)
    const own = ctxOf(
      (await getGameView(host.token, current, creds.seatSecret))!,
    )
    const card = own.players[current]!.hand[0]!
    expect((await act({ type: 'SELECT_CARD', cardId: card.id })).ok).toBe(true)
    const link = { from: 'birmingham', to: 'coventry' }
    expect((await act({ type: 'SELECT_LINK', ...link })).ok).toBe(true)

    // The acting seat still sees its own picks.
    const mine = ctxOf(
      (await getGameView(host.token, current, creds.seatSecret))!,
    )
    expect(mine.selectedLink).toEqual(link)
    expect(mine.selectedCard?.id).toBe(card.id)

    // The opponent gets the same state node, with the selection redacted —
    // no route to light up on their board, no card identity.
    const theirs = ctxOf(
      (await getGameView(host.token, other, otherCreds.seatSecret))!,
    )
    expect(theirs.selectedLink).toBeNull()
    expect(theirs.selectedSecondLink).toBeNull()
    expect(theirs.selectedLocation).toBeNull()
    expect(theirs.selectedIndustryTile).toBeNull()
    expect(theirs.selectedTilesForDevelop).toEqual([])
    expect(theirs.pendingSale).toBeNull()
    expect(theirs.chosenBeerSources).toEqual([])
    expect(theirs.chosenIronSources).toEqual([])
    expect(theirs.chosenCoalSources).toEqual([])
    expect(theirs.pendingIronStep).toBeNull()
    expect(theirs.pendingCoalStep).toBeNull()
    expect(theirs.selectedCard?.id).toMatch(/^hidden-/)

    // Wire-level: neither endpoint's id appears anywhere in the opponent's
    // in-flight selection payload.
    const wire = JSON.stringify(
      (await getGameView(host.token, other, otherCreds.seatSecret))!.snapshot,
    )
    const wireCtx = (JSON.parse(wire) as { context: Ctx }).context
    expect(JSON.stringify(selectionFieldsOf(wireCtx))).not.toContain('coventry')
  })

  test('unauthenticated view exposes lobby facts only — never a snapshot', async () => {
    const { host } = await freshGame()
    const anon = await getGameView(host.token, null, null)
    expect(anon?.you).toBeNull()
    expect(anon?.snapshot).toBeNull()
    expect(anon?.seats.length).toBe(2)
    const badSecret = await getGameView(host.token, 0, 'guessed-secret-aaaa')
    expect(badSecret?.you).toBeNull()
    expect(badSecret?.snapshot).toBeNull()
  })
})

describe('multiplayer: table talk', () => {
  test('chat requires the right secret, lands for both seats, trims and caps', async () => {
    const { host, guest } = await freshGame()

    // Wrong secret → rejected, nothing stored.
    const bad = await sendChat(host.token, 0, 'not-the-secret', 'hi')
    expect(bad).toStrictEqual({ ok: false, error: 'Not your seat' })

    // Empty / whitespace-only → rejected.
    const empty = await sendChat(host.token, 0, host.seatSecret, '   ')
    expect(empty.ok).toBe(false)

    // A real message lands for BOTH seats, with sender name and id.
    const versionBefore = (await loadGame(host.token))!.version
    const sent = await sendChat(host.token, 0, host.seatSecret, '  hello  ')
    expect(sent.ok).toBe(true)
    const hostView = await getGameView(host.token, 0, host.seatSecret)
    const guestView = await getGameView(
      host.token,
      guest.seatId,
      guest.seatSecret,
    )
    expect(hostView!.messages).toHaveLength(1)
    expect(guestView!.messages).toStrictEqual(hostView!.messages)
    expect(hostView!.messages[0]).toMatchObject({
      id: 1,
      seatId: 0,
      name: 'Ada',
      text: 'hello', // trimmed
    })
    // chat is normalized OUT of the game row: a message inserts one
    // chat_messages row and does NOT rewrite the game record nor bump the
    // engine version (that's the whole point — no full-state frame per line).
    expect((await loadGame(host.token))!.version).toBe(versionBefore)

    // Long messages are capped at CHAT_MAX_LENGTH characters.
    await sendChat(host.token, 1, guest.seatSecret, 'x'.repeat(2000))
    const after = await getGameView(host.token, 0, host.seatSecret)
    expect(after!.messages).toHaveLength(2)
    expect(after!.messages[1]!.text.length).toBe(CHAT_MAX_LENGTH)
    expect(after!.messages[1]!.seatId).toBe(1)

    // Spectators (no valid seat) never receive the messages.
    const anon = await getGameView(host.token, null, null)
    expect(anon!.messages).toStrictEqual([])
  })
})

describe('multiplayer: chat delivery over the (version, maxSeq) poll', () => {
  test('per-game seq increases monotonically; the poll pair tracks it without bumping version', async () => {
    const { host, guest } = await freshGame()
    const base = await loadVersionAndSeq(host.token)
    expect(base).not.toBeNull()
    expect(base!.maxSeq).toBe(0) // no chat yet

    const a = await sendChat(host.token, 0, host.seatSecret, 'one')
    const b = await sendChat(host.token, 1, guest.seatSecret, 'two')
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) throw new Error('unreachable')
    // ids are the monotonic per-game seq
    expect(a.view.messages.at(-1)!.id).toBe(1)
    expect(b.view.messages.at(-1)!.id).toBe(2)

    // The cheap poll pair sees the new max seq but the SAME engine version:
    // the stream pushes a chat increment, never a full-state frame, for chat.
    const poll = await loadVersionAndSeq(host.token)
    expect(poll!.version).toBe(base!.version)
    expect(poll!.maxSeq).toBe(2)
  })

  test('getChatDelta returns only messages since a seq, and only to seated players', async () => {
    const { host, guest } = await freshGame()
    await sendChat(host.token, 0, host.seatSecret, 'm1')
    await sendChat(host.token, 1, guest.seatSecret, 'm2')
    await sendChat(host.token, 0, host.seatSecret, 'm3')

    // Increment since seq 1 → messages 2 and 3 only, ascending, chatSeq = 3.
    const delta = await getChatDelta(host.token, 0, host.seatSecret, 1, 50)
    expect(delta).not.toBeNull()
    expect(delta!.chatSeq).toBe(3)
    expect(delta!.messages.map((m) => m.id)).toEqual([2, 3])
    expect(delta!.messages.map((m) => m.text)).toEqual(['m2', 'm3'])

    // Caught up (since the max) → nothing to send.
    expect(await getChatDelta(host.token, 0, host.seatSecret, 3, 50)).toBeNull()

    // A spectator / wrong secret never gets a chat increment.
    expect(await getChatDelta(host.token, null, null, 0, 50)).toBeNull()
    expect(await getChatDelta(host.token, 0, 'wrong-secret', 0, 50)).toBeNull()
  })

  test('store-level increment: loadChatSince mirrors what the stream pushes', async () => {
    const { host, guest } = await freshGame()
    await sendChat(host.token, 0, host.seatSecret, 'x1')
    await sendChat(host.token, 1, guest.seatSecret, 'x2')
    const since1 = await loadChatSince(host.token, 1, 50)
    expect(since1.map((m) => m.id)).toEqual([2])
    expect(await loadChatSince(host.token, 2, 50)).toHaveLength(0)
  })
})

describe('multiplayer: the chat tail carried in a view is bounded', () => {
  test('a view ships only the recent CHAT_TAIL_LIMIT lines; full history stays in the table', async () => {
    const { host, guest } = await freshGame()
    const total = CHAT_TAIL_LIMIT + 15
    // Exercise the real send path for the first two (seq allocation + view),
    // then bulk-seed the rest straight through the store's appendChatMessage
    // (same seq allocation, fewer round trips) so the test stays under budget.
    await sendChat(host.token, 0, host.seatSecret, 'msg-1')
    await sendChat(host.token, 1, guest.seatSecret, 'msg-2')
    for (let i = 3; i <= total; i++) {
      const asHost = i % 2 === 1
      const msg = await appendChatMessage(
        host.token,
        asHost ? 0 : 1,
        asHost ? 'Ada' : 'Brunel',
        `msg-${i}`,
        new Date(2026, 0, 1, 0, 0, i).toISOString(),
      )
      expect(msg.id).toBe(i) // seq stays monotonic through both paths
    }

    // The seat view (a full frame / reconnect frame) carries only the tail…
    const view = await getGameView(host.token, 0, host.seatSecret)
    expect(view!.messages).toHaveLength(CHAT_TAIL_LIMIT)
    // …and it is the LAST CHAT_TAIL_LIMIT, in order, ending at the newest id.
    expect(view!.messages.at(-1)!.id).toBe(total)
    expect(view!.messages.at(-1)!.text).toBe(`msg-${total}`)
    expect(view!.messages[0]!.id).toBe(total - CHAT_TAIL_LIMIT + 1)
    const ids = view!.messages.map((m) => m.id)
    expect(ids).toEqual([...ids].sort((p, q) => p - q))

    // The bounded tail is a VIEW concern only — the table keeps everything.
    const everything = await loadRecentChat(host.token, total + 100)
    expect(everything).toHaveLength(total)
    expect(everything[0]!.id).toBe(1)

    // A reconnecting client's first frame == the current state + recent tail,
    // so it never has to page history to render the conversation.
    const reconnectFrame = await getGameView(host.token, 1, guest.seatSecret)
    expect(reconnectFrame!.messages).toHaveLength(CHAT_TAIL_LIMIT)
    expect(reconnectFrame!.messages.at(-1)!.id).toBe(total)
  }, 90_000) // seeds > CHAT_TAIL_LIMIT rows over the network — extra headroom
})

describe('multiplayer: persistence survives a redeploy', () => {
  // A "restart" for this store is a fresh load from the DB: the store keeps
  // NO in-memory copy of a game (game.ts's process singletons are pub/sub
  // and locks only), so a reload by token reconstructs the whole record from
  // the DB row alone. If that reload returns the played state AND the chat
  // history, an ephemeral-box redeploy loses nothing.
  test('a played + chatted game reloads from the DB with identical state and chat', async () => {
    const { host, guest } = await freshGame()

    // Play a full loan through the engine so the snapshot carries real state.
    let view = await getGameView(host.token, 0, host.seatSecret)
    const current = ctxOf(view!).currentPlayerIndex
    const creds = current === 0 ? host : guest
    await actInGame(host.token, current, creds.seatSecret, {
      type: 'TAKE_LOAN',
    })
    view = await getGameView(host.token, current, creds.seatSecret)
    const ownHand = ctxOf(view!).players[current]!.hand
    await actInGame(host.token, current, creds.seatSecret, {
      type: 'SELECT_CARD',
      cardId: ownHand[0]!.id,
    })
    await actInGame(host.token, current, creds.seatSecret, { type: 'CONFIRM' })

    // Chat from both seats.
    await sendChat(host.token, 0, host.seatSecret, 'good game')
    await sendChat(host.token, 1, guest.seatSecret, 'you too')

    // Snapshot the authoritative record BEFORE the "restart".
    const before = await loadGame(host.token)
    expect(before).not.toBeNull()

    // Simulate the redeploy: a brand-new load from the DB, nothing cached.
    const after = await loadGame(host.token)
    expect(after).not.toBeNull()

    // Whole game record is identical — phase, version, seats, snapshot.
    expect(after).toStrictEqual(before)
    expect(after!.phase).toBe('playing')
    expect(after!.snapshot).toBeTruthy()
    // Chat now lives in its OWN table, so it survives the reload independently
    // of the game row — read it back through the seat view (the record itself
    // no longer carries chat).
    const chatView = await getGameView(host.token, 0, host.seatSecret)
    expect(chatView!.messages).toHaveLength(2)
    expect(chatView!.messages.map((m) => m.text)).toEqual([
      'good game',
      'you too',
    ])
    // The engine state (the loan's money) survived the round-trip.
    const money = (
      after!.snapshot as { context: { players: Array<{ money: number }> } }
    ).context.players[current]!.money
    expect(money).toBe(47) // £17 + £30 loan
  })
})

describe('multiplayer: concurrent-write protection', () => {
  // The game lock is per-process; a second server instance can load the same
  // record and race the save. The store's version-guarded upsert turns that
  // into a hard error instead of a silent last-writer-wins overwrite (which
  // would also erase chat, since messages live in the row).
  test('a stale-version save is rejected; the first write stands', async () => {
    const { host } = await freshGame()
    const first = (await loadGame(host.token))!
    const rival = structuredClone(first) // another instance's stale read

    first.version++
    first.updatedAt = new Date().toISOString()
    await saveGame(first)

    rival.version++ // same bump, computed from the same stale read
    rival.updatedAt = new Date().toISOString()
    await expect(saveGame(rival)).rejects.toThrow(/concurrent/i)

    const settled = await loadGame(host.token)
    expect(settled!.version).toBe(first.version)
    expect(settled!.updatedAt).toBe(first.updatedAt)
  })
})

describe('multiplayer: the starting player is randomized server-side', () => {
  // Bucket B item 1: Brass deals a random first-player marker. The mp service
  // supplies a random startingPlayerIndex at start, baked into the persisted
  // snapshot — so it is deterministic per game and identical for every client,
  // never the host (seat 0) every time.
  const startedCtx = async (token: string) => {
    const g = await loadGame(token)
    return (
      g!.snapshot as {
        context: { currentPlayerIndex: number; turnOrder: string[] }
      }
    ).context
  }

  test('a forced non-zero draw makes a non-host seat lead, order rotated', async () => {
    // floor(0.75 * 2) === 1 → seat 1 leads a 2-player table.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.75)
    try {
      const { host } = await freshGame()
      const ctx = await startedCtx(host.token)
      expect(ctx.currentPlayerIndex).toBe(1)
      // turnOrder rotated to begin at the starting player; both seats present.
      expect(ctx.turnOrder[0]).toBe('2')
      expect([...ctx.turnOrder].sort()).toEqual(['1', '2'])
    } finally {
      spy.mockRestore()
    }
  })

  test('the chosen order is stable — reloading a game yields the same leader', async () => {
    const { host } = await freshGame()
    const a = await startedCtx(host.token)
    const b = await startedCtx(host.token)
    expect(b.currentPlayerIndex).toBe(a.currentPlayerIndex)
    expect(b.turnOrder).toEqual(a.turnOrder)
  })

  test('over many games the first player is not always seat 0', async () => {
    // Real randomness over many 2-player games: the leader must vary (it was
    // ALWAYS seat 0 before this change). With 20 fair coin flips, "all the
    // same" has probability 2·2⁻²⁰ ≈ 2e-6 — effectively never, no retries.
    const leaders = new Set<number>()
    for (let n = 0; n < 20; n++) {
      const { host } = await freshGame()
      leaders.add((await startedCtx(host.token)).currentPlayerIndex)
    }
    expect(leaders.size).toBeGreaterThan(1)
  })
})

describe('multiplayer: table names and private/public visibility', () => {
  // Bucket B items 3 + 4: an optional table name captured at create and shown
  // in the lobby list; a visibility flag that keeps private tables off the
  // public list (default public → existing games keep showing).
  test('a named public game appears in the lobby list with its name', async () => {
    const host = await createGame('Ada', 3, [], {
      name: '  Ada’s ironworks  ',
      visibility: 'public',
    })
    const lobbies = await loadOpenLobbies()
    const mine = lobbies.find((l) => l.token === host.token)
    // trimmed at create
    expect(mine?.name).toBe('Ada’s ironworks')
  })

  test('an over-long name is capped at create', async () => {
    const host = await createGame('Ada', 2, [], { name: 'x'.repeat(200) })
    const g = await loadGame(host.token)
    expect(g!.name.length).toBe(40)
  })

  test('a private game is reachable by token but never listed publicly', async () => {
    const host = await createGame('Ada', 3, [], { visibility: 'private' })
    // still loadable directly (invite-link flow)
    const g = await loadGame(host.token)
    expect(g!.visibility).toBe('private')
    // but absent from the public list
    const lobbies = await loadOpenLobbies()
    expect(lobbies.find((l) => l.token === host.token)).toBeUndefined()
  })

  test('visibility defaults to public — an unnamed game still lists', async () => {
    const host = await createGame('Ada', 3)
    const g = await loadGame(host.token)
    expect(g!.visibility).toBe('public')
    expect(g!.name).toBe('')
    const lobbies = await loadOpenLobbies()
    expect(lobbies.find((l) => l.token === host.token)).toBeTruthy()
  })
})
