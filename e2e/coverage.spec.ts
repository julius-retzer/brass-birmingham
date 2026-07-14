import { type Page, expect, test } from '@playwright/test'

/**
 * Whole-game coverage for the Ironmaster's Atlas: every action flow, the
 * error surface, the era transition, and a played-through game ending.
 *
 * Fixtures (all real engine-generated states, frozen by probe conditions in
 * generate-demo.test.ts):
 *   ?demo         canal round 6 — George to act, £18, 1 action left
 *   ?demo=sell    canal round 8 — Isambard to act, £10; multi-sale possible
 *   ?demo=eraend  canal round 10 — Eliza to act; ONE pass ends the era
 *   ?demo=gameend rail round 8 — Isambard to act; 8 passes reach game over
 *   ?era=rail     rail round 1 — Isambard to act, £41; double-link reachable
 */

function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

/** Pass the curtain if it is up (multi-turn helpers). */
async function revealIfGated(page: Page) {
  const reveal = page.getByTestId('reveal-hand')
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.click()
  }
}

/**
 * Click a map route ON its stroke. Routes are curved (routeBow), so the
 * bounding-box centre Playwright would click can miss the fat hit-stroke
 * entirely — compute the true path midpoint and click that with the mouse.
 */
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

test('Network: claim a canal route by clicking it on the map', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'George')).toHaveText('£18')

  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(
    page.getByText(/Choose a canal route — \d+ available/),
  ).toBeVisible()

  // Legal routes are marked on their fat hit-paths; illegal/ghost ones are not.
  const legalRoute = page.locator('path[data-conn][data-legal="true"]')
  expect(await legalRoute.count()).toBeGreaterThan(0)
  const firstConn = (await legalRoute.first().getAttribute('data-conn'))!
  await clickRoute(page, firstConn)

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(/George built a canal link between/),
  ).toBeVisible()
  // £18 − £3 canal + £25 end-of-round income (George is the round's last
  // player and this was his only action).
  await expect(treasuryOf(page, 'George')).toHaveText('£40')
  // Least spender goes first: George (£3) opens round 7 himself, so no
  // curtain — the round chip advancing is the turn-lifecycle proof.
  await expect(page.getByTestId('round-chip')).toHaveText('Round 7')
  await expect(page.getByTestId('mat-3')).toHaveAttribute(
    'data-current',
    'true',
  )
})

test('Network: rail-era double-link build (two routes, £15 + coal + beer)', async ({
  page,
}) => {
  await page.goto('/?era=rail')
  await expect(page.getByTestId('era-plate')).toHaveText('rail era')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£41')

  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(page.getByText('Choose a rail route on the map.')).toBeVisible()

  await clickRoute(page, 'cannock|wolverhampton')
  await page.getByTestId('choose-double-link').click()
  await expect(
    page.getByText('Choose the second rail route on the map.'),
  ).toBeVisible()

  await clickRoute(page, 'tamworth|nuneaton')
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(
      /Isambard built 2 rail links \(cannock-wolverhampton, tamworth-nuneaton\)/,
    ),
  ).toBeVisible()
  // £41 − £15 (both coal cubes came free from a connected mine).
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£26')
  await expect(page.getByTestId('pass-curtain')).toBeVisible()
})

test('Sell: gated with an explanation when nothing can be sold', async ({
  page,
}) => {
  await page.goto('/?demo')
  const sell = page.getByTestId('action-sell')
  await expect(sell).toBeDisabled()
  await expect(sell).toContainText('No goods you can sell right now')
})

test('Sell: multi-sale — flip two industries in one action', async ({
  page,
}) => {
  await page.goto('/?demo=sell')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£10')

  const sell = page.getByTestId('action-sell')
  await expect(sell).toBeEnabled()
  await sell.click()
  await page.locator('button.bb2-card:not([disabled])').first().click()

  // First sale, then a second one from the refreshed option list.
  await page.getByTestId('sale-option').first().click()
  await expect(page.getByText(/Flipped 1 industry this action/)).toBeVisible()
  await page.getByTestId('sale-option').first().click()
  await expect(page.getByText(/Flipped 2 industries this action/)).toBeVisible()

  await page.getByTestId('confirm-action').click()
  await expect(
    page.getByText(/Isambard completed Sell action \(2 industries sold\)/),
  ).toBeVisible()
})

test('illegal clicks toast and CANCEL unwinds every flow', async ({ page }) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'George')).toHaveText('£18')

  const chooseAnAction = page.getByText('Choose an action')
  const cancel = page.getByTestId('cancel-action')

  // Build: reach the site step, click an ILLEGAL (dimmed) city → toast.
  await page.getByTestId('action-build').click()
  await page.getByTestId('card-coal_1').click()
  await expect(page.getByText(/Choose a site for your coal/)).toBeVisible()
  await page
    .locator('g[data-city="birmingham"]:not([data-legal])')
    .click({ force: true })
  await expect(
    page.getByText(/Birmingham is not a legal site for this build/),
  ).toBeVisible()
  // Unwind from deep inside the flow.
  await cancel.click()
  await cancel.click()
  await expect(chooseAnAction).toBeVisible()

  // Network: reach the route step, click a rail-only ghost → era toast.
  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(page.getByText('Choose a canal route on the map.')).toBeVisible()
  await clickRoute(page, 'belper|leek') // rail-only corridor
  await expect(page.getByText(/That corridor only carries rail/)).toBeVisible()
  await cancel.click()
  await cancel.click()
  await expect(chooseAnAction).toBeVisible()

  // Develop, Scout, Loan: enter and cancel straight back out.
  for (const action of ['action-develop', 'action-scout', 'action-loan']) {
    await page.getByTestId(action).click()
    await expect(chooseAnAction).not.toBeVisible()
    await cancel.click()
    await expect(chooseAnAction).toBeVisible()
  }

  // Nothing was spent and the action was never consumed.
  await expect(treasuryOf(page, 'George')).toHaveText('£18')
})

test('Scout: discard three cards for the two wilds', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByTestId('action-scout').click()

  const enabledCards = page.locator(
    'button.bb2-card:not([disabled]):not([data-selected])',
  )
  for (let i = 0; i < 3; i++) {
    await enabledCards.first().click()
  }
  await expect(page.getByText(/\(3\/3 chosen\)/)).toBeVisible()

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(/George scouted \(discarded 3 cards, gained 2 wild cards\)/),
  ).toBeVisible()
  // George spent £0, so he leads the next round himself (no curtain).
  await expect(page.getByTestId('round-chip')).toHaveText('Round 7')
})

test('Develop: scrap the lowest tile, consuming iron', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByTestId('action-develop').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()

  // "Develop lowest available" auto-picks the cheapest developable tile,
  // then the confirm step spells out the cost before executing.
  await page.getByRole('button', { name: 'Develop lowest available' }).click()
  await expect(
    page.getByText(/Scrapping: .*lowest available tile.* — consumes iron/),
  ).toBeVisible()
  await page.getByTestId('confirm-action').click()

  await expect(
    page.getByText(/George developed \(removed 1 tile/),
  ).toBeVisible()
  // George spent nothing from the treasury (market iron was free-of-charge
  // only if from a works; either way the round advanced).
  await expect(page.getByTestId('round-chip')).toHaveText('Round 7')
})

test('era transition: one pass ends the Canal Era and opens the Rail Era', async ({
  page,
}) => {
  await page.goto('/?demo=eraend')
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')
  await expect(page.getByTestId('round-chip')).toHaveText('Round 10')

  // Passing is two-tap: the first click arms the button, the second confirms.
  await page.getByTestId('action-pass').click()
  await expect(page.getByTestId('action-pass')).toContainText('Really pass?')
  await page.getByTestId('action-pass').click()

  // Era scoring runs, the board turns over, and the Rail Era begins.
  await expect(page.getByTestId('era-plate')).toHaveText('rail era')
  await expect(
    page.getByText('The Canal Era has ended — welcome to the Age of Rail.'),
  ).toBeVisible()
  await expect(page.getByText('Canal Era ended').first()).toBeVisible()
  await expect(page.getByText('Rail Era started').first()).toBeVisible()
  await expect(
    page.getByText('All players drew new 8-card hands').first(),
  ).toBeVisible()
  await expect(page.getByTestId('round-chip')).toHaveText('Round 1')
})

test('capstone: play the final turns through the UI to the winner', async ({
  page,
}) => {
  await page.goto('/?demo=gameend')
  await expect(page.getByTestId('era-plate')).toHaveText('rail era')
  await expect(page.getByTestId('round-chip')).toHaveText('Round 8')

  // Play the game out: pass every remaining turn (8 passes across three
  // players, with the hotseat curtain between turns) until the books close.
  const finished = page.getByText('The books are closed')
  for (let i = 0; i < 45; i++) {
    if (await finished.isVisible().catch(() => false)) break
    await revealIfGated(page)
    const pass = page.getByTestId('action-pass')
    if (await pass.isVisible().catch(() => false)) {
      // Two-tap pass: the loop's next iteration lands the confirming click.
      await pass.click()
    }
    await page.waitForTimeout(50)
  }

  // Final scoring (links + flipped industries) crowns Eliza at 57 VP —
  // she entered these last turns THIRD on points (11 vp) and wins on
  // end-of-era scoring, which is exactly what this test pins.
  await expect(finished).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Eliza prevails' }),
  ).toBeVisible()
  const rows = page.locator('.bb2-mat')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Eliza')
  await expect(rows.first()).toContainText('57')
  await expect(
    page.getByRole('button', { name: 'Found a new company' }),
  ).toBeVisible()
})
