// FEAT-012 — 하단 프로파일 스트립의 브라우저 축.
//
// 정규화·도달 경계·폐합 불연속의 **계산**은 순수 축(`profile-points.test.ts`)이 잰다.
// 여기서는 DOM이 있어야 성립하는 것만 본다: 그려지는가, 조작이 커서에 반영되는가,
// 축 표기가 개폐를 견디는가.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('profile-strip')).toBeVisible()
}

async function centerX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('요소가 화면에 없다 — 중심 X를 잴 수 없다')
  return box.x + box.width / 2
}

test('TC-012-1 · 고도 곡선이 좌→우로 렌더되고 세그먼트 경계에 구분선이 있다', async ({
  page,
}) => {
  await openTrack(page)

  await expect(page.getByTestId('profile-curve')).toBeVisible()
  // 구분선은 세그먼트마다 하나다 — 0개면 "경계 표시"가 없는 것이고, 132개여야 순서 전체다
  await expect(page.getByTestId('profile-boundary')).toHaveCount(132)

  // 좌→우: 곡선의 x 좌표가 단조 증가해야 순서를 따라 그린 것이다
  const xs = await page.getByTestId('profile-curve').evaluate((node) => {
    const raw = (node as SVGPolylineElement).getAttribute('points') ?? ''
    return raw.split(' ').map((pair) => Number(pair.split(',')[0]))
  })
  expect(xs.length).toBe(132)
  expect(xs.every((value, at) => at === 0 || value > xs[at - 1]!)).toBe(true)
})

test('TC-012-2(부분) · 스트립을 클릭하면 공유 커서가 그 지점으로 옮겨간다', async ({ page }) => {
  await openTrack(page)

  const slider = page.getByTestId('profile-strip-slider')
  await expect(slider).toHaveAttribute('aria-valuenow', '0')

  const box = (await slider.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)

  const now = Number(await slider.getAttribute('aria-valuenow'))
  console.log(`TC-012-2 클릭 후 커서 ${now}`)
  expect(now).toBeGreaterThan(0)

  // 같은 커서를 목록도 본다 — 세 표면이 같은 지점을 가리키는 것이 공유 커서 계약이다
  await expect(page.getByTestId(`section-row-${now}`)).toHaveAttribute('aria-selected', 'true')
})

test('TC-012-2(부분) · 목록에서 옮긴 커서가 스트립 인디케이터에도 반영된다', async ({ page }) => {
  await openTrack(page)

  const before = await centerX(page.getByTestId('profile-indicator'))
  await page.getByTestId('section-row-60').click()

  await expect(page.getByTestId('profile-strip-slider')).toHaveAttribute('aria-valuenow', '60')
  expect(await centerX(page.getByTestId('profile-indicator'))).toBeGreaterThan(before)
})

test('TC-012-4 · y축의 "상대 스케일(실측 아님)" 표기가 항상 남는다', async ({ page }) => {
  await openTrack(page)

  const note = page.getByTestId('profile-strip-scale-note')
  await expect(note).toHaveText('상대 스케일(실측 아님)')

  // 접어도 사라지지 않는다 — 헤더 바는 항상 마운트된다(layout-spec §Chart 리사이즈 계약)
  await page.getByTestId('profile-strip-toggle').click()
  await expect(page.getByTestId('profile-strip')).toHaveAttribute('data-collapsed', 'true')
  await expect(note).toBeVisible()

  await page.getByTestId('profile-strip-toggle').click()
  await expect(note).toBeVisible()
})

// TC-010-4의 나머지 절. FEAT-010 라운드에서는 프로파일 그래프가 없어(FEAT-012 미착수)
// 축 문구를 잴 대상 자체가 없었다 — 그래서 fix 티켓 #30이 열려 있었다.
//
// ⚠ Given 편차(정직 표기): 티켓 본문의 Given은 "고저차 시각 과장(수직 스케일 확대)이
// 적용된 경우"인데, PC-008이 과장 배율을 3× → **1×**로 내려 현재 과장은 적용되지 않는다.
// 여기서 재는 것은 Then의 두 절이다 — 축 표기가 개폐 내내 유지되는가, 범례 중앙이
// 흔들리지 않는가. 과장이 다시 들어오면 그 조건에서 재확인해야 한다.
test('TC-010-4 · 범례를 개폐해도 축 표기가 유지되고 범례 중앙이 흔들리지 않는다', async ({
  page,
}) => {
  await openTrack(page)

  const note = page.getByTestId('profile-strip-scale-note')
  const trigger = page.getByTestId('legend-trigger')
  const overlayCenter = await centerX(page.getByTestId('evidence-overlay'))

  await expect(note).toBeVisible()
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)

  await trigger.click()
  await expect(page.getByTestId('legend-panel')).toBeVisible()
  await expect(note).toBeVisible()
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)

  await trigger.click()
  await expect(page.getByTestId('legend-panel')).toBeHidden()
  await expect(note).toBeVisible()
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)
})

test('스트립은 WebGL 대체 화면에서도 유지된다', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
        return null
      }
      return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(
        this,
        contextId,
        ...rest,
      )
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await openTrack(page)

  await expect(page.getByTestId('webgl-fallback-screen')).toBeVisible()
  // states.md §WebGL 미지원 — "스트립은 유지". 고도는 파싱됐으므로 2D로 그릴 수 있다
  await expect(page.getByTestId('profile-curve')).toBeVisible()
  await expect(page.getByTestId('profile-strip-scale-note')).toBeVisible()
})

test('스트립에 접근성 위반이 없다', async ({ page }) => {
  await openTrack(page)
  const result = await new AxeBuilder({ page }).include('[data-testid="profile-strip"]').analyze()
  expect(result.violations).toEqual([])
})

test('키보드만으로 스트립을 조작한다', async ({ page }) => {
  await openTrack(page)

  const slider = page.getByTestId('profile-strip-slider')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '1')

  await page.keyboard.press('End')
  await expect(slider).toHaveAttribute('aria-valuenow', '131')

  await page.keyboard.press('Home')
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  // 이동 즉시 반영이다 — Enter가 필요 없다(a11y-responsive 명시)
  await expect(page.getByTestId('section-row-0')).toHaveAttribute('aria-selected', 'true')
})
