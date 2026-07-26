import { type Page, expect, test } from '@playwright/test'

/**
 * Card-first flow: playing a hand card BEFORE choosing an action holds the
 * card (machine state playing.action.cardSelected) and offers the actions it
 * can start; the chosen action then continues with the card carried in.
 * Fixture: ?demo — canal round 8, Eliza to act with £19, LAST action of her
 * turn (see coverage.spec.ts for the fixture map).
 */

function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

/** Click a map route ON its stroke (curved paths — see coverage.spec.ts). */
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

test('card-first: play a card, pick Network, confirm — card never re-asked', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')

  // The hand is live while idling, and the tray carries no label until an
  // action is actually in flight — play a card first.
  await expect(page.getByTestId('hand-hint')).toHaveCount(0)
  await page.getByTestId('card-brewery_2').click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(page.getByTestId('held-card')).toContainText('Holding')
  await expect(
    page.getByTestId('hand-hint').getByText(/^Holding /),
  ).toBeVisible()

  // The held card's actions are offered; Network goes STRAIGHT to the
  // route step — no second card ask.
  const network = page.getByTestId('action-network')
  await expect(network).toBeEnabled()
  await network.click()
  await expect(
    page.getByText(/Choose a canal route — \d+ available/),
  ).toBeVisible()

  // The card stays visibly held for the WHOLE action, not just the
  // cardSelected screen: it keeps its lift in the fan and the "Holding …"
  // label persists on the route step (the captain's report was that both
  // vanished the moment an action was pressed).
  const held = page.getByTestId('card-brewery_2')
  await expect(held).toHaveAttribute('data-selected', 'true')
  await expect(
    page.getByTestId('hand-hint').getByText(/^Holding /),
  ).toBeVisible()

  const legalRoute = page.locator('path[data-conn][data-legal="true"]')
  expect(await legalRoute.count()).toBeGreaterThan(0)
  const firstConn = (await legalRoute.first().getAttribute('data-conn'))!
  await clickRoute(page, firstConn)

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  // Still held through the confirm step, right up until it's spent.
  await expect(held).toHaveAttribute('data-selected', 'true')
  await expect(
    page.getByTestId('hand-hint').getByText(/^Holding /),
  ).toBeVisible()
  await confirm.click()

  // The link was laid with the held card and consumed the action (£19 − £3;
  // this was Eliza's LAST action, so the device passes on).
  await expect(
    page.getByText(/Eliza built a canal link between/).first(),
  ).toBeVisible()
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£16')
  await expect(page.getByTestId('pass-curtain')).toBeVisible()
})

test('card-first: build with the held card resumes at the industry step', async ({
  page,
}) => {
  await page.goto('/?demo')

  // brewery_2 is an industry card — card-first Build skips the card step.
  await page.getByTestId('card-brewery_2').click()
  await page.getByTestId('action-build').click()
  await expect(page.getByText(/Choose a site for your brewery/)).toBeVisible()

  // Cancel unwinds the flow without having consumed anything.
  await page.getByTestId('cancel-action').click()
  await page.getByTestId('cancel-action').click()
  await expect(page.getByText('Choose an action')).toBeVisible()
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')
})

test('action-first: the "Holding <card>" banner appears once a card is picked and persists', async ({
  page,
}) => {
  await page.goto('/?demo')

  // Action first: choose Network BEFORE a card. On the discard step no card is
  // held yet, so the dock shows no held-card banner.
  await page.getByTestId('action-network').click()
  await expect(page.getByTestId('held-card')).toHaveCount(0)

  // Pick a card during the discard step — the dock now NAMES it, the same
  // "Holding <card>" wording the card-first order shows.
  await page.getByTestId('card-birmingham_1').click()
  const held = page.getByTestId('held-card')
  await expect(held).toBeVisible()
  await expect(held).toContainText('Holding')
  await expect(held).toContainText('Birmingham')

  // …and it persists through the route step and into confirm.
  const legalRoute = page.locator('path[data-conn][data-legal="true"]')
  expect(await legalRoute.count()).toBeGreaterThan(0)
  const firstConn = (await legalRoute.first().getAttribute('data-conn'))!
  await clickRoute(page, firstConn)
  await expect(page.getByTestId('confirm-action')).toBeEnabled()
  await expect(page.getByTestId('held-card')).toContainText('Birmingham')
})

test('card-first: the same held-card banner shows in the dock and persists', async ({
  page,
}) => {
  await page.goto('/?demo')

  // Card first: the banner is up from the chooser onward.
  await page.getByTestId('card-birmingham_1').click()
  await expect(page.getByTestId('held-card')).toContainText('Birmingham')
  await page.getByTestId('action-network').click()
  // Same banner through the route step — identical to the action-first order.
  await expect(page.getByTestId('held-card')).toContainText('Birmingham')
})

test('card-first: clicking another card switches the selection on the pick step', async ({
  page,
}) => {
  await page.goto('/?demo')
  const brewery = page.getByTestId('card-brewery_2')
  const birmingham = page.getByTestId('card-birmingham_1')

  await brewery.click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(brewery).toHaveAttribute('data-selected', 'true')

  // Selection follows the last click — the new card is held, the old released.
  await birmingham.click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(birmingham).toHaveAttribute('data-selected', 'true')
  await expect(brewery).not.toHaveAttribute('data-selected', 'true')
})

test('card-first: clicking another card mid-action cancels it and re-holds the new one', async ({
  page,
}) => {
  await page.goto('/?demo')
  const birmingham = page.getByTestId('card-birmingham_1')
  const brewery = page.getByTestId('card-brewery_2')

  // Enter a real action flow holding Birmingham.
  await birmingham.click()
  await page.getByTestId('action-network').click()
  await expect(
    page.getByTestId('hand-hint').getByText(/^Holding /),
  ).toBeVisible()
  await expect(birmingham).toHaveAttribute('data-selected', 'true')

  // Clicking a DIFFERENT card mid-flow is "cancel this, play that instead":
  // the network action unwinds and we're back holding the new card.
  await brewery.click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(brewery).toHaveAttribute('data-selected', 'true')
  await expect(birmingham).not.toHaveAttribute('data-selected', 'true')
  // Nothing was spent — the switch consumed no action.
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')
})

test('card-first: the held card can be put back (re-tap and Put back)', async ({
  page,
}) => {
  await page.goto('/?demo')
  const chooseAnAction = page.getByText('Choose an action')
  const card = page.getByTestId('card-brewery_2')

  // Re-tapping the held card puts it back.
  await card.click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(card).toHaveAttribute('data-selected', 'true')
  await card.click()
  await expect(chooseAnAction).toBeVisible()

  // The Put back button does the same.
  await card.click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await page.getByTestId('cancel-action').click()
  await expect(chooseAnAction).toBeVisible()

  // Nothing was spent along the way.
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£19')
})
