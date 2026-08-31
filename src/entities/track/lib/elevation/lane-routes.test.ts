// FEAT-018 · D-049 — 레인보우 체인저의 명시 경로. 값의 정본은 piece-geometry.md §레인보우 체인저
// (도면 픽셀 실측)이며 여기서는 그 값이 코드에 그대로 옮겨졌는지와 배치 계약·순환을 잰다.
import { describe, expect, it } from 'vitest'

import type { ParsedPiece } from '../../model/types'
import { lookupPieceOffsets } from '../parse/piece-catalog'
import { laneRoutesOf } from './lane-routes'
import { buildPiecePath } from './piece-path'
import type { OrientedPiece, Point } from './types'

const LANE_PITCH = 12
const OUTER_CENTER = { x: 15, y: 0 }
const INNER_CENTER = { x: -51.5, y: 12 }

function rotate(point: Point, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

/** 파서와 같은 좌표 계약으로 끝점을 계산한 피스 */
function pieceOf(pieceClass: string, x = 0, y = 0, angleDeg = 0): ParsedPiece {
  const offsets = lookupPieceOffsets(pieceClass)
  if (offsets === undefined) throw new Error(`${pieceClass} 카탈로그 없음`)
  const v1 = rotate(offsets.vertex1, angleDeg)
  const v2 = rotate(offsets.vertex2, angleDeg)
  return {
    pieceId: 'L',
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

function oriented(piece: ParsedPiece, flipped = false): OrientedPiece {
  return { piece, flipped }
}

/**
 * 진행 방향 기준 레인 자리(0 = 왼쪽). `lane-model`의 가로 위치 규약(법선 `(−sin θ, cos θ)`,
 * 자리 = −12/0/+12)을 편집기 좌표에서 그대로 푼 것이다.
 */
function slotOf(point: Point, center: Point, headingRad: number): number {
  const nx = -Math.sin(headingRad)
  const ny = Math.cos(headingRad)
  const lateral = (point.x - center.x) * nx + (point.y - center.y) * ny
  return Math.round(lateral / LANE_PITCH) + 1
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('TC-018-7 — Lan2 중심선은 큰 U턴 r=54 경로다', () => {
  it('길이가 105 + 54π + 105이고 두 끝이 카탈로그 끝점과 일치한다', () => {
    const piece = pieceOf('Lan2')
    const path = buildPiecePath(oriented(piece))

    expect(path.length).toBeCloseTo(105 + 54 * Math.PI + 105, 6)
    expect(distance(path.pointAt(0), piece.vertex1)).toBeLessThan(1e-9)
    expect(distance(path.pointAt(1), piece.vertex2)).toBeLessThan(1e-9)
    // 반원의 꼭짓점 — 중심 (15,0)에서 오른쪽으로 54
    const apex = path.pointAt(0.5)
    expect(apex.x).toBeCloseTo(OUTER_CENTER.x + 54, 6)
    expect(apex.y).toBeCloseTo(0, 6)
  })

  it('회전·이동한 피스에서도 끝점이 배치 계약과 맞물린다', () => {
    const piece = pieceOf('Lan2', 400.02, 408.461, 90)
    const path = buildPiecePath(oriented(piece))
    expect(distance(path.pointAt(0), piece.vertex1)).toBeLessThan(1e-9)
    expect(distance(path.pointAt(1), piece.vertex2)).toBeLessThan(1e-9)
  })

  it('명시 모델이 없는 피스는 종전 경로다(Lan1은 직선 현)', () => {
    const lan1 = pieceOf('Lan1')
    expect(laneRoutesOf(oriented(lan1))).toBeUndefined()
    expect(buildPiecePath(oriented(lan1)).length).toBeCloseTo(162, 9)
  })
})

describe('TC-018-1 — 세 레인의 진입·진출 자리와 한 칸 순환', () => {
  it('진입은 vertex1 기준 −12/0/+12, 진출 자리는 (j+1) mod 3이다', () => {
    const piece = pieceOf('Lan2')
    const routes = laneRoutesOf(oriented(piece))
    expect(routes).toHaveLength(3)

    routes!.forEach((route, lane) => {
      const entry = route.pointAt(0)
      const exit = route.pointAt(1)
      // 진입 팔 진행 방향 +x, 진출 팔 진행 방향 −x
      expect(entry.x).toBeCloseTo(piece.vertex1.x, 9)
      expect(slotOf(entry, piece.vertex1, 0)).toBe(lane)
      expect(exit.x).toBeCloseTo(piece.vertex2.x, 9)
      expect(slotOf(exit, piece.vertex2, Math.PI)).toBe((lane + 1) % 3)
    })
  })

  it('회전한 피스는 진입점이 배치 계약대로 옮겨진다', () => {
    const routes = laneRoutesOf(oriented(pieceOf('Lan2', 100, 200, 90)))
    // rotate((-90,-66), 90°) = (66, -90) → (166, 110)
    const entry = routes![0]!.pointAt(0)
    expect(entry.x).toBeCloseTo(166, 9)
    expect(entry.y).toBeCloseTo(110, 9)
  })
})

describe('TC-018-2 — U턴 중심·반지름이 도면 실측과 같다', () => {
  it('레인 0·1은 중심 (15,0)에서 54·42, 레인 2는 중심 (−51.5,12)에서 54', () => {
    const routes = laneRoutesOf(oriented(pieceOf('Lan2')))!
    expect(distance(routes[0]!.pointAt(0.5), OUTER_CENTER)).toBeCloseTo(54, 6)
    expect(distance(routes[1]!.pointAt(0.5), OUTER_CENTER)).toBeCloseTo(42, 6)
    expect(distance(routes[2]!.pointAt(0.5), INNER_CENTER)).toBeCloseTo(54, 6)
  })

  it('레인 0·1은 x∈[−28,8]에서 12cm 안쪽으로 직선 이동한다 — 앞뒤는 평행', () => {
    const routes = laneRoutesOf(oriented(pieceOf('Lan2')))!
    const lane0 = routes[0]!
    // 이동 구간 앞(x=−60)과 뒤(x=12)의 y를 t 탐색으로 얻는다
    const yAtX = (targetX: number): number => {
      let best = { x: 0, y: 0 }
      for (let step = 0; step <= 2000; step += 1) {
        const p = lane0.pointAt(step / 2000)
        if (Math.abs(p.x - targetX) < Math.abs(best.x - targetX) && p.y < 0) best = p
      }
      return best.y
    }
    expect(yAtX(-60)).toBeCloseTo(-66, 1)
    expect(yAtX(12)).toBeCloseTo(-54, 1)
    expect(yAtX(-10)).toBeCloseTo(-60, 1) // 구간 중앙 — 직선이면 정확히 반
  })
})

describe('TC-018-8 — 레인 2는 뱅크와 뱅크 사이 구간과 같은 판 모델로 오른다', () => {
  const GRADIENT = Math.tan((20 * Math.PI) / 180)
  const D_IN = 38.5 // 진입 전이의 판축 거리 = 진입 직선 길이
  const LIFT = D_IN / 2

  it('전이 g(d)=gradient·dEnd/2·(d/dEnd)² → 판 gradient·(d − lift), 꼭짓점 ≈ 26.7cm, 대칭', () => {
    const routes = laneRoutesOf(oriented(pieceOf('Lan2')))!
    const lane2 = routes[2]!
    const arc = 54 * Math.PI
    const length = 38.5 * 2 + arc
    const at = (s: number) => lane2.riseAt(s / length)

    expect(at(0)).toBe(0)
    // 전이 중앙(d = 19.25): k = 1 → gradient·(38.5/2)·0.25
    expect(at(D_IN / 2)).toBeCloseTo(GRADIENT * (D_IN / 2) * 0.25, 6)
    // 원호 시작(d = 38.5): 전이 끝 = 판 시작 = gradient·(38.5 − 19.25)
    expect(at(D_IN)).toBeCloseTo(GRADIENT * (D_IN - LIFT), 6)
    // 꼭짓점(d = 38.5 + 54)
    expect(at(D_IN + arc / 2)).toBeCloseTo(GRADIENT * (D_IN + 54 - LIFT), 6)
    expect(at(D_IN + arc / 2)).toBeCloseTo(26.66, 1)
    // 원호 끝과 진출 전이 — 대칭
    expect(at(D_IN + arc)).toBeCloseTo(at(D_IN), 6)
    expect(at(length - D_IN / 2)).toBeCloseTo(at(D_IN / 2), 6)
    expect(at(length)).toBeCloseTo(0, 9)

    expect(routes[0]!.riseAt(0.5)).toBe(0)
    expect(routes[1]!.riseAt(0.5)).toBe(0)
  })

  it('기울기가 이음새(전이↔판)와 꼭짓점에서 연속이다 — 꺾임이 없다', () => {
    const lane2 = laneRoutesOf(oriented(pieceOf('Lan2')))![2]!
    const length = 38.5 * 2 + 54 * Math.PI
    const slope = (s: number) => (lane2.riseAt((s + 0.05) / length) - lane2.riseAt((s - 0.05) / length)) / 0.1
    // 전이 끝 = 판 기울기(진입 팔 방향으로 달리므로 d 증가율 1)
    expect(slope(D_IN - 0.5)).toBeCloseTo(GRADIENT, 2)
    expect(slope(D_IN + 0.5)).toBeCloseTo(GRADIENT, 2)
    // 꼭짓점에서 0(코사인 마루) — 선형 산이면 ±gradient로 뛴다
    expect(Math.abs(slope(D_IN + (54 * Math.PI) / 2))).toBeLessThan(0.01)
    // 진입에서 0(평지와 접선 연속)
    expect(Math.abs(slope(0.5))).toBeLessThan(0.02)
  })

  it('뒤집힌 주행에서도 같은 자리에서 같은 높이다', () => {
    const piece = pieceOf('Lan2')
    const forward = laneRoutesOf(oriented(piece))![2]!
    const backward = laneRoutesOf(oriented(piece, true))![2]!
    for (const t of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      expect(backward.riseAt(t)).toBeCloseTo(forward.riseAt(1 - t), 9)
    }
  })
})

describe('TC-018-3 — 뒤집힌 주행도 같은 형상이고 순환은 한 칸이다', () => {
  it('레인 j는 경로 (4−j) mod 3을 역방향으로 타고 진출 자리가 (j+1) mod 3이다', () => {
    const piece = pieceOf('Lan2')
    const forward = laneRoutesOf(oriented(piece))!
    const backward = laneRoutesOf(oriented(piece, true))!

    backward.forEach((route, lane) => {
      const source = forward[(4 - lane) % 3]!
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        expect(distance(route.pointAt(t), source.pointAt(1 - t))).toBeLessThan(1e-9)
      }
      expect(route.length).toBeCloseTo(source.length, 9)
      // 뒤집힌 주행은 vertex2 팔로 들어와(+x) vertex1 팔로 나간다(−x)
      expect(slotOf(route.pointAt(0), piece.vertex2, 0)).toBe(lane)
      expect(slotOf(route.pointAt(1), piece.vertex1, Math.PI)).toBe((lane + 1) % 3)
    })
  })
})
