import { expect, test } from '@playwright/test'

/**
 * Hand tray magnification + phone fit (offline, ?demo fixture).
 *
 * Desktop: hovering a card raises a magnified lens (data-raised on the
 * button); neighbours slide aside dock-style; clicking while raised still
 * selects (the lens is pointer-events:none, the 108×156 button hitbox
 * never grows sideways). A SELECTED card keeps a smaller persistent lens
 * (scale 1.3) until it is deselected or the action completes.
 *
 * Touch: there is no hover, so the FIRST tap peeks (raises the lens) and
 * the SECOND tap acts. A LONG-PRESS (350ms) also peeks, and keeping the
 * finger down while sliding browses the fan Hearthstone-style — the raise
 * follows the finger; releasing keeps the card under the finger peeked and
 * NEVER selects (acting stays a deliberate tap on the raised card).
 * Dimmed/disabled cards peek too (the seat wrapper handles the tap —
 * clicks don't fire on disabled buttons).
 */

/** The fan seat wrapper around a card button (carries the dock transform). */
function seatOf(page: import('@playwright/test').Page, cardId: string) {
  return page.locator('.bb2-card-seat', {
    has: page.getByTestId(`card-${cardId}`),
  })
}

test.describe('desktop hover magnification', () => {
  test('hover raises the card, shifts neighbours, and click still selects', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await expect(card).toBeVisible()

    // No card is raised at rest.
    await expect(card).not.toHaveAttribute('data-raised', 'true')

    await card.hover()
    await expect(card).toHaveAttribute('data-raised', 'true')

    // The immediate neighbours slide away from the raised card.
    await expect(seatOf(page, 'birmingham_1')).toHaveAttribute(
      'style',
      /translateX\(-/,
    )
    await expect(seatOf(page, 'cotton_manufacturer_6')).toHaveAttribute(
      'style',
      /translateX\((?!0px)/,
    )

    // Moving off the fan lowers the card again.
    await page.mouse.move(400, 200)
    await expect(card).not.toHaveAttribute('data-raised', 'true')

    // Clicking a hovered card still selects it (card-first hold).
    await card.click()
    await expect(card).toHaveAttribute('data-selected', 'true')
    await expect(page.getByText('Play this card')).toBeVisible()

    // The selected card STAYS enlarged after the mouse leaves — the
    // persistent selected lens (1.3×), smaller than the hover lens.
    await page.mouse.move(400, 200)
    await expect(card).not.toHaveAttribute('data-raised', 'true')
    await expect(card.locator('.bb2-card-lens')).toHaveAttribute(
      'style',
      /scale\(1\.3\)/,
    )

    // Re-tap puts it back — nothing consumed (pinned deeper in card-first.spec).
    await card.click()
    await expect(page.getByText('Choose an action')).toBeVisible()
    await page.mouse.move(400, 200)
    await expect(card.locator('.bb2-card-lens')).not.toHaveAttribute(
      'style',
      /scale\(/,
    )
  })

  test('reduced motion still raises and selects (end state, no transition)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await card.hover()
    await expect(card).toHaveAttribute('data-raised', 'true')
    await card.click()
    await expect(page.getByText('Play this card')).toBeVisible()
  })
})

test.describe('phone: fit + tap-to-peek', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  test('a full 8-card opening hand fits a 375px viewport', async ({ page }) => {
    // A fresh game deals the worst case: 8 cards (the ?demo hand holds 5).
    await page.goto('/?fresh=1')
    await page.getByRole('button', { name: '2', exact: true }).tap()
    await page.getByRole('button', { name: 'Open the ledger' }).tap()

    const cards = page.locator('button.bb2-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBe(8)
    for (let i = 0; i < 8; i++) {
      // boundingBox includes the fan rotation — the exact thing that used
      // to push the outermost cards off screen.
      const box = (await cards.nth(i).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375)
    }
  })

  test('first tap peeks, second tap selects; outside tap dismisses', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await expect(card).toBeVisible()

    // First tap: peek only — raised, NOT selected.
    await card.tap()
    await expect(card).toHaveAttribute('data-raised', 'true')
    await expect(card).not.toHaveAttribute('data-selected', 'true')
    await expect(page.getByText('Play this card')).not.toBeVisible()

    // Tap far outside the tray: peek dismissed, still nothing selected.
    await page.touchscreen.tap(187, 60)
    await expect(card).not.toHaveAttribute('data-raised', 'true')
    await expect(page.getByText('Play this card')).not.toBeVisible()

    // Peek again, then tap the card again: NOW it selects.
    await card.tap()
    await expect(card).toHaveAttribute('data-raised', 'true')
    await card.tap()
    await expect(card).toHaveAttribute('data-selected', 'true')
    await expect(page.getByText('Play this card')).toBeVisible()

    // The selected card keeps the persistent lens (peek cleared on select).
    await expect(card).not.toHaveAttribute('data-raised', 'true')
    await expect(card.locator('.bb2-card-lens')).toHaveAttribute(
      'style',
      /scale\(1\.3\)/,
    )

    // Put it back to leave the fixture untouched.
    await card.tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })

  test('long-press browses the fan; release keeps the peek, never selects', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const start = page.getByTestId('card-birmingham_1')
    const target = page.getByTestId('card-cotton_manufacturer_4')
    await expect(start).toBeVisible()
    const sBox = (await start.boundingBox())!
    const tBox = (await target.boundingBox())!
    const sx = sBox.x + sBox.width / 2
    const sy = sBox.y + sBox.height / 2
    const tx = tBox.x + tBox.width / 2

    // Playwright's touchscreen only taps, so drive the long-press + slide
    // with raw CDP touch events (trusted input, real pointer events).
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: sx, y: sy }],
    })
    // Holding still for the long-press delay raises the pressed card.
    await expect(start).toHaveAttribute('data-raised', 'true')
    await expect(start).not.toHaveAttribute('data-selected', 'true')

    // Sliding along the fan moves the raise to the card under the finger.
    const steps = 8
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: sx + ((tx - sx) * i) / steps, y: sy }],
      })
    }
    await expect(target).toHaveAttribute('data-raised', 'true')
    await expect(start).not.toHaveAttribute('data-raised', 'true')

    // Release keeps the browsed card peeked — browsing can never select.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(target).toHaveAttribute('data-raised', 'true')
    await expect(target).not.toHaveAttribute('data-selected', 'true')
    await expect(page.getByText('Play this card')).not.toBeVisible()

    // The kept peek then acts on a normal tap (the existing second-tap rule).
    await target.tap()
    await expect(target).toHaveAttribute('data-selected', 'true')
    await expect(page.getByText('Play this card')).toBeVisible()

    // Put it back to leave the fixture untouched.
    await target.tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })

  test('a slide that starts before the hold fires cancels the long-press', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const start = page.getByTestId('card-birmingham_1')
    await expect(start).toBeVisible()
    const sBox = (await start.boundingBox())!
    const sx = sBox.x + sBox.width / 2
    const sy = sBox.y + sBox.height / 2

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: sx, y: sy }],
    })
    // Slide immediately (beyond the 12px slop) — no browse, no peek.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: sx + 40, y: sy }],
    })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-raised="true"]')).toHaveCount(0)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  })

  test('mid-action, another card peeks on the first tap and switches the play on the second', async ({
    page,
  }) => {
    await page.goto('/?demo')

    // Loan: discard a card (peek-tap, then select-tap) → confirm step, now
    // holding brewery_2 (Eliza can't actually confirm — income too low — but
    // the confirm STEP is reached, which is what we need).
    await page.getByTestId('action-loan').tap()
    const discard = page.getByTestId('card-brewery_2')
    await discard.tap()
    await discard.tap()
    await expect(page.getByTestId('confirm-action')).toBeVisible()

    // A DIFFERENT card mid-flow is a switch target: on touch the first tap
    // peeks it (look before you leap), the second commits the switch —
    // cancelling the loan and re-holding the new card at the card-select step.
    const other = page.getByTestId('card-birmingham_1')
    await other.tap()
    await expect(other).toHaveAttribute('data-raised', 'true')
    await other.tap()
    await expect(page.getByText('Play this card')).toBeVisible()
    await expect(other).toHaveAttribute('data-selected', 'true')

    // The loan never happened — put the new card back to idle.
    await page.getByTestId('cancel-action').tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })
})
