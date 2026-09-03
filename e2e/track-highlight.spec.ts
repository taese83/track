// FEAT-019 — 목록·스트립이 고른 구간을 3D 씬이 짚는가.
//
// 순수 축(`highlight-geometry.test.ts`·`highlight-visibility.test.ts`)이 좌표와 판정을 재고,
// 여기서는 **클릭이 실제로 씬에 닿는가**와 **카메라를 언제 건드리는가**만 본다.
//
// 하이라이트는 3D 픽셀이라 DOM에 흔적을 남기지 않는다. 두 축으로 잰다:
// ① `data-highlight-order` — 어느 구간을 짚고 있는가(구조)
// ② 캔버스 스크린샷의 테두리 색 픽셀 수 — 실제로 그려졌는가(픽셀).
// ②는 베이스라인 diff가 **아니다**(nonGoals "픽셀 스크린샷 diff로 CI를 게이팅하지 않는다") —
// 고정 hex 하나가 화면에 있는지 세는 존재 판정이며 기준 이미지를 갖지 않는다.
import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * 테두리 밝은 톤 `highlight-edge-light #C4B5FD`. 테두리는 불투명해 이 색 그대로 화면에 남는다
 * (면은 반투명이라 아래 노면색과 섞여 값이 배경마다 달라진다 — 세는 대상이 아니다).
 * 여유를 좁게 잡는다: `primary-hover #B9A3FC`가 가까워 넓게 잡으면 UI 크롬이 씬으로 샌다.
 */
const EDGE_LIGHT_RGB = { r: 0xc4, g: 0xb5, b: 0xfd }
const EDGE_TOLERANCE = { r: 18, g: 18, b: 14 }

async function submit(page: Page, value: string) {
  await page.getByTestId('url-input').fill(value)
  await page.getByTestId('url-submit').click()
}

async function openTrack(page: Page, code = 'WS67Y2'): Promise<Locator> {
  await submit(page, code)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready', { timeout: 20_000 })
  return canvas
}

/**
 * 캔버스 안의 테두리 픽셀 수. PNG 디코더를 의존성으로 들이지 않으려고 스크린샷을 다시
 * 브라우저로 보내 2D 캔버스에서 센다(CHANGE_BUDGET 의존성 0).
 */
async function edgePixels(page: Page, canvas: Locator): Promise<number> {
  const box = await canvas.locator('canvas').boundingBox()
  if (box === null) throw new Error('캔버스 박스를 읽지 못했다')
  // 캔버스 위에 **겹친** 조작 오버레이를 가린다. clip은 겹침을 걷어내지 못한다 — 추종 토글과
  // 속도 컨트롤의 선택 상태가 `primary` 배경이라(같은 hex) 가리지 않으면 UI 크롬이 씬으로
  // 센다(실측: 추종 ON에서 하이라이트가 없는데 2354px이 잡혔다). 마스크는 #FF00FF라 창 밖이다.
  const shot = await page.screenshot({
    clip: box,
    mask: [
      page.getByTestId('follow-toggle'),
      page.getByTestId('follow-play'),
      page.getByTestId('follow-speed'),
    ],
  })

  return page.evaluate(
    async ({ data, target, tolerance }) => {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve())
        image.addEventListener('error', () => reject(new Error('스크린샷 디코드 실패')))
        image.src = `data:image/png;base64,${data}`
      })
      const surface = document.createElement('canvas')
      surface.width = image.width
      surface.height = image.height
      const context = surface.getContext('2d')
      if (context === null) throw new Error('2D 컨텍스트 없음')
      context.drawImage(image, 0, 0)
      const { data: pixels } = context.getImageData(0, 0, surface.width, surface.height)

      let hits = 0
      for (let at = 0; at + 3 < pixels.length; at += 4) {
        // 안티에일리어싱 여유. 편집기 팔레트(빨강 #AD0A09·파랑 #004E8F·청록·주황)는 어느
        // 채널로도 이 창에 들어오지 않는다 — 보라를 고른 이유가 그것이다(tokens §2).
        if (
          Math.abs(pixels[at]! - target.r) <= tolerance.r
          && Math.abs(pixels[at + 1]! - target.g) <= tolerance.g
          && Math.abs(pixels[at + 2]! - target.b) <= tolerance.b
        ) {
          hits += 1
        }
      }
      return hits
    },
    { data: shot.toString('base64'), target: EDGE_LIGHT_RGB, tolerance: EDGE_TOLERANCE },
  )
}

/** `data-camera-*`는 컨트롤의 `change`에서만 쓰인다 — 한 번 흔들어 초기값을 남긴다 */
async function seedCameraState(canvas: Locator) {
  await canvas.click({ position: { x: 8, y: 8 } })
  await canvas.press('ArrowRight')
  await expect(canvas).toHaveAttribute('data-camera-azimuth', /-?\d/)
}

async function cameraState(canvas: Locator) {
  return {
    azimuth: await canvas.getAttribute('data-camera-azimuth'),
    polar: await canvas.getAttribute('data-camera-polar'),
    distance: await canvas.getAttribute('data-camera-distance'),
    target: await canvas.getAttribute('data-camera-target'),
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-019-1 · 목록 행을 클릭하면 그 구간이 씬에서 하이라이트된다', async ({ page }) => {
  const canvas = await openTrack(page)

  // 종전에는 추종을 켜지 않으면 캔버스가 커서에 아무 반응도 하지 않았다(관측된 baseline)
  await expect(canvas).toHaveAttribute('data-follow-mode', 'false')
  await expect(canvas).toHaveAttribute('data-highlight-order', '0')

  const before = await edgePixels(page, canvas)

  await page.getByTestId('section-row-40').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '40')
  await expect(page.getByTestId('section-row-40')).toHaveAttribute('aria-selected', 'true')

  const after = await edgePixels(page, canvas)
  console.log(`TC-019-1 테두리 픽셀 ${before} → ${after}`)
  expect(after).toBeGreaterThan(0)

  // 동시에 하나뿐이다 — 다음 행을 고르면 앞의 것이 남지 않는다
  await page.getByTestId('section-row-90').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '90')
  await expect(page.getByTestId('section-row-40')).toHaveAttribute('aria-selected', 'false')
})

test('TC-019-2 · 스트립 조작이 옮긴 지점을 목록·스트립·하이라이트가 함께 가리킨다', async ({
  page,
}) => {
  const canvas = await openTrack(page)
  const slider = page.getByTestId('profile-strip-slider')

  await slider.click()
  for (let step = 0; step < 5; step += 1) await slider.press('ArrowRight')

  const cursor = await slider.getAttribute('aria-valuenow')
  expect(cursor).not.toBeNull()
  await expect(canvas).toHaveAttribute('data-highlight-order', cursor!)
  await expect(page.getByTestId(`section-row-${cursor}`)).toHaveAttribute('aria-selected', 'true')

  expect(await edgePixels(page, canvas)).toBeGreaterThan(0)
})

test('TC-019-3 · 트랙 아래에서 올려다봐도 윤곽선이 보인다(깊이 검사를 하지 않는다)', async ({
  page,
}) => {
  const canvas = await openTrack(page)
  await seedCameraState(canvas)

  // 전체 프레이밍에서 한 구간의 윤곽선은 17px 남짓이라(실측) 사각에서 안티에일리어싱에
  // 묻힌다. 먼저 바짝 당겨 그 구간을 화면 밖으로 보낸 뒤 고르면 — 이 기능이 타깃을 그리로
  // 옮기므로(TC-019-4) — 구간이 화면 한가운데에 크게 선다. 그 위에서 위/아래를 대조한다.
  for (let step = 0; step < 20; step += 1) await canvas.press('+')
  await page.getByTestId('section-row-60').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '60')
  await page.waitForTimeout(600)

  const above = await edgePixels(page, canvas)
  expect(above).toBeGreaterThan(0)

  // 극각을 90°(π/2) 너머로 돌려 **트랙 밑면**에서 본다(TC-006-6의 360° 순환). 그러면 노면이
  // 하이라이트 면(노면 위 0.6cm)을 가린다 — 그래도 남는 보라는 depthTest를 끈 윤곽선뿐이다.
  for (let step = 0; step < 40; step += 1) {
    const at = Number((await canvas.getAttribute('data-camera-polar')) ?? '0')
    if (at > Math.PI / 2 + 0.25) break
    await canvas.press('ArrowDown')
  }
  const polar = Number((await canvas.getAttribute('data-camera-polar')) ?? '0')
  expect(polar).toBeGreaterThan(Math.PI / 2 + 0.2)

  const below = await edgePixels(page, canvas)
  console.log(`TC-019-3 위에서 ${above}px · 밑면에서 ${below}px (극각 ${polar.toFixed(3)}rad)`)
  expect(below).toBeGreaterThan(0)
})

test('TC-019-4 · 화면 안이면 카메라를 건드리지 않고, 밖이면 타깃만 옮긴다', async ({ page }) => {
  const canvas = await openTrack(page)
  await seedCameraState(canvas)

  // ① 전체가 보이는 초기 프레이밍에서는 어느 구간을 골라도 카메라가 그대로다
  const wide = await cameraState(canvas)
  await page.getByTestId('section-row-70').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '70')
  await page.waitForTimeout(500)
  expect(await cameraState(canvas)).toEqual(wide)

  // ② 바짝 당겨 대부분의 구간을 화면 밖으로 보낸다
  for (let step = 0; step < 22; step += 1) await canvas.press('+')
  const zoomed = await cameraState(canvas)

  await page.getByTestId('section-row-10').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '10')
  await page.waitForTimeout(600)
  const moved = await cameraState(canvas)

  console.log(`TC-019-4 타깃 ${zoomed.target} → ${moved.target}`)
  expect(moved.target).not.toBe(zoomed.target)

  // 사용자가 잡아 둔 시점은 그대로다 — 옮긴 것은 타깃뿐이다
  expect(Number(moved.azimuth)).toBeCloseTo(Number(zoomed.azimuth), 3)
  expect(Number(moved.polar)).toBeCloseTo(Number(zoomed.polar), 3)
  expect(Number(moved.distance) / Number(zoomed.distance)).toBeCloseTo(1, 3)

  // 옮겼으니 보인다
  expect(await edgePixels(page, canvas)).toBeGreaterThan(0)
})

test('TC-019-5 · 추종을 켜면 하이라이트가 사라지고 끄면 커서 자리에 돌아온다', async ({
  page,
}) => {
  const canvas = await openTrack(page)
  await page.getByTestId('section-row-25').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '25')

  await page.getByTestId('follow-toggle').click()
  await expect(canvas).toHaveAttribute('data-follow-mode', 'true')
  await expect(canvas).not.toHaveAttribute('data-highlight-order', /.*/)
  expect(await edgePixels(page, canvas)).toBe(0)

  await page.getByTestId('follow-toggle').click()
  await expect(canvas).toHaveAttribute('data-follow-mode', 'false')
  await expect(canvas).toHaveAttribute('data-highlight-order', '25')
})

test('TC-019-6 · 도달 불가 구간에는 하이라이트가 생기지 않는다', async ({ page }) => {
  const canvas = await openTrack(page, 'UNSUPP')

  await page.getByTestId('section-row-5').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '5')

  // 미지원 피스 행은 비활성이다 — 눌러도 커서가 가지 않으므로 하이라이트도 옮겨가지 않는다
  const blocked = page.locator('[role="option"][aria-disabled="true"]').first()
  await expect(blocked).toHaveCount(1)
  await blocked.click({ force: true })

  await page.waitForTimeout(300)
  await expect(canvas).toHaveAttribute('data-highlight-order', '5')
})

test('TC-019-7 · 커서를 연속으로 옮겨도 오빗 fps가 30 이상이다', async ({ page }) => {
  const canvas = await openTrack(page)

  for (let row = 0; row < 20; row += 1) {
    await page.getByTestId(`section-row-${row * 6}`).click()
    await canvas.press('ArrowRight')
  }
  await expect(canvas).toHaveAttribute('data-highlight-order', '114')

  // 조작 중에만 세는 지표다(performance-budget §1) — 키를 눌러 창을 만든다
  for (let step = 0; step < 60; step += 1) {
    await canvas.press('ArrowRight')
    await page.waitForTimeout(16)
  }
  const fps = await page.evaluate(
    () => (window as unknown as { __perfStats?: { orbitFps?: number } }).__perfStats?.orbitFps ?? 0,
  )
  console.log(`TC-019-7 orbitFps ${fps}`)
  expect(fps).toBeGreaterThanOrEqual(30)
})
