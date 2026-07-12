import { type Page, expect, test } from '@playwright/test'

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
  await guest.getByTestId('action-pass').click()
  await expect(host.getByTestId('round-chip')).toHaveText('Round 2')
  await expect(guest.getByTestId('round-chip')).toHaveText('Round 2')

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
      // the initial view arrives as the first data: frame; read until the
      // frame terminator
      for (let i = 0; i < 10 && !text.includes('\n\n'); i++) {
        const { value, done } = await reader.read()
        if (done) break
        text += new TextDecoder().decode(value)
      }
      await reader.cancel()
      return text
    },
    { token },
  )
  expect(rawEvent).toContain('data: ')
  const payload = JSON.parse(
    rawEvent.slice(rawEvent.indexOf('data: ') + 6, rawEvent.indexOf('\n\n')),
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
