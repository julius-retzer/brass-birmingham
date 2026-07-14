import { type Page, expect, test } from '@playwright/test'

/**
 * Core journeys for the Ironmaster's Atlas (landed from the e2e spike).
 * Runs against the dev server (see playwright.config.ts webServer).
 *
 * Selector strategy: data-testid spine for structure (actions, confirm,
 * treasury, curtain, cards, map plates/routes), visible text for the
 * assertions that intentionally pin game meaning (journal lines, era).
 * State strategy: the app's own boot hooks (?fresh=1, ?demo, ?era=rail,
 * ?preview=gameover) provide deterministic engine-generated states; ?demo
 * is canal round 6, George to act with £18 and 1 action remaining.
 */

/** Treasury stat of a named player in the player rail. */
export function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

test('fresh game: setup charter → Loan action end-to-end → pass gate', async ({
  page,
}) => {
  await page.goto('/?fresh=1')

  // Setup charter: pick 2 players, name player 1, start.
  await expect(page.getByText('Company charter')).toBeVisible()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByPlaceholder('Eliza').fill('Ada')
  await page.getByRole('button', { name: 'Open the ledger' }).click()

  // Round 1, canal era, Ada to act with £17.
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')
  await expect(page.getByTestId('round-chip')).toHaveText('Round 1')
  await expect(treasuryOf(page, 'Ada')).toHaveText('£17')

  // Loan: choose action → discard any card → confirm.
  await page.getByTestId('action-loan').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await page.getByTestId('confirm-action').click()

  // Treasury +£30 and the journal records it.
  await expect(treasuryOf(page, 'Ada')).toHaveText('£47')
  await expect(page.getByText(/Ada took a loan/)).toBeVisible()

  // Round 1 = single action → turn passes; the curtain hides the next hand.
  const curtain = page.getByTestId('pass-curtain')
  await expect(curtain.getByText('pass the device to')).toBeVisible()
  await expect(curtain.getByText('Isambard', { exact: true })).toBeVisible()
  await expect(page.locator('button.bb2-card')).toHaveCount(0)
})

test('demo fixture: SVG map pan/zoom + Build action end-to-end', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£19')

  const svg = page.getByLabel('Game board map')
  const before = await svg.getAttribute('viewBox')

  // Probe the two risky SVG interactions: wheel-zoom and pointer-drag pan.
  await svg.hover()
  await page.mouse.wheel(0, -300) // zoom in
  await expect.poll(async () => svg.getAttribute('viewBox')).not.toBe(before)

  const box = (await svg.boundingBox())!
  const zoomed = await svg.getAttribute('viewBox')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width / 2 - 120,
    box.y + box.height / 2 - 40,
    { steps: 8 },
  )
  await page.mouse.up()
  await expect.poll(async () => svg.getAttribute('viewBox')).not.toBe(zoomed)
  await page.getByRole('button', { name: 'Reset view' }).click()

  // Build: card → site (click the pulsing legal city plate) → confirm.
  // iron_2 is an INDUSTRY card: the machine goes straight to site selection
  // on the map (a location card would instead fix the site and ask for the
  // industry type).
  await page.getByTestId('action-build').click()
  await page.getByTestId('card-iron_2').click()
  await expect(page.getByText(/Choose a site for your iron/)).toBeVisible()

  const legalCity = page.locator('g[data-city][data-legal="true"]')
  await expect(legalCity.first()).toBeVisible()
  await page.locator('g[data-city="coalbrookdale"]').click()

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  // The build consumed money and hit the journal (an overbuild of his own
  // level 3 iron works — deterministic for this fixture).
  await expect(
    page.getByText(/Isambard built iron Level 4 at coalbrookdale/),
  ).toBeVisible()
  const money = await treasuryOf(page, 'Isambard').textContent()
  expect(money).not.toBe('£19')
})

test('save → reload → resume: state survives a refresh behind the pass gate', async ({
  page,
}) => {
  // Start from the demo fixture and take a loan so the state is distinctive.
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£19')
  await page.getByTestId('action-loan').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await page.getByTestId('confirm-action').click()
  // First of Isambard's two actions: +£30, no round end, no income yet.
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£49')
  // .first(): the generated fixture's own journal already holds an older
  // Isambard loan entry.
  await expect(page.getByText(/Isambard took a loan/).first()).toBeVisible()

  // Reload WITHOUT query params: the localStorage save must resume, gated.
  await page.goto('/')
  await expect(page.getByTestId('pass-curtain')).toBeVisible()
  await expect(page.locator('button.bb2-card')).toHaveCount(0) // hand hidden
  await page.getByTestId('reveal-hand').click()

  // Same game: canal era, the loan stuck, journal intact.
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£49')
  // .first(): the generated fixture's own journal already holds an older
  // Isambard loan entry.
  await expect(page.getByText(/Isambard took a loan/).first()).toBeVisible()
})

test('?preview=gameover renders the final scoring with a winner', async ({
  page,
}) => {
  await page.goto('/?preview=gameover')
  await expect(page.getByText('The books are closed')).toBeVisible()
  await expect(page.getByRole('heading', { name: /prevails/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Found a new company' }),
  ).toBeVisible()
})
