// FEAT-019 — 하이라이트 버퍼의 순수 축.
//
// 브라우저에서 확인할 수 있는 것은 "보라색이 떴다"까지다. **하이라이트가 그 구간 위에
// 정확히 얹혔는가**·**윤곽선이 면에 파묻히지 않는가**는 좌표로만 드러나므로 여기서 잰다.
import { describe, expect, it } from 'vitest'

import {
  buildHighlightBorders,
  buildHighlightGeometry,
  buildHighlightSurface,
  HIGHLIGHT_BORDER_WIDTH_CM,
  HIGHLIGHT_OUTLINE_LIFT_CM,
  HIGHLIGHT_SURFACE_LIFT_CM,
  isHighlightable,
  outerRingsOf,
} from './highlight-geometry'
import type { BandPoint, LaneBand, SegmentBands } from './lane-bands'

/** 진행축 x를 따라 표본 `count`개, 가로는 `lane`으로 벌린 곧은 레인 */
function straightLane(lane: number, count: number, y = 0): LaneBand {
  const at = (side: number): BandPoint[] =>
    Array.from({ length: count }, (_, index) => ({
      x: index * 10,
      y,
      z: lane * 12 + side * 6,
    }))
  return { lane, lo: at(-1), hi: at(1) }
}

function bandOf(lanes: LaneBand[], overrides: Partial<SegmentBands> = {}): SegmentBands {
  return {
    order: 7,
    pieceId: 'p7',
    pieceClass: 'Str1',
    isSupported: true,
    lanes,
    separated: false,
    ...overrides,
  }
}

function positionsOf(geometry: { getAttribute: (name: string) => { array: ArrayLike<number> } }) {
  return Array.from(geometry.getAttribute('position').array)
}

function heightsOf(geometry: Parameters<typeof positionsOf>[0]): number[] {
  const flat = positionsOf(geometry)
  return flat.filter((_, index) => index % 3 === 1)
}

describe('isHighlightable', () => {
  it('레인이 없는 구간은 하이라이트하지 않는다 — 미지원 피스는 폭을 지어내지 않는다', () => {
    expect(isHighlightable(bandOf([], { isSupported: false }))).toBe(false)
  })

  it('표본이 하나뿐인 레인은 면이 되지 않는다', () => {
    expect(isHighlightable(bandOf([straightLane(0, 1)]))).toBe(false)
  })

  it('null·undefined를 그대로 받아 false를 낸다 — 호출자가 커서 부재를 따로 다루지 않게', () => {
    expect(isHighlightable(null)).toBe(false)
    expect(isHighlightable(undefined)).toBe(false)
  })

  it('표본 2개 이상인 레인이 하나라도 있으면 하이라이트한다', () => {
    expect(isHighlightable(bandOf([straightLane(0, 1), straightLane(1, 4)]))).toBe(true)
  })
})

describe('outerRingsOf', () => {
  it('맞붙은 레인 셋의 둘레는 하나 — 첫 레인의 lo와 마지막 레인의 hi다', () => {
    const lanes = [straightLane(0, 3), straightLane(1, 3), straightLane(2, 3)]
    const rings = outerRingsOf(bandOf(lanes))

    expect(rings).toHaveLength(1)
    expect(rings[0]!.lo).toEqual(lanes[0]!.lo)
    expect(rings[0]!.hi).toEqual(lanes[2]!.hi)
  })

  it('레인 사이 경계는 둘레에 넣지 않는다 — 그 선은 boundaryLinesOf의 형태 축이다', () => {
    const lanes = [straightLane(0, 3), straightLane(1, 3), straightLane(2, 3)]
    const rings = outerRingsOf(bandOf(lanes))
    const drawn = rings.flatMap((ring) => [...ring.lo, ...ring.hi])

    // 가운데 레인의 가장자리(z = 6·18)는 어느 둘레에도 없다
    expect(drawn.some((point) => point.z === lanes[1]!.lo[0]!.z)).toBe(false)
  })

  it('명시 경로로 따로 놓인 레인(FEAT-018)은 레인마다 자기 둘레를 갖는다', () => {
    const lanes = [straightLane(0, 3), straightLane(1, 3), straightLane(2, 3)]
    const rings = outerRingsOf(bandOf(lanes, { separated: true }))

    expect(rings).toHaveLength(3)
    expect(rings[1]!.lo).toEqual(lanes[1]!.lo)
  })

  it('면이 되지 않는 레인은 둘레에서 빠진다', () => {
    const rings = outerRingsOf(bandOf([straightLane(0, 1), straightLane(1, 4)]))
    expect(rings).toHaveLength(1)
    expect(rings[0]!.lo).toHaveLength(4)
  })
})

describe('buildHighlightBorders', () => {
  it('옆줄에서 두 톤이 겹치지 않고 나란히 깔린다 — 밝은 쪽이 바깥, 어두운 쪽이 그 안쪽', () => {
    // 폭 36(z −6~30)짜리 곧은 구간. 띠 폭 2면 밝은 띠는 가장자리~2, 어두운 띠는 2~4다.
    // 마구리(진입·진출)는 폭 **전체**를 덮으므로 x로 걸러 옆줄만 본다.
    const band = bandOf([straightLane(0, 4), straightLane(1, 4), straightLane(2, 4)])
    const { light, dark } = buildHighlightBorders(band, 2)

    const sideZs = (geometry: Parameters<typeof positionsOf>[0]) => {
      const flat = positionsOf(geometry)
      const out: number[] = []
      for (let at = 0; at + 2 < flat.length; at += 3) {
        if (flat[at]! > 5 && flat[at]! < 25) out.push(flat[at + 2]!)
      }
      return out
    }

    const lightZ = sideZs(light)
    const darkZ = sideZs(dark)
    // 바깥 가장자리에 닿는 것은 밝은 띠뿐이다
    expect(Math.min(...lightZ)).toBeCloseTo(-6, 3)
    expect(Math.max(...lightZ)).toBeCloseTo(30, 3)
    // 어두운 띠는 그 안쪽 2~4 구간에만 있다(겹치지 않는다)
    expect(Math.min(...darkZ)).toBeCloseTo(-4, 3)
    expect(Math.max(...darkZ)).toBeCloseTo(28, 3)
  })

  it('두 톤 모두 구간 **안쪽**에만 있다 — 바깥으로 내밀면 이웃 구간을 덮는다', () => {
    const lanes = [straightLane(0, 5), straightLane(1, 5), straightLane(2, 5)]
    const band = bandOf(lanes)
    const outerLo = lanes[0]!.lo[0]!.z
    const outerHi = lanes[2]!.hi[0]!.z

    for (const geometry of Object.values(buildHighlightBorders(band, 2))) {
      const zs = positionsOf(geometry).filter((_, index) => index % 3 === 2)
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(outerLo - 1e-3)
      expect(Math.max(...zs)).toBeLessThanOrEqual(outerHi + 1e-3)
    }
  })

  it('마구리가 있어 고리가 닫힌다 — 양 옆 2장 + 진입·진출 2장 = 띠 4장', () => {
    const band = bandOf([straightLane(0, 6)])
    // 띠 1장 = 표본 n개면 삼각형 2(n-1)개. 옆줄 2장은 n=6, 마구리 2장은 n=2
    const triangles = positionsOf(buildHighlightBorders(band, 2).light).length / 3
    expect(triangles).toBe((6 * 2) * 2 + (2 * 2) * 2)
  })

  it('따로 놓인 레인(FEAT-018)은 레인마다 자기 테두리를 갖는다', () => {
    const band = bandOf([straightLane(0, 4), straightLane(1, 4)], { separated: true })
    const one = bandOf([straightLane(0, 4)], { separated: true })

    expect(positionsOf(buildHighlightBorders(band, 2).light).length).toBe(
      positionsOf(buildHighlightBorders(one, 2).light).length * 2,
    )
  })

  it('좁은 구간에서도 띠가 반대쪽을 넘지 않는다 — 넘으면 면이 접힌다', () => {
    // 폭 12(z −6~6)인 레인 하나에 폭 8짜리 띠를 두 겹 요구한다(합 16 > 12)
    const band = bandOf([straightLane(0, 4)], { separated: true })
    const zs = positionsOf(buildHighlightBorders(band, 8).dark).filter(
      (_, index) => index % 3 === 2,
    )
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-6 - 1e-3)
    expect(Math.max(...zs)).toBeLessThanOrEqual(6 + 1e-3)
  })

  it('빈 레인이면 빈 버퍼를 낸다 — 호출자가 예외를 다루지 않게', () => {
    const { light, dark } = buildHighlightBorders(bandOf([]))
    expect(positionsOf(light)).toHaveLength(0)
    expect(positionsOf(dark)).toHaveLength(0)
  })

  it('기본 폭이 상수를 따른다', () => {
    const band = bandOf([straightLane(0, 4), straightLane(1, 4), straightLane(2, 4)])
    const zs = positionsOf(buildHighlightBorders(band).light).filter(
      (_, index) => index % 3 === 2,
    )
    expect(Math.min(...zs) + HIGHLIGHT_BORDER_WIDTH_CM * 2).toBeCloseTo(
      -6 + HIGHLIGHT_BORDER_WIDTH_CM * 2,
      3,
    )
  })
})

describe('buildHighlightSurface', () => {
  it('노면 위로 띄운다 — 0이면 z-fighting으로 하이라이트가 깜빡인다', () => {
    const band = bandOf([straightLane(0, 3, 12)])
    const heights = heightsOf(buildHighlightSurface(band))

    // Float32Array라 정확 비교가 아니라 오차 비교다
    expect(heights.length).toBeGreaterThan(0)
    for (const height of heights) expect(height).toBeCloseTo(12 + HIGHLIGHT_SURFACE_LIFT_CM, 4)
  })

  it('레인 면의 표본을 그대로 덮는다 — 정점 수가 레인 표본의 두 배(lo·hi)다', () => {
    const band = bandOf([straightLane(0, 6), straightLane(1, 6)])
    expect(positionsOf(buildHighlightSurface(band)).length / 3).toBe(6 * 2 * 2)
  })
})

describe('buildHighlightGeometry', () => {
  it('테두리가 면보다 높다 — 같은 높이면 자기 오버레이에 파묻혀 형태 채널이 사라진다', () => {
    const { surface, borderLight, borderDark } = buildHighlightGeometry(
      bandOf([straightLane(0, 4, 30)]),
    )

    const top = Math.max(...heightsOf(surface))
    expect(Math.max(...heightsOf(borderLight))).toBeGreaterThan(top)
    expect(Math.max(...heightsOf(borderDark))).toBeGreaterThan(top)
    expect(HIGHLIGHT_OUTLINE_LIFT_CM).toBeGreaterThan(HIGHLIGHT_SURFACE_LIFT_CM)
  })

  it('원본 밴드를 건드리지 않는다 — 같은 밴드를 트랙 면이 함께 쓴다', () => {
    const lanes = [straightLane(0, 3, 5)]
    const band = bandOf(lanes)
    const before = JSON.stringify(band)

    buildHighlightGeometry(band)

    expect(JSON.stringify(band)).toBe(before)
  })
})
