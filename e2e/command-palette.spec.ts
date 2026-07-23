/**
 * The Cmd/Ctrl+K palette — find a city or an industry, and the board
 * spotlights it (`data-located`) for ~5s. It is a navigation aid: it must
 * never send a machine event, so the turn state it opens over is the turn
 * state it closes over.
 *
 * Offline: runs on the demo fixture, no DB.
 */
import { expect, test } from '@playwright/test'

const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'

test('the shortcut opens the palette; Escape closes it', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.getByTestId('palette-trigger')).toBeVisible()

  await page.keyboard.press(`${MODIFIER}+KeyK`)
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await expect(page.getByTestId('palette-input')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
})

test('picking a city spotlights that one plate, then clears itself', async ({
  page,
}) => {
  await page.goto('/?demo')
  await page.getByTestId('palette-trigger').click()
  await page.getByTestId('palette-input').fill('derby')

  // The query narrows to the one city; Enter takes the highlighted row.
  await expect(page.getByTestId('palette-result-city-derby')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)

  await expect(
    page.locator('g[data-city="derby"][data-located="true"]'),
  ).toBeVisible()
  // ~5s later the spotlight releases on its own — nothing to dismiss.
  await expect(page.locator('g[data-located="true"]')).toHaveCount(0, {
    timeout: 9000,
  })
})

test('picking an industry spotlights every location that can take it', async ({
  page,
}) => {
  await page.goto('/?demo')
  await page.getByTestId('palette-trigger').click()
  await page.getByTestId('palette-input').fill('pottery')
  await page.getByTestId('palette-result-industry-pottery').click()

  // The four printed pottery slots: Coventry, Stafford, Stoke, Belper.
  await expect(page.locator('g[data-city][data-located="true"]')).toHaveCount(4)
  for (const city of ['coventry', 'stafford', 'stoke', 'belper']) {
    await expect(
      page.locator(`g[data-city="${city}"][data-located="true"]`),
    ).toBeVisible()
  }
})

test('the palette never touches the game state it opens over', async ({
  page,
}) => {
  await page.goto('/?demo')
  const round = await page.getByTestId('round-chip').textContent()
  const deck = await page.getByTestId('deck-chip').textContent()
  const journalBefore = await page.getByTestId('journal-entry').count()

  await page.keyboard.press(`${MODIFIER}+KeyK`)
  await page.getByTestId('palette-input').fill('birmingham')
  await page.keyboard.press('Enter')

  expect(await page.getByTestId('round-chip').textContent()).toBe(round)
  expect(await page.getByTestId('deck-chip').textContent()).toBe(deck)
  expect(await page.getByTestId('journal-entry').count()).toBe(journalBefore)
})
