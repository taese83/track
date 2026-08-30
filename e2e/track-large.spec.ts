// FEAT-011 — 대형 트랙 완화의 브라우저 축.
//
// **TC-011-1·2는 여기서 재지 못한다(정직 표기).** 300피스를 초과하면서 3D 뷰에 도달하는
// fixture가 없다: `LARGE1`은 304피스로 파싱은 되지만 피스 복제가 끝점 매칭 분기를 폭발시켜
// `restoreOrder`가 `search-budget-exceeded`로 실패하고 화면이 `error`로 착지한다(실측).
// 임계값 판정과 작업량 감소는 순수 축(`perf-mitigation.test.ts`)이 수치로 잰다.
//
// 여기서 잠그는 것은 **완화하지 않는 쪽**이다 — 참조 트랙 규모에서 배지가 뜨지 않고
// 라벨이 살아 있는가(TC-011-3·4).
import { expect, test, type Page } from '@playwright/test'

async function openTrack(page: Page, code: string, query = '') {
  await page.goto(`/${query}`)
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 20_000,
  })
}

test('TC-011-3 · 참조 트랙 규모(132피스)에는 배지가 없다', async ({ page }) => {
  await openTrack(page, 'WS67Y2')

  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-segment-count', '132')
  await expect(canvas).toHaveAttribute('data-mitigated', 'false')
  await expect(page.getByTestId('canvas-large-track')).toHaveCount(0)

  // 경계 구간 미만이므로 라벨도 그대로 남는다(FEAT-015)
  await expect(page.getByTestId('segment-label').first()).toBeAttached()
})

test('TC-011-4 · 경계 구간은 재량이다 — 이 구현은 완화하지 않는다', async ({ page }) => {
  // 참조 트랙 132는 경계 구간의 아래끝이다. 배지가 없는 것이 이 구현의 선택이며
  // ASSUMPTION-006에 따라 케이스마다 달라도 결함이 아니다 — 여기서 잠그는 것은
  // "이 구현의 현재 선택"이지 요구가 아니다.
  await openTrack(page, 'WS67Y2')
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-mitigated', 'false')
})
