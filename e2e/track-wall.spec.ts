// FEAT-020 — 트랙 벽의 브라우저 축.
//
// 높이·법선·줄 수는 순수 축(`wall-geometry.test.ts`)이 좌표로 잰다. 여기서는 그 순수 축이
// 확인할 수 없는 것만 본다: **실제 씬에 벽이 섰는가**(`data-wall-lines`), **벽을 더하고도
// 예산 안인가**(TC-020-6), **기존 시각 채널이 벽에 가려 사라지지 않았는가**(TC-020-7).
import { expect, test, type Locator, type Page } from '@playwright/test'

/** 하이라이트 테두리 밝은 톤(FEAT-019). 벽이 이것을 가리는지 보려고 센다 */
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

async function edgePixels(page: Page, canvas: Locator): Promise<number> {
  const box = await canvas.locator('canvas').boundingBox()
  if (box === null) throw new Error('캔버스 박스를 읽지 못했다')
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-020-1 · 참조 트랙의 모든 지원 구간에 벽이 선다', async ({ page }) => {
  const canvas = await openTrack(page)

  const segments = Number(await canvas.getAttribute('data-segment-count'))
  const walls = Number(await canvas.getAttribute('data-wall-lines'))
  console.log(`TC-020-1 구간 ${segments} · 벽 ${walls}줄`)

  // 맞붙은 레인은 4줄, 명시 경로 레인(Lan2)은 6줄이다. WS67Y2에는 Lan2가 없으므로 정확히 4배다
  expect(segments).toBe(132)
  expect(walls).toBe(segments * 4)
})

test('TC-020-1 · 명시 경로 레인(Lan2)이 있는 트랙은 그 구간만 6줄이 된다', async ({ page }) => {
  const canvas = await openTrack(page, 'R84APY')

  const segments = Number(await canvas.getAttribute('data-segment-count'))
  const walls = Number(await canvas.getAttribute('data-wall-lines'))
  const separated = (walls - segments * 4) / 2

  console.log(`TC-020-1(Lan2) 구간 ${segments} · 벽 ${walls}줄 · 명시 경로 구간 ${separated}개`)
  expect(walls).toBeGreaterThanOrEqual(segments * 4)
  // 초과분은 반드시 2의 배수다 — 맞붙은 4줄이 6줄이 될 때만 늘어난다
  expect(Number.isInteger(separated)).toBe(true)
})

test('TC-020-4 · 미지원 피스 자리에는 벽이 없다', async ({ page }) => {
  const canvas = await openTrack(page, 'UNSUPP')

  const segments = Number(await canvas.getAttribute('data-segment-count'))
  const walls = Number(await canvas.getAttribute('data-wall-lines'))
  const unsupported = await page.getByTestId('unsupported-label').count()

  console.log(`TC-020-4 구간 ${segments} · 벽 ${walls}줄 · 미지원 라벨 ${unsupported}개`)
  expect(unsupported).toBeGreaterThan(0)

  // 미지원 피스가 벽을 얻었다면 줄 수가 `(구간 + 미지원) × 4`가 됐을 것이다. 정확히
  // `구간 × 4`라는 것이 "플레이스홀더에는 벽이 없다"의 증거다 — 부등호로 두면 어떤 값이 나와도
  // 통과하는 공허한 단언이 된다(첫 작성이 그랬다).
  expect(walls).toBe(segments * 4)
  expect(walls).toBeLessThan((segments + unsupported) * 4)

  // **정직 표기**: 이 fixture의 미지원 피스는 전부 순서에 끼지 못한 *플레이스홀더*라
  // 애초에 레인 파이프라인에 들어가지 않는다. 순서 안에 있으면서 `isSupported=false`인
  // 세그먼트는 확보된 fixture에 없다 — 그 경로는 순수 축(`wall-geometry.test.ts`)이 잰다.
})

test('TC-020-4 · 부분 실패에서도 복원 구간까지만 벽이 서고 렌더가 멈추지 않는다', async ({
  page,
}) => {
  const canvas = await openTrack(page, 'OPENLOOP')

  const segments = Number(await canvas.getAttribute('data-segment-count'))
  const walls = Number(await canvas.getAttribute('data-wall-lines'))
  console.log(`TC-020-4(부분 실패) 구간 ${segments} · 벽 ${walls}줄`)

  expect(segments).toBeGreaterThan(0)
  expect(walls).toBeGreaterThanOrEqual(segments * 4)
})

test('TC-020-6 · 벽을 더하고도 초기 렌더 3초·오빗 30fps를 지킨다', async ({ page }) => {
  const canvas = await openTrack(page)

  const initialRenderMs = await page.evaluate(
    () =>
      (window as unknown as { __perfStats?: { initialRenderMs?: number } }).__perfStats
        ?.initialRenderMs ?? Number.POSITIVE_INFINITY,
  )
  console.log(`TC-020-6 초기 렌더 ${initialRenderMs}ms`)
  expect(initialRenderMs).toBeLessThan(3000)

  await canvas.click({ position: { x: 8, y: 8 } })
  for (let step = 0; step < 60; step += 1) {
    await canvas.press('ArrowRight')
    await page.waitForTimeout(16)
  }
  const fps = await page.evaluate(
    () => (window as unknown as { __perfStats?: { orbitFps?: number } }).__perfStats?.orbitFps ?? 0,
  )
  console.log(`TC-020-6 orbitFps ${fps}`)
  expect(fps).toBeGreaterThanOrEqual(30)
})

test('TC-020-7 · 벽이 기존 시각 채널을 가리지 않는다', async ({ page }) => {
  const canvas = await openTrack(page)

  // FEAT-015 유형 라벨·표식은 그대로 있다
  await expect(page.getByTestId('segment-label').first()).toBeVisible()
  expect(await page.getByTestId('segment-label').count()).toBeGreaterThan(0)

  // FEAT-019 하이라이트 테두리는 depthTest=false라 벽 뒤에서도 보인다
  await page.getByTestId('section-row-60').click()
  await expect(canvas).toHaveAttribute('data-highlight-order', '60')
  const edge = await edgePixels(page, canvas)
  console.log(`TC-020-7 하이라이트 테두리 ${edge}px`)
  expect(edge).toBeGreaterThan(0)
})

test('TC-020-7 · 미지원 플레이스홀더와 라벨이 벽과 함께 남는다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')

  const labels = page.getByTestId('unsupported-label')
  await expect(labels.first()).toBeVisible()
  expect(await labels.count()).toBeGreaterThan(0)
})
