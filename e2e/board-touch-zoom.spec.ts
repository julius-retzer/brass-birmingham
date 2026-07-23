import { type CDPSession, type Page, expect, test } from '@playwright/test'

/**
 * The board on a PHONE: pinch-to-zoom, one-finger pan, and the +/−/home
 * controls that have to stay coherent with them. At the fit-the-board default
 * a city slot renders at ~11px on a 390px screen — technically painted,
 * practically unreadable and untappable — so zooming in is the whole game on a
 * phone, and it has to land the finger on the right tile afterwards.
 *
 * Touch is driven through raw CDP `Input.dispatchTouchEvent`: Playwright's own
 * touchscreen API is single-point, and synthetic `dispatchEvent` pointers would
 * not prove the real browser gesture path works (the same blind spot that once
 * hid the setPointerCapture click-eating bug — see board-map.tsx).
 */

const PHONE = { width: 390, height: 844 }

interface Touch {
  x: number
  y: number
  id: number
}

/** One raw multi-touch frame. `type` is CDP's touch event type. */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: Touch[],
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  })
}

/** Viewport box of the board svg. */
async function boardBox(page: Page) {
  const box = await page.getByLabel('Game board map').boundingBox()
  if (!box) throw new Error('board svg has no box')
  return box
}

/**
 * Drive a two-finger pinch about `anchor`, from `fromGap` to `toGap` px
 * between the fingers. The fingers travel horizontally and are kept inside
 * `bounds` — a touch point outside the svg lands on another element and the
 * gesture silently never starts.
 */
async function pinch(
  cdp: CDPSession,
  anchor: { x: number; y: number },
  fromGap: number,
  toGap: number,
  bounds: { x: number; width: number },
) {
  const lo = bounds.x + 2
  const hi = bounds.x + bounds.width - 2
  const at = (gap: number) => [
    { x: Math.max(lo, anchor.x - gap), y: anchor.y, id: 1 },
    { x: Math.min(hi, anchor.x + gap), y: anchor.y, id: 2 },
  ]
  const step = fromGap < toGap ? 10 : -10
  await touch(cdp, 'touchStart', at(fromGap))
  for (
    let gap = fromGap + step;
    step > 0 ? gap <= toGap : gap >= toGap;
    gap += step
  ) {
    await touch(cdp, 'touchMove', at(gap))
  }
  await touch(cdp, 'touchEnd', [])
}

function viewBoxWidth(vb: string | null): number {
  return Number((vb ?? '').split(/\s+/)[2])
}

test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

test('phone: pinch zooms the board in and out about the fingers', async ({
  page,
}) => {
  await page.goto('/?demo')
  await expect(page.getByTestId('era-plate')).toHaveText('canal era')

  const svg = page.getByLabel('Game board map')
  const plate = page.locator('g[data-city="birmingham"]')
  const before = await svg.getAttribute('viewBox')
  const smallPlate = (await plate.boundingBox())!
  // The premise of this whole spec: unreadably small at the default view.
  expect(smallPlate.width).toBeLessThan(40)

  const cdp = await page.context().newCDPSession(page)
  const box = await boardBox(page)
  const anchor = {
    x: smallPlate.x + smallPlate.width / 2,
    y: smallPlate.y + smallPlate.height / 2,
  }

  // Spread two fingers apart, centred on Birmingham.
  await pinch(cdp, anchor, 20, 130, box)

  await expect.poll(async () => svg.getAttribute('viewBox')).not.toBe(before)
  const zoomedVb = await svg.getAttribute('viewBox')
  expect(viewBoxWidth(zoomedVb)).toBeLessThan(viewBoxWidth(before))

  // Readable AND tappable: the plate is now several times its former size,
  // and it stayed under the fingers that grabbed it.
  const bigPlate = (await plate.boundingBox())!
  expect(bigPlate.width).toBeGreaterThan(smallPlate.width * 2.5)
  const drift = Math.hypot(
    bigPlate.x + bigPlate.width / 2 - anchor.x,
    bigPlate.y + bigPlate.height / 2 - anchor.y,
  )
  expect(drift).toBeLessThan(12)

  // Pinching closed zooms back out, from the middle of the board where both
  // fingers are certain to have room.
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await pinch(cdp, centre, 130, 20, box)
  await expect
    .poll(async () => viewBoxWidth(await svg.getAttribute('viewBox')))
    .toBeGreaterThan(viewBoxWidth(zoomedVb))
})

test('phone: one finger pans while zoomed, and home restores the fit view', async ({
  page,
}) => {
  await page.goto('/?demo')
  const svg = page.getByLabel('Game board map')
  const fitView = await svg.getAttribute('viewBox')

  // Zoom in with the control, so this test does not depend on the gesture.
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  for (let i = 0; i < 4; i++) await zoomIn.click()
  await expect.poll(async () => svg.getAttribute('viewBox')).not.toBe(fitView)
  const zoomed = await svg.getAttribute('viewBox')

  const box = await boardBox(page)
  const cdp = await page.context().newCDPSession(page)
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await touch(cdp, 'touchStart', [{ ...from, id: 1 }])
  for (let i = 1; i <= 8; i++) {
    await touch(cdp, 'touchMove', [
      { x: from.x - i * 9, y: from.y - i * 7, id: 1 },
    ])
  }
  await touch(cdp, 'touchEnd', [])

  await expect.poll(async () => svg.getAttribute('viewBox')).not.toBe(zoomed)
  // A pan never changes the zoom level.
  expect(viewBoxWidth(await svg.getAttribute('viewBox'))).toBeCloseTo(
    viewBoxWidth(zoomed),
    5,
  )

  // The home control is reachable on a phone (the legend used to cover it)
  // and puts the whole board back.
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect.poll(async () => svg.getAttribute('viewBox')).toBe(fitView)
})

test('phone: a tap after zooming selects the tile under the finger', async ({
  page,
}) => {
  await page.goto('/?demo')

  // Enter a build so city plates become legal tap targets.
  await page.getByTestId('action-build').click()
  await page.getByTestId('card-brewery_2').click()
  await expect(page.getByText(/Choose a site for your brewery/)).toBeVisible()

  const derby = page.locator('g[data-city="derby"]')
  await expect(derby).toHaveAttribute('data-legal', 'true')

  // Pinch in on Derby itself, then tap it where it now sits.
  const svg = page.getByLabel('Game board map')
  // Picking the card scrolled the phone page down to the hand tray — touch
  // coordinates are viewport-relative, so bring the board back first.
  await svg.scrollIntoViewIfNeeded()
  const cdp = await page.context().newCDPSession(page)
  const board = await boardBox(page)
  const small = (await derby.boundingBox())!
  await pinch(
    cdp,
    { x: small.x + small.width / 2, y: small.y + small.height / 2 },
    20,
    130,
    board,
  )
  await expect
    .poll(async () => viewBoxWidth(await svg.getAttribute('viewBox')))
    .toBeLessThan(1600)

  const box = (await derby.boundingBox())!
  expect(box.width).toBeGreaterThan(small.width * 2)
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }
  await touch(cdp, 'touchStart', [point])
  await touch(cdp, 'touchEnd', [])

  // The engine took DERBY, not a neighbour — no coordinate drift between the
  // visual transform and the hit test. The journal names the site, so this
  // pins WHICH plate the finger landed on.
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(
    page.getByText(/Eliza built Brewery \(I\) at Derby/),
  ).toBeVisible()
})
