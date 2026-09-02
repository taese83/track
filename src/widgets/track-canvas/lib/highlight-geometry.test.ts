// FEAT-019 — 하이라이트 버퍼의 순수 축.
//
// 브라우저에서 확인할 수 있는 것은 "보라색이 떴다"까지다. **하이라이트가 그 구간 위에
// 정확히 얹혔는가**·**윤곽선이 면에 파묻히지 않는가**는 좌표로만 드러나므로 여기서 잰다.
import { describe, expect, it } from 'vitest'

import {
  buildHighlightGeometry,
  buildHighlightOutline,
  buildHighlightSurface,
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

describe('buildHighlightOutline', () => {
  it('둘레가 닫힌다 — 옆 두 줄에 진입·진출 마구리 두 줄을 더한다', () => {
    const count = 5
    const geometry = buildHighlightOutline(bandOf([straightLane(0, count), straightLane(1, count)]))

    // 선분 하나 = 정점 2 = float 6. 옆줄 2*(count-1) + 마구리 2
    const segments = positionsOf(geometry).length / 6
    expect(segments).toBe(2 * (count - 1) + 2)
  })

  it('마구리가 진입·진출 양 끝을 잇는다 — 한쪽만 닫으면 구간의 끝이 열린 채 남는다', () => {
    const lanes = [straightLane(0, 3)]
    const flat = positionsOf(buildHighlightOutline(bandOf(lanes)))
    const xs = flat.filter((_, index) => index % 3 === 0)

    // 마지막 두 선분이 마구리다: 각각 같은 x에서 lo↔hi를 잇는다
    const entry = flat.slice(flat.length - 12, flat.length - 6)
    const exit = flat.slice(flat.length - 6)
    expect(entry[0]).toBe(entry[3])
    expect(exit[0]).toBe(exit[3])
    expect(entry[0]).toBe(Math.min(...xs))
    expect(exit[0]).toBe(Math.max(...xs))
  })

  it('따로 놓인 레인은 레인마다 닫힌 고리를 갖는다', () => {
    const count = 4
    const band = bandOf([straightLane(0, count), straightLane(1, count)], { separated: true })
    const segments = positionsOf(buildHighlightOutline(band)).length / 6

    expect(segments).toBe(2 * (2 * (count - 1) + 2))
  })

  it('빈 레인이면 빈 버퍼를 낸다 — 호출자가 예외를 다루지 않게', () => {
    expect(positionsOf(buildHighlightOutline(bandOf([])))).toHaveLength(0)
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
  it('윤곽선이 면보다 높다 — 같은 높이면 자기 오버레이에 파묻혀 형태 채널이 사라진다', () => {
    const { surface, outline } = buildHighlightGeometry(bandOf([straightLane(0, 4, 30)]))

    expect(Math.max(...heightsOf(outline))).toBeGreaterThan(Math.max(...heightsOf(surface)))
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
