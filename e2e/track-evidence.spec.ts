// FEAT-010 — 근거 등급 표기의 브라우저 축.
//
// vitest는 `environment: node`라 "범례를 펼치거나 다시 접으면"·"트리거의 중심 X 좌표"를
// 만들 수 없다. 어떤 항목이 어떤 등급인지의 **내용**은 순수 축(`evidence-summary.test.ts`)이
// 재고, 여기서는 **화면에 상시 노출되는가**와 **개폐가 중앙축을 흔들지 않는가**만 본다.
//
// ⚠ TC-010-1의 등급 라벨 편차(정직 표기): 티켓 본문은 슬로프 낙차를 "추정(inferred,
// ASSUMPTION-001)"으로 적었지만 그 가정은 **D-022에서 폐기**됐고, 이후 **D-042**가
// "슬로프 각도는 실물 실측이 아닌 사용자 지정 렌더 규칙(`confirmed`)"으로 확정해
// `build-elevation.ts`가 그대로 구현하고 있다. 화면을 "추정"으로 되돌리려면 확정된
// 결정을 뒤집어야 하므로, 여기서는 **상류가 태깅한 등급을 그대로 검증한다**.
// 개폐 전후 배지 상시 노출·중심 X 불변이라는 TC-010-1의 나머지 절은 그대로 잰다.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('evidence-overlay')).toBeVisible()
}

async function centerX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('요소가 화면에 없다 — 중심 X를 잴 수 없다')
  return box.x + box.width / 2
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-010-1 · 범례를 펼치고 다시 접어도 배지는 노출되고 트리거 중심 X는 불변이다', async ({
  page,
}) => {
  await openTrack(page)

  const trigger = page.getByTestId('legend-trigger')
  const panel = page.getByTestId('legend-panel')
  const slope = page.getByTestId('evidence-row-slopeAngleDeg')

  // 기본은 접힘이다(states.md)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toBeHidden()
  await expect(slope.locator('[data-evidence-badge]')).toBeVisible()

  const collapsedX = await centerX(trigger)
  const collapsedWidth = (await panel.boundingBox())?.width

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  // 배지는 개폐와 무관하게 계속 노출된다 — 범례를 접었다고 근거가 사라지면 안 된다
  await expect(slope.locator('[data-evidence-badge]')).toBeVisible()

  const openX = await centerX(trigger)
  // 패널이 실제로 폭을 가졌는지 먼저 확인한다 — 폭이 0이면 중심 X 불변은 공짜로 통과한다
  const openWidth = (await panel.boundingBox())?.width ?? 0
  expect(openWidth).toBeGreaterThan(0)
  expect(openWidth).not.toBe(collapsedWidth)
  expect(Math.abs(openX - collapsedX)).toBeLessThan(1)

  await trigger.click()
  await expect(panel).toBeHidden()
  await expect(slope.locator('[data-evidence-badge]')).toBeVisible()
  expect(Math.abs((await centerX(trigger)) - collapsedX)).toBeLessThan(1)
})

test('TC-010-2 · 뱅크는 실측 배지를 개폐 내내 유지하고 범례는 중앙 정렬을 지킨다', async ({
  page,
}) => {
  await openTrack(page)

  const bank = page.getByTestId('evidence-row-bankAngleDeg')
  await expect(bank).toHaveAttribute('data-grade', 'measured')
  await expect(bank.locator('[data-evidence-badge]')).toHaveText('실측')

  const trigger = page.getByTestId('legend-trigger')
  const overlay = page.getByTestId('evidence-overlay')

  // 범례 루트의 중앙축이 오버레이(캔버스 전체 폭)의 중앙축과 같아야 "중앙 정렬"이다
  const overlayCenter = await centerX(overlay)
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)

  await trigger.click()
  await expect(bank.locator('[data-evidence-badge]')).toHaveText('실측')
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)

  await trigger.click()
  await expect(bank.locator('[data-evidence-badge]')).toHaveText('실측')
  expect(Math.abs((await centerX(page.getByTestId('legend-root'))) - overlayCenter)).toBeLessThan(1)
})

test('TC-010-3 · 태깅된 항목 전체가 화면 배지와 1:1이고 누락이 없다', async ({ page }) => {
  await openTrack(page)

  const rows = page.getByTestId('evidence-totals').locator('[data-testid^="evidence-row-"]')
  const count = await rows.count()
  expect(count).toBeGreaterThan(0)

  // 행 하나에 배지 하나 — 하나라도 배지 없이 값만 있으면 "실측처럼 보이게 넘긴" 것이다
  const badges = page.getByTestId('evidence-totals').locator('[data-evidence-badge]')
  await expect(badges).toHaveCount(count)

  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i)
    const grade = await row.getAttribute('data-grade')
    expect(grade).not.toBeNull()
    // 행의 등급과 그 행 배지의 등급이 어긋나면 1:1이 아니다
    await expect(row.locator('[data-evidence-badge]')).toHaveAttribute('data-grade', grade!)
  }

  // 범례는 4등급을 모두 싣는다 — 화면에 없는 등급도 읽는 법으로 남는다
  await page.getByTestId('legend-trigger').click()
  const legendBadges = page.getByTestId('legend-panel').locator('[data-evidence-badge]')
  await expect(legendBadges).toHaveCount(4)
})

test('TC-010-5 · 피스 수는 확인 배지, 총 길이는 절대 단위 없이 미확인 배지다', async ({
  page,
}) => {
  await openTrack(page)

  const pieces = page.getByTestId('evidence-row-totalPieceCount')
  await expect(pieces).toContainText('132피스')
  await expect(pieces.locator('[data-evidence-badge]')).toHaveText('확인')

  const length = page.getByTestId('evidence-row-totalLength')
  await expect(length.locator('[data-evidence-badge]')).toHaveText('미확인')
  // R2 — 절대 미터 표기 금지. 화면 어디에도 "190.84 m"류가 나오면 안 된다.
  await expect(length).not.toContainText('m')
  await expect(length).not.toContainText('미터')
})

test('오버레이는 접근성 위반 없이 개폐된다', async ({ page }) => {
  await openTrack(page)

  const scan = async () =>
    new AxeBuilder({ page }).include('[data-testid="evidence-overlay"]').analyze()

  expect((await scan()).violations).toEqual([])
  await page.getByTestId('legend-trigger').click()
  expect((await scan()).violations).toEqual([])
})

test('캔버스 컬럼이 좁아져도 패널은 줄바꿈으로 흡수하고 중앙축을 지킨다', async ({ page }) => {
  // 320px 뷰포트를 그대로 쓰지 않는 이유(정직 표기): 현재 셸은 목록 컬럼이 320px 고정
  // 인라인 폭이라 320px 뷰포트에서 캔버스 컬럼이 24px까지 눌린다(실측). 그건 오버레이가
  // 아니라 3분할 셸의 반응형 공백이고, 셸 치수는 FEAT-006이 예약해 이 티켓의
  // PUBLIC_CONTRACTS_TO_PRESERVE에 들어 있다. 그래서 **목록을 레일로 접어** 캔버스가
  // 실제로 갖는 최소 폭을 만든 뒤, 그 안에서 패널이 잘리지 않는지를 잰다.
  await page.setViewportSize({ width: 360, height: 720 })
  await openTrack(page)

  await page.getByTestId('section-list-toggle').click()

  const overlay = page.getByTestId('evidence-overlay')
  const trigger = page.getByTestId('legend-trigger')
  const collapsedX = await centerX(trigger)

  await trigger.click()
  const panel = page.getByTestId('legend-panel')
  await expect(panel).toBeVisible()

  const panelBox = await panel.boundingBox()
  const overlayBox = await overlay.boundingBox()
  // 줄바꿈으로 흡수해야 한다 — 패널이 오버레이 밖으로 삐져나가면 잘린 것이다
  expect(panelBox!.width).toBeLessThanOrEqual(overlayBox!.width)
  // 여러 줄이 됐다는 것 자체를 확인한다(한 줄로 들어가면 이 케이스를 안 잰 것이다)
  expect(panelBox!.height).toBeGreaterThan(40)
  expect(Math.abs((await centerX(trigger)) - collapsedX)).toBeLessThan(1)
})
