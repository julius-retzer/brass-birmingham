import { type Page, expect, test } from '@playwright/test'

/**
 * Error toasts float over the top of the board. On a phone they cover a
 * board-width strip of it, so a toast layer that takes the hit-test swallows
 * the tap under it — the worst kind of failure on a touch surface, because the
 * player gets no feedback that the tap was lost.
 *
 * Taps here are raw CDP touch events: a synthetic `dispatchEvent` click would
 * bypass the browser's own hit-test, which is the only thing under test.
 */

const PHONE = { width: 390, height: 844 }

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const FRONT_TOAST =
  '[data-sonner-toast][data-front="true"][data-visible="true"][data-removed="false"]'
const BOARD = 'svg[aria-label="Game board map"]'

function centre(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

function contains(r: Rect, p: { x: number; y: number }) {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height
}

async function tap(page: Page, at: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: at.x, y: at.y, id: 1 }],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
}

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`no box for ${selector}`)
  return b
}

/**
 * Hold every toast open. Sonner auto-closes on a 4s timer, which is plenty for
 * a player and far too tight for a spec that has to settle the slide-in, scroll
 * the board and then tap: an expiry mid-measurement would fail this test for a
 * reason it is not about. Nothing else in the game schedules a timer this long.
 */
async function freezeToastExpiry(page: Page) {
  await page.addInitScript(() => {
    const native = window.setTimeout
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) =>
      (ms ?? 0) >= 3000
        ? 0
        : native(fn, ms, ...rest)) as typeof window.setTimeout
  })
}

/** A toast slides in over ~400ms, so read its box once it has come to rest. */
async function settledBox(page: Page, selector: string): Promise<Rect> {
  let last = await box(page, selector)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const next = await box(page, selector)
    if (next.y === last.y && next.height === last.height) return next
    last = next
  }
  throw new Error(`${selector} never settled`)
}

/** What the browser itself says is on top at a viewport point. */
async function hitTest(page: Page, at: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return {
      city: el?.closest('g[data-city]')?.getAttribute('data-city') ?? null,
      inToastLayer: !!el?.closest('[data-sonner-toaster]'),
    }
  }, at)
}

/** A build stopped on the site step, with an error toast raised over the board. */
async function toastOverBuildStep(page: Page) {
  await freezeToastExpiry(page)
  await page.goto('/?demo')
  await page.getByTestId('action-build').click()
  await page.getByTestId('card-brewery_2').click()
  await expect(page.getByText(/Choose a site for your brewery/)).toBeVisible()

  // An illegal site raises the engine's own refusal as an error toast.
  await page
    .locator('g[data-city="birmingham"]:not([data-legal])')
    .click({ force: true })
  await expect(
    page.getByText(/Birmingham is not in your network/),
  ).toBeVisible()
  await page.locator(BOARD).scrollIntoViewIfNeeded()
}

test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

test('phone: an error toast does not swallow the board tap under it', async ({
  page,
}) => {
  await toastOverBuildStep(page)

  const toast = await settledBox(page, FRONT_TOAST)
  const board = await box(page, BOARD)
  // The premise: the toast is painted across the top of the board.
  expect(toast.y).toBeLessThan(board.y + board.height)
  expect(toast.y + toast.height).toBeGreaterThan(board.y)
  expect(toast.width).toBeGreaterThan(300)

  // Bring a legal plate under the toast by scrolling the page — the toast is
  // fixed to the viewport, the board scrolls with the document.
  const plate = page.locator(`${BOARD} g[data-city][data-legal="true"]`).first()
  const city = await plate.getAttribute('data-city')
  const cityName = (await plate.getAttribute('aria-label'))!.split(' — ')[0]
  const start = await plate.boundingBox()
  await page.evaluate(
    (dy) => window.scrollBy(0, dy),
    centre(start!).y - centre(toast).y,
  )
  const at = centre((await plate.boundingBox())!)

  // The toast is still up, and still covers the point about to be tapped.
  const stillThere = await box(page, FRONT_TOAST)
  await expect(page.locator(FRONT_TOAST)).toBeVisible()
  expect(contains(stillThere, at)).toBe(true)

  // The browser hands that point to the plate, not to the toast layer.
  const hit = await hitTest(page, at)
  expect(hit.inToastLayer).toBe(false)
  expect(hit.city).toBe(city)

  // And a real finger there selects that site.
  await tap(page, at)
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(
    page.getByText(new RegExp(`built Brewery \\(I\\) at ${cityName}`)),
  ).toBeVisible()
})

test('phone: a control inside a toast is still clickable', async ({ page }) => {
  await toastOverBuildStep(page)
  await settledBox(page, FRONT_TOAST)

  // No toast in the app carries an action, cancel or close control today, so
  // the exception that keeps such a control clickable is exercised against the
  // live cascade instead: a real button, inside a real toast, tapped for real.
  await page.locator(FRONT_TOAST).evaluate((li) => {
    const button = document.createElement('button')
    button.dataset.button = 'true'
    button.id = 'probe-action'
    button.textContent = 'Undo'
    button.addEventListener('click', () => {
      button.dataset.tapped = 'true'
    })
    li.appendChild(button)
  })

  const button = page.locator('#probe-action')
  await expect(button).toBeVisible()
  const at = centre((await button.boundingBox())!)

  // The browser hands the point to the button, not past it to the board.
  expect((await hitTest(page, at)).inToastLayer).toBe(true)
  await tap(page, at)
  await expect(button).toHaveAttribute('data-tapped', 'true')
})
