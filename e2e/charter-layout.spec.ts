import { expect, test } from '@playwright/test'

/**
 * The company charter's mode row must be geometrically final by the time it is
 * tappable. It offers two or three modes depending on whether the server can
 * seat AI rivals, so a row that learns the answer after paint re-flows from two
 * columns to three — and a tap aimed at "One device" lands on its neighbour,
 * silently starting a different kind of game. Worst on a phone, where the
 * buttons are widest and the answer is slowest.
 */
test.describe('charter layout', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  test('no late server answer can move the mode row', async ({ page }) => {
    // Hold every API answer until the row has been measured, then let them all
    // land: whatever the charter asks the server for, the row may not move.
    const held: (() => void)[] = []
    await page.route('**/api/**', async (route) => {
      await new Promise<void>((resolve) => held.push(resolve))
      await route.continue()
    })

    await page.goto('/?fresh=1')
    const local = page.getByTestId('mode-local')
    await expect(local).toBeVisible()
    // The panel animates in (bb2-rise, 0.55s, 14px of travel) — measure the
    // resting geometry, not a frame of the entrance.
    await page.waitForTimeout(900)
    const before = (await local.boundingBox())!

    for (const release of held) release()
    // Fixed settle window: the point is that nothing lands here that the row
    // depends on, so there is no request or render to await.
    await page.waitForTimeout(1000)
    expect(await local.boundingBox()).toEqual(before)

    // And the button still does what it says.
    await local.tap()
    await expect(local).toHaveAttribute('data-selected', 'true')
    await expect(
      page.getByRole('button', { name: 'Open the ledger' }),
    ).toBeVisible()
  })
})
