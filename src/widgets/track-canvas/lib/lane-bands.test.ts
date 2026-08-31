// FEAT-008 — 레인 면과 이음새의 순수 축.
//
// 폭 결함은 **화면으로는 그럴듯하고 숫자로만 드러난다**(piece-geometry.md §결함 이력:
// 상수는 36cm인데 렌더는 24cm였다). 그래서 상수와 실제 렌더 좌표를 대조하는 단언을 여기
// 둔다 — 브라우저에서는 "트랙이 있다"까지밖에 확인할 수 없다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildElevatedSegments, orientPath } from '@/entities/track/lib/elevation'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
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
  return { ...buildSceneLayout({ oriented, elevated, truncated: false }), elevated }
}

let segments: SceneSegment[]
let bands: SegmentBands[]
let elevated: ElevatedSegment[]

beforeAll(async () => {
  const layout = await referenceLayout()
  segments = layout.segments
  bands = buildLaneBands(segments)
  elevated = layout.elevated
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

// D-042. `build-elevation.ts`의 `BANK_ANGLE_DEG`와 같은 값이나 그 상수는 export되지 않는다
const PLATE_ANGLE_DEG = 20
const MAX_CROSS_FALL_CM = TRACK_WIDTH_CM * Math.tan((PLATE_ANGLE_DEG * Math.PI) / 180)

type Row3 = readonly [number, number, number]

function det3(r0: Row3, r1: Row3, r2: Row3): number {
  return (
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  )
}

/** 최소제곱 평면 y = a·x + b·z + c. 좌표를 평균으로 옮겨 정규방정식을 조건화한다 */
function fitPlane(points: readonly BandPoint[]) {
  const count = points.length
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / count
  const meanZ = points.reduce((sum, point) => sum + point.z, 0) / count
  let sxx = 0
  let sxz = 0
  let sx = 0
  let szz = 0
  let sz = 0
  let sxy = 0
  let szy = 0
  let sy = 0
  for (const point of points) {
    const x = point.x - meanX
    const z = point.z - meanZ
    sxx += x * x
    sxz += x * z
    sx += x
    szz += z * z
    sz += z
    sxy += x * point.y
    szy += z * point.y
    sy += point.y
  }
  const base = det3([sxx, sxz, sx], [sxz, szz, sz], [sx, sz, count])
  const a = det3([sxy, sxz, sx], [szy, szz, sz], [sy, sz, count]) / base
  const b = det3([sxx, sxy, sx], [sxz, szy, sz], [sx, sy, count]) / base
  const c = det3([sxx, sxz, sxy], [sxz, szz, szy], [sx, sz, sy]) / base

  const heightAt = (x: number, z: number) => a * (x - meanX) + b * (z - meanZ) + c
  let residual = 0
  for (const point of points) {
    residual = Math.max(residual, Math.abs(point.y - heightAt(point.x, point.z)))
  }
  const steepness = Math.hypot(a, b)
  return {
    heightAt,
    residual,
    slopeDeg: (Math.atan(steepness) * 180) / Math.PI,
    /** 판축 — 오르막 방향 단위 벡터(씬 xz). `build-elevation`의 `up`과 같은 축이다 */
    axis: steepness < 1e-12 ? { x: 1, z: 0 } : { x: a / steepness, z: b / steepness },
  }
}

function profileKindOf(order: number): string | undefined {
  return elevated[order]?.elevationProfile.kind
}

/** 노면 평면 판정에서 뺄 것: 미지원·레인체인지(육교 상승은 노면이 아니다 — D-035) */
function isSurfaceOrder(order: number): boolean {
  const segment = segments[order]
  if (segment === undefined) return false
  return (
    segment.isSupported &&
    !isLaneChangeClass(segment.pieceClass) &&
    (bands[order]?.lanes.length ?? 0) > 0
  )
}

/** 연속한 `plane` 세그먼트 묶음 = 판 하나 */
function plateGroups(): number[][] {
  const groups: number[][] = []
  let current: number[] = []
  segments.forEach((_, order) => {
    if (profileKindOf(order) === 'plane' && isSurfaceOrder(order)) current.push(order)
    else if (current.length > 0) {
      groups.push(current)
      current = []
    }
  })
  if (current.length > 0) groups.push(current)
  return groups
}

/** `neighbour`가 1이면 판으로 들어가는 전이, −1이면 판에서 나오는 전이 */
function transitionOrders(neighbour: 1 | -1): number[] {
  return segments
    .map((_, order) => order)
    .filter((order) => profileKindOf(order) === 'bankTransition')
    .filter((order) => profileKindOf(order + neighbour) === 'plane')
}

/** 노면의 좌·우 바깥 가장자리 한 쌍 */
function edgePair(order: number, at: number): { lo: BandPoint; hi: BandPoint } | undefined {
  const band = bands[order]
  const lo = band?.lanes[0]?.lo[at]
  const hi = band?.lanes[LANE_COUNT - 1]?.hi[at]
  return lo === undefined || hi === undefined ? undefined : { lo, hi }
}

function crossFallSeries(order: number): number[] {
  const segment = segments[order]
  if (segment === undefined) return []
  return segment.points.map((_, at) => {
    const pair = edgePair(order, at)
    return pair === undefined ? 0 : Math.abs(pair.hi.y - pair.lo.y)
  })
}

function surfacePointsOf(orders: readonly number[]): BandPoint[] {
  const points: BandPoint[] = []
  for (const order of orders) {
    for (const lane of bands[order]?.lanes ?? []) points.push(...lane.lo, ...lane.hi)
  }
  return points
}

describe('FEAT-017 — 판 구간의 횡경사', () => {
  it('TC-017-1: 판 세그먼트의 좌·우 가장자리 높이가 다르고 판 좌표 계산과 일치한다', () => {
    const groups = plateGroups()
    expect(groups.length).toBeGreaterThan(0)

    let worstSurface = 0
    let worstFit = 0
    let minCrossFall = Number.POSITIVE_INFINITY
    let checked = 0

    for (const group of groups) {
      const fit = fitPlane(surfacePointsOf(group))
      for (const order of group) {
        const surface = segments[order]?.surfaceHeightAt
        if (surface === undefined) throw new Error(`순서 ${order}에 노면 함수가 없다`)
        const count = segments[order]?.points.length ?? 0
        for (let at = 0; at < count; at += 1) {
          const pair = edgePair(order, at)
          if (pair === undefined) continue
          const observed = pair.hi.y - pair.lo.y
          const byPlate = surface(pair.hi.x, pair.hi.z) - surface(pair.lo.x, pair.lo.z)
          const byFit = fit.heightAt(pair.hi.x, pair.hi.z) - fit.heightAt(pair.lo.x, pair.lo.z)
          worstSurface = Math.max(worstSurface, Math.abs(observed - byPlate))
          worstFit = Math.max(worstFit, Math.abs(observed - byFit))
          minCrossFall = Math.min(minCrossFall, Math.abs(observed))
          expect(Math.abs(observed)).toBeGreaterThan(0)
          checked += 1
        }
      }
    }

    console.log(`TC-017-1 표본 ${checked} · 판 계산 최대차 ${worstSurface.toExponential(2)}cm · 적합 평면 최대차 ${worstFit.toExponential(2)}cm · 최소 횡경사 ${minCrossFall.toFixed(3)}cm`)
    expect(checked).toBeGreaterThan(0)
    expect(worstSurface).toBeLessThanOrEqual(0.01)
    expect(worstFit).toBeLessThanOrEqual(0.01)
  })

  it('TC-017-2: 등고선과 나란한 지점에서 횡경사가 폭 × tan(판 기울기)에 이른다', () => {
    let peak = 0
    let interior = 0

    for (const order of plateGroups().flat()) {
      const series = crossFallSeries(order)
      // 첫·끝 표본은 이음새 절단선이 폭을 늘린다 — 상한 판정에서 뺀다
      for (let at = 1; at + 1 < series.length; at += 1) {
        const value = series[at] ?? 0
        expect(value).toBeLessThanOrEqual(MAX_CROSS_FALL_CM + 0.01)
        peak = Math.max(peak, value)
        interior += 1
      }
    }

    console.log(`TC-017-2 내부 표본 ${interior} · 최대 횡경사 ${peak.toFixed(3)}cm / 상한 ${MAX_CROSS_FALL_CM.toFixed(3)}cm`)
    expect(interior).toBeGreaterThan(0)
    // 실측으로 확인할 값 — 판 위 진행 방향이 등고선에 얼마나 가까워지는가에 달렸다
    expect(peak).toBeGreaterThanOrEqual(MAX_CROSS_FALL_CM * 0.95)
  })

  it('TC-017-3: 평지 구간은 좌우 가장자리 높이가 같다', () => {
    let checked = 0
    let worst = 0

    segments.forEach((_, order) => {
      if (profileKindOf(order) !== 'flat' || !isSurfaceOrder(order)) return
      for (const value of crossFallSeries(order)) {
        worst = Math.max(worst, value)
        expect(value).toBeLessThanOrEqual(1e-9)
        checked += 1
      }
    })

    console.log(`TC-017-3 평지 표본 ${checked} · 최대 좌우 높이차 ${worst.toExponential(2)}cm`)
    expect(checked).toBeGreaterThan(0)
  })

  it('TC-017-4: 뱅크 전이에서 노면의 판축 방향 기울기가 0에서 판 기울기까지 단조 증가한다', () => {
    // 재는 양은 레인 가장자리 높이차가 아니라 **노면의 판축 방향 기울기 ∂y/∂d**다. 뱅크 피스는
    // 판축과 나란히 달리므로 가장자리 높이차는 기하적으로 ~0이고(실측 0.0065 → 0.0034cm),
    // 횡경사는 판 위에서 트랙이 돌 때 그 기울기가 가로로 투영되며 생긴다. D-041의 단조 조건이
    // 노면 전체에 성립하는지는 이 기울기로만 잴 수 있다 — 이음새에 꺾임이 없다는 뜻이다.
    const groups = plateGroups()
    const entries = transitionOrders(1)
    const exits = transitionOrders(-1)

    expect(entries.length).toBeGreaterThan(0)
    expect(exits.length).toBe(entries.length)

    const plateGradient = Math.tan((PLATE_ANGLE_DEG * Math.PI) / 180)
    const PROBE_CM = 0.5

    /** 이웃 판의 적합 평면에서 판축을 얻어 중심선 표본마다 그 방향의 기울기를 잰다 */
    const axialGradients = (order: number, plate: readonly number[]): number[] => {
      const { axis } = fitPlane(surfacePointsOf(plate))
      const segment = segments[order]
      const surface = segment?.surfaceHeightAt
      if (segment === undefined || surface === undefined) {
        throw new Error(`순서 ${order}에 노면 함수가 없다`)
      }
      return segment.points.map((point) => {
        const ahead = surface(point.x + axis.x * PROBE_CM, point.z + axis.z * PROBE_CM)
        const behind = surface(point.x - axis.x * PROBE_CM, point.z - axis.z * PROBE_CM)
        return (ahead - behind) / (2 * PROBE_CM)
      })
    }

    for (const order of entries) {
      const plate = groups.find((group) => group[0] === order + 1)
      if (plate === undefined) throw new Error(`진입 전이 ${order} 뒤에 판이 없다`)
      const series = axialGradients(order, plate)
      expect(series.length).toBeGreaterThan(2)
      series.forEach((value, at) => {
        if (at > 0) expect(value).toBeGreaterThanOrEqual((series[at - 1] ?? 0) - 1e-6)
      })
      const first = series[0] ?? 0
      const last = series[series.length - 1] ?? 0
      console.log(`TC-017-4 진입 전이 ${order} · 판축 기울기 ${first.toFixed(4)} → ${last.toFixed(4)} (판 ${plateGradient.toFixed(4)})`)
      expect(first).toBeLessThanOrEqual(0.01)
      expect(last).toBeCloseTo(plateGradient, 2)
    }

    for (const order of exits) {
      const plate = groups.find((group) => group[group.length - 1] === order - 1)
      if (plate === undefined) throw new Error(`진출 전이 ${order} 앞에 판이 없다`)
      const series = axialGradients(order, plate)
      expect(series.length).toBeGreaterThan(2)
      series.forEach((value, at) => {
        if (at > 0) expect(value).toBeLessThanOrEqual((series[at - 1] ?? 0) + 1e-6)
      })
      expect(series[0] ?? 0).toBeCloseTo(plateGradient, 2)
      expect(series[series.length - 1] ?? 0).toBeLessThanOrEqual(0.01)
    }
  })

  it('TC-017-5: 판 구간의 모든 노면 표본이 하나의 평면 위에 놓인다', () => {
    const groups = plateGroups()
    // 실측으로 확인할 값 — 참조 트랙의 판 구간은 2개다(D-041: 뱅크 37~42 · 49~54)
    expect(groups.length).toBeGreaterThanOrEqual(1)

    for (const group of groups) {
      const points = surfacePointsOf(group)
      expect(points.length).toBeGreaterThan(3)
      const fit = fitPlane(points)
      console.log(`TC-017-5 판 구간 [${group.join(',')}] 표본 ${points.length} · 잔차 ${fit.residual.toExponential(2)}cm · 기울기 ${fit.slopeDeg.toFixed(2)}°`)
      expect(fit.residual).toBeLessThanOrEqual(0.01)
      expect(fit.slopeDeg).toBeCloseTo(PLATE_ANGLE_DEG, 1)
    }
  })
})
