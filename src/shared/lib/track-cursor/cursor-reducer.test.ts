// 공유 커서의 2차 게이트가 실제로 무는지 — 같은 값 재발행이 끊기고 실패 구간이 거부되는가.
import { describe, expect, it } from 'vitest'

import {
  initialCursorState,
  isReachable,
  setCursor,
  stepBy,
} from './cursor-reducer'
import type { CursorBounds } from './cursor-reducer'

const FULL: CursorBounds = { totalCount: 132, reachableCount: 132 }
/** 부분 실패 — 40번째까지만 이어졌다 */
const PARTIAL: CursorBounds = { totalCount: 132, reachableCount: 40 }

describe('공유 커서 리듀서', () => {
  it('같은 인덱스로 다시 쓰면 동일 참조를 돌려준다 (순환 갱신 2차 게이트)', () => {
    const state = initialCursorState(FULL)
    const moved = setCursor(state, FULL, 5, 'list')
    // 다른 소스가 같은 값을 재발행해도 새 객체를 만들지 않는다 — 여기서 A→B→A가 끊긴다
    expect(setCursor(moved, FULL, 5, 'canvas')).toBe(moved)
    expect(setCursor(moved, FULL, 5, 'strip')).toBe(moved)
  })

  it('이동하면 새 상태와 마지막 소스를 남긴다', () => {
    const next = setCursor(initialCursorState(FULL), FULL, 12, 'list')
    expect(next.currentIndex).toBe(12)
    expect(next.lastSource).toBe('list')
    expect(next.totalCount).toBe(132)
  })

  it('도달 불가 구간으로는 미끄러지지 않고 거부한다', () => {
    const state = setCursor(initialCursorState(PARTIAL), PARTIAL, 10, 'list')
    // 클램프하면 39로 미끄러져 "여기까지 이어져 있다"는 거짓 신호가 된다 — 그대로 둔다
    expect(setCursor(state, PARTIAL, 80, 'list')).toBe(state)
    expect(setCursor(state, PARTIAL, -1, 'list')).toBe(state)
    expect(setCursor(state, PARTIAL, 1.5, 'list')).toBe(state)
  })

  it('isReachable이 실패 구간 경계를 정확히 가른다', () => {
    expect(isReachable(PARTIAL, 39)).toBe(true)
    expect(isReachable(PARTIAL, 40)).toBe(false)
    expect(isReachable(FULL, 131)).toBe(true)
    expect(isReachable(FULL, 132)).toBe(false)
  })

  it('상대 이동은 도달 가능 범위 안에서 멈춘다', () => {
    let state = initialCursorState(PARTIAL)
    state = stepBy(state, PARTIAL, 100, 'strip')
    expect(state.currentIndex).toBe(39)

    // 경계에서 한 번 더 밀어도 같은 참조 — 재렌더가 없다
    expect(stepBy(state, PARTIAL, 5, 'strip')).toBe(state)

    state = stepBy(state, PARTIAL, -1000, 'strip')
    expect(state.currentIndex).toBe(0)
    expect(stepBy(state, PARTIAL, -1, 'strip')).toBe(state)
  })

  it('도달 가능 구간이 없으면 아무것도 하지 않는다', () => {
    const empty: CursorBounds = { totalCount: 0, reachableCount: 0 }
    const state = initialCursorState(empty)
    expect(stepBy(state, empty, 1, 'list')).toBe(state)
    expect(setCursor(state, empty, 0, 'list')).toBe(state)
  })
})
