import { type Page, expect, test } from '@playwright/test'

/**
 * Whole-game coverage for the Ironmaster's Atlas: every action flow, the
 * error surface, the era transition, and a played-through game ending.
 *
 * Fixtures (all real engine-generated states, frozen by probe conditions in
 * generate-demo.test.ts):
 *   ?demo         canal round 8 — Eliza to act, £19, LAST action of her turn
 *   ?demo=sell    canal round 9 — George to act, £9; multi-sale possible
 *   ?demo=eraend  canal round 10 — George to act; ONE pass ends the era
 *   ?demo=gameend rail round 8 — Isambard to act; 8 passes reach game over
 *   ?era=rail     rail round 1 — George to act, £21; double bielsko-prerov +
 *                 pardubice-prerov completable (generator-verified)
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
 * Activate a map route. Routes are curved AND, on a dense graph, short links
 * are fully covered by their end-plates and by longer routes' fat 22px
 * hit-strokes drawn on top — so no mouse point on the stroke is reliably the
 * topmost element. Legal route hit-paths are keyboard-activatable buttons
 * (tabIndex + Enter/Space → onLinkClick), which is overlap-immune, so drive
 * legal routes that way. Illegal routes (used to assert the toast) are not
 * focusable, so fall back to a mouse click walked along the path to a point
 * where this route is actually the topmost hit element.
 */
async function clickRoute(page: Page, conn: string) {
  const path = page.locator(`path[data-conn="${conn}"]`)
  const legal = (await path.getAttribute('data-legal')) === 'true'
  if (legal) {
    await path.evaluate((el) => (el as SVGPathElement).focus())
    await page.keyboard.press('Enter')
    return
  }
  const pt = await path.evaluate((el) => {
    const p = el as unknown as SVGPathElement
    const len = p.getTotalLength()
    const screenAt = (frac: number) => {
      const q = p.getPointAtLength(len * frac)
      return new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM()!)
    }
    const fracs = [0.5]
    for (let k = 1; k <= 9; k++) fracs.push(0.5 + k * 0.045, 0.5 - k * 0.045)
    for (const f of fracs) {
      if (f < 0.06 || f > 0.94) continue
      const sp = screenAt(f)
      const top = document.elementFromPoint(sp.x, sp.y) as Element | null
      if (top === p) return { x: sp.x, y: sp.y }
    }
    const mid = screenAt(0.5)
    return { x: mid.x, y: mid.y }
  })
  await page.mouse.click(pt.x, pt.y)
}

test('Network: claim a canal route by clicking it on the map', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')

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
    page.getByText(/Eliza built a canal link between/).first(),
  ).toBeVisible()
  // £19 − £3 canal; this was the LAST action of Eliza's turn, so the
  // device passes on (round 8 continues with the next player).
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£16')
  await expect(page.getByTestId('round-chip')).toHaveText('Round 8')
  await expect(page.getByTestId('pass-curtain')).toBeVisible()
})

test('Network: rail-era double-link build (two routes, £15 + coal + beer)', async ({
  page,
}) => {
  await page.goto('/?era=rail')
  await expect(page.getByTestId('era-plate')).toHaveText('rail era')
  await expect(treasuryOf(page, 'George')).toHaveText('£21')

  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(page.getByText('Choose a rail route on the map.')).toBeVisible()

  await clickRoute(page, 'bielsko|prerov')
  await page.getByTestId('choose-double-link').click()
  await expect(
    page.getByText('Choose the second rail route on the map.'),
  ).toBeVisible()

  await clickRoute(page, 'pardubice|prerov')
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(/George built 2 rail links \(bielsko-prerov, pardubice-prerov\)/),
  ).toBeVisible()
  // The £15 (+ any market coal) left the treasury; this was George's last
  // action, so the device passes on.
  await expect(treasuryOf(page, 'George')).not.toHaveText('£21')
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
  await expect(treasuryOf(page, 'George')).toHaveText('£9')

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
    page.getByText(/George completed Sell action \(2 industries sold\)/),
  ).toBeVisible()
})

test('illegal clicks toast and CANCEL unwinds every flow', async ({ page }) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')

  const chooseAnAction = page.getByText('Choose an action')
  const cancel = page.getByTestId('cancel-action')

  // Build: reach the site step, click an ILLEGAL (dimmed) city → toast.
  await page.getByTestId('action-build').click()
  await page.getByTestId('card-brewery_2').click()
  await expect(page.getByText(/Choose a site for your brewery/)).toBeVisible()
  await page
    .locator('g[data-city="brno"]:not([data-legal])')
    .click({ force: true })
  await expect(
    page.getByText(/Brno is not a legal site for this build/),
  ).toBeVisible()
  // Unwind from deep inside the flow.
  await cancel.click()
  await cancel.click()
  await expect(chooseAnAction).toBeVisible()

  // Network: reach the route step, click a rail-only ghost → era toast.
  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(page.getByText('Choose a canal route on the map.')).toBeVisible()
  await clickRoute(page, 'tesin|liberec') // rail-only corridor
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
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')
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
    page.getByText(/Eliza scouted \(discarded 3 cards, gained 2 wild cards\)/),
  ).toBeVisible()
  // Her turn ends but the round continues with the next player.
  await expect(page.getByTestId('round-chip')).toHaveText('Round 8')
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
    page.getByText(/Eliza developed \(removed 1 tile/),
  ).toBeVisible()
  // Her turn ends but the round continues with the next player.
  await expect(page.getByTestId('round-chip')).toHaveText('Round 8')
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

  // Final scoring (links + flipped industries) crowns Isambard at 32 VP —
  // end-of-era scoring decides it, which is exactly what this test pins.
  await expect(finished).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Isambard prevails' }),
  ).toBeVisible()
  const rows = page.locator('.bb2-mat')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Isambard')
  await expect(rows.first()).toContainText('32')
  await expect(
    page.getByRole('button', { name: 'Found a new company' }),
  ).toBeVisible()
})

test('Undo: the first action of a turn can be taken back in full', async ({
  page,
}) => {
  await page.goto('/?demo=sell')
  await expect(treasuryOf(page, 'George')).toHaveText('£9')
  await expect(page.getByTestId('undo-action')).toHaveCount(0)

  // First action: sell one industry.
  await page.getByTestId('action-sell').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await page.getByTestId('sale-option').first().click()
  await expect(page.getByText(/Flipped 1 industry this action/)).toBeVisible()
  await page.getByTestId('confirm-action').click()
  await expect(
    page.getByText(/George completed Sell action/).first(),
  ).toBeVisible()

  // Second action pending — the undo affordance appears…
  await expect(page.getByTestId('actions-left')).toHaveText(
    'Last action this turn',
  )
  await page.getByTestId('undo-action').click()

  // …and the whole action is unwound: two actions again, the journal
  // entry is gone (it lives in the snapshot), nothing was spent.
  await expect(page.getByTestId('actions-left')).toHaveText(
    '2 of 2 actions left',
  )
  await expect(page.getByText(/George completed Sell action/)).toHaveCount(0)
  await expect(treasuryOf(page, 'George')).toHaveText('£9')
  await expect(page.getByTestId('undo-action')).toHaveCount(0)
})
