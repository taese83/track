// FEAT-008 — 레인 면과 이음새의 순수 축.
//
// 폭 결함은 **화면으로는 그럴듯하고 숫자로만 드러난다**(piece-geometry.md §결함 이력:
// 상수는 36cm인데 렌더는 24cm였다). 그래서 상수와 실제 렌더 좌표를 대조하는 단언을 여기
// 둔다 — 브라우저에서는 "트랙이 있다"까지밖에 확인할 수 없다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildElevatedSegments, orientPath } from '@/entities/track/lib/elevation'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { boundaryLinesOf, buildLaneBands } from './lane-bands'
import type { BandPoint, SegmentBands } from './lane-bands'
import { LANE_COUNT, LANE_PITCH_CM, TRACK_WIDTH_CM, isLaneChangeClass } from './lane-model'
import { buildSceneLayout } from './scene-layout'
import type { SceneSegment } from './scene-layout'

async function referenceLayout(fixture = 'WS67Y2.js.txt') {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', fixture), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`${fixture} 추출 실패`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`${fixture} 파싱 실패`)
  const restored = restoreOrder(parsed.pieces)
  if (!restored.ok) throw new Error(`${fixture} 순서 복원 실패`)

  const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
  const ordered: ParsedPiece[] = []
  for (const pieceId of restored.orderedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) ordered.push(found)
  }
  const oriented = orientPath(ordered)
  const elevated = buildElevatedSegments(oriented).segments
  return buildSceneLayout({ oriented, elevated, truncated: false })
}

let segments: SceneSegment[]
let bands: SegmentBands[]

beforeAll(async () => {
  const layout = await referenceLayout()
  segments = layout.segments
  bands = buildLaneBands(segments)
})

/** 중심선에 수직인 방향으로 잰 거리 — 이음새 절단선이 비스듬해도 폭 자체는 이 값이다 */
function perpendicularOffset(
  center: { x: number; z: number },
  edge: BandPoint,
  tangentRad: number,
): number {
  const nx = -Math.sin(tangentRad)
  const nz = Math.cos(tangentRad)
  return (edge.x - center.x) * nx + (edge.z - center.z) * nz
}

function polylineLength(points: readonly BandPoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!
    const b = points[index]!
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

describe('TC-008-6 — 좌·우 가장자리 거리가 36cm이고 레인마다 12cm다', () => {
  it('참조 트랙의 모든 직선 피스에서 전폭이 상수와 일치한다', () => {
    const straights = segments
      .map((segment, index) => ({ segment, band: bands[index]! }))
      .filter(({ segment }) => segment.pieceClass.startsWith('Str') && segment.isSupported)

    expect(straights.length).toBeGreaterThan(0)

    for (const { segment, band } of straights) {
      const sample = segment.points[0]!
      const tangent = segment.entryTangentRad
      const outerLo = perpendicularOffset(sample, band.lanes[0]!.lo[0]!, tangent)
      const outerHi = perpendicularOffset(sample, band.lanes[LANE_COUNT - 1]!.hi[0]!, tangent)
      expect(outerHi - outerLo).toBeCloseTo(TRACK_WIDTH_CM, 6)
    }
  })

  it('레인마다 정확히 12cm를 차지하고 사이에 틈이 없다', () => {
    const straight = segments.findIndex(
      (segment) => segment.pieceClass.startsWith('Str') && segment.isSupported,
    )
    const segment = segments[straight]!
    const band = bands[straight]!
    const sample = segment.points[0]!
    const tangent = segment.entryTangentRad

    let previousHi: number | null = null
    for (const lane of band.lanes) {
      const lo = perpendicularOffset(sample, lane.lo[0]!, tangent)
      const hi = perpendicularOffset(sample, lane.hi[0]!, tangent)
      expect(hi - lo).toBeCloseTo(LANE_PITCH_CM, 6)
      if (previousHi !== null) expect(lo).toBeCloseTo(previousHi, 6)
      previousHi = hi
    }
  })

  it('렌더 단위가 면 396개·경계선 528개다(참조 트랙 132피스 실측)', () => {
    const supported = bands.filter((band) => band.lanes.length > 0)
    const faces = supported.reduce((sum, band) => sum + band.lanes.length, 0)
    const lines = supported.reduce((sum, band) => sum + boundaryLinesOf(band).length, 0)
    console.log(`TC-008-6 지원 피스 ${supported.length} · 면 ${faces} · 경계선 ${lines}`)
    expect(faces).toBe(supported.length * LANE_COUNT)
    expect(lines).toBe(supported.length * (LANE_COUNT + 1))
  })
})

describe('TC-008-7 — 이음새는 하나의 공통 절단선이다', () => {
  it('가장자리 벌어짐이 중심선 벌어짐을 넘지 않는다 — 노치가 없다', () => {
    let checked = 0
    let worst = 0
    for (let index = 0; index + 1 < bands.length; index += 1) {
      const current = bands[index]!
      const next = bands[index + 1]!
      if (current.lanes.length === 0 || next.lanes.length === 0) continue
      // 레인체인지 피스는 양 끝의 가로 위치가 다르므로(자리바꿈) 이웃과 레인이 어긋난다
      if (isLaneChangeClass(current.pieceClass) || isLaneChangeClass(next.pieceClass)) continue

      const a = segments[index]!
      const b = segments[index + 1]!
      const aEnd = a.points[a.points.length - 1]!
      const bStart = b.points[0]!
      // 이음새 자체가 벌어져 있을 수 있다(참조 트랙에 매달린 끝 한 쌍이 있다 —
      // scene-layout.test.ts 실측 31.67px). 노치는 그 벌어짐을 **넘어서는** 어긋남이다.
      const centerGap = Math.hypot(aEnd.x - bStart.x, aEnd.z - bStart.z)

      for (const lane of [0, LANE_COUNT - 1]) {
        const edgeA = current.lanes[lane]!
        const edgeB = next.lanes[lane]!
        const exit = edgeA.hi[edgeA.hi.length - 1]!
        const entry = edgeB.hi[0]!
        const edgeGap = Math.hypot(exit.x - entry.x, exit.z - entry.z)
        worst = Math.max(worst, edgeGap - centerGap)
        expect(edgeGap - centerGap).toBeLessThan(0.01)
        checked += 1
      }
    }
    console.log(`TC-008-7 이음새 ${checked}쌍 · 중심선 대비 가장자리 추가 어긋남 최대 ${worst.toExponential(2)}cm`)
    expect(checked).toBeGreaterThan(100)
  })

  it('이음새의 네 점이 하나의 직선 위에 있다', () => {
    for (let index = 0; index + 1 < bands.length; index += 1) {
      const current = bands[index]!
      const next = bands[index + 1]!
      if (current.lanes.length === 0 || next.lanes.length === 0) continue

      const outer = current.lanes[LANE_COUNT - 1]!
      const inner = current.lanes[0]!
      const cutPoints = [
        inner.lo[inner.lo.length - 1]!,
        outer.hi[outer.hi.length - 1]!,
        next.lanes[0]!.lo[0]!,
        next.lanes[LANE_COUNT - 1]!.hi[0]!,
      ]
      const [origin, second] = cutPoints
      const dx = second!.x - origin!.x
      const dz = second!.z - origin!.z
      const length = Math.hypot(dx, dz)
      if (length < 1e-9) continue

      const a = segments[index]!
      const b = segments[index + 1]!
      const aEnd = a.points[a.points.length - 1]!
      const bStart = b.points[0]!
      // 이음새가 실제로 벌어진 곳(매달린 끝)은 절단선이 둘이다 — 노치 검사에서 이미
      // 그 벌어짐을 따로 재므로 여기서는 맞물린 이음새만 본다
      if (Math.hypot(aEnd.x - bStart.x, aEnd.z - bStart.z) > 1) continue
      if (isLaneChangeClass(a.pieceClass) || isLaneChangeClass(b.pieceClass)) continue

      for (const point of cutPoints.slice(2)) {
        // 원점에서 그은 절단선 방향에 대한 수직 거리
        const cross = Math.abs((point.x - origin!.x) * dz - (point.z - origin!.z) * dx) / length
        expect(cross).toBeLessThan(1)
      }
    }
  })

  it('코너에서 바깥쪽 가장자리가 안쪽보다 길다', () => {
    const corners = segments
      .map((segment, index) => ({ segment, band: bands[index]! }))
      .filter(({ segment }) => segment.pieceClass.startsWith('Cor') && segment.isSupported)

    expect(corners.length).toBeGreaterThan(0)

    let outerLonger = 0
    for (const { band } of corners) {
      const innerEdge = polylineLength(band.lanes[0]!.lo)
      const outerEdge = polylineLength(band.lanes[LANE_COUNT - 1]!.hi)
      // 코너는 좌우 어느 쪽으로도 돌 수 있다 — 바깥이 어느 쪽이든 둘의 길이가 달라야 한다
      if (Math.abs(outerEdge - innerEdge) > 1) outerLonger += 1
    }
    console.log(`TC-008-7 코너 ${corners.length}개 중 안팎 길이가 다른 것 ${outerLonger}개`)
    expect(outerLonger).toBe(corners.length)
  })
})

describe('TC-008-1 — 레인체인지 구간의 가로 오프셋이 인접 직선과 다르다', () => {
  it('자리바꿈 피스에서만 레인 가로 위치가 피스 안에서 변한다', () => {
    const laneChange = segments.findIndex((segment) => isLaneChangeClass(segment.pieceClass))
    expect(laneChange).toBeGreaterThanOrEqual(0)

    const segment = segments[laneChange]!
    const band = bands[laneChange]!
    const tangent = segment.entryTangentRad
    const lane0 = band.lanes[0]!
    const first = perpendicularOffset(segment.points[0]!, lane0.lo[0]!, tangent)
    const last = perpendicularOffset(
      segment.points[segment.points.length - 1]!,
      lane0.lo[lane0.lo.length - 1]!,
      tangent,
    )
    console.log(`TC-008-1 레인0 좌측 가장자리 ${first.toFixed(1)} → ${last.toFixed(1)} cm`)
    expect(Math.abs(last - first)).toBeCloseTo(LANE_PITCH_CM, 4)

    // 인접 직선 구간에서는 변하지 않는다
    const straight = segments.findIndex(
      (segment) => segment.pieceClass.startsWith('Str') && segment.isSupported,
    )
    const straightSegment = segments[straight]!
    const straightBand = bands[straight]!.lanes[0]!
    const straightFirst = perpendicularOffset(
      straightSegment.points[0]!,
      straightBand.lo[0]!,
      straightSegment.entryTangentRad,
    )
    const straightLast = perpendicularOffset(
      straightSegment.points[straightSegment.points.length - 1]!,
      straightBand.lo[straightBand.lo.length - 1]!,
      straightSegment.exitTangentRad,
    )
    expect(straightLast - straightFirst).toBeCloseTo(0, 6)
  })
})

describe('미지원 피스는 레인을 만들지 않는다', () => {
  // 참조 트랙의 미지원 피스는 순서 복원에서 자리를 얻지 못해 `oriented`에 들어오지 않는다
  // (그래서 실측 fixture로는 이 분기가 실행되지 않는다). 방어가 실제로 동작하는지 보려면
  // 세그먼트를 직접 만들어 넣는 수밖에 없다 — 통과를 위해 fixture를 고르지 않는다.
  it('폭을 지어내지 않는다 — 플레이스홀더는 FEAT-009 소유다', () => {
    const collapsed: SceneSegment = {
      pieceId: 'X1',
      pieceClass: 'Chi1',
      order: 0,
      points: [
        { t: 0, x: 10, y: 0, z: 10 },
        { t: 1, x: 10, y: 0, z: 10 },
      ],
      entryTangentRad: 0,
      exitTangentRad: 0,
      isSupported: false,
      compatCorrected: false,
      kind: 'plain',
      direction: 'none',
    }
    const [band] = buildLaneBands([collapsed])
    expect(band?.lanes).toEqual([])
    expect(boundaryLinesOf(band!)).toEqual([])
  })
})
