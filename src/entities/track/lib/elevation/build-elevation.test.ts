import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { parseTrackString } from '../parse/parse-track-string'
import { restoreOrder } from '../restore/restore-order'
import { buildElevatedSegments } from './build-elevation'
import type { BuildElevationResult } from './build-elevation'
import { orientPath } from './orient-path'
import { buildPiecePath } from './piece-path'
import type { ElevatedSegment, OrientedPiece, Point } from './types'

const DEG = 180 / Math.PI

function toDeg(gradient: number): number {
  return Math.atan(gradient) * DEG
}

function piece(overrides: Partial<ParsedPiece> & { pieceId: string }): ParsedPiece {
  return {
    pieceClass: 'Str1',
    x: 0,
    y: 0,
    angleDeg: 0,
    colorIndex: 0,
    vertex1: { x: -27, y: 0 },
    vertex2: { x: 27, y: 0 },
    isSupported: true,
    ...overrides,
  }
}

/** 끝점이 이어지도록 x축을 따라 피스를 늘어놓는다 */
function straightRun(specs: readonly Partial<ParsedPiece>[]): OrientedPiece[] {
  let cursor = 0
  return specs.map((spec, index) => {
    const half = 27
    const built = piece({
      pieceId: `p${index}`,
      ...spec,
      vertex1: { x: cursor, y: 0 },
      vertex2: { x: cursor + half * 2, y: 0 },
    })
    cursor += half * 2
    return { piece: built, flipped: false }
  })
}

async function parseFixture(name: string): Promise<ParsedPiece[]> {
  const body = await readFile(
    path.resolve(process.cwd(), 'fixtures/track', `${name}.js.txt`),
    'utf8',
  )
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`fixture ${name} 추출 실패: ${extracted.reason}`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`fixture ${name} 파싱 실패: ${parsed.reason}`)
  return parsed.pieces
}

async function buildReferenceTrack(): Promise<{
  built: BuildElevationResult
  oriented: OrientedPiece[]
}> {
  const pieces = await parseFixture('WS67Y2')
  const restored = restoreOrder(pieces)
  if (!restored.ok) throw new Error('참조 트랙 순서 복원 실패')
  const byId = new Map(pieces.map((item) => [item.pieceId, item]))
  const ordered: ParsedPiece[] = []
  for (const pieceId of restored.orderedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) ordered.push(found)
  }
  const oriented = orientPath(ordered)
  return { built: buildElevatedSegments(oriented), oriented }
}

function requireSegment(segments: readonly ElevatedSegment[], order: number): ElevatedSegment {
  const segment = segments[order]
  if (segment === undefined) throw new Error(`순서 ${order}의 세그먼트가 없다`)
  return segment
}

/** 최소제곱 평면을 맞추고 최대 잔차와 최급경사를 낸다 */
function fitPlane(points: readonly Point[], heights: readonly number[]) {
  const count = points.length
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / count
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / count
  const meanZ = heights.reduce((sum, z) => sum + z, 0) / count
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sxz = 0
  let syz = 0
  points.forEach((point, index) => {
    const dx = point.x - meanX
    const dy = point.y - meanY
    const dz = (heights[index] ?? 0) - meanZ
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
    sxz += dx * dz
    syz += dy * dz
  })
  const det = sxx * syy - sxy * sxy
  const a = (sxz * syy - syz * sxy) / det
  const b = (syz * sxx - sxz * sxy) / det
  let residual = 0
  points.forEach((point, index) => {
    const predicted = meanZ + a * (point.x - meanX) + b * (point.y - meanY)
    residual = Math.max(residual, Math.abs((heights[index] ?? 0) - predicted))
  })
  return { residual, slopeDeg: toDeg(Math.hypot(a, b)) }
}

describe('슬로프 — S곡선 (TC-005-1 · TC-005-3)', () => {
  // D-042 실측: 슬로프 20°에서 피스당 18.47cm. 이 숫자가 어긋나면 현 규칙이 문서와 갈라진 것이다
  it('TC-005-1: 총 상승량이 진행축 px × sin20°와 일치한다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 3 }, {}]),
    )
    const slope = requireSegment(segments, 1)

    expect(slope.absoluteElevationEnd - slope.absoluteElevationStart).toBeCloseTo(
      54 * Math.sin((20 * Math.PI) / 180),
      6,
    )
    expect(slope.absoluteElevationEnd).toBeCloseTo(18.4691, 4)
  })

  it('TC-005-1: 곡면이 h(t) = H/2·(1−cos πt)를 따른다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 3 }, {}]),
    )
    const { elevationProfile } = requireSegment(segments, 1)
    const total = 54 * Math.sin((20 * Math.PI) / 180)

    expect(elevationProfile.kind).toBe('sCurve')
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(elevationProfile.heightAt(t)).toBeCloseTo((total * (1 - Math.cos(Math.PI * t))) / 2, 9)
    }
  })

  // 양 끝 기울기 0이라야 앞뒤 평지와 접선이 이어진다. 평지는 0°이므로 이음매 오차도 0°다
  it('TC-005-1: 양 끝 접선 기울기가 0이고 앞뒤 평지와의 이음매 오차가 ±1° 이내다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 3 }, {}]),
    )
    const before = requireSegment(segments, 0)
    const slope = requireSegment(segments, 1)
    const after = requireSegment(segments, 2)

    expect(slope.elevationProfile.slopeAt(0)).toBeCloseTo(0, 9)
    expect(slope.elevationProfile.slopeAt(1)).toBeCloseTo(0, 9)
    expect(
      Math.abs(
        toDeg(before.elevationProfile.slopeAt(1)) - toDeg(slope.elevationProfile.slopeAt(0)),
      ),
    ).toBeLessThan(1)
    expect(
      Math.abs(toDeg(slope.elevationProfile.slopeAt(1)) - toDeg(after.elevationProfile.slopeAt(0))),
    ).toBeLessThan(1)
  })

  it('TC-005-3: 상승·하강 슬로프 쌍이 마루에서 기울기 0으로 만나 언덕 하나가 된다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([
        {},
        { pieceClass: 'Bri1', colorIndex: 3 },
        { pieceClass: 'Bri1', colorIndex: 2 },
        {},
      ]),
    )
    const rise = requireSegment(segments, 1)
    const fall = requireSegment(segments, 2)

    // 마루에서 높이가 이어지고 양쪽 기울기가 모두 0 — 꺾임이 없다
    expect(fall.absoluteElevationStart).toBeCloseTo(rise.absoluteElevationEnd, 9)
    expect(rise.elevationProfile.slopeAt(1)).toBeCloseTo(0, 9)
    expect(fall.elevationProfile.slopeAt(0)).toBeCloseTo(0, 9)
    // 언덕이 원래 높이로 돌아온다
    expect(fall.absoluteElevationEnd).toBeCloseTo(rise.absoluteElevationStart, 9)
  })

  it('TC-005-3: 하강 슬로프는 같은 크기만큼 내려간다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 2 }, {}]),
    )
    const fall = requireSegment(segments, 1)

    expect(fall.absoluteElevationEnd - fall.absoluteElevationStart).toBeCloseTo(-18.4691, 4)
  })
})

describe('마커 직선 (TC-005-5)', () => {
  // c는 방향 플래그가 아니라 팔레트 인덱스다 — Str1의 c=5는 출발선 표식이고 고도가 없다
  it('TC-005-5: Str1의 c=5는 flat 프로파일이고 상승·하강 판정에서 빠진다', () => {
    const { segments, finalElevation } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Str1', colorIndex: 5 }, {}]),
    )
    const marker = requireSegment(segments, 1)

    expect(marker.elevationProfile.kind).toBe('flat')
    expect(marker.absoluteElevationEnd).toBe(marker.absoluteElevationStart)
    expect(marker.evidenceGrade).toHaveLength(0)
    expect(finalElevation).toBe(0)
  })

  it('TC-005-5: 고도 변화 피스가 아니면 c=3이어도 고도를 바꾸지 않는다', () => {
    const { finalElevation } = buildElevatedSegments(
      straightRun([{ pieceClass: 'Str1', colorIndex: 3 }]),
    )

    expect(finalElevation).toBe(0)
  })
})

describe('뱅크와 기운 평면 — 참조 트랙 (TC-005-2 · TC-005-6)', () => {
  it('뱅크 쌍이 판 구간을 만든다 — 참조 트랙은 37~42 · 49~54다', async () => {
    const { built } = await buildReferenceTrack()
    const onPlane = built.segments.filter(
      (segment) =>
        segment.elevationProfile.kind === 'plane' ||
        segment.elevationProfile.kind === 'bankTransition',
    )

    // D-041이 실측 기록한 구간과 같은 자리다
    expect(onPlane.map((segment) => segment.order)).toEqual([
      37, 38, 39, 40, 41, 42, 49, 50, 51, 52, 53, 54,
    ])
  })

  it('TC-005-2: 판 구간(뱅크 제외)의 모든 점이 하나의 평면 위에 놓이고 기울기가 20°다', async () => {
    const { built, oriented } = await buildReferenceTrack()
    // 판정 대상은 **판 구간**이다 — 뱅크 피스는 전이 곡선이라 판을 벗어난다(D-041·D-042)
    const groups = [
      [38, 39, 40, 41],
      [50, 51, 52, 53],
    ]

    for (const group of groups) {
      const points: Point[] = []
      const heights: number[] = []
      for (const order of group) {
        const segment = requireSegment(built.segments, order)
        const target = oriented[order]
        if (target === undefined) throw new Error(`순서 ${order}의 피스가 없다`)
        const piecePath = buildPiecePath(target)
        for (let step = 0; step <= 20; step += 1) {
          const t = step / 20
          points.push(piecePath.pointAt(t))
          heights.push(segment.absoluteElevationStart + segment.elevationProfile.heightAt(t))
        }
      }
      const fit = fitPlane(points, heights)

      expect(fit.residual).toBeLessThanOrEqual(0.01)
      expect(fit.slopeDeg).toBeCloseTo(20, 3)
    }
  })

  it('TC-005-2: 구간 진입 높이와 진출 높이가 같다 — 그래야 폐곡선이 닫힌다', async () => {
    const { built } = await buildReferenceTrack()

    for (const [from, to] of [
      [37, 42],
      [49, 54],
    ]) {
      const entry = requireSegment(built.segments, from ?? 0)
      const exit = requireSegment(built.segments, to ?? 0)

      expect(exit.absoluteElevationEnd).toBeCloseTo(entry.absoluteElevationStart, 6)
    }
  })

  it('TC-005-6: 뱅크 안에서 기울기가 단조롭게 변하고 판 기울기를 넘지 않는다', async () => {
    const { built } = await buildReferenceTrack()
    const planeGradient = Math.tan((20 * Math.PI) / 180)

    // 진입 뱅크는 평지(0)에서 판 기울기까지 오르고, 진출 뱅크는 그 거울상이다
    for (const [entryOrder, exitOrder] of [
      [37, 42],
      [49, 54],
    ]) {
      const entry = requireSegment(built.segments, entryOrder ?? 0)
      const exit = requireSegment(built.segments, exitOrder ?? 0)

      const entryGradients = Array.from({ length: 41 }, (_, index) =>
        Math.abs(entry.elevationProfile.slopeAt(index / 40)),
      )
      const exitGradients = Array.from({ length: 41 }, (_, index) =>
        Math.abs(exit.elevationProfile.slopeAt(index / 40)),
      )

      expect(
        entryGradients.every(
          (value, index) => index === 0 || value >= (entryGradients[index - 1] ?? 0) - 1e-9,
        ),
      ).toBe(true)
      expect(
        exitGradients.every(
          (value, index) => index === 0 || value <= (exitGradients[index - 1] ?? 0) + 1e-9,
        ),
      ).toBe(true)
      expect(Math.max(...entryGradients, ...exitGradients)).toBeLessThanOrEqual(
        planeGradient + 1e-9,
      )
    }
  })

  it('TC-005-6: 진입 뱅크는 기울기 0에서 시작해 판 기울기로 끝난다', async () => {
    const { built } = await buildReferenceTrack()
    const planeGradient = Math.tan((20 * Math.PI) / 180)
    const entry = requireSegment(built.segments, 37)

    expect(entry.elevationProfile.slopeAt(0)).toBeCloseTo(0, 3)
    expect(Math.abs(entry.elevationProfile.slopeAt(1))).toBeCloseTo(planeGradient, 3)
  })
})

describe('FEAT-017 — surfaceHeightAt 계약', () => {
  it('판 위 세그먼트에만 붙는다 — flat·sCurve는 중심선 스칼라로 충분하다', async () => {
    const { built } = await buildReferenceTrack()

    for (const segment of built.segments) {
      const { kind, surfaceHeightAt } = segment.elevationProfile
      const onPlane = kind === 'plane' || kind === 'bankTransition'
      expect(typeof surfaceHeightAt === 'function').toBe(onPlane)
    }

    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 3 }, {}]),
    )
    expect(requireSegment(segments, 1).elevationProfile.surfaceHeightAt).toBeUndefined()
  })

  it('중심선에서 heightAt와 같은 높이를 낸다', async () => {
    const { built, oriented } = await buildReferenceTrack()
    let checked = 0

    built.segments.forEach((segment, order) => {
      const { kind, surfaceHeightAt, heightAt } = segment.elevationProfile
      if (kind !== 'plane' && kind !== 'bankTransition') return
      if (surfaceHeightAt === undefined) throw new Error(`순서 ${order}에 노면 함수가 없다`)
      const target = oriented[order]
      if (target === undefined) throw new Error(`순서 ${order}의 피스가 없다`)
      const piecePath = buildPiecePath(target)

      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(surfaceHeightAt(piecePath.pointAt(t))).toBeCloseTo(
          segment.absoluteElevationStart + heightAt(t),
          9,
        )
        checked += 1
      }
    })

    expect(checked).toBeGreaterThan(0)
  })

  it('전이 피스의 판 밖 좌표는 클램프가 아니라 판 공식으로 이어진다', async () => {
    const { built, oriented } = await buildReferenceTrack()
    const entryOrder = built.segments.findIndex(
      (segment, index) =>
        segment.elevationProfile.kind === 'bankTransition' &&
        built.segments[index + 1]?.elevationProfile.kind === 'plane',
    )
    expect(entryOrder).toBeGreaterThanOrEqual(0)

    const transition = requireSegment(built.segments, entryOrder).elevationProfile.surfaceHeightAt
    const plane = requireSegment(built.segments, entryOrder + 1).elevationProfile.surfaceHeightAt
    if (transition === undefined || plane === undefined) throw new Error('판 구간 함수가 없다')

    const target = oriented[entryOrder]
    if (target === undefined) throw new Error(`순서 ${entryOrder}의 피스가 없다`)
    const seam = buildPiecePath(target).pointAt(1)

    // 판축(up)은 export되지 않는다 — 판 피스의 높이는 좌표에 대해 선형이므로 그 수치
    // 기울기 방향이 곧 판축이다
    const step = 1
    const on = (x: number, y: number) => plane({ x, y })
    const gx = (on(seam.x + step, seam.y) - on(seam.x - step, seam.y)) / 2
    const gy = (on(seam.x, seam.y + step) - on(seam.x, seam.y - step)) / 2
    const norm = Math.hypot(gx, gy)
    expect(norm).toBeGreaterThan(0)

    const reach = 18
    const sides = [1, -1].map((sign) => ({
      x: seam.x + (sign * reach * gx) / norm,
      y: seam.y + (sign * reach * gy) / norm,
    }))
    const heights = sides.map((point) => ({ plate: plane(point), edge: transition(point) }))
    expect(heights.every((entry) => Number.isFinite(entry.edge))).toBe(true)
    expect(Math.abs((heights[0]?.plate ?? 0) - (heights[1]?.plate ?? 0))).toBeGreaterThan(1)

    // 판 안쪽으로 넘어간 가장자리(판 쪽이 더 높다)는 다음 판 피스와 같은 값이라야 노치가 없다
    const inner = (heights[0]?.plate ?? 0) > (heights[1]?.plate ?? 0) ? heights[0] : heights[1]
    if (inner === undefined) throw new Error('판 쪽 가장자리를 고르지 못했다')
    expect(inner.edge).toBeCloseTo(inner.plate, 2)
    // 클램프였다면 이음새 높이에 그대로 눌렸다
    const seamHeight = transition(seam)
    expect(Math.abs(inner.edge - seamHeight)).toBeGreaterThan(1)
  })
})

describe('근거 등급 (TC-005-4)', () => {
  it('TC-005-4: 슬로프 각도는 사용자 지정 렌더 규칙이라 confirmed로 태깅된다', () => {
    const { segments } = buildElevatedSegments(
      straightRun([{}, { pieceClass: 'Bri1', colorIndex: 3 }, {}]),
    )

    expect(requireSegment(segments, 1).evidenceGrade).toEqual([
      { field: 'slopeAngleDeg', grade: 'confirmed' },
      { field: 'colorRule', grade: 'measured' },
    ])
  })

  it('TC-005-4: 뱅크 각도는 타미야 공식 실측값이라 measured로 태깅된다', async () => {
    const { built } = await buildReferenceTrack()

    expect(requireSegment(built.segments, 37).evidenceGrade).toEqual([
      { field: 'bankAngleDeg', grade: 'measured' },
      { field: 'colorRule', grade: 'measured' },
    ])
  })

  it('TC-005-4: 고도를 바꾸지 않는 피스에는 붙일 근거가 없다', async () => {
    const { built } = await buildReferenceTrack()
    const flat = built.segments.filter((segment) => segment.elevationProfile.kind === 'flat')

    expect(flat.length).toBeGreaterThan(0)
    expect(flat.every((segment) => segment.evidenceGrade.length === 0)).toBe(true)
  })
})

describe('참조 트랙 전체', () => {
  // D-042가 실측 기록한 세 값과 대조한다 — 하나라도 어긋나면 모델이 문서와 갈라진 것이다
  it('경로를 다 돌면 START 높이로 돌아온다 (finalZ 0.000)', async () => {
    const { built } = await buildReferenceTrack()

    expect(built.finalElevation).toBeCloseTo(0, 9)
  })

  it('이음새 고도 불연속이 D-042 실측(0.0003cm) 수준을 넘지 않는다', async () => {
    const { built } = await buildReferenceTrack()
    let worst = 0
    for (let index = 0; index + 1 < built.segments.length; index += 1) {
      const current = requireSegment(built.segments, index)
      const next = requireSegment(built.segments, index + 1)
      worst = Math.max(worst, Math.abs(next.absoluteElevationStart - current.absoluteElevationEnd))
    }

    expect(worst).toBeLessThanOrEqual(0.001)
  })

  it('최고 높이가 D-042 실측 24.75cm와 일치한다', async () => {
    const { built } = await buildReferenceTrack()
    let peak = Number.NEGATIVE_INFINITY
    for (const segment of built.segments) {
      for (let step = 0; step <= 20; step += 1) {
        peak = Math.max(
          peak,
          segment.absoluteElevationStart + segment.elevationProfile.heightAt(step / 20),
        )
      }
    }

    expect(peak).toBeCloseTo(24.75, 2)
  })

  it('132피스 전부에 프로파일이 붙는다', async () => {
    const { built } = await buildReferenceTrack()

    expect(built.segments).toHaveLength(132)
    expect(built.segments.every((segment) => segment.order >= 0)).toBe(true)
  })
})
