import {
  type BrowserContext,
  expect as baseExpect,
  test,
} from '@playwright/test'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

// Every assertion waits on a real POST + SSE round-trip against a real
// network database; on a contended machine those outlast the 5s default.
const expect = baseExpect.configure({ timeout: 15_000 })

/**
 * Personal SEAT RECOVERY LINK, in real browsers.
 *
 * The unit tests pin the link format and the scrubbing logic
 * (`src/components/mp/recovery-link.test.ts`); the wire tests pin the seat
 * auth (`gameStore.multiplayer.test.ts`). What only a browser can prove is
 * the part that actually protects the player:
 *
 *  - a seat restored in a genuinely CLEAN browser profile (fresh context =
 *    empty localStorage), from the link alone;
 *  - the secret GONE from the address bar and from session history the
 *    moment it is consumed;
 *  - an invite link opened in a clean profile granting nothing, because
 *    every seat is taken;
 *  - a tampered link refused with one unrevealing message.
 */

test.skip(!hasDatabaseUrl, `seat-recovery e2e ${NEEDS_DB_MESSAGE}`)
test.setTimeout(120_000)

/** The recovery link as the player would copy it out of the seat-key modal. */
async function readSeatKey(ctx: BrowserContext, gameUrl: string) {
  const page = ctx.pages()[0]!
  await page.getByTestId('seat-key-button').click()
  const link = page.getByTestId('seat-key-link')
  // Masked until explicitly revealed — a screenshot or a shared screen must
  // not leak the seat by default.
  await expect(link).toHaveAttribute('data-revealed', 'false')
  await expect(link).not.toContainText(gameUrl)
  await page.getByTestId('seat-key-reveal').click()
  await expect(link).toHaveAttribute('data-revealed', 'true')
  const href = (await link.textContent())!.trim()
  await page.getByTestId('seat-key-close').click()
  return href
}

test('a seat is restored in a clean browser from its recovery link, and the secret never lingers', async ({
  browser,
}) => {
  /* ---- host creates an online table ---- */
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  await host.goto('/?fresh=1')
  await host.getByTestId('mode-online').click()
  await host.getByTestId('name-0').fill('Ada')
  await host.getByRole('button', { name: '2', exact: true }).click()
  await host.getByTestId('create-online').click()
  await host.waitForURL(/\/g\/[A-Za-z0-9_-]{20,}/)
  const gameUrl = host.url()
  await expect(host.getByText('Waiting to begin')).toBeVisible()

  // The HOST claims seat 0 at creation without passing through the join
  // screen, and is nudged all the same.
  await expect(host.getByTestId('seat-key-notice')).toBeVisible()

  /* ---- lobby hierarchy: the INVITE outranks the seat key ---- */
  // Prominence must track shareability. While a seat is open, filling it is
  // the task, so the invite is the primary card and carries the only bright
  // button of the pair; the seat key stays a quiet secondary row. Inverting
  // these teaches players to send the credential — pinned here so it cannot
  // regress silently.
  await expect(host.getByTestId('invite-callout')).toBeVisible()
  await expect(host.getByTestId('invite-link-text')).toContainText(gameUrl)
  await expect(host.getByTestId('share-link')).toHaveClass(/bb2-confirm/)
  await expect(host.getByTestId('seat-key-notice-open')).not.toHaveClass(
    /bb2-confirm/,
  )

  /* ---- guest joins; the seat key is offered at claim time, unprompted ---- */
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(gameUrl)
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  // Claim-time nudge, without blocking the lobby controls behind it.
  await expect(guest.getByTestId('seat-key-notice')).toBeVisible()
  await expect(guest.getByTestId('lobby-ready-toggle')).toBeEnabled()
  await guest.getByTestId('seat-key-notice-open').click()
  await expect(guest.getByTestId('seat-key-warning')).toContainText(
    'anyone with this link can take your seat',
  )
  // …and it says outright that this is NOT the shareable link.
  await expect(guest.getByTestId('seat-key-vs-invite')).toContainText(
    'This is not the invite link',
  )
  await guest.getByTestId('seat-key-close').click()
  await expect(guest.getByTestId('seat-key-modal')).toHaveCount(0)
  // Acknowledged: the nudge is gone, but the key is not.
  await expect(guest.getByTestId('seat-key-notice')).toHaveCount(0)
  await expect(guest.getByTestId('seat-key-button')).toBeVisible()

  // …and once the table is full there is nobody left to invite, so the callout
  // stands down to the compact chip rather than shouting at a closed lobby.
  await expect(host.getByTestId('invite-callout')).toHaveCount(0)
  await expect(host.getByTestId('share-link')).toBeVisible()

  /* ---- and it is retrievable LATER, which is the whole point ---- */
  const guestKey = await readSeatKey(guestCtx, gameUrl)
  expect(guestKey.startsWith(`${gameUrl}#`)).toBe(true)
  expect(guestKey).toContain('secret=')

  // The HOST — not just the joiner — has one too.
  const hostKey = await readSeatKey(hostCtx, gameUrl)
  expect(hostKey.startsWith(`${gameUrl}#`)).toBe(true)
  expect(hostKey).not.toBe(guestKey)

  /* ---- the guest's seat, restored in a clean profile ---- */
  const restoredCtx = await browser.newContext()
  const restored = await restoredCtx.newPage()
  await restored.goto(guestKey)

  // Seated as Brunel (seat 1) without ever touching the join form.
  await expect(restored.getByTestId('lobby-seat-1')).toContainText('Brunel')
  await expect(restored.getByTestId('lobby-seat-1')).toContainText('you')
  await expect(restored.getByTestId('join-seat')).toHaveCount(0)

  /* ---- the secret is gone from the URL, from history, and from the DOM ---- */
  const secret = new URL(guestKey).hash.split('secret=')[1]!
  expect(secret.length).toBeGreaterThan(8)

  const url = restored.url()
  expect(url).toBe(gameUrl)
  expect(url).not.toContain(secret)
  expect(await restored.evaluate(() => location.hash)).toBe('')
  // …and the visible page never renders it either (the modal is closed).
  expect(await restored.content()).not.toContain(secret)

  // It really is the same credential: the stored seat matches the link.
  const stored = await restored.evaluate((token) => {
    return localStorage.getItem(`bb-mp-${token}`)
  }, gameUrl.split('/g/')[1]!)
  expect(JSON.parse(stored!)).toMatchObject({ seatId: 1 })

  // replaceState, not pushState: stepping back cannot land on the
  // secret-bearing URL, because that history entry was overwritten rather
  // than added. (The context's own opening blank page is the only entry
  // behind it, so `history.length` alone would not prove this.)
  await restored.goBack().catch(() => null)
  expect(restored.url()).not.toContain(secret)

  /* ---- the INVITE link, in a clean profile, grants nothing ---- */
  // Same table, same URL — minus the fragment. Every seat is claimed, so a
  // stranger holding it is offered no seat at all.
  const strangerCtx = await browser.newContext()
  const stranger = await strangerCtx.newPage()
  await stranger.goto(gameUrl)
  await expect(stranger.getByText('All seats are taken')).toBeVisible()
  await expect(stranger.getByTestId('join-seat')).toHaveCount(0)
  await expect(stranger.getByTestId('lobby-ready-toggle')).toHaveCount(0)

  /* ---- a tampered recovery link is refused, unrevealingly ---- */
  const forgedCtx = await browser.newContext()
  const forged = await forgedCtx.newPage()
  const flipped = secret.startsWith('a')
    ? `b${secret.slice(1)}`
    : `a${secret.slice(1)}`
  await forged.goto(`${gameUrl}#seat=1&secret=${flipped}`)
  await expect(forged.getByTestId('recovery-rejected')).toBeVisible()
  // The message names no seat, no player and no reason beyond "did not work".
  const refusal = (await forged.getByTestId('recovery-rejected').textContent())!
  expect(refusal).toContain('did not work')
  expect(refusal).not.toContain('Brunel')
  expect(refusal).not.toContain('secret')
  // The forged secret is dropped from the URL too — a bad credential must not
  // linger in the address bar any more than a good one.
  expect(await forged.evaluate(() => location.hash)).toBe('')
  expect(forged.url()).not.toContain(flipped)

  /* ---- a refused link is a NO-OP for a player already in their seat ---- */
  // Anyone holding the public game token can craft a link for any seat, so the
  // recovered credentials stay unpersisted until the server accepts them. On a
  // refusal the browser's own credentials are restored and the player keeps
  // playing — the seat they already hold is never the casualty of a bad paste.
  const token = gameUrl.split('/g/')[1]!
  const storedBefore = await guest.evaluate(
    (t) => localStorage.getItem(`bb-mp-${t}`),
    token,
  )
  await guest.goto(`${gameUrl}#seat=1&secret=${flipped}`)
  await expect(guest.getByTestId('lobby-seat-1')).toContainText('Brunel')
  await expect(guest.getByTestId('lobby-seat-1')).toContainText('you')
  await expect(guest.getByTestId('join-seat')).toHaveCount(0)
  expect(
    await guest.evaluate((t) => localStorage.getItem(`bb-mp-${t}`), token),
  ).toBe(storedBefore)
  expect(await guest.evaluate(() => location.hash)).toBe('')

  await Promise.all(
    [hostCtx, guestCtx, restoredCtx, strangerCtx, forgedCtx].map((c) =>
      c.close(),
    ),
  )
})

test('a seat claimed after the game starts gets its key as a modal, and the board is usable once it closes', async ({
  browser,
}) => {
  /* ---- a live two-player game ---- */
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  await host.goto('/?fresh=1')
  await host.getByTestId('mode-online').click()
  await host.getByTestId('name-0').fill('Ada')
  await host.getByRole('button', { name: '2', exact: true }).click()
  await host.getByTestId('create-online').click()
  await host.waitForURL(/\/g\/[A-Za-z0-9_-]{20,}/)
  const gameUrl = host.url()

  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(gameUrl)
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  await host.getByTestId('lobby-ready-toggle').click()
  await guest.getByTestId('lobby-ready-toggle').click()
  await expect(host.getByTestId('lobby-start')).toBeEnabled()
  await host.getByTestId('lobby-start').click()
  await expect(host.getByTestId('era-plate')).toHaveText('canal era')

  /* ---- seat 1 is released and re-claimed mid-game ---- */
  // This path skips the lobby, so it never meets the inline notice: the key is
  // offered as a modal instead. Its condition is the one worth pinning — armed
  // for a lobby claim, the flag survives into the started game and drops a
  // full-screen curtain over the board.
  await host.getByTestId('seats-button').click()
  await host.getByTestId('release-1').click()
  await expect(host.getByTestId('seats-overlay')).toBeVisible()

  const retakenCtx = await browser.newContext()
  const retaken = await retakenCtx.newPage()
  await retaken.goto(gameUrl)
  await retaken.getByTestId('join-name').fill('Telford')
  await retaken.getByTestId('join-seat').click()

  await expect(retaken.getByTestId('seat-key-modal')).toBeVisible()
  await expect(retaken.getByTestId('seat-key-warning')).toContainText(
    'anyone with this link can take your seat',
  )
  await retaken.getByTestId('seat-key-close').click()
  await expect(retaken.getByTestId('seat-key-modal')).toHaveCount(0)

  // Nothing is left covering the table: a real click reaches the chrome (a
  // lingering curtain would intercept it), and the key is still retrievable.
  await expect(retaken.getByTestId('era-plate')).toHaveText('canal era')
  await retaken.getByTestId('chat-toggle').click()
  await expect(retaken.getByTestId('chat-list')).toBeVisible()
  await expect(retaken.getByTestId('seat-key-button')).toBeVisible()

  await Promise.all([hostCtx, guestCtx, retakenCtx].map((c) => c.close()))
})
