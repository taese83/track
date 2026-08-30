import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function submit(page: Page, value: string) {
  await page.getByTestId('url-input').fill(value)
  await page.getByTestId('url-submit').click()
}

/** 접힌 `<details>` 안의 `<pre>`는 펼치기 전에는 보이지 않는다 */
async function openDebugDetails(page: Page) {
  await page.getByText('원본 응답 일부 보기(디버그)').click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-002-1 · 실측 원문을 제출하면 132피스가 화면에 드러난다', async ({ page }) => {
  await submit(page, 'WS67Y2')

  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await expect(page.getByTestId('piece-count')).toHaveText('132')
  await expect(page.getByTestId('unsupported-count')).toHaveText('0')
})

test('TC-002-2 · 손상된 피스 문자열은 파싱 실패 화면과 디버그 발췌를 낸다', async ({ page }) => {
  await submit(page, 'PARSEFAIL')

  await expect(page.getByRole('alert')).toContainText('트랙 데이터를 해석하지 못했습니다')
  await expect(page.getByTestId('fetch-success')).toHaveCount(0)

  await openDebugDetails(page)
  const snippet = page.getByTestId('error-raw-snippet')
  await expect(snippet).toBeVisible()
  await expect(snippet).toContainText('어긋난 세그먼트')
  await expect(page.getByTestId('error-retry')).toBeVisible()
})

test('TC-002-3 · 피스가 0개인 원문도 같은 파싱 실패 경로로 착지한다', async ({ page }) => {
  await submit(page, 'EMPTY1')

  await expect(page.getByRole('alert')).toContainText('트랙 데이터를 해석하지 못했습니다')
  await expect(page.getByTestId('fetch-success')).toHaveCount(0)

  await openDebugDetails(page)
  const snippet = page.getByTestId('error-raw-snippet')
  await expect(snippet).toBeVisible()
  await expect(snippet).toContainText('피스가 하나도 없습니다')
})

test('TC-002-4 · compat=false 트랙에는 보정 대상이 없다', async ({ page }) => {
  await submit(page, 'WS67Y2')

  await expect(page.getByTestId('compat-flag')).toHaveText('false')
  await expect(page.getByTestId('compat-corrected-count')).toHaveText('0')
})

test('TC-002-5 · compat=true 트랙은 45/135/225/315° Cor1 32개를 보정 대상으로 센다', async ({
  page,
}) => {
  await submit(page, 'COMPAT1')

  await expect(page.getByTestId('compat-flag')).toHaveText('true')
  await expect(page.getByTestId('compat-corrected-count')).toHaveText('32')
})

test('미지원 클래스는 파싱 실패가 아니라 개수로 드러난다', async ({ page }) => {
  await submit(page, 'UNSUPP')

  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await expect(page.getByTestId('piece-count')).toHaveText('134')
  // 배지 UI는 FEAT-009 몫이고 여기서는 판정값의 수만 본다
  await expect(page.getByTestId('unsupported-count')).toHaveText('2')
})

/**
 * FEAT-002 시점에는 이 자리표가 `fetch-success` 132…131을 기다렸다 — 순서 복원이 없어
 * 파싱만 끝나면 성공 카드가 떴기 때문이다. FEAT-003이 그 판정을 붙이면서 NOSTART는
 * **복원** 실패 화면으로 간다. 지켜야 할 회귀는 화면 종류가 아니라 **두 실패가 구분된다**는
 * 것이다 — data-model.md가 "두 실패를 하나의 에러 타입으로 합치면 REQ-F-007 검증 자체가
 * 불가능해진다"고 못 박은 경계다.
 */
test('회귀 · START 부재는 파싱 실패가 아니다 — 복원 실패로 구분된다', async ({ page }) => {
  await submit(page, 'NOSTART')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('시작 지점(START)을 찾을 수 없습니다')
  await expect(alert).not.toContainText('트랙 데이터를 해석하지 못했습니다')

  // 대조군 — 진짜 파싱 실패는 여전히 파싱 문구다
  await page.getByTestId('error-retry').click()
  await page.goto('/')
  await submit(page, 'PARSEFAIL')
  await expect(page.getByRole('alert')).toContainText('트랙 데이터를 해석하지 못했습니다')
})

test('회귀 · 파싱이 붙어도 요청당 /api/track 호출은 1회다', async ({ page }) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/track')) calls += 1
  })

  await submit(page, 'WS67Y2')
  await expect(page.getByTestId('fetch-success')).toBeVisible()

  expect(calls).toBe(1)
})

test('접근성 · 파싱 실패 화면에 심각 위반이 없다', async ({ page }) => {
  const scan = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
      .violations

  await submit(page, 'PARSEFAIL')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await scan()).toEqual([])

  await openDebugDetails(page)
  await expect(page.getByTestId('error-raw-snippet')).toBeVisible()
  expect(await scan()).toEqual([])
})
