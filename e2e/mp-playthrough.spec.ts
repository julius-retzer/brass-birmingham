import { type Page, expect as baseExpect, test } from '@playwright/test'

// Every assertion here waits on a real POST + SSE round-trip against a real
// network database; on a contended machine those regularly outlast the 5s
// default without anything being wrong. Widen the whole file's expects.
const expect = baseExpect.configure({ timeout: 15_000 })
import {
  cityDisplayName,
  pickBreweryCity,
  pickCottonPlan,
  pickIronPlan,
} from '../src/test/mp-opening-plan'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

/**
 * Networked multiplayer PLAYTHROUGH: two real browsers play a realistic
 * canal-era opening through the UI — every click a real intent over
 * /api/mp/act, every screen update a real SSE frame. One deterministic
 * journey covers the action surface AND both resource-source pickers:
 *
 *   Ada (host)    — network, loan, scout, build (wild location → brewery),
 *                   build (wild industry → cotton), SELL into a genuine
 *                   beer-source choice (own brewery vs merchant barrel),
 *                   DEVELOP into a genuine iron-source choice (2 rival works)
 *   Brunel (guest)— network, loan, scout, two iron works via both wild cards
 *                   (+ any linking canals), then passes
 *
 * Also pinned on the way: CANCEL unwinds a staged sale without flipping,
 * a FORGED off-offer beer pick is refused over the raw wire with the exact
 * explainRefusal reason, and the opponent's screen converges on every step.
 *
 * The same opening is validated offline (no DB) against `applyIntent` in
 * src/server/mp/playthrough.test.ts — if this journey breaks but that one
 * passes, the regression is in the UI/transport, not the engine.
 */

test.skip(!hasDatabaseUrl, `multiplayer playthrough e2e ${NEEDS_DB_MESSAGE}`)
test.setTimeout(420_000)

interface WireContext {
  era: string
  currentPlayerIndex: number
  merchants: Array<{
    location: string
    hasBeer: boolean
    industryIcons: string[]
  }>
  players: Array<{
    name: string
    industries: Array<{
      type: string
      location: string
      flipped: boolean
      ironCubesOnTile: number
    }>
  }>
}

/** Read this seat's own next full-state SSE frame (fresh stream, first frame).
 * Retries: a contended dev server can answer a one-off 500 mid-journey. */
async function fetchContext(page: Page, token: string): Promise<WireContext> {
  let lastError: unknown
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetchContextOnce(page, token)
    } catch (error) {
      lastError = error
      await page.waitForTimeout(700)
    }
  }
  throw lastError
}

async function fetchContextOnce(
  page: Page,
  token: string,
): Promise<WireContext> {
  const raw = await page.evaluate(
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
      for (let i = 0; i < 30 && !/data: .+\n\n/.test(text); i++) {
        const { value, done } = await reader.read()
        if (done) break
        text += new TextDecoder().decode(value)
      }
      await reader.cancel()
      const start = text.indexOf('data: ') + 6
      return text.slice(start, text.indexOf('\n\n', start))
    },
    { token },
  )
  return (
    JSON.parse(raw) as {
      snapshot: { context: WireContext }
    }
  ).snapshot.context
}

/** POST a raw event as this seat — the wire a modified client could speak. */
async function postIntent(
  page: Page,
  token: string,
  event: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(
    async ({ token, event }) => {
      const creds = JSON.parse(localStorage.getItem(`bb-mp-${token}`)!) as {
        seatId: number
        seatSecret: string
      }
      const res = await fetch('/api/mp/act', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          seatId: creds.seatId,
          seatSecret: creds.seatSecret,
          event,
        }),
      })
      return (await res.json()) as { ok: boolean; error?: string }
    },
    { token, event },
  )
}

/** Click a curved map route ON its stroke (bbox-centre misses bowed paths). */
async function clickRoute(page: Page, a: string, b: string) {
  const key =
    (await page.locator(`path[data-conn="${a}|${b}"]`).count()) > 0
      ? `${a}|${b}`
      : `${b}|${a}`
  const path = page.locator(`path[data-conn="${key}"]`)
  const pt = await path.evaluate((el) => {
    const p = el as unknown as SVGPathElement
    const mid = p.getPointAtLength(p.getTotalLength() / 2)
    const sp = new DOMPoint(mid.x, mid.y).matrixTransform(p.getScreenCTM()!)
    return { x: sp.x, y: sp.y }
  })
  await page.mouse.click(pt.x, pt.y)
}

const dismissCurtain = async (page: Page) => {
  const curtain = page.getByTestId('round-curtain-dismiss')
  if (await curtain.isVisible().catch(() => false)) {
    await curtain.click().catch(() => undefined)
  }
}

/** A hand card that is NOT a wild (wilds are spent on the two builds). */
const plainCard = (page: Page) =>
  page
    .locator('button.bb2-card:not([disabled])')
    .filter({ hasNotText: 'Any Location' })
    .filter({ hasNotText: 'Any Industry' })
    .first()

/** Wait until this page's dock has settled back to "choose an action" or the
 * turn has moved on — the anchor between consecutive intents. */
const settle = async (page: Page) => {
  await expect(
    page.getByTestId('action-pass').or(page.getByTestId('waiting-panel')),
  ).toBeVisible({ timeout: 20_000 })
}

/** Wait for the dock to be interactive (no in-flight intent dimming it). */
const notBusy = async (page: Page) => {
  await expect(page.locator('.bb2-busy')).toHaveCount(0)
}

test('two browsers play a realistic opening: every action, both source pickers, refusals named', async ({
  browser,
}) => {
  /* ---- create + join, exactly like a real table ---- */
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

  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(gameUrl)
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  /* ---- ready up, then the host starts (no more auto-start on full) ---- */
  await host.getByTestId('lobby-ready-toggle').click()
  await guest.getByTestId('lobby-ready-toggle').click()
  const startBtn = host.getByTestId('lobby-start')
  await expect(startBtn).toBeEnabled()
  await startBtn.click()

  await expect(host.getByTestId('era-plate')).toHaveText('canal era')
  await expect(guest.getByTestId('era-plate')).toHaveText('canal era')

  const pages: [Page, Page] = [host, guest] // seat order: creator is seat 0

  /* ---- plan the opening from PUBLIC state (merchant tiles shuffle) ---- */
  const startCtx = await fetchContext(host, token)
  const cotton = pickCottonPlan(startCtx.merchants)
  expect(
    cotton,
    'a beer-holding cotton merchant with an adjacent mill site',
  ).not.toBeNull()
  const iron = pickIronPlan(new Set([cotton!.mill]))
  expect(iron, 'two linked iron-works sites near a merchant').not.toBeNull()
  const brewery = pickBreweryCity(
    new Set([cotton!.mill, iron!.first, iron!.second]),
  )
  expect(brewery, 'a brewery city clear of the other sites').toBeDefined()

  /* ---- UI action runners (each = one action; clicks only) ----
   * EVERY click here POSTs a real intent and the dock swallows clicks while
   * one is in flight — so each click is anchored on the NEXT step's UI before
   * the following click fires. */

  const network = async (page: Page, from: string, to: string) => {
    await notBusy(page)
    await page.getByTestId('action-network').click()
    await expect(page.getByText(/to open a route/).first()).toBeVisible()
    await plainCard(page).click()
    await expect(page.getByText(/Choose a canal route/).first()).toBeVisible()
    await expect(async () => {
      await clickRoute(page, from, to)
      await expect(page.getByTestId('confirm-action')).toBeEnabled({
        timeout: 2000,
      })
    }).toPass()
    await page.getByTestId('confirm-action').click()
    await settle(page)
  }

  const loan = async (page: Page) => {
    await notBusy(page)
    await page.getByTestId('action-loan').click()
    await expect(page.getByText(/Discard any card/).first()).toBeVisible()
    await plainCard(page).click()
    await expect(page.getByText(/Sign with the bank/).first()).toBeVisible()
    await page.getByTestId('confirm-action').click()
    await settle(page)
  }

  const scout = async (page: Page) => {
    await notBusy(page)
    await page.getByTestId('action-scout').click()
    for (let i = 1; i <= 3; i++) {
      await notBusy(page)
      await page
        .locator('button.bb2-card:not([disabled]):not([data-selected])')
        .filter({ hasNotText: 'Any Location' })
        .filter({ hasNotText: 'Any Industry' })
        .first()
        .click()
      await expect(page.getByText(`(${i}/3 chosen)`).first()).toBeVisible()
    }
    await page.getByTestId('confirm-action').click()
    await settle(page)
  }

  const buildWithWild = async (
    page: Page,
    wildLabel: 'Any Location' | 'Any Industry',
    industryType: string,
    cityId: string,
  ) => {
    await notBusy(page)
    await page.getByTestId('action-build').click()
    await expect(
      page.getByText(/Play a card from your hand/).first(),
    ).toBeVisible()
    await page
      .locator('button.bb2-card:not([disabled])')
      .filter({ hasText: wildLabel })
      .first()
      .click()
    await expect(page.getByTestId(`industry-${industryType}`)).toBeVisible()
    await page.getByTestId(`industry-${industryType}`).click()
    await expect(
      page.getByText(/Choose a site on the map/).first(),
    ).toBeVisible()
    // Wait for the settled view to mark the site legal, then click it —
    // retrying, because a click during SSE churn can be swallowed.
    await expect(
      page.locator(`g[data-city="${cityId}"][data-legal="true"]`),
    ).toBeVisible()
    await expect(async () => {
      await page.locator(`g[data-city="${cityId}"]`).click()
      // If more than one unflipped works could pay the tile's iron, the
      // machine stops to ask — otherwise it goes straight to the confirm.
      await expect(
        page
          .getByTestId('confirm-action')
          .or(page.getByTestId('iron-source').first()),
      ).toBeVisible({ timeout: 2000 })
    }).toPass()
    if ((await page.getByTestId('iron-source').count()) > 0) {
      await page.getByTestId('iron-source').first().click()
    }
    await expect(page.getByTestId('confirm-action')).toBeEnabled()
    await page.getByTestId('confirm-action').click()
    await settle(page)
  }

  const pass = async (page: Page) => {
    await notBusy(page)
    const btn = page.getByTestId('action-pass')
    // The turn can move under us between detection and click — skip, retry.
    if (!(await btn.isVisible().catch(() => false))) return
    await btn.click()
    await expect(btn).toContainText('Really pass?')
    await btn.click()
    await settle(page)
  }

  /* ---- the two seats' scripts ---- */

  type Step = {
    ready?: (ctx: WireContext) => boolean
    run: (page: Page) => Promise<void>
  }

  const unflippedWorks = (ctx: WireContext) =>
    ctx.players
      .flatMap((p) => p.industries)
      .filter((i) => i.type === 'iron' && !i.flipped && i.ironCubesOnTile > 0)

  const sellerSteps: Step[] = [
    { run: (p) => network(p, cotton!.mill, cotton!.merchant) },
    { run: loan },
    { run: scout },
    { run: (p) => buildWithWild(p, 'Any Location', 'brewery', brewery!) },
    { run: (p) => buildWithWild(p, 'Any Industry', 'cotton', cotton!.mill) },
    {
      // The headline sale. Merchants are per-slot entries — gate on the
      // cotton-buying slot still holding its barrel, not the first entry.
      ready: (ctx) =>
        ctx.merchants.some(
          (m) =>
            m.location === cotton!.merchant &&
            m.hasBeer &&
            m.industryIcons.includes('cotton'),
        ),
      run: async (page) => {
        await notBusy(page)
        await page.getByTestId('action-sell').click()
        await expect(page.getByText(/Discard any card/).first()).toBeVisible()
        await plainCard(page).click()
        const saleOption = page
          .getByTestId('sale-option')
          .filter({ hasText: `cotton at ${cityDisplayName(cotton!.mill)}` })
          .filter({ hasText: cityDisplayName(cotton!.merchant) })
          .first()

        // Stage the sale: the machine must STOP at the beer question.
        await saleOption.click()
        const sources = page.getByTestId('beer-source')
        await expect(sources.first()).toBeVisible()
        expect(await sources.count()).toBeGreaterThanOrEqual(2)

        // Backing out drops the staged sale without flipping anything…
        await page.getByTestId('cancel-action').click()
        await expect(page.getByTestId('sale-option').first()).toBeVisible()
        await expect(page.getByText(/Flipped 1 industry/)).toHaveCount(0)

        // …so stage it again, for real this time.
        await saleOption.click()
        await expect(sources.first()).toBeVisible()

        // A FORGED pick (a brewery nobody built), straight down the wire a
        // modified client would use, is refused with the exact reason.
        const forged = await postIntent(page, token, {
          type: 'SELECT_BEER_SOURCE',
          source: { kind: 'brewery', ownerId: '1', location: 'birmingham' },
        })
        expect(forged.ok).toBe(false)
        expect(forged.error).toBe(
          'That beer source is not available for this action.',
        )

        // The legal pick — the merchant's barrel — executes the sale.
        await sources.filter({ hasText: "merchant's barrel" }).first().click()
        await expect(page.getByText(/Flipped 1 industry/).first()).toBeVisible()
        await page.getByTestId('confirm-action').click()
        await settle(page)

        // The rival's screen converges on the completed sale via SSE.
        await expect(
          guest.getByText(/completed Sell action/).first(),
        ).toBeVisible()
      },
    },
    {
      // Develop only once both rival works stand — that makes iron a genuine
      // question (the market is never offered while any works holds cubes).
      ready: (ctx) => unflippedWorks(ctx).length >= 2,
      run: async (page) => {
        await notBusy(page)
        await page.getByTestId('action-develop').click()
        await expect(page.getByText(/Discard any card/).first()).toBeVisible()
        await plainCard(page).click()
        await expect(page.getByTestId('develop-lowest')).toBeVisible()
        await page.getByTestId('develop-lowest').click()

        const sources = page.getByTestId('iron-source')
        await expect(sources.first()).toBeVisible()
        expect(await sources.count()).toBeGreaterThanOrEqual(2)
        // Rules p.5: the market is a fallback, never an alternative.
        await expect(sources.filter({ hasText: /market/i })).toHaveCount(0)

        await sources.filter({ hasText: "Brunel's iron works" }).first().click()
        await page.getByTestId('confirm-action').click()
        await settle(page)
      },
    },
  ]

  const rivalSteps: Step[] = [
    { run: (p) => network(p, iron!.first, iron!.market) },
    { run: loan },
    { run: scout },
    { run: (p) => buildWithWild(p, 'Any Location', 'iron', iron!.first) },
    ...iron!.extensionLinks.map((link) => ({
      run: (p: Page) => network(p, link.from, link.to),
    })),
    { run: (p) => buildWithWild(p, 'Any Industry', 'iron', iron!.second) },
  ]

  /* ---- interleave on the SERVER's word for whose turn it is ----
   * A page can show a stale dock for the ~1s between an action landing and
   * its SSE frame arriving — trusting the DOM alone once passed the wrong
   * seat and deadlocked. currentPlayerIndex on the wire is authoritative. */

  const queues: [Step[], Step[]] = [sellerSteps, rivalSteps]
  for (
    let guard = 0;
    (queues[0].length > 0 || queues[1].length > 0) && guard < 240;
    guard++
  ) {
    await dismissCurtain(host)
    await dismissCurtain(guest)
    const ctx = await fetchContext(host, token)
    expect(ctx.era, 'the opening must finish inside the Canal Era').toBe(
      'canal',
    )
    const seat = ctx.currentPlayerIndex
    const page = pages[seat]!
    // Wait until the active seat's own dock has caught up before clicking.
    if (
      !(await page
        .getByTestId('action-pass')
        .isVisible()
        .catch(() => false))
    ) {
      await host.waitForTimeout(300)
      continue
    }
    const queue = queues[seat]!
    const step = queue[0]
    if (!step || (step.ready && !step.ready(ctx))) {
      await pass(page)
      continue
    }
    queue.shift()
    await step.run(page)
  }

  // Both scripts drained — a stall means a step's preconditions could never
  // be met, which is exactly what this journey exists to catch.
  expect(queues[0]).toHaveLength(0)
  expect(queues[1]).toHaveLength(0)

  await hostCtx.close()
  await guestCtx.close()
})
