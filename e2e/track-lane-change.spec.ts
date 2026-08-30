// FEAT-008 — 레인체인지의 브라우저 축.
//
// 자리바꿈 형상·레인 폭·이음새는 **좌표로만 갈린다**(화면으로는 S곡선과 45% 직선 이동이
// 둘 다 그럴듯하다). 그 축은 순수 테스트가 수치로 재고(`lane-model.test.ts`,
// `lane-bands.test.ts`), 여기서는 브라우저에서만 성립하는 두 가지만 본다:
// 목록 표기(TC-008-3)와 `filter` 미사용(TC-008-8).
import { expect, test, type Page } from '@playwright/test'

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('track-canvas')).toBeVisible()
}

test('TC-008-3 · 레인체인지 구간이 텍스트 구간 목록에 "레인체인지"로 나열된다', async ({
  page,
}) => {
  await openTrack(page)

  const rows = page.getByTestId('section-list-box').locator('[data-kind="lane-change"]')
  const count = await rows.count()
  console.log(`TC-008-3 레인체인지 행 ${count}개`)
  // 참조 트랙의 공식 API 값은 `LANE_CHANGER: 1`이다 — 0개면 유형이 뭉개진 것이다
  expect(count).toBe(1)
  await expect(rows.first()).toContainText('레인체인지')
})

test('TC-008-8 · 가운데 레인 구분에 filter를 쓰지 않는다', async ({ page }) => {
  await openTrack(page)

  // 캔버스 하위 어디에도 filter가 걸려 있으면 안 된다. filter는 도형을 별도 래스터화해
  // 가장자리에 얇은 검은 실선을 남긴다(D-036 ⑤) — 레인 경계가 그 실선과 섞인다.
  const filtered = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="track-canvas"]')
    if (root === null) return ['track-canvas 없음']
    const offenders: string[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const { filter, backdropFilter } = getComputedStyle(element)
      if (filter !== 'none' || backdropFilter !== 'none') {
        offenders.push(`${element.tagName}: filter=${filter} backdrop=${backdropFilter}`)
      }
    }
    return offenders
  })
  expect(filtered).toEqual([])
})

test('레인 면이 들어와도 132피스가 그대로 배치된다', async ({ page }) => {
  await openTrack(page)

  // 레인 분할은 렌더 단위를 늘리는 변경이다 — 배치 자체가 줄어들면 형상이 사라진 것이다
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-segment-count', '132')
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready')
})
