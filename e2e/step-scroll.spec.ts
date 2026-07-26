import { expect, test } from '@playwright/test'

/**
 * Phone step-scrolling (offline, ?demo fixture).
 *
 * On a phone the board takes the top of the screen and the action dock sits
 * below it, mostly under the fold and under the fixed hand tray. Committing a
 * hand card opens the list of actions that card can start — in the dock — so
 * the dock is scrolled into view.
 *
 * The tap model it has to respect (see hand-tray.spec.ts): the first tap only
 * PEEKS a card so it can be read, the second one plays it. The scroll is driven
 * by the machine's step, which is what keeps a peek from moving the view — a
 * peek sends no event.
 */
test.describe('phone: the held card brings its action list on screen', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })

  const dockPanel = (page: import('@playwright/test').Page) =>
    page.getByTestId('side-panel').locator('.bb2-panel-active')

  test('peeking moves nothing; playing the card scrolls the dock into view', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await expect(card).toBeVisible()

    // At rest the dock's top edge is below the fold.
    const before = (await dockPanel(page).boundingBox())!
    expect(before.y).toBeGreaterThan(page.viewportSize()!.height / 2)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    // First tap: a peek. No machine event, so nothing scrolls.
    await card.tap()
    await expect(card).toHaveAttribute('data-raised', 'true')
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    // Second tap: the card is committed and the dock arrives.
    await card.tap()
    await expect(page.getByText('Play this card')).toBeVisible()
    await expect
      .poll(async () => (await dockPanel(page).boundingBox())!.y, {
        timeout: 4000,
      })
      .toBeLessThan(80)
    // Landed at the top of the viewport rather than past it.
    expect((await dockPanel(page).boundingBox())!.y).toBeGreaterThan(-2)
    const title = (await page.getByText('Play this card').boundingBox())!
    expect(title.y).toBeGreaterThan(0)
    expect(title.y + title.height).toBeLessThan(page.viewportSize()!.height)

    // Scrolling only: the tap keeps its focus. Moving it into the dock would
    // yank a screen reader's cursor off the card the player just played.
    expect(
      await page.evaluate(
        () =>
          !!document.activeElement &&
          document
            .querySelector('[data-testid="side-panel"]')
            ?.contains(document.activeElement),
      ),
    ).toBe(false)
  })

  test('a player who has just scrolled keeps their position', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await expect(card).toBeVisible()

    // Peek first, so only the committing tap has to land inside the
    // suppression window (a wheel is not a pointerdown, so it keeps the peek).
    await card.tap()
    await expect(card).toHaveAttribute('data-raised', 'true')

    await page.mouse.wheel(0, 300)
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0)
    const parked = await page.evaluate(() => window.scrollY)

    await card.tap()
    await expect(page.getByText('Play this card')).toBeVisible()
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => window.scrollY)).toBe(parked)
  })
})
