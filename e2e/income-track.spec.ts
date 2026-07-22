import { expect, test } from '@playwright/test'

/**
 * The income-track view: clicking a player's Income stat in the rail opens a
 * modal showing the full progress track (all 41 income levels with their
 * £/round value and non-linear spacing) and every player's marker. Booted on
 * the ?demo fixture (canal round 8, three players all on negative income).
 */
test('income stat opens the full income track with player markers', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')

  // The Income stat in each rail card is a control; open from the first.
  await page.getByTestId('open-income-track').first().click()

  const modal = page.getByTestId('income-track-modal')
  await expect(modal).toBeVisible()

  // The full track: one row per income level, -10..30 (41 levels).
  await expect(modal.getByTestId(/^income-level-/)).toHaveCount(41)

  // Non-linear spacing is real track data: level 30 spans 3 spaces (97-99),
  // level 21 spans 4, level 1 spans 2, level -10 spans 1.
  await expect(page.getByTitle('Space 97')).toBeVisible()
  await expect(page.getByTitle('Space 99')).toBeVisible()

  // Player markers sit on the track by name.
  await expect(modal.getByTitle(/Eliza — space/)).toBeVisible()

  // Escape closes the modal, and the game underneath is untouched.
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(page.getByTestId('action-build')).toBeVisible()
})
