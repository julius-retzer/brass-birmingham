import { type Page, expect, test } from '@playwright/test'

/**
 * Regression journeys for the 2026-07-13 bug hunt. Each test pins a bug
 * that shipped in earlier versions:
 *  - wild cards (Scout's reward) could not complete a Build: wild location
 *    skipped site selection and errored at confirm; wild industry silently
 *    dead-ended on a disabled confirm
 *  - the Develop action could only remove ONE tile through the UI (rules:
 *    one or two per action)
 *
 * ?demo=wilds: canal round 2 — Eliza to act, £27, empty board, holding
 * wild_location_1 and wild_industry_1.
 */

function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

test('wild location card: pick industry, pick ANY city on the map, build', async ({
  page,
}) => {
  await page.goto('/?demo=wilds')
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£27')

  await page.getByTestId('action-build').click()
  await page.getByTestId('card-wild_location_1').click()

  // Wild location asks for the industry first…
  await page.getByTestId('action-build').isHidden()
  await page.locator('button', { hasText: 'Coal' }).first().click()

  // …then for a site: with nothing on the board every coal city is legal.
  await expect(page.getByText(/Choose a site for your coal/)).toBeVisible()
  const legalCity = page.locator('g[data-city][data-legal="true"]')
  expect(await legalCity.count()).toBeGreaterThan(1) // wild = free choice
  await page.locator('g[data-city="dudley"]').click()

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(/Eliza built coal Level 1 at dudley .* using wild location/),
  ).toBeVisible()
})

test('wild industry card: pick industry type, then a city, build', async ({
  page,
}) => {
  await page.goto('/?demo=wilds')
  await expect(treasuryOf(page, 'Eliza')).toHaveText('£27')

  await page.getByTestId('action-build').click()
  await page.getByTestId('card-wild_industry_1').click()

  // Wild industry has no printed industries — the type step must appear.
  await page.locator('button', { hasText: 'Brewery' }).first().click()
  await expect(page.getByText(/Choose a site for your brewery/)).toBeVisible()
  await page.locator('g[data-city="burton"]').click()

  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(
      /Eliza built brewery Level 1 at burton.*using wild industry/,
    ),
  ).toBeVisible()
})

test('develop removes TWO tiles in one action through the UI', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(treasuryOf(page, 'Isambard')).toHaveText('£19')

  await page.getByTestId('action-develop').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()

  // Pick two different industries (iron + coal), then confirm both steps.
  await page.getByTestId('develop-iron').click()
  await page.getByTestId('develop-coal').click()
  await page.getByTestId('confirm-action').click() // "Scrap two tiles"
  await expect(page.getByText(/Scrapping: .*coal, iron/)).toBeVisible()
  await page.getByTestId('confirm-action').click() // confirm step

  await expect(
    page.getByText(/Isambard developed \(removed 2 tiles/),
  ).toBeVisible()
})
