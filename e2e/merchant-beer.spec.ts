/**
 * The beer a merchant supplies, as the board actually renders it.
 *
 * The geometry is unit-pinned in `src/components/board/merchant-beer.test.ts`;
 * what only a real render can show is WHICH slots get a socket and which state
 * it is in, so this spec walks the four cases the fixtures produce: a merchant
 * with beer, a blank tile that buys nothing, a closed merchant with no tiles at
 * all, and a barrel spent on a sale.
 */
import { type Page, expect, test } from '@playwright/test'

function sockets(page: Page, city: string, state?: 'ready' | 'spent') {
  const sel = state ? `[data-beer="${state}"]` : '[data-beer]'
  return page.locator(`g[data-city="${city}"] ${sel}`)
}

test('every merchant tile that buys goods shows its beer; blank and closed ones show none', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(page.getByTestId('era-plate')).toBeVisible()

  // Warrington prints two tiles in this fixture, both stocked.
  await expect(sockets(page, 'warrington', 'ready')).toHaveCount(2)

  await expect(sockets(page, 'shrewsbury', 'ready')).toHaveCount(1)

  // Gloucester and Oxford each pair a buying tile with a blank one. The blank
  // tile never holds beer, so it gets no socket at all — not an empty one.
  for (const city of ['gloucester', 'oxford']) {
    await expect(sockets(page, city, 'ready')).toHaveCount(1)
    await expect(sockets(page, city)).toHaveCount(1)
  }

  // Nottingham is closed at this player count: no tiles, so no sockets.
  await expect(sockets(page, 'nottingham')).toHaveCount(0)

  // Nothing is stuck in the spent state before anyone has sold.
  await expect(page.locator('[data-beer="spent"]')).toHaveCount(0)
})

test('spending a merchant barrel empties that socket and no other', async ({
  page,
}) => {
  await page.goto('/?demo=beerchoice')
  await expect(sockets(page, 'warrington', 'ready')).toHaveCount(1)
  const readyBefore = await page.locator('[data-beer="ready"]').count()

  await page.getByTestId('action-sell').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await page
    .getByTestId('sale-option')
    .filter({ hasText: 'cotton at Leek' })
    .click()
  await page
    .getByTestId('beer-source')
    .filter({ hasText: "Warrington merchant's barrel" })
    .click()

  await expect(sockets(page, 'warrington', 'spent')).toHaveCount(1)
  await expect(sockets(page, 'warrington', 'ready')).toHaveCount(0)
  await expect(page.locator('[data-beer="ready"]')).toHaveCount(readyBefore - 1)
})

test('the barrel glyph sits centred in its socket, clear of the rim', async ({
  page,
}) => {
  // `merchant-beer.ts` hard-codes the vendored glyph's ink bounds, because the
  // board renders server-side where there is no `getBBox`. This measures the
  // real path: if the icon data moves, the barrel drifts off-centre or out of
  // its well and nothing else would notice.
  await page.goto('/?demo')
  await expect(page.getByTestId('era-plate')).toBeVisible()
  const fit = await page
    .locator('g[data-beer="ready"]')
    .first()
    .evaluate((g) => {
      const socket = g.querySelector('circle')!
      const art = g.querySelector('g') as SVGGElement
      const ink = (art.querySelector('path') as SVGPathElement).getBBox()
      // getBBox is in the element's own space, so walk the art group's matrix
      // to land the ink bounds in the socket's coordinates.
      const m = art.transform.baseVal.consolidate()!.matrix
      const xs = [ink.x, ink.x + ink.width]
      const ys = [ink.y, ink.y + ink.height]
      const pts = xs.flatMap((x) =>
        ys.map((y) => ({
          x: m.a * x + m.c * y + m.e,
          y: m.b * x + m.d * y + m.f,
        })),
      )
      return {
        r: Number(socket.getAttribute('r')),
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        left: Math.min(...pts.map((p) => p.x)),
        right: Math.max(...pts.map((p) => p.x)),
        top: Math.min(...pts.map((p) => p.y)),
        bottom: Math.max(...pts.map((p) => p.y)),
      }
    })

  // Both axes come out of the same factor, with no skew: the art can be sized,
  // never stretched or sheared.
  expect(fit.a).toBeCloseTo(fit.d, 9)
  expect(fit.b).toBe(0)
  expect(fit.c).toBe(0)

  const w = fit.right - fit.left
  const h = fit.bottom - fit.top
  expect(w).toBeGreaterThan(0)
  // Centred on the socket origin, and inside its rim on both axes.
  expect(Math.abs(fit.left + w / 2)).toBeLessThan(0.6)
  expect(Math.abs(fit.top + h / 2)).toBeLessThan(0.6)
  expect(w / 2).toBeLessThan(fit.r - 1)
  expect(h / 2).toBeLessThan(fit.r - 1)
})

// merchant-beer.test.ts sizes the barrel in board units against these two
// scales. They are a property of the frame, not of the board data, so a layout
// change could move them and shrink every on-board marker with nothing failing.
for (const [width, height, scale] of [
  [1280, 900, 0.489],
  [390, 844, 0.221],
] as const) {
  test(`the board renders at ${scale} of its viewBox at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/?demo')
    await expect(page.getByTestId('era-plate')).toBeVisible()
    const measured = await page
      .locator('svg.touch-none')
      .evaluate((svg) => (svg as SVGSVGElement).getScreenCTM()!.a)
    expect(measured).toBeCloseTo(scale, 2)
  })
}
