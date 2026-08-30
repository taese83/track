// FEAT-014 — WebGL 게이트와 2D 대체 표현의 브라우저 축.
//
// 이 TC들은 **데이터가 아니라 환경**을 바꿔야 성립한다(티켓 본문: "데이터 fixture가 아니라
// 브라우저 환경 모킹(예: `getContext` 실패 stub)이 필요하다"). vitest는 `environment: node`라
// 캔버스 자체가 없으므로 여기가 유일한 검증 경로다. 게이트가 **무엇을 묻는가**와 예외를
// 접는가는 순수 축(`webgl-support.test.ts`)이 따로 잰다.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const NOTICE = '이 브라우저는 3D 보기를 지원하지 않습니다'

/**
 * WebGL을 **아예 없는** 환경으로 만든다. 앱 스크립트보다 먼저 실행돼야 마운트 시점의
 * 게이트가 이 스텁을 본다(`addInitScript`).
 */
async function stubWebglUnsupported(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
        return null
      }
      return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(
        this,
        contextId,
        ...rest,
      )
    } as typeof HTMLCanvasElement.prototype.getContext
  })
}

/**
 * TC-014-3의 환경 — **게이트는 통과시키고 렌더러만 실패시킨다.**
 *
 * 현실의 "런타임 컨텍스트 생성 실패"는 컨텍스트 풀 소진이다: 앞선 요청은 성공하고 나중
 * 요청부터 실패한다. 그래서 호출 횟수로 모델링한다 — 첫 요청(마운트 시 게이트 판정)은
 * 통과시키고 그 뒤(렌더러)부터 던진다. 이 순서가 곧 TC의 Given("지원은 감지됐으나
 * 컨텍스트 생성이 런타임에 실패")이다.
 */
async function stubWebglRuntimeFailure(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    let granted = 0
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ) {
      const isWebgl =
        contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl'
      if (isWebgl) {
        granted += 1
        if (granted > 1) throw new Error('시뮬레이션 — 컨텍스트 소진으로 생성 실패')
      }
      return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(
        this,
        contextId,
        ...rest,
      )
    } as typeof HTMLCanvasElement.prototype.getContext
  })
}

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
}

test('TC-014-1 · WebGL 미지원이면 안내가 뜨고 3D 렌더 시도 자체가 없다', async ({ page }) => {
  await stubWebglUnsupported(page)
  await openTrack(page)

  const fallback = page.getByTestId('webgl-fallback-screen')
  await expect(fallback).toBeVisible()
  await expect(page.getByTestId('webgl-unsupported-notice')).toContainText(NOTICE)

  // 상태 머신이 실제로 `webgl-unsupported`로 갔는가 — 3D 셸을 그린 뒤 가린 것이 아니다
  await expect(page.locator('main')).toHaveAttribute('data-view-state', 'webgl-unsupported')

  // **핵심 절**: 캔버스를 그렸다가 지운 것이 아니라 애초에 마운트되지 않았다.
  await expect(page.getByTestId('track-screen')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('TC-014-2 · 대체 화면에 파싱된 경로가 텍스트 구간 목록으로 표시된다', async ({ page }) => {
  await stubWebglUnsupported(page)
  await openTrack(page)

  await expect(page.getByTestId('webgl-fallback-screen')).toBeVisible()

  // 데이터가 살아 있어야 "대체 표현"이다 — 빈 껍데기면 계약이 성립하지 않는다
  const list = page.getByTestId('section-list')
  await expect(list).toBeVisible()
  await expect(page.getByTestId('section-list-count')).toHaveText('132개 구간')
  await expect(page.getByTestId('section-row-0')).toBeVisible()
})

test('TC-013-5 · 대체 화면의 목록은 기본 펼침이고 접을 수 없다', async ({ page }) => {
  await stubWebglUnsupported(page)
  await openTrack(page)

  const list = page.getByTestId('section-list')
  await expect(list).toHaveAttribute('data-expanded', 'true')
  await expect(list).toHaveAttribute('data-variant', 'full-width')

  // 토글 버튼이 **없어야** 한다 — "접었다 펼 수 있는 옵션"으로 보이면 대체 화면이
  // 주 콘텐츠라는 계약이 깨진다(component-spec §widgets, 협상 불가)
  await expect(page.getByTestId('section-list-toggle')).toHaveCount(0)

  // 목록이 폭을 다 쓰는가 — 사이드바 320px 예약이 아니라 전체폭이다
  const listBox = await list.boundingBox()
  const mainBox = await page.locator('main').boundingBox()
  expect(listBox).not.toBeNull()
  expect(mainBox).not.toBeNull()
  expect(listBox!.width).toBeGreaterThan(mainBox!.width * 0.9)
})

test('TC-014-3 · 런타임 컨텍스트 실패는 화면을 깨지 않고 같은 대체 표현으로 내려간다', async ({
  page,
}) => {
  await stubWebglRuntimeFailure(page)
  await openTrack(page)

  // 같은 안내·같은 화면이어야 한다 — 실패 원인마다 다른 화면을 그리면 계약이 갈린다
  await expect(page.getByTestId('webgl-fallback-screen')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('webgl-unsupported-notice')).toContainText(NOTICE)

  // "전체 화면이 깨지지 않는다" — 헤더와 목록이 살아 있어야 성립한다
  await expect(page.getByTestId('app-header-source-link')).toBeVisible()
  await expect(page.getByTestId('section-list-count')).toHaveText('132개 구간')
})

test('TC-014-4 · 대체 화면에서도 원본 출처 링크가 동일하게 노출된다', async ({ page }) => {
  await stubWebglUnsupported(page)
  await openTrack(page)

  await expect(page.getByTestId('webgl-fallback-screen')).toBeVisible()

  const link = page.getByTestId('app-header-source-link')
  await expect(link).toBeVisible()
  await expect(link).toHaveText('원본 편집기 ↗')
  // 링크가 살아 있는가 — 텍스트만 남고 href가 비면 "출처 노출"이 아니다
  const href = await link.getAttribute('href')
  expect(href).toBeTruthy()
})

test('대체 화면은 접근성 위반 없이 렌더된다', async ({ page }) => {
  await stubWebglUnsupported(page)
  await openTrack(page)

  await expect(page.getByTestId('webgl-fallback-screen')).toBeVisible()
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations).toEqual([])
})
