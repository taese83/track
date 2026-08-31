// FEAT-013 — 텍스트 구간 목록의 브라우저 축.
//
// vitest는 `environment: node`라 "패널을 열면"·"키보드 포커스가 있는 상태"를 만들 수 없다.
// 순서·유형·미지원 라벨의 **내용**은 순수 축(`section-items.test.ts`)이 수치로 재고,
// 여기서는 **화면에 나타나고 조작이 반영되는가**만 본다.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function submit(page: Page, value: string) {
  await page.getByTestId('url-input').fill(value)
  await page.getByTestId('url-submit').click()
}

async function openTrack(page: Page, code = 'WS67Y2'): Promise<Locator> {
  await submit(page, code)
  const list = page.getByTestId('section-list')
  await expect(list).toBeVisible()
  return list
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('TC-013-1 · 132개 세그먼트가 순서대로 나열되고 각 행에 타입·유형이 표시된다', async ({
  page,
}) => {
  await openTrack(page)

  await expect(page.getByTestId('section-list-count')).toHaveText('132개 구간')
  const rows = page.getByRole('option')
  await expect(rows).toHaveCount(132)

  // 첫 행은 순서의 기점이다 — 번호·타입·유형 셋이 다 있어야 "표시된다"가 성립한다
  const first = page.getByTestId('section-row-0')
  await expect(first).toContainText('1')
  await expect(first).toContainText('Str2')
  await expect(first).toContainText('START')

  // 순서가 화면에서도 이어진다 — 스크롤해 중간과 끝을 실제로 확인한다
  const middle = page.getByTestId('section-row-65')
  await middle.scrollIntoViewIfNeeded()
  await expect(middle).toContainText('66')

  const last = page.getByTestId('section-row-131')
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeVisible()
  await expect(last).toContainText('132')
})

test('TC-013-1 · 접으면 56px 레일로 줄고 캔버스가 그 폭을 가져간다', async ({ page }) => {
  const list = await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')

  const expandedList = await list.boundingBox()
  const expandedCanvas = await canvas.boundingBox()
  expect(expandedList?.width).toBeCloseTo(320, 0)

  const toggle = page.getByTestId('section-list-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()

  // 위로 사라지지 않는다 — 레일이 남는다(component-spec §측면 접기 계약)
  await expect(list).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const railBox = await list.boundingBox()
  expect(railBox?.width).toBeCloseTo(56, 0)

  // 레일에도 제목이 남는다
  await expect(page.getByRole('heading', { name: '구간 목록' })).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(0)

  // 캔버스가 확보한 폭을 실제로 쓴다
  const collapsedCanvas = await canvas.boundingBox()
  expect(collapsedCanvas!.width).toBeGreaterThan(expandedCanvas!.width)
  expect(collapsedCanvas!.width - expandedCanvas!.width).toBeCloseTo(
    expandedList!.width - railBox!.width,
    0,
  )

  // 다시 펼치면 원래 폭과 132행이 복원된다
  await toggle.click()
  await expect(page.getByRole('option')).toHaveCount(132)
  expect((await list.boundingBox())?.width).toBeCloseTo(320, 0)
})

test('TC-013-1 · 접었다 펴도 같은 버튼에 포커스가 남는다', async ({ page }) => {
  await openTrack(page)
  const toggle = page.getByTestId('section-list-toggle')

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // DOM이 갱신돼도 포커스가 날아가지 않아야 한다(a11y-responsive §포커스 순서)
  await expect(toggle).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toBeFocused()
})

test('TC-013-2(부분) · 행을 클릭하면 공유 커서가 그 행으로 옮겨간다', async ({ page }) => {
  await openTrack(page)

  // 초기 선택은 첫 행이다
  await expect(page.getByTestId('section-row-0')).toHaveAttribute('aria-selected', 'true')

  const target = page.getByTestId('section-row-7')
  await target.click()
  await expect(target).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('section-row-0')).toHaveAttribute('aria-selected', 'false')

  // 선택은 하나뿐이다 — 둘이 선택돼 보이면 커서가 아니라 토글이 된다
  await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1)
})

test('TC-013-3 · 미지원 피스 행이 타입명과 함께 표기된다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')

  // 복원 순서에 못 낀 미지원 피스도 목록에 남는다(실측: 134피스 중 순서는 132개)
  await expect(page.getByTestId('section-list-count')).toHaveText('134개 구간')

  for (const label of ['미지원: Xyz9', '미지원: Wob2']) {
    const row = page.locator('[role="option"]', { hasText: label })
    await expect(row).toHaveCount(1)
    // 뭉뚱그리지 않는다 — 각 행이 자기 타입명을 갖는다
    await expect(row).toHaveAttribute('aria-disabled', 'true')
  }
})

test('TC-013-4 · 방향키로 순회하고 Enter로 확정한다', async ({ page }) => {
  await openTrack(page)

  const first = page.getByTestId('section-row-0')
  await first.focus()
  await expect(first).toBeFocused()

  // 방향키는 포커스만 옮긴다 — 커서(aria-selected)는 그대로다
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('section-row-2')).toBeFocused()
  await expect(first).toHaveAttribute('aria-selected', 'true')

  // Enter에서만 커서가 확정된다(공유 커서 계약 §쓰기는 명시적 확정 이벤트에서만)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('section-row-2')).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('aria-selected', 'false')

  // Home/End로 양 끝까지 간다
  await page.keyboard.press('End')
  await expect(page.getByTestId('section-row-131')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(first).toBeFocused()
})

test('TC-013-4 · 목록 전체가 Tab stop 하나다', async ({ page }) => {
  await openTrack(page)

  // 132개 행이 각각 Tab stop이면 캔버스까지 132번 눌러야 한다 — APG 컴포지트 패턴 위반
  const tabbable = page.locator('[role="option"][tabindex="0"]')
  await expect(tabbable).toHaveCount(1)

  await page.getByTestId('section-row-3').focus()
  await expect(page.locator('[role="option"][tabindex="0"]')).toHaveCount(1)
  await expect(page.getByTestId('section-row-3')).toHaveAttribute('tabindex', '0')
})

/** 행이 목록 상자의 스크롤 뷰포트 안에 완전히 들어왔는가. smooth 스크롤 대기는 호출부의 poll이 맡는다 */
async function rowIsInView(page: Page, index: number): Promise<boolean> {
  const box = await page.getByTestId('section-list-box').boundingBox()
  const row = await page.getByTestId(`section-row-${index}`).boundingBox()
  if (box === null || row === null) return false
  return row.y >= box.y - 1 && row.y + row.height <= box.y + box.height + 1
}

test('TC-013-6 · 스트립을 클릭하면 목록이 그 행으로 스크롤되고 roving 포커스가 옮겨간다', async ({
  page,
}) => {
  await openTrack(page)

  const slider = page.getByTestId('profile-strip-slider')
  const box = (await slider.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)

  const n = Number(await slider.getAttribute('aria-valuenow'))
  expect(n).toBeGreaterThan(60)

  const row = page.getByTestId(`section-row-${n}`)
  await expect(row).toHaveAttribute('aria-selected', 'true')
  // 목록 밖에서 옮긴 커서가 목록의 roving 포커스도 가져간다 — Tab이 그 행으로 돌아온다
  await expect(row).toHaveAttribute('tabindex', '0')

  await expect.poll(() => rowIsInView(page, n)).toBe(true)

  // 스트립의 키보드 포커스는 빼앗지 않는다 — 실측(2026-08-31): Chromium에서 tabIndex=0
  // 슬라이더는 마우스 클릭으로 포커스를 받으므로 이 단언이 "목록이 포커스를 뺏지 않았다"를 잰다
  await expect(slider).toBeFocused()
  await expect(page.getByTestId('section-list-box')).not.toBeFocused()
})

test('TC-013-6 · 스트립 End 키로 끝까지 가면 마지막 행이 보이고, 목록에서 고른 경우엔 스크롤을 건드리지 않는다', async ({
  page,
}) => {
  await openTrack(page)

  const slider = page.getByTestId('profile-strip-slider')
  await slider.focus()
  await page.keyboard.press('End')
  await expect(slider).toHaveAttribute('aria-valuenow', '131')

  await expect(page.getByTestId('section-row-131')).toHaveAttribute('tabindex', '0')
  await expect.poll(() => rowIsInView(page, 131)).toBe(true)

  // 목록에서 직접 고르면(source `list`) 사용자의 스크롤 위치를 건드리지 않는다
  const listBox = page.getByTestId('section-list-box')
  const before = await listBox.evaluate((node) => node.scrollTop)
  await page.getByTestId('section-row-129').click()
  await expect(page.getByTestId('section-row-129')).toHaveAttribute('aria-selected', 'true')
  const after = await listBox.evaluate((node) => node.scrollTop)
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1)
})

test('구간 목록 화면에 접근성 위반이 없다', async ({ page }) => {
  await openTrack(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
