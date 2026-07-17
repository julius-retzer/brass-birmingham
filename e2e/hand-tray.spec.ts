import { expect, test } from '@playwright/test'

/**
 * Hand tray magnification + phone fit (offline, ?demo fixture).
 *
 * Desktop: hovering a card raises a magnified lens (data-raised on the
 * button); neighbours slide aside dock-style; clicking while raised still
 * selects (the lens is pointer-events:none, the 108×156 button hitbox
 * never grows sideways).
 *
 * Touch: there is no hover, so the FIRST tap peeks (raises the lens) and
 * the SECOND tap acts. Dimmed/disabled cards peek too (the seat wrapper
 * handles the tap — clicks don't fire on disabled buttons).
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

    // Re-tap puts it back — nothing consumed (pinned deeper in card-first.spec).
    await card.click()
    await expect(page.getByText('Choose an action')).toBeVisible()
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

  test('a full 8-card opening hand fits a 375px viewport', async ({
    page,
  }) => {
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

    // Put it back to leave the fixture untouched.
    await card.tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })

  test('a display-only (disabled) card can still be peeked by tap', async ({
    page,
  }) => {
    await page.goto('/?demo')

    // Loan: discard a card (peek-tap, then select-tap) → confirm step.
    // (Eliza can't actually confirm — income is too low for another loan —
    // but the confirm STEP is reached either way, which is what we need.)
    await page.getByTestId('action-loan').tap()
    const discard = page.getByTestId('card-brewery_2')
    await discard.tap()
    await discard.tap()
    await expect(page.getByTestId('confirm-action')).toBeVisible()

    // At the confirm step the hand is display-only: every card's button is
    // disabled, so peeking rides the seat wrapper, not the button's click.
    const other = page.getByTestId('card-birmingham_1')
    await expect(other).toBeDisabled()
    // tap() refuses disabled elements (actionability), which is the point:
    // force it — the browser still dispatches real touch input at the spot.
    await other.tap({ force: true })
    await expect(other).toHaveAttribute('data-raised', 'true')

    // A second tap folds it back down instead of selecting anything.
    await other.tap({ force: true })
    await expect(other).not.toHaveAttribute('data-raised', 'true')

    // Unwind: confirm step → card step → idle.
    await page.getByTestId('cancel-action').tap()
    await page.getByTestId('cancel-action').tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })
})
