/**
 * Double-link beer choice — the second rail's barrel could come from more
 * than one brewery, so the machine stops at the beer picker instead of
 * auto-skipping (the ?era=rail fixture's pair always auto-skips this step).
 *
 * Fixture: ?demo=doublebeer — rail era; the pair redditch-gloucester +
 * birmingham-redditch is generator-verified completable WITH a real beer
 * choice on the post-placement network (never merchant beer, rules p.9).
 */
import { type Page, expect, test } from '@playwright/test'

const FIRST = 'redditch|gloucester'
const SECOND = 'birmingham|redditch'

/**
 * Click a map route ON its stroke. Routes are curved (routeBow), so the
 * bounding-box centre Playwright would click can miss the fat hit-stroke
 * entirely — compute the true path midpoint and click that with the mouse.
 */
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

test('the double rail stops at the beer picker and completes after the choice', async ({
  page,
}) => {
  await page.goto('/?demo=doublebeer')
  await expect(page.getByTestId('era-plate')).toHaveText('rail era')

  await page.getByTestId('action-network').click()
  await page.locator('button.bb2-card:not([disabled])').first().click()
  await expect(page.getByText('Choose a rail route on the map.')).toBeVisible()

  // Both route clicks land on bowed strokes; retry until the machine moves.
  await expect(async () => {
    await clickRoute(page, FIRST)
    await expect(page.getByTestId('choose-double-link')).toBeVisible({
      timeout: 1000,
    })
  }).toPass()
  await page.getByTestId('choose-double-link').click()

  const secondPrompt = page.getByText(
    'Choose the second rail route on the map.',
  )
  await expect(secondPrompt).toBeVisible()
  await expect(async () => {
    await clickRoute(page, SECOND)
    await expect(secondPrompt).toBeHidden({ timeout: 1000 })
  }).toPass()

  // THE point of this journey: the machine must ASK for the barrel's source
  // (2+ breweries reach the second rail post-placement), never auto-skip.
  const sources = page.getByTestId('beer-source')
  await expect(sources.first()).toBeVisible()
  expect(await sources.count()).toBeGreaterThanOrEqual(2)

  await sources.first().click()
  const confirm = page.getByTestId('confirm-action')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(
    page.getByText(
      /built 2 rail links \(redditch-gloucester, birmingham-redditch\)/,
    ),
  ).toBeVisible()
})
