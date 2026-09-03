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

test('TC-012-2 · 자동 재생 중 인디케이터가 카메라를 따라 이동한다', async ({ page }) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready', { timeout: 20_000 })

  const before = await centerX(page.getByTestId('profile-indicator'))
  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'true')

  const samples: number[] = []
  for (let take = 0; take < 6; take += 1) {
    await page.waitForTimeout(300)
    samples.push(await centerX(page.getByTestId('profile-indicator')))
  }
  console.log(`TC-012-2 인디케이터 x ${samples.map((x) => x.toFixed(1)).join(' → ')}`)

  // 뒤로 가지 않고 실제로 나아간다
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]!).toBeGreaterThan(samples[index - 1]!)
  }
  expect(samples[0]!).toBeGreaterThan(before)
})

test('TC-012-6 · 구간이 바뀌지 않는 동안에도 인디케이터가 움직인다(계단이 아니다)', async ({
  page,
}) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready', { timeout: 20_000 })

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'true')

  // 같은 `data-follow-order` 안에서 x가 자라는 표본을 찾는다 — 이것이 이 티켓의 전부다.
  // 종전 구현에서는 order가 고정된 동안 x가 **항상** 같았다(2026-09-02 실측: 550ms 정지).
  const readings: { order: string; x: number }[] = []
  for (let take = 0; take < 40; take += 1) {
    await page.waitForTimeout(60)
    readings.push({
      order: (await canvas.getAttribute('data-follow-order')) ?? '',
      x: await centerX(page.getByTestId('profile-indicator')),
    })
  }

  const movedWithinOrder = readings.filter(
    (reading, at) =>
      at > 0 && reading.order === readings[at - 1]!.order && reading.x > readings[at - 1]!.x,
  )
  console.log(
    `TC-012-6 같은 구간 안 이동 ${movedWithinOrder.length}건 / 표본 ${readings.length - 1}쌍`,
  )
  expect(movedWithinOrder.length).toBeGreaterThan(0)
})

test('TC-012-6 · 재생을 멈추면 인디케이터가 공유 커서 자리로 돌아온다', async ({ page }) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready', { timeout: 20_000 })

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await page.waitForTimeout(900)
  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'false')

  const slider = page.getByTestId('profile-strip-slider')
  const cursor = Number(await slider.getAttribute('aria-valuenow'))
  expect(cursor).toBeGreaterThan(0)

  // 커서가 가리키는 자리 = 그 구간 경계선의 x. 둘이 같아야 세 표면이 한 곳을 가리킨다.
  const indicator = await centerX(page.getByTestId('profile-indicator'))
  const boundary = await centerX(page.getByTestId('profile-boundary').nth(cursor))
  console.log(`TC-012-6 정지 후 인디케이터 ${indicator.toFixed(1)} · 경계 ${boundary.toFixed(1)}`)
  expect(Math.abs(indicator - boundary)).toBeLessThan(1.5)
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

// TC-012-4 — y축의 "상대 스케일(실측 아님)" 표기.
//
// 이 검사는 원래 TC-010-4(근거 등급)의 나머지 절이었고 범례 개폐 중에도 표기가 유지되는지를
// 함께 쟀다. **PC-018(2026-09-03)로 근거 등급 바와 범례가 제거되면서 범례 절은 대상이
// 사라졌고**, 축 표기는 FEAT-012 자기 계약(TC-012-4)으로 남는다 — 그리고 이제 그것이 화면에
// 남은 **유일한 정직성 표기**다. 그래서 이 검사는 약해지는 것이 아니라 더 중요해진다.
//
// ⚠ Given 편차(정직 표기): 티켓 본문의 Given은 "고저차 시각 과장(수직 스케일 확대)이 적용된
// 경우"인데, PC-008이 과장 배율을 3× → **1×**로 내려 현재 과장은 적용되지 않는다.
// 과장이 다시 들어오면 그 조건에서 재확인해야 한다.
test('TC-012-4 · y축 "상대 스케일(실측 아님)" 표기가 조건부 숨김 없이 상시 노출된다', async ({
  page,
}) => {
  await openTrack(page)

  const note = page.getByTestId('profile-strip-scale-note')
  await expect(note).toBeVisible()
  await expect(note).toHaveText('상대 스케일(실측 아님)')

  // 스트립을 접었다 펴도 사라지지 않는다 — 접힘 상태에서도 40px 헤더는 남는다
  await page.getByTestId('profile-strip-toggle').click()
  await expect(note).toBeVisible()
  await page.getByTestId('profile-strip-toggle').click()
  await expect(note).toBeVisible()

  // PC-018 회귀 가드: 제거된 표면이 되살아나지 않았는지 함께 본다
  await expect(page.getByTestId('evidence-overlay')).toHaveCount(0)
  await expect(page.getByTestId('legend-root')).toHaveCount(0)
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
