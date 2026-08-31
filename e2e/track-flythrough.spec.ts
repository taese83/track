// FEAT-007 — 추종 시점의 브라우저 축.
//
// 3D 캔버스는 픽셀만 남기고 상태를 남기지 않는다. 그래서 "따라가고 있다"의 판정 근거를
// 스크린샷이 아니라 캔버스가 스스로 노출한 `data-follow-*`로 삼는다(카메라 상태를
// `data-camera-*`로 노출한 것과 같은 이유·같은 방식이다).
//
// **정직 표기**: 여기서 재는 것은 카메라가 경로를 따라 진행했는가·멈췄는가이지 화면이
// "올바르게 보이는가"가 아니다. 형상 일치는 순수 축(`flythrough-camera.test.ts`)이
// 참조 트랙 실측으로 잰다.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openTrack(page: Page, code = 'WS67Y2') {
  await page.goto('/')
  await page.getByTestId('url-input').fill(code)
  await page.getByTestId('url-submit').click()
  await expect(page.getByTestId('track-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 20_000,
  })
}

const distanceOf = async (page: Page) =>
  Number(await page.getByTestId('track-canvas').getAttribute('data-follow-distance'))
const orderOf = async (page: Page) =>
  Number(await page.getByTestId('track-canvas').getAttribute('data-follow-order'))

test('TC-007-1 · 추종을 켜면 START 지점에서 시작한다', async ({ page }) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')
  await expect(canvas).toHaveAttribute('data-follow-mode', 'false')

  await page.getByTestId('follow-toggle').click()
  await expect(canvas).toHaveAttribute('data-follow-mode', 'true')

  // 커서가 0번(START)에 있으므로 추종도 거기서 출발한다
  await expect(canvas).toHaveAttribute('data-follow-order', '0')
  console.log(`TC-007-1 시작 구간 ${await orderOf(page)}`)
})

test('TC-007-1 · 자동 재생이 순서대로 트랙을 진행한다', async ({ page }) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'true')

  // 진행은 단조 증가여야 한다 — 뒤로 가거나 튀면 트랙을 따라가는 것이 아니다
  const samples: number[] = []
  for (let take = 0; take < 5; take += 1) {
    await page.waitForTimeout(400)
    samples.push(await distanceOf(page))
  }
  console.log(`TC-007-1 진행 표본 ${samples.map((s) => s.toFixed(0)).join(' → ')}`)

  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]!).toBeGreaterThan(samples[index - 1]!)
  }

  // 공유 커서도 함께 끌려온다 — 목록이 같은 지점을 가리키는 것이 공유 커서 계약이다
  const order = await orderOf(page)
  expect(order).toBeGreaterThan(0)
  await expect(page.getByTestId(`section-row-${order}`)).toHaveAttribute('aria-selected', 'true')
})

test('TC-007-2 · 스트립을 클릭하면 카메라가 즉시 컷 없이 그 지점으로 간다', async ({ page }) => {
  await openTrack(page)
  await page.getByTestId('follow-toggle').click()

  const slider = page.getByTestId('profile-strip-slider')
  const box = (await slider.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2)

  const target = Number(await slider.getAttribute('aria-valuenow'))
  expect(target).toBeGreaterThan(0)

  // 한 프레임 뒤에는 아직 도착하지 않았어야 한다(즉시 컷이면 이미 같다).
  // 프레임 타이밍에 기대지 않도록 **도착 전 표본이 목표보다 작다**만 본다.
  await page.waitForTimeout(30)
  const midway = await orderOf(page)

  await expect
    .poll(async () => orderOf(page), { timeout: 5_000 })
    .toBe(target)
  console.log(`TC-007-2 스크럽 목표 ${target} · 이동 중 ${midway} → 도착 ${await orderOf(page)}`)
  expect(midway).toBeLessThan(target)
})

test('TC-007-3 · 일시정지하면 즉시 멈추고 위치를 유지한다', async ({ page }) => {
  await openTrack(page)
  const canvas = page.getByTestId('track-canvas')

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await page.waitForTimeout(600)

  await page.getByTestId('follow-play').click()
  await expect(canvas).toHaveAttribute('data-follow-playing', 'false')

  // 진행 값은 최대 100ms 간격으로 발행되므로, 정지 **직후**에 읽으면 정지 전 표본을
  // 집는다. 값이 멎을 때까지 기다린 뒤에 기준점을 잡는다 — 그러지 않으면 발행 지연을
  // "정지 후 이동"으로 오독한다.
  await page.waitForTimeout(250)
  const held = await distanceOf(page)
  await page.waitForTimeout(700)
  const after = await distanceOf(page)

  console.log(`TC-007-3 정지 시점 ${held.toFixed(2)} → 0.7초 뒤 ${after.toFixed(2)}`)
  // 멈춘 자리가 0이면 "움직이다 멈췄다"가 아니라 애초에 안 움직인 것이다 — 두 값이
  // 같다는 단언만으로는 그 둘이 구분되지 않는다
  expect(held).toBeGreaterThan(0)
  expect(after).toBe(held)
})

test('TC-007-3 · 속도를 올리면 같은 시간에 더 멀리 간다', async ({ page }) => {
  // 속도는 segmented radiogroup이다(§ControlCluster) — 옵션 radio를 직접 누른다
  const runAt = async (id: 'slow' | 'fast') => {
    await openTrack(page)
    await page.getByTestId('follow-toggle').click()
    await page.getByTestId(`follow-speed-${id}`).click()
    await expect(page.getByTestId(`follow-speed-${id}`)).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('follow-play').click()
    await page.waitForTimeout(1_000)
    return distanceOf(page)
  }

  const slow = await runAt('slow')
  const fast = await runAt('fast')
  console.log(`TC-007-3 느리게 ${slow.toFixed(0)} · 빠르게 ${fast.toFixed(0)}`)

  // 느린 쪽도 **실제로 움직였어야** 한다. 0과 비교하면 진행이 아예 발행되지 않아도
  // "빠른 쪽이 크다"가 성립해 거짓 통과가 된다(첫 측정에서 실제로 느리게=0이 나왔고,
  // 원인은 진행 값이 구간 변화에만 발행돼 한 구간 안에서 멈춰 있던 것이었다).
  expect(slow).toBeGreaterThan(0)
  expect(fast).toBeGreaterThan(slow)
})

test('TC-007-6(부분) · 스트립에 포커스를 두고 키보드로 옮기면 카메라가 따라간다', async ({
  page,
}) => {
  await openTrack(page)
  await page.getByTestId('follow-toggle').click()

  const slider = page.getByTestId('profile-strip-slider')
  await slider.focus()
  await expect(slider).toBeFocused()

  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowRight')
  const target = Number(await slider.getAttribute('aria-valuenow'))
  expect(target).toBe(5)

  await expect.poll(async () => orderOf(page), { timeout: 5_000 }).toBe(target)
  console.log(`TC-007-6(부분) 키보드 ${target}구간 → 카메라 ${await orderOf(page)}`)
})

/**
 * **정직 표기 — OPENLOOP은 여기서 쓰지 못한다.** 그 fixture는 복원이
 * `traversal-incomplete`로 실패해 `TrackViewerPage`가 3D가 아니라 **에러 화면**으로
 * 착지한다(실측: `track-canvas`가 마운트되지 않는다). 3D에 도달하면서 `truncated`인
 * fixture는 `UNSUPP`다 — 복원은 성공하고 미지원 피스 2개가 `connectedPieceIds`에서
 * 빠져 배치가 전체를 덮지 못한다. 비폐곡선 자체의 추종은 순수 축이 OPENLOOP의 연결
 * 접두부(131구간)로 잰다.
 */
test('TC-007-5 · 배치가 잘린 트랙에서 켜도 오류로 중단되지 않는다', async ({ page }) => {
  await openTrack(page, 'UNSUPP')
  const canvas = page.getByTestId('track-canvas')
  await expect(page.getByTestId('canvas-truncated')).toBeVisible()

  await page.getByTestId('follow-toggle').click()
  await page.getByTestId('follow-play').click()
  await page.waitForTimeout(800)

  // 화면이 살아 있고 진행하고 있다 — 잘린 트랙에서 던지면 여기서 드러난다
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  expect(await distanceOf(page)).toBeGreaterThan(0)
  console.log(`TC-007-5 잘린 트랙 진행 ${(await distanceOf(page)).toFixed(0)}`)
})

test('추종 시점을 켠 화면에 접근성 위반이 없다', async ({ page }) => {
  await openTrack(page)
  await page.getByTestId('follow-toggle').click()
  await expect(page.getByTestId('follow-play')).toBeVisible()

  // 조작이 늘어난 상태에서 잰다 — 켜기 전만 재면 새로 생긴 버튼·선택은 검사되지 않는다
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('추종 조작이 키보드만으로 도달·조작된다', async ({ page }) => {
  await openTrack(page)
  const toggle = page.getByTestId('follow-toggle')

  // 즉시 적용 토글은 switch다 — 상태는 aria-checked로 읽힌다(§ControlCluster)
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await page.keyboard.press('Tab')
  const play = page.getByTestId('follow-play')
  await expect(play).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(play).toHaveAttribute('aria-pressed', 'true')

  // 속도 radiogroup — Tab 한 번에 그룹으로 들어가고(roving tabindex), 방향키로 고른다
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('follow-speed-normal')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('follow-speed-fast')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('follow-speed-fast')).toBeFocused()
})
