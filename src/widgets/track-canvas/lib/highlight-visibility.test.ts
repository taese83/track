// FEAT-019 — "화면 안인가"와 "얼마나 옮겼나"의 순수 축.
//
// 카메라 뒤의 점이 화면 안으로 오판되는 것이 이 판정의 유일한 함정이다(원근 나눗셈의
// 부호가 뒤집혀 x·y가 −1~1에 들어온다). 브라우저에서는 그 오판이 "가끔 엉뚱한 데로
// 카메라가 튄다"로만 보이므로 여기서 수치로 못박는다.
import { describe, expect, it } from 'vitest'

import {
  contrastRatio,
  easeProgress,
  edgeContrastOn,
  HIGHLIGHT_EDGE_DARK,
  HIGHLIGHT_EDGE_LIGHT,
  HIGHLIGHT_FILL,
  isPointInView,
  lerpPoint,
  TARGET_EASE_MS,
  VIEW_MARGIN_NDC,
} from './highlight-visibility'
import {
  FALL_SURFACE,
  FLAT_SURFACE,
  RISE_SURFACE,
  UNSUPPORTED_SURFACE,
} from './segment-appearance'

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

describe('TC-019-8 · 테두리 대비', () => {
  // 실제 표면색 상수를 그대로 가져온다 — 노면 색이 바뀌면 이 검사가 함께 깨져야 한다.
  const surfaces = {
    평지: FLAT_SURFACE,
    상승: RISE_SURFACE,
    하강: FALL_SURFACE,
    미지원: UNSUPPORTED_SURFACE,
  }

  it('네 노면 **모두**에서 두 톤 중 하나가 3:1을 넘는다', () => {
    for (const [name, surface] of Object.entries(surfaces)) {
      expect(edgeContrastOn(surface), `${name} 노면`).toBeGreaterThanOrEqual(3)
    }
  })

  it('두 톤이 실제로 역할을 나눈다 — 밝은 평지는 어두운 톤이, 어두운 노면은 밝은 톤이 읽힌다', () => {
    expect(contrastRatio(HIGHLIGHT_EDGE_DARK, FLAT_SURFACE)).toBeGreaterThan(
      contrastRatio(HIGHLIGHT_EDGE_LIGHT, FLAT_SURFACE),
    )
    for (const dark of [RISE_SURFACE, FALL_SURFACE]) {
      expect(contrastRatio(HIGHLIGHT_EDGE_LIGHT, dark)).toBeGreaterThan(
        contrastRatio(HIGHLIGHT_EDGE_DARK, dark),
      )
    }
  })

  it('단일 색으로는 불가능했다는 사실을 고정한다 — 회귀 시 이 검사가 근거를 되돌려준다', () => {
    // PC-015의 단색 primary는 평지에서 1.10:1이었다(이 라운드가 고친 결함).
    expect(contrastRatio(HIGHLIGHT_FILL, FLAT_SURFACE)).toBeLessThan(1.5)
    // 반대로 진한 보라 하나로 평지를 살리면 어두운 노면이 죽는다
    expect(contrastRatio('#6D28D9', FALL_SURFACE)).toBeLessThan(1.5)
  })

  it('대비 계산이 WCAG 정의를 따른다 — 흰/검 21:1, 자기 자신 1:1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2)
    expect(contrastRatio('#A78BFA', '#A78BFA')).toBeCloseTo(1, 10)
  })
})
