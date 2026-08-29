import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const SHARE_URL = 'https://mini4wd-track-editor.pimentoso.com/view/WS67Y2'

async function submit(page: Page, value: string) {
  await page.getByTestId('url-input').fill(value)
  await page.getByTestId('url-submit').click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-001-1 · 유효한 공유 링크를 제출하면 원문이 파싱 단계로 전달된다', async ({ page }) => {
  const response = page.waitForResponse((r) => r.url().includes('/api/track'))
  await submit(page, SHARE_URL)

  const api = await response
  expect(api.status()).toBe(200)
  // 성공 응답만 CDN 캐시 대상이다(api-schema §7)
  expect(api.headers()['cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')

  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await expect(page.getByTestId('compat-flag')).toHaveText('false')
  await expect(page.getByTestId('raw-length')).toContainText('자')
})

test('TC-001-2 · 형식이 어긋난 링크는 인라인 에러를 띄우고 입력값을 지우지 않는다', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/track')) requests.push(r.url())
  })

  await submit(page, 'https://example.com/view/WS67Y2')

  await expect(page.getByTestId('url-field-error')).toBeVisible()
  await expect(page.getByTestId('url-field-error')).toContainText('view/')
  await expect(page.getByTestId('url-input')).toHaveValue('https://example.com/view/WS67Y2')
  await expect(page.getByTestId('url-input')).toHaveAttribute('aria-invalid', 'true')
  // 형식 오류에서는 서버로 나가지 않는다
  expect(requests).toHaveLength(0)
})

test('TC-001-2 · blur 전에는 에러를 그리지 않는다', async ({ page }) => {
  await page.getByTestId('url-input').fill('완전히 잘못된 값')

  await expect(page.getByTestId('url-field-error')).toHaveCount(0)

  await page.getByTestId('url-input').blur()
  await expect(page.getByTestId('url-field-error')).toBeVisible()
})

test('TC-001-3 · 존재하지 않는 트랙 코드는 "트랙을 찾을 수 없습니다"다', async ({ page }) => {
  await submit(page, 'ZZZZZZ')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('트랙을 찾을 수 없습니다')
  await expect(page.getByTestId('error-retry')).toBeVisible()
})

test('TC-001-4 · 임계값을 넘겨 지연되면 "시간이 걸리고 있어요" 안내가 추가된다', async ({ page }) => {
  await submit(page, 'SLOWLY')

  const progress = page.getByTestId('load-progress')
  await expect(progress).toHaveText(/트랙을 불러오는 중입니다/)
  await expect(progress).toHaveText(/시간이 걸리고 있어요/, { timeout: 5_000 })
  // 문구만 바뀔 뿐 요청은 계속된다
  await expect(page.getByTestId('fetch-success')).toBeVisible({ timeout: 10_000 })
})

test('TC-001-5 · 업스트림 5xx와 timeout은 원인이 구분된 문구와 재시도 버튼을 낸다', async ({ page }) => {
  await submit(page, 'SRVERR')
  await expect(page.getByRole('alert')).toContainText('편집기 서버에 연결하지 못했습니다')
  await expect(page.getByTestId('error-retry')).toBeVisible()

  await page.getByTestId('app-header-switch-track').click()
  await submit(page, 'TIMEOUT')
  await expect(page.getByRole('alert')).toContainText('응답이 시간 초과되었습니다')
})

test('TC-001-5 · 재시도 버튼은 같은 대상을 다시 조회한다', async ({ page }) => {
  await submit(page, 'SRVERR')
  await expect(page.getByTestId('error-retry')).toBeVisible()

  const retryRequest = page.waitForRequest((r) => r.url().includes('/api/track'))
  await page.getByTestId('error-retry').click()
  expect((await retryRequest).url()).toContain('SRVERR')
})

test('TC-001-6 · 같은 탭에서 같은 코드를 재제출하면 /api/track 요청이 0건이다', async ({ page }) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/track')) calls += 1
  })

  await submit(page, SHARE_URL)
  await expect(page.getByTestId('fetch-success')).toBeVisible()
  expect(calls).toBe(1)

  await page.getByTestId('app-header-switch-track').click()
  await submit(page, SHARE_URL)
  await expect(page.getByTestId('fetch-success')).toBeVisible()
  expect(calls).toBe(1)

  // 코드만 넣은 편의 입력도 같은 캐시 키로 복원된다
  await page.getByTestId('app-header-switch-track').click()
  await submit(page, 'ws67y2')
  await expect(page.getByTestId('fetch-success')).toBeVisible()
  expect(calls).toBe(1)
})

test('TC-001-7 · 원본 편집기 출처 링크가 모든 상태에서 노출된다', async ({ page }) => {
  const link = page.getByTestId('app-header-source-link')
  const assertVisible = async () => {
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://mini4wd-track-editor.pimentoso.com/')
    await expect(link).toHaveAttribute('rel', /noopener/)
  }

  await assertVisible() // 입력 대기
  await submit(page, 'ZZZZZZ')
  await expect(page.getByRole('alert')).toBeVisible()
  await assertVisible() // 완전 실패

  await page.getByTestId('app-header-switch-track').click()
  await submit(page, SHARE_URL)
  await expect(page.getByTestId('fetch-success')).toBeVisible()
  await assertVisible() // 조회 성공
})

/**
 * TC-001-8은 Vercel CDN이 붙은 배포에서만 관측 가능하다 — 로컬 preview 서버에는 `x-vercel-cache`
 * 헤더를 붙이는 층 자체가 없다. 여기서 기계로 확인할 수 있는 것은 그 캐시가 성립하기 위한
 * **전제**(서버가 s-maxage를 실제로 내려보내는지)까지이며, HIT/STALE 관측은 배포 후 수동
 * 확인 항목으로 남는다. 통과했다고 표시하지 않는다.
 */
test('TC-001-8(전제) · 성공 응답만 s-maxage를 내려보내고 에러는 캐시를 금지한다', async ({ page }) => {
  const ok = page.waitForResponse((r) => r.url().includes('/api/track'))
  await submit(page, SHARE_URL)
  expect((await ok).headers()['cache-control']).toContain('s-maxage=3600')

  await page.getByTestId('app-header-switch-track').click()
  const failed = page.waitForResponse((r) => r.url().includes('/api/track'))
  await submit(page, 'ZZZZZZ')
  expect((await failed).headers()['cache-control']).toBe('no-store')
})

test('접근성 · 입력 대기와 완전 실패 화면에 심각 위반이 없다', async ({ page }) => {
  const scan = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
      .violations

  expect(await scan()).toEqual([])

  await submit(page, 'ZZZZZZ')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await scan()).toEqual([])
})
