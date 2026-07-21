import { expect as baseExpect, test } from '@playwright/test'
import { NEEDS_DB_MESSAGE, hasDatabaseUrl } from './db-available'

// SSE + POST round-trips against a real network DB outlast the 5s default.
const expect = baseExpect.configure({ timeout: 15_000 })

/**
 * The public lobby browser: an open online table is DISCOVERABLE without the
 * invite link, and a joiner reaches it straight from the list. A full table
 * drops off the list (it is not joinable). This is the one thing the token-URL
 * flow could never do.
 */
test.skip(!hasDatabaseUrl, `lobby browser e2e ${NEEDS_DB_MESSAGE}`)
test.setTimeout(90_000)

test('an open table is discoverable in the browser, joinable, and leaves the list once started', async ({
  browser,
}) => {
  /* ---- host opens a 2-player online table from the charter ---- */
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  await host.goto('/?fresh=1')
  await host.getByTestId('mode-online').click()
  await host.getByTestId('name-0').fill('Ada')
  await host.getByRole('button', { name: '2', exact: true }).click()
  await host.getByTestId('create-online').click()
  await host.waitForURL(/\/g\/[A-Za-z0-9_-]{20,}/)
  const token = host.url().split('/g/')[1]!

  /* ---- a second player finds it from the lobby browser (no link) ---- */
  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto('/lobbies')
  const row = guest.getByTestId(`lobby-row-${token}`)
  await expect(row).toBeVisible()
  await expect(row).toContainText('Ada')
  await expect(row).toContainText('1 / 2 seated')

  /* ---- Join takes them to the table's join screen ---- */
  await guest.getByTestId(`lobby-join-${token}`).click()
  await guest.waitForURL(new RegExp(`/g/${token}`))
  await guest.getByTestId('join-name').fill('Brunel')
  await guest.getByTestId('join-seat').click()

  /* ---- table is now full → it drops off the public list ---- */
  await guest.goto('/lobbies')
  await expect(guest.getByTestId(`lobby-row-${token}`)).toHaveCount(0)
})
