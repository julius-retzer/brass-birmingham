import { type Page, expect as baseExpect, test } from '@playwright/test'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

// Every assertion waits on a real POST + SSE round-trip against a real
// network database; on a contended machine those outlast the 5s default.
const expect = baseExpect.configure({ timeout: 15_000 })

/**
 * Networked multiplayer journey: two REAL browser contexts (separate
 * localStorage), server-authoritative engine, SSE live updates.
 *
 * Covers, in one deterministic flow:
 *  - host creates an online table from the charter and gets a /g/<token> URL
 *  - guest joins via the URL, both ready up, the host starts the game
 *  - actions round-trip live in both directions (loan → pass → round 2)
 *  - a mid-game refresh reclaims the seat from the localStorage secret
 *  - WIRE-LEVEL hidden-information check: the guest's own SSE stream bytes
 *    contain no real card of the host's hand, no real draw-pile card, and
 *    none of the host's in-progress selection (the route she is mid-way
 *    through picking)
 */

test.skip(!hasDatabaseUrl, `multiplayer e2e ${NEEDS_DB_MESSAGE}`)
// One long journey over a REAL network database: ~15 round-trips at ~1s each
// plus the ~8s chat-wire window blow the 30s default on a slow/contended DB.
test.setTimeout(150_000)

// Map routes are CURVED: a bbox-centre click misses the fat hit-stroke, so
// aim at the path's own midpoint (same helper as coverage.spec.ts).
async function clickRoute(page: Page, conn: string) {
  const path = page.locator(`path[data-conn="${conn}"]`)
  const pt = await path.evaluate((el) => {
    const p = el as unknown as SVGPathElement
    const mid = p.getPointAtLength(p.getTotalLength() / 2)
    const sp = new DOMPoint(mid.x, mid.y).matrixTransform(p.getScreenCTM()!)
    return { x: sp.x, y: sp.y }
  })
  await page.mouse.click(pt.x, pt.y)
}

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
  await expect(host.getByText('Waiting to begin')).toBeVisible()

  /* ---- guest joins via the shared URL (separate context) ---- */
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(gameUrl)
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  /* ---- both ready up, the host starts the game ---- */
  await host.getByTestId('lobby-ready-toggle').click()
  await guest.getByTestId('lobby-ready-toggle').click()
  await expect(host.getByTestId('lobby-start')).toBeEnabled()
  await host.getByTestId('lobby-start').click()

  // the game starts for BOTH, live
  await expect(host.getByTestId('era-plate')).toHaveText('canal era')
  await expect(guest.getByTestId('era-plate')).toHaveText('canal era')
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
  await expect(host.getByTestId('round-chip')).toHaveText('Round 2/11')
  await expect(guest.getByTestId('round-chip')).toHaveText('Round 2/11')

  /* ---- table talk: message, unread badge, reply ---- */
  await host.getByTestId('chat-toggle').click()
  await host.getByTestId('chat-input').fill('good luck!')
  await host.getByTestId('chat-send').click()
  // the guest sees an unread badge (panel closed), then reads it — delivery
  // rides the ~1.2s DB poll, so give a contended database room to breathe
  await expect(guest.getByTestId('chat-unread')).toHaveText('1', {
    timeout: 15_000,
  })
  await guest.getByTestId('chat-toggle').click()
  await expect(guest.getByTestId('chat-list')).toContainText('good luck!')
  await expect(guest.getByTestId('chat-unread')).toHaveCount(0)
  // reply flows back to the host's already-open panel
  await guest.getByTestId('chat-input').fill('you too')
  await guest.getByTestId('chat-send').click()
  await expect(host.getByTestId('chat-list')).toContainText('you too', {
    timeout: 15_000,
  })

  /* ---- mid-game refresh reclaims the seat from the stored secret ---- */
  await guest.reload()
  await expect(guest.getByTestId('round-chip')).toHaveText('Round 2/11')

  /* ---- the host opens a Network action and picks a route, but does NOT
     confirm: every step is a persisted intent that broadcasts, so this is
     exactly the moment an opponent could watch the pick live ---- */
  await expect(host.getByTestId('action-network')).toBeVisible()
  await host.getByTestId('action-network').click()
  await expect(
    host.locator('button.bb2-card:not([disabled])').first(),
  ).toBeVisible()
  await host.locator('button.bb2-card:not([disabled])').first().click()
  await expect(
    host.getByText(/Choose a canal route — \d+ available/),
  ).toBeVisible()
  const legalRoute = host.locator('path[data-conn][data-legal="true"]')
  await expect(legalRoute).not.toHaveCount(0)
  const pickedConn = (await legalRoute.first().getAttribute('data-conn'))!
  await clickRoute(host, pickedConn)
  await expect(host.getByTestId('confirm-action')).toBeEnabled()

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
  // …and the host's IN-PROGRESS selection is redacted: the route she just
  // picked is nowhere in the guest's frame, so it cannot light up their map.
  expect(ctx.selectedLink).toBeNull()
  expect(ctx.selectedSecondLink).toBeNull()
  expect(ctx.selectedLocation).toBeNull()
  expect(ctx.selectedIndustryTile).toBeNull()
  expect(ctx.selectedTilesForDevelop).toEqual([])
  expect(ctx.pendingSale).toBeNull()
  expect(ctx.chosenBeerSources).toEqual([])
  expect(ctx.chosenIronSources).toEqual([])
  expect(ctx.chosenCoalSources).toEqual([])
  expect(ctx.selectedCard?.id).toMatch(/^hidden-/)
  // Belt-and-braces at the byte level: neither endpoint of the picked route
  // appears in the selection payload the guest received.
  // (selectedCard is excluded: its placeholder is a legit-shaped Birmingham
  // location card, which would false-positive a raw city-id search.)
  const selectionWire = JSON.stringify({
    selectedLink: ctx.selectedLink,
    selectedSecondLink: ctx.selectedSecondLink,
    selectedLocation: ctx.selectedLocation,
    selectedIndustryTile: ctx.selectedIndustryTile,
    selectedTilesForDevelop: ctx.selectedTilesForDevelop,
    pendingSale: ctx.pendingSale,
  })
  for (const city of pickedConn.split('|')) {
    expect(selectionWire).not.toContain(city)
  }

  /* ---- chat delta on the wire: a NEW chat line arrives as an `event: chat`
     increment (NOT a full-state `data:` view frame), proving a message never
     costs a full ~26KB per-seat frame under the DB-as-bus poll ---- */
  const [chatWire] = await Promise.all([
    guest.evaluate(
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
        // Read for up to ~8s or until the chat increment frame lands.
        for (let i = 0; i < 60 && !/event: chat\n/.test(text); i++) {
          const { value, done } = await reader.read()
          if (done) break
          text += new TextDecoder().decode(value)
        }
        await reader.cancel()
        return text
      },
      { token },
    ),
    // Send a fresh line from the host once the guest's raw stream is open.
    (async () => {
      await guest.waitForTimeout(1500)
      await host.getByTestId('chat-input').fill('wire-delta-check')
      await host.getByTestId('chat-send').click()
    })(),
  ])
  // The increment rides its own SSE event and carries only the new message —
  // there is no engine snapshot in a chat frame.
  expect(chatWire).toContain('event: chat')
  const chatStart = chatWire.indexOf('event: chat')
  const dataLine = chatWire.slice(chatStart).match(/data: (.+)\n/)
  const delta = JSON.parse(dataLine![1]!) as {
    chatSeq: number
    messages: Array<{ id: number; text: string }>
    snapshot?: unknown
  }
  expect(delta.snapshot).toBeUndefined() // chat frame ≠ full-state frame
  expect(delta.messages.at(-1)!.text).toBe('wire-delta-check')
  expect(delta.chatSeq).toBe(delta.messages.at(-1)!.id)

  await hostCtx.close()
  await guestCtx.close()
})
