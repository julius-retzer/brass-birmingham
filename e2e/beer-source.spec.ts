/**
 * Beer-source choice — the player picks where each barrel comes from.
 *
 * Fixture: ?demo=beerchoice — canal, George to act with £8, an own brewery at
 * Stone in reach AND a Warrington merchant barrel (£5 bonus). The engine's old
 * auto-pick would have drained the brewery and left the £5 on the table, so
 * this journey is the whole point of the feature.
 */
import { type Page, expect, test } from '@playwright/test'

function treasuryOf(page: Page, name: string) {
  return page
    .locator('[data-testid^="mat-"]')
    .filter({ hasText: name })
    .getByTestId('treasury')
}

async function openSaleList(page: Page) {
  await page.goto('/?demo=beerchoice')
  await expect(treasuryOf(page, 'George')).toHaveText('£8')
  await page.getByTestId('action-sell').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
}

test('the beer picker offers every legal source, and the merchant barrel pays its bonus', async ({
  page,
}) => {
  await openSaleList(page)

  // Staging the sale asks the question instead of answering it silently
  await page
    .getByTestId('sale-option')
    .filter({ hasText: 'cotton at Leek' })
    .click()

  const sources = page.getByTestId('beer-source')
  await expect(sources).toHaveCount(2) // own brewery at Stone + merchant barrel
  await expect(
    sources.filter({ hasText: "Warrington merchant's barrel" }),
  ).toContainText('Collects the merchant bonus: £5.')

  // The choice is about places, so the map points at the candidate breweries
  await expect(
    page.locator('g[data-city="stone"] rect[stroke-dasharray="6 4"]'),
  ).toBeVisible()

  // Assigning the barrel is the answer — the sale flips on it
  await sources.filter({ hasText: "Warrington merchant's barrel" }).click()

  // The merchant's barrel went, and its £5 came back — unreachable before
  await expect(treasuryOf(page, 'George')).toHaveText('£13')
  await expect(page.getByTestId('journal-entry').first()).toContainText(
    '1 beer from merchant at Warrington (money +5)',
  )
})

test('backing out of the beer step flips nothing and returns to the goods list', async ({
  page,
}) => {
  await openSaleList(page)
  await page
    .getByTestId('sale-option')
    .filter({ hasText: 'cotton at Leek' })
    .click()
  await expect(page.getByTestId('beer-source').first()).toBeVisible()

  // The staged sale is UI-only — the machine never saw it, so cancelling it
  // costs neither the card nor the action.
  await page.getByTestId('cancel-action').click()

  await expect(page.getByTestId('sale-option').first()).toBeVisible()
  await expect(treasuryOf(page, 'George')).toHaveText('£8')
  await expect(page.getByText(/Flipped 1 industry this action/)).toHaveCount(0)
})
