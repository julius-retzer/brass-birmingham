import { type Page, expect, test } from '@playwright/test'

/**
 * The round-end curtain: a round closing announces itself with what each
 * player spent and the spend-driven turn-order switch.
 *
 * ?fresh=1 with 2 players is fully deterministic — canal round 1, one action
 * each — so a link build (£3) against a pass (£0) makes the reorder exact.
 */

/**
 * Pass a whole turn. Pass is two-tap and the arm lapses after 4s, so wait for
 * the armed label before the confirming tap — otherwise a loaded machine can
 * let the arm expire between clicks and the turn silently never passes.
 */
async function passTurn(page: Page) {
  const pass = page.getByTestId('action-pass')
  await pass.click()
  await expect(pass).toContainText('Really pass?')
  await pass.click()
}

/** Click a map route ON its stroke — routes are curved, so bbox-centre misses. */
async function clickRoute(page: Page, conn: string) {
  const path = page.locator(`path[data-conn="${conn}"]`)
  const pt = await path.evaluate((el) => {
    const p = el as unknown as SVGPathElement
    const mid = p.getPointAtLength(p.getTotalLength() / 2)
    const sp = new DOMPoint(mid.x, mid.y).matrixTransform(p.getScreenCTM()!)
    return { x: sp.x, y: sp.y }
  })
  await page.mouse.click(pt.x, pt.y)
}

test('round end: curtain reports spends and switches the turn order', async ({
  page,
}) => {
  await page.goto('/?fresh=1')
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByPlaceholder('Eliza').fill('Ada')
  await page.getByRole('button', { name: 'Open the ledger' }).click()
  await expect(page.getByTestId('round-chip')).toHaveText('Round 1')

  // Ada claims a canal route — £3 spent.
  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  const legal = page.locator('path[data-conn][data-legal="true"]').first()
  await clickRoute(page, (await legal.getAttribute('data-conn'))!)
  await page.getByTestId('confirm-action').click()

  // No curtain yet — the round is only half played.
  await expect(page.getByTestId('round-curtain')).toBeHidden()

  // Player two passes — £0 spent, and the round closes. Pass is two-tap:
  // the first click arms it, the second confirms.
  await page.getByTestId('reveal-hand').click()
  await passTurn(page)

  const curtain = page.getByTestId('round-curtain')
  await expect(curtain).toBeVisible()
  await expect(curtain.getByText('Round 1 complete')).toBeVisible()

  // The spends that drove the switch, per player.
  await expect(page.getByTestId('curtain-spend-1')).toContainText('£3')
  await expect(page.getByTestId('curtain-spend-2')).toContainText('£0')

  // The £0 spender now leads: rank 1 belongs to player 2, not Ada.
  await expect(page.getByTestId('curtain-order-2')).toHaveAttribute(
    'data-rank',
    '1',
  )
  await expect(page.getByTestId('curtain-order-1')).toHaveAttribute(
    'data-rank',
    '2',
  )

  // Dismissing hands the board back, in the new round.
  await page.getByTestId('round-curtain-dismiss').click()
  await expect(curtain).toBeHidden()
  await expect(page.getByTestId('round-chip')).toHaveText('Round 2')
})

test('round curtain: any key dismisses it and it does not return', async ({
  page,
}) => {
  await page.goto('/?fresh=1')
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: 'Open the ledger' }).click()

  // Both players pass out the round — equal £0 spends, order preserved.
  for (let i = 0; i < 2; i++) {
    const reveal = page.getByTestId('reveal-hand')
    if (await reveal.isVisible().catch(() => false)) await reveal.click()
    await passTurn(page)
  }

  const curtain = page.getByTestId('round-curtain')
  await expect(curtain).toBeVisible()
  await expect(page.getByTestId('curtain-order-1')).toHaveAttribute(
    'data-rank',
    '1',
  )

  await page.keyboard.press('Escape')
  await expect(curtain).toBeHidden()

  // The next player's turn proceeds with the curtain gone for good.
  const reveal = page.getByTestId('reveal-hand')
  if (await reveal.isVisible().catch(() => false)) await reveal.click()
  await expect(page.getByTestId('action-pass')).toBeVisible()
  await expect(curtain).toBeHidden()
})
