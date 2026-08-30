// FEAT-009 — 미지원 피스 노출의 브라우저 축.
//
// 와이어프레임 자체는 WebGL 캔버스 안이라 DOM에서 조사할 수 없다 — 상자 12모서리와 좌표는
// 순수 축(`unsupported-placeholder.test.ts`)이 잰다. 여기서는 **라벨이 실제로 화면에
// 있는가**와 **각각 따로 있는가**를 본다.
import { expect, test, type Page } from '@playwright/test'

async function openTrack(page: Page, code: string) {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready')
}

test('TC-009-1 · 미지원 피스가 화면에 라벨과 함께 남는다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')

  const labels = page.getByTestId('unsupported-label')
  await expect(labels).toHaveCount(2)
  await expect(labels.first()).toBeVisible()

  // 순서에는 132개만 들어간다 — 나머지 2개가 조용히 사라지지 않는다는 것이 이 TC다
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-segment-count', '132')
  await expect(page.getByTestId('section-list-count')).toHaveText('134개 구간')
})

test('TC-009-3 · 미지원 피스마다 개별 라벨이 붙고 타입명이 그대로 나온다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')

  const texts = await page
    .getByTestId('unsupported-label')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent))
  console.log(`TC-009-3 라벨 ${JSON.stringify(texts)}`)

  // "미지원 2건" 같은 요약이 아니라 타입명이 각각 나온다
  expect(texts).toContain('미지원: Xyz9')
  expect(texts).toContain('미지원: Wob2')
  expect(texts).toHaveLength(2)
})

test('TC-009-2 · 미지원 피스가 없는 트랙에는 라벨이 붙지 않는다', async ({ page }) => {
  await openTrack(page, 'WS67Y2')

  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-segment-count', '132')
  await expect(page.getByTestId('unsupported-label')).toHaveCount(0)
})

test('미지원 피스가 있어도 3D 씬이 정상 렌더된다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')

  // 플레이스홀더가 바운딩박스에 들어가면서 카메라 프레이밍이 바뀐다 — 씬이 깨지지 않는지 본다
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready')
  await expect(page.getByTestId('segment-label').first()).toBeAttached()
})
