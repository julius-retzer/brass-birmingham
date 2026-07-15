import { type Page, expect, test } from '@playwright/test'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

/**
 * Networked multiplayer journey: two REAL browser contexts (separate
 * localStorage), server-authoritative engine, SSE live updates.
 *
 * Covers, in one deterministic flow:
 *  - host creates an online table from the charter and gets a /g/<token> URL
 *  - guest joins via the URL, the game auto-starts when seats fill
 *  - actions round-trip live in both directions (loan → pass → round 2)
 *  - a mid-game refresh reclaims the seat from the localStorage secret
 *  - WIRE-LEVEL hidden-information check: the guest's own SSE stream bytes
 *    contain no real card of the host's hand and no real draw-pile card
 */

test.skip(!hasDatabaseUrl, `multiplayer e2e ${NEEDS_DB_MESSAGE}`)

function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

test('two browsers: create → join → live convergence → seat reclaim → wire hygiene', async ({
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
  const token = gameUrl.split('/g/')[1]!
  await expect(host.getByText('Waiting for players')).toBeVisible()

  /* ---- guest joins via the shared URL (separate context) ---- */
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(gameUrl)
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  // seats full → the game starts for BOTH, live
  await expect(host.getByTestId('era-plate')).toHaveText('canal era')
  await expect(guest.getByTestId('era-plate')).toHaveText('canal era')
  await expect(guest.getByTestId('you-chip')).toHaveText('You are Brunel')
  // Ada opens; the guest is spectating her turn behind the waiting panel
  await expect(guest.getByTestId('waiting-panel')).toBeVisible()
  await expect(guest.getByText('Waiting for Ada to act…')).toBeVisible()

  /* ---- host acts; the guest's screen converges without any input ---- */
  await host.getByTestId('action-loan').click()
  await host.locator('button.bb2-card:not([disabled])').first().click()
  await host.getByTestId('confirm-action').click()
  await expect(guest.getByText(/Ada took a loan/)).toBeVisible()
  await expect(treasuryOf(guest, 'Ada')).toHaveText('£47')

  /* ---- turn passes to the guest; both converge on round 2 ---- */
  await expect(guest.getByTestId('action-pass')).toBeVisible()
  await expect(host.getByTestId('waiting-panel')).toBeVisible()
  // turn notification cues: the guest's tab title flags the turn, the
  // host's does not; the unobtrusive permission bell is available
  await expect(guest).toHaveTitle(/● Your turn — Brass/)
  await expect(host).toHaveTitle(/^Brass: Birmingham$/)
  // the permission bell shows only while permission is undecided — the
  // test browser may auto-grant/deny, so gate the assertion on it
  const notifyPermission = await guest.evaluate(() => Notification.permission)
  if (notifyPermission === 'default') {
    await expect(guest.getByTestId('notify-enable')).toBeVisible()
  } else {
    await expect(guest.getByTestId('notify-enable')).toHaveCount(0)
  }
  // Two-tap pass: arm, then confirm.
  await guest.getByTestId('action-pass').click()
  await guest.getByTestId('action-pass').click()
  await expect(host.getByTestId('round-chip')).toHaveText('Round 2')
  await expect(guest.getByTestId('round-chip')).toHaveText('Round 2')

  /* ---- table talk: message, unread badge, reply ---- */
  await host.getByTestId('chat-toggle').click()
  await host.getByTestId('chat-input').fill('good luck!')
  await host.getByTestId('chat-send').click()
  // the guest sees an unread badge (panel closed), then reads it
  await expect(guest.getByTestId('chat-unread')).toHaveText('1')
  await guest.getByTestId('chat-toggle').click()
  await expect(guest.getByTestId('chat-list')).toContainText('good luck!')
  await expect(guest.getByTestId('chat-unread')).toHaveCount(0)
  // reply flows back to the host's already-open panel
  await guest.getByTestId('chat-input').fill('you too')
  await guest.getByTestId('chat-send').click()
  await expect(host.getByTestId('chat-list')).toContainText('you too')

  /* ---- mid-game refresh reclaims the seat from the stored secret ---- */
  await guest.reload()
  await expect(guest.getByTestId('you-chip')).toHaveText('You are Brunel')
  await expect(guest.getByTestId('round-chip')).toHaveText('Round 2')

  /* ---- wire hygiene: read the guest's OWN stream bytes and inspect ---- */
  const rawEvent = await guest.evaluate(
    async ({ token }) => {
      const creds = JSON.parse(localStorage.getItem(`bb-mp-${token}`)!) as {
        seatId: number
        seatSecret: string
      }
      const res = await fetch(
        `/api/mp/stream?token=${token}&seat=${creds.seatId}&secret=${encodeURIComponent(creds.seatSecret)}`,
      )
      const reader = res.body!.getReader()
      let text = ''
      // The stream opens with a `retry:` reconnect hint, then the initial view
      // as a `data:` frame; read until a complete data frame has arrived.
      for (let i = 0; i < 20 && !/data: .+\n\n/.test(text); i++) {
        const { value, done } = await reader.read()
        if (done) break
        text += new TextDecoder().decode(value)
      }
      await reader.cancel()
      return text
    },
    { token },
  )
  // The stream sends a reconnect hint so EventSource reconnects in ~1.5s (not
  // Chrome's ~4s default) when the bounded stream rotates.
  expect(rawEvent).toContain('retry: 1500')
  expect(rawEvent).toContain('data: ')
  // Slice the data frame relative to `data: ` — the FIRST `\n\n` now
  // terminates the leading `retry:` line, not the payload.
  const dataStart = rawEvent.indexOf('data: ') + 6
  const payload = JSON.parse(
    rawEvent.slice(dataStart, rawEvent.indexOf('\n\n', dataStart)),
  ) as {
    you: number
    snapshot: {
      context: {
        players: Array<{ hand: Array<{ id: string }> }>
        drawPile: Array<{ id: string }>
      }
    }
  }
  expect(payload.you).toBe(1)
  const ctx = payload.snapshot.context
  // the guest's own hand is real…
  expect(ctx.players[1]!.hand.length).toBeGreaterThan(0)
  expect(ctx.players[1]!.hand.every((c) => !c.id.startsWith('hidden-'))).toBe(
    true,
  )
  // …the host's hand and the deck are placeholders, counts only
  expect(ctx.players[0]!.hand.length).toBeGreaterThan(0)
  expect(ctx.players[0]!.hand.every((c) => c.id.startsWith('hidden-'))).toBe(
    true,
  )
  expect(ctx.drawPile.every((c) => c.id.startsWith('hidden-'))).toBe(true)

  await hostCtx.close()
  await guestCtx.close()
})
