/**
 * Iron-source choice — the player picks WHICH works supplies a Develop's cube.
 *
 * Fixture: ?demo=ironchoice — 2+ unflipped iron works with cubes on the board
 * (generator-verified through the machine's own guards), so the Develop flow
 * must stop at the iron picker instead of auto-skipping. The market must NOT
 * be offered: the rules (p.5) make it a fallback, legal only when no unflipped
 * works holds iron.
 */
import { type Page, expect, test } from '@playwright/test'

async function openIronPicker(page: Page) {
  await page.goto('/?demo=ironchoice')
  await page.getByTestId('action-develop').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  // "Develop lowest available" confirms the tile step, which lands on the
  // machine's iron-source step (it would auto-skip without a real choice).
  await page.getByTestId('develop-lowest').click()
}

test('the iron picker offers every works but never the market, and the develop consumes the chosen cube', async ({
  page,
}) => {
  await openIronPicker(page)

  const sources = page.getByTestId('iron-source')
  await expect(sources.first()).toBeVisible()
  expect(await sources.count()).toBeGreaterThanOrEqual(2)
  // RULES PIN (p.5): the market is a fallback, not an alternative — while any
  // unflipped works holds iron it must never be on offer.
  await expect(sources.filter({ hasText: /market/i })).toHaveCount(0)

  // Answering the question moves the flow on to the confirm step.
  await sources.first().click()
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  // The journal renders the tile count as a chip and the iron consumption
  // as a demoted detail line — same words, restructured.
  await expect(
    page
      .getByText(/developed removed 1 tile 1 iron from iron works \(free\)/)
      .first(),
  ).toBeVisible()
})

test('backing out of the iron step consumes nothing', async ({ page }) => {
  await openIronPicker(page)
  await expect(page.getByTestId('iron-source').first()).toBeVisible()
  const treasuries = await page
    .locator('[data-testid="treasury"]')
    .allTextContents()

  await page.getByTestId('cancel-action').click()

  // Back on the tile step; no tile was scrapped, no iron or money moved.
  await expect(page.getByTestId('develop-lowest')).toBeVisible()
  await expect(page.getByText(/developed removed/)).toHaveCount(0)
  expect(
    await page.locator('[data-testid="treasury"]').allTextContents(),
  ).toEqual(treasuries)
})
