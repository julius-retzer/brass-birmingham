/**
 * Hover-to-locate — hovering (or focusing) a city NAME anywhere in the UI
 * spotlights that city's plate on the board map (`data-located` on the
 * g[data-city] group), because finding cities on the map is genuinely hard.
 *
 * Offline: runs on the demo fixtures, no DB.
 */
import { expect, test } from '@playwright/test'

test('hovering a journal place name spotlights that city on the map', async ({
  page,
}) => {
  await page.goto('/?demo')

  // The demo ledger's journal is full of engine entries naming places; every
  // recognised place is a data-locate-city span. Take the first one and make
  // sure the map answers with the locate mark on exactly that plate.
  const name = page
    .getByTestId('journal-entry')
    .locator('[data-locate-city]')
    .first()
  await expect(name).toBeVisible()
  const cityId = await name.getAttribute('data-locate-city')
  expect(cityId).toBeTruthy()

  await name.hover()
  await expect(
    page.locator(`g[data-city="${cityId}"][data-located="true"]`),
  ).toBeVisible()

  // Moving off the name releases the spotlight.
  await page.getByTestId('era-plate').hover()
  await expect(
    page.locator(`g[data-city="${cityId}"][data-located="true"]`),
  ).toHaveCount(0)
})

test('the beer-source picker locates breweries and merchants; focus counts as hover', async ({
  page,
}) => {
  await page.goto('/?demo=beerchoice')
  await page.getByTestId('action-sell').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()

  // The sale list itself names places — hovering the goods' city name
  // spotlights Leek before any sale is staged.
  const saleOption = page
    .getByTestId('sale-option')
    .filter({ hasText: 'cotton at Leek' })
  await saleOption.locator('[data-locate-city="leek"]').hover()
  await expect(
    page.locator('g[data-city="leek"][data-located="true"]'),
  ).toBeVisible()

  await saleOption.click()

  // Hovering the own-brewery option points at Stone…
  const sources = page.getByTestId('beer-source')
  await sources.filter({ hasText: 'brewery at Stone' }).hover()
  await expect(
    page.locator('g[data-city="stone"][data-located="true"]'),
  ).toBeVisible()

  // …and keyboard focus on the merchant option points at the Warrington
  // merchant plate (a11y: focus counts as hover; merchants count as places).
  await sources.filter({ hasText: "Warrington merchant's barrel" }).focus()
  await expect(
    page.locator('g[data-city="warrington"][data-located="true"]'),
  ).toBeVisible()
  await expect(
    page.locator('g[data-city="stone"][data-located="true"]'),
  ).toHaveCount(0)
})

test('the iron-source picker locates rival works; the market locates nothing', async ({
  page,
}) => {
  await page.goto('/?demo=ironchoice')
  await page.getByTestId('action-develop').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  // Confirming the tile step lands on the machine's iron-source step.
  await page.getByTestId('develop-lowest').click()

  const sources = page.getByTestId('iron-source')
  await expect(sources.first()).toBeVisible()
  const first = sources.first()
  const cityId = await first
    .locator('[data-locate-city]')
    .first()
    .getAttribute('data-locate-city')
  expect(cityId).toBeTruthy()

  await first.hover()
  await expect(
    page.locator(`g[data-city="${cityId}"][data-located="true"]`),
  ).toBeVisible()

  await page.getByTestId('era-plate').hover()
  await expect(page.locator('g[data-located="true"]')).toHaveCount(0)
})
