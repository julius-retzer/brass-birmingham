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

  // The hand is live while idling — play a card first.
  await page.getByTestId('card-brewery_2').click()
  await expect(page.getByText('Play this card')).toBeVisible()
  await expect(page.getByText('Holding')).toBeVisible()

  // The held card's actions are offered; Network goes STRAIGHT to the
  // route step — no second card ask.
  const network = page.getByTestId('action-network')
  await expect(network).toBeEnabled()
  await network.click()
  await expect(
    page.getByText(/Choose a canal route — \d+ available/),
  ).toBeVisible()

  const legalRoute = page.locator('path[data-conn][data-legal="true"]')
  expect(await legalRoute.count()).toBeGreaterThan(0)
  const firstConn = (await legalRoute.first().getAttribute('data-conn'))!
  await clickRoute(page, firstConn)

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
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
