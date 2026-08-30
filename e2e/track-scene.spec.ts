// FEAT-006 — 3D 씬과 오빗 카메라의 브라우저 축.
//
// vitest는 `environment: node`라 상호작용을 잡을 수 없다(TC-006-2/3/5는 전부 "3D 뷰가
// 표시된 상태"를 전제한다). 배치 정확도(TC-006-1)는 순수 축에서 수치로 재고, 여기서는
// **조작이 카메라에 실제로 반영되는가**만 본다.
//
// 카메라 상태는 `TrackCanvas`가 컨트롤의 `change`에서 컨테이너 dataset으로 내보낸다 —
// 3D 캔버스는 픽셀만 남기고 상태를 남기지 않아 그 값 없이는 "회전했다"를 확인할 수 없다.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function submit(page: Page, value: string) {
  await page.getByTestId('url-input').fill(value)
  await page.getByTestId('url-submit').click()
}

async function openReferenceTrack(page: Page): Promise<Locator> {
  await submit(page, 'WS67Y2')
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  return canvas
}

interface CameraState {
  azimuth: number
  polar: number
  distance: number
}

async function cameraOf(canvas: Locator): Promise<CameraState> {
  const [azimuth, polar, distance] = await Promise.all([
    canvas.getAttribute('data-camera-azimuth'),
    canvas.getAttribute('data-camera-polar'),
    canvas.getAttribute('data-camera-distance'),
  ])
  return {
    azimuth: Number(azimuth),
    polar: Number(polar),
    distance: Number(distance),
  }
}

/**
 * 컨트롤은 첫 `change`에서야 값을 내보내므로 기준값을 얻으려면 한 번 건드려야 한다.
 * **드래그로 건드리지 않는다** — `enableDamping` 때문에 아주 작은 드래그도 관성으로
 * 몇 프레임 더 회전하고, 그 잔여 회전이 뒤따르는 어서션에 섞여 든다(실측 0.006rad).
 * 휠 한 쌍은 서로 정확한 역연산(×0.95, ÷0.95)이라 각도를 건드리지 않고 값만 내보낸다.
 */
async function settleCamera(page: Page, canvas: Locator): Promise<CameraState> {
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('캔버스 위치를 얻지 못했다')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -120)
  await page.mouse.wheel(0, 120)
  await expect(canvas).toHaveAttribute('data-camera-azimuth', /-?\d/)
  return cameraOf(canvas)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-006-2 · 캔버스를 드래그하면 카메라가 궤도 회전한다', async ({ page }) => {
  const canvas = await openReferenceTrack(page)
  const before = await settleCamera(page, canvas)

  const box = await canvas.boundingBox()
  if (box === null) throw new Error('캔버스 위치를 얻지 못했다')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 60, { steps: 8 })
  await page.mouse.up()

  const after = await cameraOf(canvas)
  expect(Math.abs(after.azimuth - before.azimuth)).toBeGreaterThan(0.05)
  expect(Math.abs(after.polar - before.polar)).toBeGreaterThan(0.02)
  // 회전이지 이동이 아니다 — 거리가 함께 변하면 궤도가 아니라 자유 비행이다
  expect(after.distance).toBeCloseTo(before.distance, 1)
})

test('TC-006-3 · 휠을 돌리면 확대/축소가 반영된다', async ({ page }) => {
  const canvas = await openReferenceTrack(page)
  const before = await settleCamera(page, canvas)

  const box = await canvas.boundingBox()
  if (box === null) throw new Error('캔버스 위치를 얻지 못했다')
  // 휠 한 이벤트 = 한 스텝(OrbitControls의 `getZoomScale()`은 델타 크기와 무관한 상수
  // 0.95^zoomSpeed다). 델타를 키워도 스텝이 커지지 않으므로 "몇 % 이상"이 아니라
  // **줄었는가/늘었는가**로 판정한다 — 배율을 어서션에 박으면 라이브러리 상수를 시험한다.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await cameraOf(canvas)).distance).toBeLessThan(before.distance)

  const zoomedIn = await cameraOf(canvas)
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await cameraOf(canvas)).distance).toBeGreaterThan(zoomedIn.distance)

  // 줌은 궤도를 돌리지 않는다
  const zoomedOut = await cameraOf(canvas)
  expect(zoomedOut.azimuth).toBeCloseTo(before.azimuth, 3)
  expect(zoomedOut.polar).toBeCloseTo(before.polar, 3)
})

test('TC-006-4 · 참조 트랙 132피스의 초기 렌더가 3초 안에 끝난다', async ({ page }) => {
  await submit(page, 'WS67Y2')
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready', { timeout: 10_000 })
  await expect(canvas).toHaveAttribute('data-segment-count', '132')

  // performance-budget §1이 지정한 측정 계약 그대로다: fetch 완료 → 씬 첫 프레임
  // `onAfterRender`. 훅이 값을 내지 않으면 NOT_MEASURED이지 통과가 아니므로 기다린다.
  await page.waitForFunction(() => typeof window.__perfStats?.initialRenderMs === 'number', null, {
    timeout: 10_000,
  })
  const initialRenderMs = await page.evaluate(() => window.__perfStats?.initialRenderMs)
  if (initialRenderMs === undefined) throw new Error('initialRenderMs 미수집 — NOT_MEASURED')

  console.log(`TC-006-4 초기 렌더 ${initialRenderMs.toFixed(0)}ms`)
  expect(initialRenderMs).toBeLessThan(3_000)
})

test('TC-006-4 · 회전 중 프레임 속도가 30fps 이상이다', async ({ page }) => {
  const canvas = await openReferenceTrack(page)
  const box = await canvas.boundingBox()
  if (box === null) throw new Error('캔버스 위치를 얻지 못했다')

  // 드래그를 **유지한 채** 움직인다 — 정지 화면의 fps는 렌더 부하를 재지 않는다.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (let step = 0; step < 90; step += 1) {
    await page.mouse.move(
      box.x + box.width / 2 + Math.sin(step / 6) * 140,
      box.y + box.height / 2 + Math.cos(step / 6) * 50,
    )
  }
  const orbitFps = await page.evaluate(() => window.__perfStats?.orbitFps)
  await page.mouse.up()

  if (orbitFps === undefined) throw new Error('orbitFps 미수집 — NOT_MEASURED')
  console.log(`TC-006-4 회전 중 ${orbitFps.toFixed(1)}fps`)
  expect(orbitFps).toBeGreaterThanOrEqual(30)
})

test('TC-006-5 · 마우스 없이 방향키와 +/- 로 회전·줌한다', async ({ page }) => {
  const canvas = await openReferenceTrack(page)
  const before = await settleCamera(page, canvas)

  await canvas.focus()
  await expect(canvas).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await cameraOf(canvas)).azimuth).toBeGreaterThan(before.azimuth)
  const rotated = await cameraOf(canvas)

  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await cameraOf(canvas)).azimuth).toBeLessThan(rotated.azimuth)

  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await cameraOf(canvas)).polar).toBeLessThan(before.polar)

  const beforeZoom = await cameraOf(canvas)
  await page.keyboard.press('+')
  await expect.poll(async () => (await cameraOf(canvas)).distance).toBeLessThan(beforeZoom.distance)

  const zoomedIn = await cameraOf(canvas)
  await page.keyboard.press('-')
  await expect.poll(async () => (await cameraOf(canvas)).distance).toBeGreaterThan(zoomedIn.distance)
})

test('TC-006-5 · 캔버스가 다루지 않는 키는 삼키지 않는다', async ({ page }) => {
  const canvas = await openReferenceTrack(page)
  await canvas.focus()

  // Tab이 삼켜지면 캔버스가 포커스 함정이 된다(a11y-responsive §포커스 순서)
  await page.keyboard.press('Tab')
  await expect(canvas).not.toBeFocused()
})

test('3D 화면에 접근성 위반이 없다', async ({ page }) => {
  await openReferenceTrack(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('셸 치수가 3D 표시에서 layout-spec 예약값과 같다', async ({ page }) => {
  await openReferenceTrack(page)

  // layout-spec §Layout stability — alert 40px는 배너 유무와 무관하게 점유한다
  const alert = page.getByTestId('alert-slot')
  await expect(alert).toHaveText('')
  expect((await alert.boundingBox())?.height).toBeCloseTo(40, 0)

  const list = page.getByRole('region', { name: '구간 목록' })
  expect((await list.boundingBox())?.width).toBeCloseTo(320, 0)

  const strip = page.getByRole('region', { name: '고도 프로파일 탐색' })
  expect((await strip.boundingBox())?.height).toBeCloseTo(140, 0)
})
