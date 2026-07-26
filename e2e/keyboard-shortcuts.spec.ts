/**
 * Leader-prefix shortcuts: tap `g`, then the binding key. The one binding is
 * the side panel toggle, which shares its state with the collapse rail.
 *
 * Offline: runs on the demo fixture, no DB.
 */
import { type Page, expect, test } from '@playwright/test'

const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'

/**
 * Taps the leader until the hint confirms it took. The retry is about the app
 * being listening at all (a key pressed into a still-hydrating page goes
 * nowhere), not about the sequence being unreliable once it is.
 */
async function armLeader(page: Page) {
  await expect
    .poll(
      async () => {
        await page.keyboard.press('KeyG')
        return page.getByTestId('shortcut-hint').count()
      },
      { intervals: [50, 100, 200, 400, 800] },
    )
    .toBe(1)
}

test('g then p collapses the side panel, and again expands it', async ({
  page,
}) => {
  await page.goto('/?demo')
  const panel = page.getByTestId('side-panel')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')

  await armLeader(page)
  await page.keyboard.press('KeyP')
  await expect(panel).toHaveAttribute('data-collapsed', 'true')
  // Firing a binding takes the hint down with it.
  await expect(page.getByTestId('shortcut-hint')).toHaveCount(0)

  await armLeader(page)
  await page.keyboard.press('KeyP')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')
})

test('typing the keys into a text field leaves the panel alone', async ({
  page,
}) => {
  await page.goto('/?demo')
  const panel = page.getByTestId('side-panel')

  // Prove the binding is live on this page first, so the silence below can
  // only be the suppression and never a shortcut that was never listening.
  await armLeader(page)
  await page.keyboard.press('KeyP')
  await expect(panel).toHaveAttribute('data-collapsed', 'true')

  await page.keyboard.press(`${MODIFIER}+KeyK`)
  const search = page.getByTestId('palette-input')
  await expect(search).toBeFocused()

  await search.pressSequentially('gp')
  await expect(search).toHaveValue('gp')
  await expect(page.getByTestId('shortcut-hint')).toHaveCount(0)
  await expect(panel).toHaveAttribute('data-collapsed', 'true')
})

test('an armed leader is forgotten when focus moves into a field', async ({
  page,
}) => {
  await page.goto('/?demo')
  const panel = page.getByTestId('side-panel')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')

  await armLeader(page)
  await page.keyboard.press(`${MODIFIER}+KeyK`)
  await expect(page.getByTestId('palette-input')).toBeFocused()
  await expect(page.getByTestId('shortcut-hint')).toHaveCount(0)

  // Back out and finish the sequence: the leader is gone, not merely paused.
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyP')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')
})

test('the leader lapses if the second key never comes', async ({ page }) => {
  await page.goto('/?demo')
  const panel = page.getByTestId('side-panel')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')

  await armLeader(page)
  // Past the leader window, `g` is forgotten and `p` means nothing.
  await expect(page.getByTestId('shortcut-hint')).toHaveCount(0, {
    timeout: 4000,
  })
  await page.keyboard.press('KeyP')
  await expect(panel).toHaveAttribute('data-collapsed', 'false')
})
