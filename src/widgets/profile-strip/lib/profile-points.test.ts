// FEAT-012 순수 축 — 상대 스케일 정규화·도달 경계·폐합 불연속.
// 화면에 그려지는가(TC-012-1)와 조작이 반영되는가(TC-012-2/3)는 Playwright가 잰다.
import { describe, expect, it } from 'vitest'

import {
  axisTicks,
  buildProfileModel,
  clampToReachable,
  pointAtRatio,
} from './profile-points'
import type { ProfileSourceSegment } from './profile-points'

function segmentsOf(elevations: readonly number[]): ProfileSourceSegment[] {
  return elevations.map((value, order) => ({
    order,
    absoluteElevationStart: value,
    absoluteElevationEnd: elevations[order + 1] ?? value,
    kindLabel: '직선',
  }))
}

describe('R2 — 절대 단위를 만들지 않는다', () => {
  it('상대 스케일 0~1로 정규화한다', () => {
    const model = buildProfileModel({ segments: segmentsOf([0, -45.3, 5, 0]) })
    const values = model.points.map((point) => point.elevationRelative)
    expect(Math.min(...values)).toBe(0)
    expect(Math.max(...values)).toBe(1)
    // 원래 값이 아니라 비율이어야 한다 — −45.3이 그대로 남으면 절대 단위 노출이다
    expect(values).not.toContain(-45.3)
  })

  it('평평한 트랙은 한가운데 그린다 — 0으로 나누지 않는다', () => {
    const model = buildProfileModel({ segments: segmentsOf([3, 3, 3]) })
    expect(model.scale.span).toBe(0)
    expect(model.points.every((point) => point.elevationRelative === 0.5)).toBe(true)
  })

  it('세그먼트가 없으면 빈 모델이다', () => {
    expect(buildProfileModel({ segments: [] }).points).toEqual([])
  })
})

describe('TC-012-3 — 끊긴 지점 이후는 도달 불가로 내려간다', () => {
  it('reachableCount 뒤의 표본만 failed다', () => {
    const model = buildProfileModel({ segments: segmentsOf([0, 1, 2, 3, 4]), reachableCount: 3 })
    expect(model.points.map((point) => point.failed === true)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ])
  })

  it('실패 구간을 가리키면 스크럽 대상이 없다 — 1차 방어', () => {
    const model = buildProfileModel({ segments: segmentsOf([0, 1, 2, 3]), reachableCount: 2 })
    expect(pointAtRatio(0, model.points)?.index).toBe(0)
    expect(pointAtRatio(1, model.points)).toBeNull()
  })

  it('화살표는 실패 경계에서 멈춘다 — 건너뛰지 않는다', () => {
    const model = buildProfileModel({ segments: segmentsOf([0, 1, 2, 3]), reachableCount: 2 })
    expect(clampToReachable(3, model.points)).toBe(1)
    expect(clampToReachable(-5, model.points)).toBe(0)
  })

  it('실패가 없으면 마지막까지 간다', () => {
    const model = buildProfileModel({ segments: segmentsOf([0, 1, 2, 3]) })
    expect(clampToReachable(99, model.points)).toBe(3)
  })
})

describe('TC-012-5 — 폐합 실패는 양 끝단 불연속으로 드러난다', () => {
  it('절대 고도 차이를 같은 스케일로 정규화한다', () => {
    const model = buildProfileModel({
      segments: segmentsOf([0, 50, 100]),
      closureGapAbsolute: 25,
    })
    // span=100이므로 25는 그래프 높이의 4분의 1이다
    expect(model.closureGapRelative).toBeCloseTo(0.25, 10)
  })

  it('폐합됐으면 불연속이 없다', () => {
    expect(buildProfileModel({ segments: segmentsOf([0, 1]) }).closureGapRelative).toBeNull()
    expect(
      buildProfileModel({ segments: segmentsOf([0, 1]), closureGapAbsolute: null })
        .closureGapRelative,
    ).toBeNull()
  })

  it('보정해서 이어붙이지 않는다 — 값을 그대로 남긴다', () => {
    const model = buildProfileModel({
      segments: segmentsOf([0, 100]),
      closureGapAbsolute: -40,
    })
    expect(model.closureGapRelative).toBeCloseTo(-0.4, 10)
  })
})

describe('y축 눈금은 nice number 4~6개다', () => {
  it('기본 5개가 0~1을 균등 분할한다', () => {
    expect(axisTicks()).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('개수를 바꿔도 양 끝을 포함한다', () => {
    const ticks = axisTicks(4)
    expect(ticks).toHaveLength(4)
    expect(ticks[0]).toBe(0)
    expect(ticks[3]).toBe(1)
  })
})
