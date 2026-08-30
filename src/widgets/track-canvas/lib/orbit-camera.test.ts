// TC-006-5의 순수 축 — 키보드 대체 조작이 마우스와 같은 궤도를 그리는가.
// 브라우저에서의 실제 반영(포커스·프레임 갱신)은 e2e가 잡는다(vitest는 environment: node).
import { describe, expect, it } from 'vitest'

import { applyOrbitKey, initialOrbitFor, isOrbitKey, orbitLimitsFor } from './orbit-camera'
import type { OrbitState } from './orbit-camera'

const DIAGONAL = 1000
const LIMITS = orbitLimitsFor(DIAGONAL)

function stateOf(overrides: Partial<OrbitState> = {}): OrbitState {
  return { azimuthRad: 0, polarRad: Math.PI / 4, distance: 500, ...overrides }
}

describe('TC-006-5 — 키보드 오빗', () => {
  it('좌우 방향키가 방위각을 반대로 돌린다', () => {
    const base = stateOf()
    const left = applyOrbitKey(base, 'ArrowLeft', LIMITS)
    const right = applyOrbitKey(base, 'ArrowRight', LIMITS)
    if (left === null || right === null) throw new Error('방향키가 처리되지 않았다')

    expect(left.azimuthRad).toBeLessThan(base.azimuthRad)
    expect(right.azimuthRad).toBeGreaterThan(base.azimuthRad)
    // 좌우가 같은 크기여야 왕복이 제자리로 돌아온다
    expect(base.azimuthRad - left.azimuthRad).toBeCloseTo(right.azimuthRad - base.azimuthRad, 12)
    expect(left.distance).toBe(base.distance)
    expect(left.polarRad).toBe(base.polarRad)
  })

  it('상하 방향키가 극각을 움직이고 한계에서 멈춘다', () => {
    const up = applyOrbitKey(stateOf(), 'ArrowUp', LIMITS)
    const down = applyOrbitKey(stateOf(), 'ArrowDown', LIMITS)
    expect(up?.polarRad).toBeLessThan(Math.PI / 4)
    expect(down?.polarRad).toBeGreaterThan(Math.PI / 4)

    // 위로 계속 눌러도 천정을 넘지 않는다 — 넘으면 방위각이 정의되지 않아 화면이 튄다
    let state = stateOf()
    for (let index = 0; index < 200; index += 1) {
      const next = applyOrbitKey(state, 'ArrowUp', LIMITS)
      if (next === null) throw new Error('방향키가 처리되지 않았다')
      state = next
    }
    expect(state.polarRad).toBe(LIMITS.minPolarRad)

    // 아래로도 지면 아래로 내려가지 않는다
    state = stateOf()
    for (let index = 0; index < 200; index += 1) {
      const next = applyOrbitKey(state, 'ArrowDown', LIMITS)
      if (next === null) throw new Error('방향키가 처리되지 않았다')
      state = next
    }
    expect(state.polarRad).toBe(LIMITS.maxPolarRad)
  })

  it('+/-가 거리를 줄이고 늘리며 한계 안에 머문다', () => {
    const base = stateOf()
    for (const key of ['+', '=']) {
      expect(applyOrbitKey(base, key, LIMITS)?.distance).toBeLessThan(base.distance)
    }
    for (const key of ['-', '_']) {
      expect(applyOrbitKey(base, key, LIMITS)?.distance).toBeGreaterThan(base.distance)
    }

    let zoomedIn = stateOf()
    for (let index = 0; index < 500; index += 1) {
      const next = applyOrbitKey(zoomedIn, '+', LIMITS)
      if (next === null) throw new Error('줌 키가 처리되지 않았다')
      zoomedIn = next
    }
    expect(zoomedIn.distance).toBeCloseTo(LIMITS.minDistance, 12)

    let zoomedOut = stateOf()
    for (let index = 0; index < 500; index += 1) {
      const next = applyOrbitKey(zoomedOut, '-', LIMITS)
      if (next === null) throw new Error('줌 키가 처리되지 않았다')
      zoomedOut = next
    }
    expect(zoomedOut.distance).toBeCloseTo(LIMITS.maxDistance, 12)
  })

  it('다루지 않는 키는 null이다 — 위젯이 브라우저 기본 동작을 삼키지 않는다', () => {
    for (const key of ['Tab', 'Enter', 'a', 'PageDown', ' ']) {
      expect(isOrbitKey(key)).toBe(false)
      expect(applyOrbitKey(stateOf(), key, LIMITS)).toBeNull()
    }
  })
})

describe('초기 카메라 배치', () => {
  it('바운딩박스 외접구가 수직 화각 안에 들어온다', () => {
    const fovDeg = 50
    const orbit = initialOrbitFor(DIAGONAL, fovDeg)
    const halfFov = (fovDeg / 2) * (Math.PI / 180)
    const visibleRadius = orbit.distance * Math.tan(halfFov)

    expect(visibleRadius).toBeGreaterThan(DIAGONAL / 2)
    // 여백이 과하면 트랙이 점으로 보인다 — 화면 절반 이상은 차지해야 한다
    expect(visibleRadius).toBeLessThan(DIAGONAL)
  })

  it('내려다보되 수직은 아니다 — 고도가 첫 프레임에 드러나야 한다', () => {
    const orbit = initialOrbitFor(DIAGONAL, 50)
    expect(orbit.polarRad).toBeGreaterThan(0.2)
    expect(orbit.polarRad).toBeLessThan(Math.PI / 2)
  })

  it('트랙 규모가 커지면 거리와 한계가 비례해 커진다', () => {
    const small = initialOrbitFor(500, 50)
    const large = initialOrbitFor(5000, 50)
    expect(large.distance / small.distance).toBeCloseTo(10, 12)
    expect(orbitLimitsFor(5000).maxDistance / orbitLimitsFor(500).maxDistance).toBeCloseTo(10, 12)
  })

  it('TC-006-6: 극각이 수평을 넘어 아래에서 올려다볼 수 있다', () => {
    const limits = orbitLimitsFor(DIAGONAL)
    // 종전 상한은 π/2 − 0.05였다. 육교·뱅크·입체교차는 자기 위를 지나가는 형상이라
    // 아래에서 봐야 보이는 것이 있다(PC-010 ②, 사용자 확정).
    expect(limits.maxPolarRad).toBeGreaterThan(Math.PI / 2)
    expect(limits.maxPolarRad).toBeLessThan(Math.PI)
    expect(limits.minPolarRad).toBeGreaterThan(0)
  })

  it('TC-006-6: 아래쪽으로 계속 눌러도 수평에서 멈추지 않는다', () => {
    const limits = orbitLimitsFor(DIAGONAL)
    let state = { azimuthRad: 0, polarRad: Math.PI / 2 - 0.1, distance: 100 }
    for (let step = 0; step < 20; step += 1) {
      const next = applyOrbitKey(state, 'ArrowDown', limits)
      expect(next).not.toBeNull()
      state = next as typeof state
    }
    expect(state.polarRad).toBeGreaterThan(Math.PI / 2)
  })

  it('TC-006-6: 방위각은 한 바퀴를 돌아도 잠기지 않는다', () => {
    const limits = orbitLimitsFor(DIAGONAL)
    let state = { azimuthRad: 0, polarRad: 1, distance: 100 }
    const seen = new Set<number>()
    for (let step = 0; step < 80; step += 1) {
      state = applyOrbitKey(state, 'ArrowRight', limits) as typeof state
      seen.add(Math.round(state.azimuthRad * 1000))
    }
    expect(seen.size).toBe(80)
    expect(Math.abs(state.azimuthRad)).toBeGreaterThan(2 * Math.PI)
  })
})
