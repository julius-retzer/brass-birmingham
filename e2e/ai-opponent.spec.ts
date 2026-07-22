import { expect as baseExpect, test } from '@playwright/test'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

// Real network database: round-trips outlast the 5s default under load.
const expect = baseExpect.configure({ timeout: 15_000 })

/**
 * Versus-AI journey against the MOCKED provider (BB_AI_MOCK=1 in the
 * playwright web server — deterministic, free, offline):
 *  - the charter's "Versus AI" mode creates a table with an AI opponent
 *    and starts immediately (no lobby — every seat is claimed)
 *  - the human plays a full loan action
 *  - the server-driven AI takes its whole turn on its own; its move lands
 *    in the journal, its rationale and the cost counter in the AI panel
 *  - play returns to the human in round 2
 */

test.skip(!hasDatabaseUrl, `versus-AI e2e ${NEEDS_DB_MESSAGE}`)
// Real network database + a server-side AI turn: the round-trips outgrow the
// 30s default when the DB is contended (observed under full-suite load).
test.setTimeout(90_000)

test('found a company against an AI rival and watch it take its turn', async ({
  page,
}) => {
  /* ---- charter: Versus AI, 2 industrialists, easy rival ---- */
  await page.goto('/?fresh=1')
  await page.getByTestId('mode-ai').click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByTestId('name-0').fill('Ada')
  await page.getByTestId('ai-tier-0-apprentice').click()
  await page.getByTestId('create-online').click()
  await page.waitForURL(/\/g\/[A-Za-z0-9_-]{20,}/)

  // No lobby: the AI seat is claimed at creation, the game is live.
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')
  await expect(page.getByTestId('round-chip')).toHaveText('Round 1/11')

  // The rival's journal panel is present before the AI has moved.
  await expect(page.getByTestId('ai-mind')).toBeVisible()
  await expect(page.getByTestId('ai-cost')).toContainText('AI spend: $0.0000')

  /* ---- the human's turn: a full loan action ---- */
  await page.getByTestId('action-loan').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await page.getByTestId('confirm-action').click()
  await expect(page.getByText(/Ada took a loan/)).toBeVisible()

  /* ---- the AI turn runs server-side without any input ---- */
  // The mock rival also prefers a loan — its move lands in the journal…
  await expect(page.getByText(/The Apprentice took a loan/)).toBeVisible()
  // …its one-line rationale (and the spend meter) in the rival's journal…
  await expect(page.getByTestId('ai-rationale').first()).toContainText(
    'Mock rationale.',
  )
  await expect(page.getByTestId('ai-cost')).toContainText('model call')
  // …and play returns to Ada for round 2.
  await expect(page.getByTestId('round-chip')).toHaveText('Round 2/11')
  await expect(page.getByTestId('action-pass')).toBeVisible()
})
