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
  await expect(slider).toBeVisible()
  const box = (await slider.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2)

  // 클릭이 커서에 반영된 뒤에 읽는다 — 1회 읽기는 실패 시 원인이 보이지 않는다
  await expect(slider).not.toHaveAttribute('aria-valuenow', '0')
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

  // 목록에서 직접 고르면(source `list`) 사용자의 스크롤 위치를 건드리지 않는다.
  // smooth 스크롤이 끝난 뒤의 값을 기준으로 삼는다 — 두 번 연속 같으면 멈춘 것이다
  const listBox = page.getByTestId('section-list-box')
  const settledScrollTop = () =>
    listBox.evaluate(
      (node) =>
        new Promise<number>((resolve) => {
          const first = node.scrollTop
          requestAnimationFrame(() => resolve(node.scrollTop === first ? first : Number.NaN))
        }),
    )
  await expect.poll(settledScrollTop).not.toBeNaN()
  const before = await settledScrollTop()
  await page.getByTestId('section-row-129').click()
  await expect(page.getByTestId('section-row-129')).toHaveAttribute('aria-selected', 'true')
  const after = await listBox.evaluate((node) => node.scrollTop)
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1)
})

test('TC-013-6 · 자동 재생이 미는 커서를 목록이 따라가되, 목록 안에서 탐색 중이면 밀어내지 않는다', async ({
  page,
}) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'true')

  // 재생이 커서를 목록 밖까지 밀면 그 행이 보이고 roving 포커스도 따라온다(source `canvas`)
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-follow-order')), { timeout: 15_000 })
    .toBeGreaterThan(40)
  // **order와 tabindex를 같은 순간에 읽는다.** 재생 중에는 `data-follow-order`(useFrame에서
  // DOM에 동기로 쓴다)와 132행 목록의 roving 포커스(React 재렌더를 거친다) 사이에 몇 프레임
  // 지연이 있다 — FEAT-012 라운드에 기록된 성질이고 FEAT-020(벽)이 렌더 비용을 올려 그 창이
  // 넓어졌다. 먼저 order를 읽어 두고 나중에 그 행을 단언하면 커서가 이미 지나간 행을 검사하게
  // 되어 영영 맞지 않는다. 한 번의 evaluate 안에서 둘을 함께 읽으면 그 경합이 사라진다.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const order = document
          .querySelector('[data-testid="track-canvas"]')
          ?.getAttribute('data-follow-order')
        return document
          .querySelector(`[data-testid="section-row-${order}"]`)
          ?.getAttribute('tabindex')
      }),
    )
    .toBe('0')

  const reached = Number(await canvas.getAttribute('data-follow-order'))
  await expect.poll(() => rowIsInView(page, reached)).toBe(true)

  // 사용자가 목록 안에서 탐색을 시작하면(목록이 DOM 포커스 보유) 재생이 계속 커서를 밀어도
  // 그 행은 밀려나지 않는다 — code-reviewer 2026-08-31 지적의 회귀 테스트
  // **사용자가 실제로 들어오는 경로로 진입한다.** 임의 행에 `.focus()`만 걸면 DOM 포커스와
  // 앱의 roving 상태(`focusedIndex`)가 어긋난 상태가 되는데, 사용자는 그 상태를 만들 수 없다 —
  // Tab은 roving 행으로 들어가고 클릭은 `onSelect`를 거친다. 어긋난 상태에서는 목록이 포커스를
  // 얻은 순간 roving effect가 DOM 포커스를 자기 행으로 되가져가므로, 테스트가 제품이 아니라
  // 자기가 만든 모순을 재는 셈이 된다(2026-09-03, FEAT-020 라운드에서 드러남).
  const roving = page.locator('[role="option"][tabindex="0"]')
  await roving.focus()
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowUp')

  // 방향키로 올라간 자리를 **읽어서** 기준으로 삼는다 — 몇 번째 행인지 계산해 두면 재생이
  // 그 사이 커서를 민 만큼 어긋난다
  const anchorTestId = await roving.getAttribute('data-testid')
  const anchor = Number(anchorTestId?.replace('section-row-', ''))
  expect(Number.isInteger(anchor)).toBe(true)
  await expect(page.getByTestId(`section-row-${anchor}`)).toBeFocused()
  const orderBefore = Number(await canvas.getAttribute('data-follow-order'))
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-follow-order')), { timeout: 15_000 })
    .toBeGreaterThan(orderBefore + 3)
  await expect(page.getByTestId(`section-row-${anchor}`)).toBeFocused()
  await expect(page.getByTestId(`section-row-${anchor}`)).toHaveAttribute('tabindex', '0')
  expect(await rowIsInView(page, anchor)).toBe(true)

  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'false')
})

test('구간 목록 화면에 접근성 위반이 없다', async ({ page }) => {
  await openTrack(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
