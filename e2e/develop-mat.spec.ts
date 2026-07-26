/**
 * Develop on the player mat — choosing Develop opens the mat as the picking
 * surface: the tile a pick would scrap glows (armed), tapping it stages the
 * scrap in the tray, tapping a lightbulb Pottery explains the rulebook block,
 * and CANCEL unwinds without consuming the action.
 *
 * Fixture: ?demo — Eliza to act with a full-ish mat (iron/coal/cotton armed;
 * her pottery 3 is a lightbulb tile).
 */
import { expect, test } from '@playwright/test'

async function openDevelopMat(page: import('@playwright/test').Page) {
  await page.goto('/?demo')
  await page.getByTestId('action-develop').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  // Entering the tile step auto-opens the mat in develop mode.
  await expect(page.getByTestId('develop-mat-bar')).toBeVisible()
}

test('the mat opens on the tile step and an armed tap stages the scrap', async ({
  page,
}) => {
  await openDevelopMat(page)

  // Only the lowest developable tile of each track is armed.
  const armed = page.locator('[data-develop-armed]')
  await expect(armed.first()).toBeVisible()

  await page
    .locator('[data-develop-armed][data-testid^="mat-slot-coal"]')
    .click()
  await expect(page.getByTestId('develop-staged-coal')).toBeVisible()
  await expect(page.getByTestId('confirm-action')).toBeEnabled()

  // Tapping the staged tile puts it back — the tray empties, nothing spent.
  await page.getByTestId('develop-staged-coal').click()
  await expect(page.getByTestId('develop-staged-coal')).toHaveCount(0)
  await expect(page.getByTestId('develop-lowest')).toBeVisible()
})

test('a tile never shows two rings: the selected one does its own arming', async ({
  page,
}) => {
  await openDevelopMat(page)

  // The mat opens with the lowest cotton tile both armed and selected.
  const cotton = page.getByTestId('mat-slot-cotton_2')
  await expect(cotton).toHaveAttribute('data-develop-armed', 'true')
  await expect(cotton).toHaveAttribute('aria-pressed', 'true')
  // Its own pulse stands down and its single ring carries the arming instead.
  await expect(cotton).not.toHaveClass(/bb2-develop-armed/)
  await expect(cotton.locator('.bb2-mat-ring-armed')).toHaveCount(1)

  // Every other armed tile keeps pulsing, with no second ring of its own.
  const coal = page.locator(
    '[data-develop-armed][data-testid^="mat-slot-coal"]',
  )
  await expect(coal).toHaveClass(/bb2-develop-armed/)
  await expect(coal.locator('.bb2-mat-ring')).toHaveCount(0)

  // Reading a tile a pick would NOT scrap rings it in the inspect hue, and
  // hands the brass pulse back to the armed one.
  const higher = page.getByTestId('mat-slot-cotton_3')
  await higher.hover()
  await expect(higher.locator('.bb2-mat-ring-inspect')).toHaveCount(1)
  await expect(cotton).toHaveClass(/bb2-develop-armed/)
  await expect(cotton.locator('.bb2-mat-ring')).toHaveCount(0)
})

test('a lightbulb Pottery tap explains the rulebook block', async ({
  page,
}) => {
  await openDevelopMat(page)

  const lightbulb = page.getByTestId('mat-slot-pottery_3')
  await lightbulb.scrollIntoViewIfNeeded()
  await expect(lightbulb).not.toHaveAttribute('data-develop-armed', 'true')
  await lightbulb.click()
  await expect(page.getByTestId('develop-pick-blocked')).toContainText(
    /lightbulb/i,
  )
  // Nothing staged by the rejected tap.
  await expect(page.locator('[data-testid^="develop-staged-"]')).toHaveCount(0)
})

test('CANCEL from the mat unwinds without consuming the action', async ({
  page,
}) => {
  await openDevelopMat(page)
  const treasuries = await page
    .locator('[data-testid="treasury"]')
    .allTextContents()

  await page
    .locator('[data-develop-armed][data-testid^="mat-slot-iron"]')
    .click()
  await expect(page.getByTestId('develop-staged-iron')).toBeVisible()

  // First CANCEL: back to the tile step (staged cleared)…
  await page.getByTestId('cancel-action').click()
  await expect(page.locator('[data-testid^="develop-staged-"]')).toHaveCount(0)
  await expect(page.getByTestId('develop-lowest')).toBeVisible()

  // …then Close the mat: the dock offers the way back in, and cancels clean.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('open-develop-mat')).toBeVisible()
  await page.getByTestId('cancel-action').click() // back to the card step
  await page.getByTestId('cancel-action').click() // back to the chooser
  await expect(page.getByText('Choose an action')).toBeVisible()
  await expect(page.getByText(/developed removed/)).toHaveCount(0)
  expect(
    await page.locator('[data-testid="treasury"]').allTextContents(),
  ).toEqual(treasuries)
})

test('closing the mat mid-flow and reopening from the dock keeps the staging', async ({
  page,
}) => {
  await openDevelopMat(page)
  await page
    .locator('[data-develop-armed][data-testid^="mat-slot-cotton"]')
    .click()
  await expect(page.getByTestId('develop-staged-cotton')).toBeVisible()

  await page.getByRole('button', { name: 'Close' }).click()
  // The dock's confirm step still knows the staged pick and reopens the mat.
  await expect(page.getByTestId('open-develop-mat')).toBeVisible()
  await page.getByTestId('open-develop-mat').click()
  await expect(page.getByTestId('develop-staged-cotton')).toBeVisible()

  await page.getByTestId('confirm-action').click()
  await expect(page.getByText(/Eliza developed removed 1 tile/)).toBeVisible()
})
