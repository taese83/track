// TC-008-8 — 가운데 레인은 `filter`가 아니라 색으로 구분한다.
import { describe, expect, it } from 'vitest'

import { laneSurfaceColorOf } from './segment-appearance'

const FLAT = '#a8aeb8'

describe('TC-008-8 — 가운데 레인 구분은 색만으로 한다', () => {
  it('가운데 레인만 색이 다르다', () => {
    expect(laneSurfaceColorOf(FLAT, 0)).toBe(FLAT)
    expect(laneSurfaceColorOf(FLAT, 2)).toBe(FLAT)
    expect(laneSurfaceColorOf(FLAT, 1)).not.toBe(FLAT)
  })

  it('바깥 두 레인은 서로 같은 색이다 — 셋을 다 다르게 하면 트랙이 얼룩진다', () => {
    expect(laneSurfaceColorOf(FLAT, 0)).toBe(laneSurfaceColorOf(FLAT, 2))
  })

  it('밝기만 올리고 색상은 유지한다', () => {
    const mid = laneSurfaceColorOf('#7a2422', 1)
    expect(mid).toBe('#883230')
    // 채널 순서가 바뀌면 색상이 달라진다 — 빨강 계열이 그대로 빨강이어야 한다
    expect(Number.parseInt(mid.slice(1, 3), 16)).toBeGreaterThan(
      Number.parseInt(mid.slice(3, 5), 16),
    )
  })

  it('255를 넘기지 않는다', () => {
    expect(laneSurfaceColorOf('#fffefd', 1)).toBe('#ffffff')
  })
})
