import { expect, test } from '@playwright/test'

/**
 * Reordering the hand (offline, ?demo fixture).
 *
 * The fan's order is PURE PRESENTATION — a permutation stored under its own
 * localStorage key (bb2-hand-order-v1), never a write to the engine's hand and
 * never an event. So every test here checks the same two things: the fan moved,
 * and the saved snapshot's hand did not.
 *
 * Three ways in, because the tray's pointer budget was already spent on
 * hover/peek/long-press-browse: a mouse drag, the ◀ ▶ handles that ride a
 * raised card (the touch route), and Shift+Arrow on a focused card.
 */

const fanOrder = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button.bb2-card')].map(
      (b) => (b as HTMLElement).dataset.testid,
    ),
  )

/** The hand as the ENGINE has it, straight out of the persisted save. */
const savedHands = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('bb2-save-v1')
    if (!raw) return null
    const save = JSON.parse(raw) as {
      snapshot?: { context?: { players?: { hand: { id: string }[] }[] } }
    }
    return (save.snapshot?.context?.players ?? []).map((p) =>
      p.hand.map((c) => c.id),
    )
  })

test.describe('desktop', () => {
  test('the handles reorder the fan, and the order survives a reload', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-coalbrookdale_3')
    await expect(card).toBeVisible()

    const before = await fanOrder(page)
    const engineBefore = await savedHands(page)
    expect(engineBefore).not.toBeNull()
    expect(before.indexOf('card-coalbrookdale_3')).toBe(3)

    // The handles only ride a RAISED card — the fan stays clean at rest.
    await expect(page.getByTestId('move-left-coalbrookdale_3')).toBeHidden()
    await card.hover()
    await page.getByTestId('move-left-coalbrookdale_3').click()

    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-coalbrookdale_3'))
      .toBe(2)

    // The ENGINE's hand is untouched: reordering is a view permutation.
    expect(await savedHands(page)).toEqual(engineBefore)

    // …and it is remembered for the session, under its own key.
    const arranged = await fanOrder(page)
    await page.reload()
    await expect(page.getByTestId('card-coalbrookdale_3')).toBeVisible()
    expect(await fanOrder(page)).toEqual(arranged)
    expect(await savedHands(page)).toEqual(engineBefore)
  })

  test('a mouse drag reorders and never counts as selecting', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const first = page.getByTestId('card-birmingham_1')
    await expect(first).toBeVisible()
    const engineBefore = await savedHands(page)

    const from = (await first.boundingBox())!
    const to = (await page.getByTestId('card-coalbrookdale_3').boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    // Several steps: the first clears the drag slop, the rest walk the fan.
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(
        from.x + from.width / 2 + ((to.x - from.x) * i) / 6,
        from.y + from.height / 2,
      )
    }
    await page.mouse.up()

    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-birmingham_1'))
      .toBeGreaterThan(0)

    // A drag swallows the click it synthesizes — nothing was played.
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
    await expect(page.getByText('Choose an action')).toBeVisible()
    expect(await savedHands(page)).toEqual(engineBefore)
  })

  test('Shift+Arrow moves the focused card and announces it', async ({
    page,
  }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-birmingham_1')
    await expect(card).toBeVisible()
    const engineBefore = await savedHands(page)

    await card.focus()
    await page.keyboard.press('Shift+ArrowRight')

    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-birmingham_1'))
      .toBe(1)
    await expect(page.locator('.bb2-handtray [role="status"]')).toHaveText(
      /moved to position 2 of 5/,
    )
    // Focus rides with the card, so the next press keeps moving the same one.
    await page.keyboard.press('Shift+ArrowRight')
    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-birmingham_1'))
      .toBe(2)
    expect(await savedHands(page)).toEqual(engineBefore)
  })

  test('selection still works on a reordered fan', async ({ page }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-brewery_2')
    await expect(card).toBeVisible()
    await card.focus()
    await page.keyboard.press('Shift+ArrowLeft')
    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-brewery_2'))
      .toBe(0)

    // Card-first entry, the held-card banner and put-back are all unaffected.
    await card.click()
    await expect(card).toHaveAttribute('data-selected', 'true')
    await expect(page.getByTestId('held-card')).toContainText('Brewery')
    await expect(page.getByText('Play this card')).toBeVisible()
    await card.click()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('tap to peek, then the handles move the card', async ({ page }) => {
    await page.goto('/?demo')
    const card = page.getByTestId('card-coalbrookdale_3')
    await expect(card).toBeVisible()
    const engineBefore = await savedHands(page)

    // First tap peeks (the existing rule) — that is what reveals the handles.
    await card.tap()
    await expect(card).toHaveAttribute('data-raised', 'true')
    const right = page.getByTestId('move-right-coalbrookdale_3')
    await expect(right).toBeVisible()

    await right.tap()
    await expect
      .poll(async () => (await fanOrder(page)).indexOf('card-coalbrookdale_3'))
      .toBe(4)
    // The peek follows the card, so the handles stay put for a second move.
    await expect(card).toHaveAttribute('data-raised', 'true')
    expect(await savedHands(page)).toEqual(engineBefore)

    // Tapping the card itself still selects it — the handles took no clicks
    // away from the fan.
    await card.tap()
    await expect(card).toHaveAttribute('data-selected', 'true')
    await card.tap()
    await expect(page.getByText('Choose an action')).toBeVisible()
  })
})
