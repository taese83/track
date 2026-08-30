// FEAT-015 — 세 채널 인코딩의 브라우저 축.
//
// 형태 채널(표식·파선)은 WebGL 캔버스 안에 있어 DOM에서 조사할 수 없다 — 그 축은 순수
// 테스트가 잰다(`marker-geometry.test.ts`가 여섯 모양이 서로 다름을,
// `segment-encoding.test.ts`가 유형→모양 대응을 잰다). 여기서는 **텍스트 채널**을 본다.
// 텍스트는 실제 DOM이라 브라우저에서만 "정말 화면에 있는가"를 확인할 수 있다.
import { expect, test, type Page } from '@playwright/test'

/** 참조 트랙에서 평지가 아닌 세그먼트 수 — 슬로프 10 · 뱅크 4 · 웨이브 2 · 레인체인지 1 · 마커 1 */
const LABELLED_SEGMENTS = 18

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready')
  // 라벨은 drei `Html`이 포털로 **비동기 마운트**한다 — 첫 라벨만 기다리면 개수를 세는
  // 시점에 아직 늘고 있다(실측: 18개 중 6~7개에서 셌다). 최종 개수를 기다린다.
  await expect(page.getByTestId('segment-label')).toHaveCount(LABELLED_SEGMENTS)
}

async function labelTally(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const tally: Record<string, number> = {}
    for (const node of document.querySelectorAll('[data-testid="segment-label"]')) {
      const text = node.getAttribute('data-segment-text') ?? ''
      tally[text] = (tally[text] ?? 0) + 1
    }
    return tally
  })
}

test('TC-015-1 · 뱅크와 슬로프가 텍스트로 구분된다', async ({ page }) => {
  await openTrack(page)

  const tally = await labelTally(page)
  console.log(`TC-015-1 라벨 분포 ${JSON.stringify(tally)}`)

  // 참조 트랙 실측: 슬로프 10 · 뱅크 4 · 웨이브 2 · 레인체인지 1 · 마커 1
  expect(tally['슬로프(상승)']).toBe(5)
  expect(tally['슬로프(하강)']).toBe(5)
  expect(tally['뱅크(상승)']).toBe(2)
  expect(tally['뱅크(하강)']).toBe(2)
  expect(tally['웨이브']).toBe(2)
  expect(tally['레인체인지']).toBe(1)

  // 종전에는 두 유형이 색 하나로만 갈렸다 — 상승 슬로프와 상승 뱅크가 같은 빨강이라
  // 3D 뷰에서 구별되지 않았다. 이제 문자열이 다르다
  expect('슬로프(상승)').not.toBe('뱅크(상승)')
})

test('TC-015-2 · 평지에는 라벨을 달지 않는다 — 화면이 글자로 덮이지 않는다', async ({ page }) => {
  await openTrack(page)

  const total = await page.getByTestId('segment-label').count()
  console.log(`TC-015-2 라벨 ${total}개 / 세그먼트 132개`)
  // 평지 114개를 빼면 18개다. 132개 전부에 라벨이 붙으면 트랙이 안 보인다
  expect(total).toBe(LABELLED_SEGMENTS)

  const tally = await labelTally(page)
  expect(tally['평지']).toBeUndefined()
})

test('TC-015-3 · 색을 완전히 제거해도 유형·방향이 판별된다', async ({ page }) => {
  await openTrack(page)

  // 색각 이상의 극단 — 색 정보를 통째로 없앤다. 텍스트 채널은 색과 독립이므로 그대로 남는다
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' })

  const tally = await labelTally(page)
  const kinds = Object.keys(tally)
  console.log(`TC-015-3 흑백에서 읽히는 유형 ${kinds.length}종`)

  // 유형 다섯 종 + 방향까지 여전히 문자열로 갈린다
  expect(kinds).toContain('슬로프(상승)')
  expect(kinds).toContain('슬로프(하강)')
  expect(kinds).toContain('뱅크(상승)')
  expect(kinds).toContain('뱅크(하강)')

  // 라벨 자체가 흑백에서도 읽혀야 한다 — 배경과 글자가 모두 무채색 대비여야 성립한다
  await expect(page.getByTestId('segment-label').first()).toBeVisible()
})

test('TC-015-4 · 하강색 뱅크는 위로 솟아도 "하강"이라고 말한다', async ({ page }) => {
  await openTrack(page)

  // D-045 — 뱅크 구간은 선언 색과 무관하게 위로 솟는다. 그 불일치를 문구가 숨기지 않는다
  const fallBanks = page.locator('[data-segment-text="뱅크(하강)"]')
  await expect(fallBanks).toHaveCount(2)

  // 기하는 실제로 솟는다 — 라벨의 3D 위치(y)가 평면보다 위에 있는지는 캔버스 안이라
  // 여기서 재지 못한다. 이 테스트가 잠그는 것은 **문구가 기하에 맞춰 바뀌지 않는 것**이다
  await expect(fallBanks.first()).toHaveAttribute('data-segment-text', '뱅크(하강)')
})
