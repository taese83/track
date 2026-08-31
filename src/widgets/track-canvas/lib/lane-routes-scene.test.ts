// FEAT-018 · D-049 — 레인보우 체인저가 씬에서 레인 면·추종 카메라·바운딩박스로 이어지는가.
// 참조 트랙(WS67Y2)에는 Lan2가 없으므로 직선–Lan2–직선의 합성 배치로 잰다.
import { describe, expect, it } from 'vitest'

import { buildElevatedSegments, orientPath } from '@/entities/track/lib/elevation'
import { lookupPieceOffsets } from '@/entities/track/lib/parse/piece-catalog'
import type { ParsedPiece } from '@/entities/track/model/types'

import { buildFlythroughPath } from './flythrough-camera'
import { boundaryLinesOf, buildLaneBands } from './lane-bands'
import type { BandPoint } from './lane-bands'
import { LANE_COUNT, LANE_PITCH_CM } from './lane-model'
import { buildSceneLayout } from './scene-layout'

function rotate(point: { x: number; y: number }, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

function pieceOf(pieceId: string, pieceClass: string, x: number, y: number, angleDeg: number): ParsedPiece {
  const offsets = lookupPieceOffsets(pieceClass)!
  const v1 = rotate(offsets.vertex1, angleDeg)
  const v2 = rotate(offsets.vertex2, angleDeg)
  return {
    pieceId,
    pieceClass,
    x,
    y,
    angleDeg,
    colorIndex: 0,
    vertex1: { x: x + v1.x, y: y + v1.y },
    vertex2: { x: x + v2.x, y: y + v2.y },
    isSupported: true,
  }
}

/** 직선(−x 쪽) → Lan2(원점, 각도 0) → 직선. 두 번째 직선은 진출 팔에서 −x로 달린다(뒤집힘) */
function layoutOf() {
  const pieces = [
    pieceOf('a', 'Str1', -117, -54, 0),
    pieceOf('l', 'Lan2', 0, 0, 0),
    pieceOf('b', 'Str1', -117, 54, 0),
  ]
  const oriented = orientPath(pieces)
  const elevated = buildElevatedSegments(oriented).segments
  const layout = buildSceneLayout({ oriented, elevated, truncated: false })
  return { oriented, elevated, layout }
}

function gap(a: BandPoint, b: BandPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

describe('TC-018-4 — Lan2의 레인 면', () => {
  const { layout } = layoutOf()
  const bands = buildLaneBands(layout.segments)
  const lan2 = bands[1]!

  it('레인 3개가 따로 놓이고 경계선이 6줄이다', () => {
    expect(layout.segments[1]!.lanePaths).toHaveLength(LANE_COUNT)
    expect(lan2.separated).toBe(true)
    expect(lan2.lanes).toHaveLength(LANE_COUNT)
    expect(boundaryLinesOf(lan2)).toHaveLength(LANE_COUNT * 2)
    // 직선은 종전대로 4줄
    expect(bands[0]!.separated).toBe(false)
    expect(boundaryLinesOf(bands[0]!)).toHaveLength(LANE_COUNT + 1)
  })

  it('레인마다 폭이 12cm이고, 레인 0·1은 평면에서 겹치지 않으며, 레인 2는 그 둘을 8cm 육교로 넘는다', () => {
    const paths = layout.segments[1]!.lanePaths!
    for (const lane of lan2.lanes) {
      lane.lo.forEach((lo, at) => expect(gap(lo, lane.hi[at]!)).toBeCloseTo(LANE_PITCH_CM, 6))
    }

    // 안쪽 이동 구간(기울기 12/36)에서 두 레인은 **수직으로** 12 떨어진 평행 사선이라 수직
    // 거리는 12·cos(atan(1/3)) ≈ 11.38이다 — 도면이 그렇게 그려져 있고(경계선 하나를 공유)
    // 그 밖의 구간은 12 이상이다.
    const diagonalPitch = LANE_PITCH_CM * Math.cos(Math.atan(12 / 36))
    let closest01 = Number.POSITIVE_INFINITY
    for (const p of paths[0]!) for (const q of paths[1]!) closest01 = Math.min(closest01, Math.hypot(p.x - q.x, p.z - q.z))
    expect(closest01).toBeGreaterThanOrEqual(diagonalPitch - 1e-6)

    // 레인 2가 레인 0·1 위를 지나는 곳(평면 거리 < 12)에서는 항상 8cm 위에 있다(TC-018-8)
    let crossings = 0
    for (const p of paths[2]!) {
      for (const q of [...paths[0]!, ...paths[1]!]) {
        if (Math.hypot(p.x - q.x, p.z - q.z) >= LANE_PITCH_CM) continue
        crossings += 1
        expect(p.y - q.y).toBeGreaterThanOrEqual(8 - 1e-6)
      }
    }
    // 양 끝은 평지로 돌아온다 — 이웃 직선과 같은 높이
    expect(paths[2]![0]!.y).toBeCloseTo(0, 9)
    expect(paths[2]![paths[2]!.length - 1]!.y).toBeCloseTo(0, 9)
    expect(Math.max(...paths[2]!.map((s) => s.y))).toBeCloseTo(8, 9)
    expect(Math.max(...paths[0]!.map((s) => s.y), ...paths[1]!.map((s) => s.y))).toBe(0)
    console.log(`TC-018-4 레인0·1 최근접 ${closest01.toFixed(3)}cm · 레인2 교차 표본쌍 ${crossings}`)
    expect(crossings).toBeGreaterThan(0)
  })

  it('진입 이음새에서 앞 직선의 레인 j가 Lan2의 레인 j로, 진출 이음새에서 레인 j가 다음 직선의 레인 (j+1)%3으로 이어진다', () => {
    const before = bands[0]!
    const after = bands[2]!
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const enter = lan2.lanes[lane]!
      const from = before.lanes[lane]!
      expect(gap(from.lo[from.lo.length - 1]!, enter.lo[0]!)).toBeLessThan(1e-6)
      expect(gap(from.hi[from.hi.length - 1]!, enter.hi[0]!)).toBeLessThan(1e-6)

      const to = after.lanes[(lane + 1) % LANE_COUNT]!
      // 진출 팔에서 진행 방향이 반대라 좌·우가 서로 바뀌지 않는다 — 둘 다 진행 기준 왼쪽이다
      expect(gap(enter.lo[enter.lo.length - 1]!, to.lo[0]!)).toBeLessThan(1e-6)
      expect(gap(enter.hi[enter.hi.length - 1]!, to.hi[0]!)).toBeLessThan(1e-6)
    }
  })
})

describe('TC-018-5 — 추종 카메라는 자기 레인의 명시 경로를 탄다', () => {
  const { layout, elevated } = layoutOf()

  it('레인 2에서 출발하면 작은 U턴 꼭짓점 (2.5, 12)를 지나고 통과 뒤 레인이 0이다', () => {
    const path = buildFlythroughPath({ segments: layout.segments, elevated, startLane: 2 })
    const inside = path.waypoints.filter((w) => w.order === 1)
    const nearest = Math.min(...inside.map((w) => Math.hypot(w.x - 2.5, w.z - 12)))
    const spacing = layout.segments[1]!.lanePaths![2]!.length
    console.log(`TC-018-5 레인2 꼭짓점 최근접 ${nearest.toFixed(3)}cm · 표본 ${spacing}`)
    expect(nearest).toBeLessThan(10)
    expect(inside[0]!.lane).toBe(2)
    expect(path.waypoints.find((w) => w.order === 2)!.lane).toBe(0)
  })

  it('가운데 레인(기본)에서 출발하면 큰 U턴 r=42 꼭짓점 (57, 0)을 지난다', () => {
    const path = buildFlythroughPath({ segments: layout.segments, elevated })
    const inside = path.waypoints.filter((w) => w.order === 1)
    const nearest = Math.min(...inside.map((w) => Math.hypot(w.x - 57, w.z - 0)))
    expect(nearest).toBeLessThan(10)
  })

  it('이음새와 Lan2 안에서 카메라 경로가 끊기지 않는다(표본 간 거리가 레인 표본 간격의 2배 이내)', () => {
    const path = buildFlythroughPath({ segments: layout.segments, elevated, startLane: 2 })
    const spacing = layout.segments[1]!.lanePaths![2]!.length
    const routeLength = 38.5 * 2 + 54 * Math.PI
    const limit = (2 * routeLength) / (spacing - 1)
    let worst = 0
    for (let index = 1; index < path.waypoints.length; index += 1) {
      const a = path.waypoints[index - 1]!
      const b = path.waypoints[index]!
      // 직선 피스의 표본은 2개(54cm 간격)라 이 검사의 대상이 아니다 — Lan2 안만 본다.
      // 이음새 연속은 TC-018-4의 레인 면 이음새 검사가 잰다(중복 점은 카메라가 걷어낸다).
      if (a.order !== 1 || b.order !== 1) continue
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))
    }
    console.log(`TC-018-5 Lan2 구간 카메라 최대 표본 간격 ${worst.toFixed(2)}cm (상한 ${limit.toFixed(2)})`)
    expect(worst).toBeLessThan(limit)
  })
})

describe('TC-018-9 — 반원이 매끄럽다(표본 3cm 간격, 꺾임 5° 미만)', () => {
  it('인접 표본 간격이 3cm 이하이고 원호 구간의 꺾임각이 5° 미만이다', () => {
    const { layout } = layoutOf()
    let worstStep = 0
    let worstTurnDeg = 0
    for (const route of layout.segments[1]!.lanePaths!) {
      for (let index = 1; index < route.length; index += 1) {
        const a = route[index - 1]!
        const b = route[index]!
        worstStep = Math.max(worstStep, Math.hypot(a.x - b.x, a.z - b.z))
        const c = route[index + 1]
        if (c === undefined) continue
        const h1 = Math.atan2(b.z - a.z, b.x - a.x)
        const h2 = Math.atan2(c.z - b.z, c.x - b.x)
        let turn = Math.abs(h2 - h1)
        if (turn > Math.PI) turn = 2 * Math.PI - turn
        // 이동 구간의 각진 꺾임(atan(1/3) ≈ 18.4°, D-036 ②)은 의도다 — 원호(중심에서 반지름 거리)만 본다
        const onOuterArc = Math.abs(Math.hypot(b.x - 15, b.z) - 54) < 0.5 || Math.abs(Math.hypot(b.x - 15, b.z) - 42) < 0.5
        const onInnerArc = Math.abs(Math.hypot(b.x + 51.5, b.z - 12) - 54) < 0.5
        if ((onOuterArc || onInnerArc) && b.x > 16) worstTurnDeg = Math.max(worstTurnDeg, (turn * 180) / Math.PI)
      }
    }
    console.log(`TC-018-9 표본 최대 간격 ${worstStep.toFixed(2)}cm · 원호 최대 꺾임 ${worstTurnDeg.toFixed(2)}°`)
    expect(worstStep).toBeLessThanOrEqual(3.1)
    expect(worstTurnDeg).toBeLessThan(5)
    expect(worstTurnDeg).toBeGreaterThan(0)
  })
})

describe('TC-018-6 — 바운딩박스가 큰 U턴을 포함한다', () => {
  it('레인 0 중심선의 꼭짓점 (69, 0)·레인 2의 진출 자리·육교 높이가 상자 안이다', () => {
    const { layout } = layoutOf()
    // 표본이 θ=0에 정확히 놓이지 않으므로 표본 간격(≈8cm)만큼의 여유를 둔다
    expect(layout.bounds.max.x).toBeGreaterThanOrEqual(15 + 54 - 1)
    expect(layout.bounds.max.z).toBeGreaterThanOrEqual(66 - 1e-6)
    expect(layout.bounds.min.z).toBeLessThanOrEqual(-66 + 1e-6)
    expect(layout.bounds.max.y).toBeCloseTo(8, 9)
  })
})
