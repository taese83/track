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

test('TC-003-1 · 실측 원문의 순서 복원 결과 132가 화면에 드러난다', async ({ page }) => {
  await submit(page, 'WS67Y2')

  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await expect(page.getByTestId('ordered-count')).toHaveText('132')
  await expect(page.getByTestId('start-selection')).toContainText('유일한 START')
})

test('TC-003-2 · 같은 원문을 다시 제출해도 순서와 START 선택이 같다', async ({ page }) => {
  await submit(page, 'WS67Y2')
  await expect(page.getByTestId('fetch-success')).toBeVisible()
  const first = {
    ordered: await page.getByTestId('ordered-count').textContent(),
    start: await page.getByTestId('start-selection').textContent(),
  }

  await page.getByTestId('app-header-switch-track').click()
  await expect(page.getByTestId('url-input')).toHaveValue('')

  await submit(page, 'WS67Y2')
  await expect(page.getByTestId('fetch-success')).toBeVisible()

  await expect(page.getByTestId('ordered-count')).toHaveText(first.ordered ?? '')
  await expect(page.getByTestId('start-selection')).toHaveText(first.start ?? '')
})

test('TC-003-4 · START가 없는 원문은 전용 문구와 디버그 발췌를 낸다', async ({ page }) => {
  await submit(page, 'NOSTART')

  await expect(page.getByRole('alert')).toContainText('시작 지점(START)을 찾을 수 없습니다')
  // 3D 표면이 아직 없으므로 "렌더를 시도하지 않았다"는 성공 카드 부재로 관측한다
  await expect(page.getByTestId('fetch-success')).toHaveCount(0)

  await openDebugDetails(page)
  const snippet = page.getByTestId('error-raw-snippet')
  await expect(snippet).toBeVisible()
  await expect(snippet).toContainText('START(Str2)가 없어')
  await expect(page.getByTestId('error-retry')).toBeVisible()
})

test('TC-003-5 · START 후보가 둘이면 최초 등장을 고르고 그 근거를 남긴다', async ({ page }) => {
  await submit(page, 'MULTISTART')

  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await expect(page.getByTestId('piece-count')).toHaveText('132')
  await expect(page.getByTestId('ordered-count')).toHaveText('132')

  const start = page.getByTestId('start-selection')
  await expect(start).toContainText('START 후보 2개')
  await expect(start).toContainText('처음 나온 것')
  expect(await start.textContent()).toMatch(/^p\d+ ·/)
})

test('회귀 · 손상된 원문은 복원 실패가 아니라 여전히 파싱 실패다', async ({ page }) => {
  await submit(page, 'PARSEFAIL')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('트랙 데이터를 해석하지 못했습니다')
  await expect(alert).not.toContainText('시작 지점(START)')
})

test('회귀 · 복원이 붙어도 요청당 /api/track 호출은 1회다', async ({ page }) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/track')) calls += 1
  })

  await submit(page, 'WS67Y2')
  await expect(page.getByTestId('ordered-count')).toBeVisible()

  expect(calls).toBe(1)
})

test('접근성 · 복원 실패 화면에 심각 위반이 없다', async ({ page }) => {
  const scan = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
      .violations

  await submit(page, 'NOSTART')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await scan()).toEqual([])

  await openDebugDetails(page)
  await expect(page.getByTestId('error-raw-snippet')).toBeVisible()
  expect(await scan()).toEqual([])
})
