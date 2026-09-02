// FEAT-019 — "화면 안인가"와 "얼마나 옮겼나"의 순수 축.
//
// 카메라 뒤의 점이 화면 안으로 오판되는 것이 이 판정의 유일한 함정이다(원근 나눗셈의
// 부호가 뒤집혀 x·y가 −1~1에 들어온다). 브라우저에서는 그 오판이 "가끔 엉뚱한 데로
// 카메라가 튄다"로만 보이므로 여기서 수치로 못박는다.
import { describe, expect, it } from 'vitest'

import {
  easeProgress,
  isPointInView,
  lerpPoint,
  TARGET_EASE_MS,
  VIEW_MARGIN_NDC,
} from './highlight-visibility'

describe('isPointInView', () => {
  it('화면 한가운데는 안이다', () => {
    expect(isPointInView({ x: 0, y: 0, z: 0 })).toBe(true)
  })

  it('가장자리 여유 밖은 밖이다 — 경계에 걸친 대상이 클릭마다 깜빡이지 않게 한다', () => {
    expect(isPointInView({ x: VIEW_MARGIN_NDC, y: 0, z: 0 })).toBe(true)
    expect(isPointInView({ x: VIEW_MARGIN_NDC + 0.01, y: 0, z: 0 })).toBe(false)
    expect(isPointInView({ x: 0, y: -VIEW_MARGIN_NDC - 0.01, z: 0 })).toBe(false)
  })

  it('카메라 **뒤**의 점은 x·y가 화면 안이어도 밖이다 — z만이 앞뒤를 가른다', () => {
    expect(isPointInView({ x: 0, y: 0, z: 1.4 })).toBe(false)
    expect(isPointInView({ x: 0, y: 0, z: -1.2 })).toBe(false)
  })

  it('유한하지 않은 값은 밖으로 판정한다 — 판정 불가를 "보인다"로 읽지 않는다', () => {
    expect(isPointInView({ x: Number.NaN, y: 0, z: 0 })).toBe(false)
    expect(isPointInView({ x: 0, y: Number.POSITIVE_INFINITY, z: 0 })).toBe(false)
  })

  it('여유를 넓히면 같은 점이 안으로 들어온다 — 여유는 인자다', () => {
    const point = { x: 0.95, y: 0, z: 0 }
    expect(isPointInView(point)).toBe(false)
    expect(isPointInView(point, 1)).toBe(true)
  })
})

describe('easeProgress', () => {
  it('시작 0, 끝 1이고 그 사이에서 단조 증가한다', () => {
    expect(easeProgress(0)).toBe(0)
    expect(easeProgress(TARGET_EASE_MS)).toBe(1)

    let previous = -1
    for (let ms = 0; ms <= TARGET_EASE_MS; ms += 20) {
      const value = easeProgress(ms)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('중간점이 0.5다 — smoothstep은 대칭이다', () => {
    expect(easeProgress(TARGET_EASE_MS / 2)).toBeCloseTo(0.5, 10)
  })

  it('양 끝에서 속도가 0이다 — 등속이면 멈추는 순간이 툭 끊긴다', () => {
    const step = 1
    expect(easeProgress(step)).toBeLessThan((step / TARGET_EASE_MS) * 0.5)
    const near = TARGET_EASE_MS - step
    expect(1 - easeProgress(near)).toBeLessThan((step / TARGET_EASE_MS) * 0.5)
  })

  it('시간을 넘겨도 1을 넘지 않고, 음수 경과는 0이다', () => {
    expect(easeProgress(TARGET_EASE_MS * 10)).toBe(1)
    expect(easeProgress(-50)).toBe(0)
  })

  it('durationMs가 0이면 첫 프레임에 1 — reduced-motion의 즉시 컷이 이 경로다', () => {
    expect(easeProgress(0, 0)).toBe(1)
    expect(easeProgress(0, -1)).toBe(1)
  })
})

describe('lerpPoint', () => {
  it('양 끝과 중간을 정확히 낸다', () => {
    const from = { x: 0, y: 10, z: -4 }
    const to = { x: 100, y: -10, z: 4 }

    expect(lerpPoint(from, to, 0)).toEqual(from)
    expect(lerpPoint(from, to, 1)).toEqual(to)
    expect(lerpPoint(from, to, 0.5)).toEqual({ x: 50, y: 0, z: 0 })
  })
})
