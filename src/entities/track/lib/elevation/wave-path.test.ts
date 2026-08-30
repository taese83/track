// FEAT-016 — 웨이브 횡돌출의 순수 축.
//
// 이 조항은 FEAT-005 명세 **산문에만** 있었고 TC가 하나도 없었다. 그래서 구현은 `Chi*`를
// `wave`로 분류만 하고 횡돌출을 만들지 않았다 — 산문에만 있는 요구는 검증되지 않고,
// 검증되지 않는 요구는 구현되지 않는다는 것의 실증이다(티켓 §발견 경위). 이 파일이 그
// 구멍을 막는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { buildElevatedSegments, orientPath } from './index'
import { buildPiecePath } from './piece-path'

const WAVE_AMPLITUDE = 8

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 진행 방향 오른쪽으로 얼마나 벗어났는가(cm). 왼쪽이면 음수다 */
function rightOffsetAt(piece: ParsedPiece, flipped: boolean, t: number): number {
  const path = buildPiecePath({ piece, flipped })
  const point = path.pointAt(t)

  const from = flipped ? piece.vertex2 : piece.vertex1
  const to = flipped ? piece.vertex1 : piece.vertex2
  const travelX = to.x - from.x
  const travelY = to.y - from.y
  const chord = Math.hypot(travelX, travelY)
  // 편집기 y는 화면 아래로 증가한다 — 진행 방향 (dx, dy)의 오른쪽은 (−dy, dx)다
  const sideX = -travelY / chord
  const sideY = travelX / chord

  // 직선 기준선(돌출 없는 경로) 대비 변위를 왼쪽 축에 투영한다
  const baseX = from.x + travelX * t
  const baseY = from.y + travelY * t
  return (point.x - baseX) * sideX + (point.y - baseY) * sideY
}

function wavePiece(overrides: Partial<ParsedPiece> = {}): ParsedPiece {
  return {
    pieceId: 'W1',
    pieceClass: 'Chi1',
    x: 0,
    y: 0,
    angleDeg: 0,
    colorIndex: 0,
    vertex1: { x: 0, y: 0 },
    vertex2: { x: 54, y: 0 },
    isSupported: true,
    ...overrides,
  }
}

describe('TC-016-1 — 중앙에서 진행 방향 오른쪽으로 8cm 벗어난다', () => {
  it('t=0.5에서 정확히 5cm다', () => {
    expect(rightOffsetAt(wavePiece(), false, 0.5)).toBeCloseTo(WAVE_AMPLITUDE, 9)
  })

  it('양 끝의 횡변위가 0이다 — 양 끝은 직선이다', () => {
    expect(rightOffsetAt(wavePiece(), false, 0)).toBeCloseTo(0, 9)
    expect(rightOffsetAt(wavePiece(), false, 1)).toBeCloseTo(0, 9)
  })

  it('모양이 sin²(πt)다 — 삼각형이 아니다', () => {
    for (const t of [0.1, 0.25, 0.4, 0.75]) {
      expect(rightOffsetAt(wavePiece(), false, t)).toBeCloseTo(
        Math.sin(Math.PI * t) ** 2 * WAVE_AMPLITUDE,
        9,
      )
    }
    // 두 모양을 가르는 지점을 고른다. **t=0.25에서는 둘 다 2.5cm라 판별되지 않는다** —
    // `sin²(π/4) = 0.5`이고 삼각형도 `1 − |2(0.25) − 1| = 0.5`다. t=0.1에서 갈린다:
    // sin²(0.1π) = 0.0955 vs 삼각형 0.2 — 두 배 넘게 차이 난다.
    const triangleAt = (t: number) => (1 - Math.abs(2 * t - 1)) * WAVE_AMPLITUDE
    expect(triangleAt(0.25)).toBeCloseTo(Math.sin(Math.PI * 0.25) ** 2 * WAVE_AMPLITUDE, 9)
    expect(rightOffsetAt(wavePiece(), false, 0.1)).toBeCloseTo(0.764, 3)
    expect(triangleAt(0.1)).toBeCloseTo(1.6, 9)
  })

  it('양 끝의 기울기가 0이라 앞뒤 직선과 매끄럽게 잇는다', () => {
    const h = 1e-5
    const rateAt = (t: number) =>
      (rightOffsetAt(wavePiece(), false, t + h) - rightOffsetAt(wavePiece(), false, t - h)) / (2 * h)

    // 삼각형이면 양 끝에서도 기울기가 일정하다(10cm/단위) — 그것과 자릿수로 비교한다.
    // 절대 0과 비교하면 유한차분의 잔차(≈1e-3)에 걸린다.
    const triangleRate = 2 * WAVE_AMPLITUDE
    expect(Math.abs(rateAt(h))).toBeLessThan(triangleRate / 1000)
    expect(Math.abs(rateAt(1 - h))).toBeLessThan(triangleRate / 1000)
    // 가운데를 지나며 부호가 바뀐다 — 들어갔다 나오는 곡면이다
    expect(rateAt(0.25)).toBeGreaterThan(0)
    expect(rateAt(0.75)).toBeLessThan(0)
  })

  it('웨이브가 아닌 직선은 벗어나지 않는다', () => {
    expect(rightOffsetAt(wavePiece({ pieceClass: 'Str1' }), false, 0.5)).toBeCloseTo(0, 12)
  })
})

describe('TC-016-3 — 역방향 통과에서도 오른쪽이다', () => {
  it('flipped에서도 진행 방향 기준 오른쪽으로 8cm다', () => {
    expect(rightOffsetAt(wavePiece(), true, 0.5)).toBeCloseTo(WAVE_AMPLITUDE, 9)
  })

  it('절대 좌표로는 반대편으로 나온다 — 진행 방향이 반대이기 때문이다', () => {
    const forward = buildPiecePath({ piece: wavePiece(), flipped: false }).pointAt(0.5)
    const backward = buildPiecePath({ piece: wavePiece(), flipped: true }).pointAt(0.5)
    expect(forward.y).toBeCloseTo(WAVE_AMPLITUDE, 9)
    expect(backward.y).toBeCloseTo(-WAVE_AMPLITUDE, 9)
    // 진행축 위치는 같은 지점이다
    expect(forward.x).toBeCloseTo(backward.x, 9)
  })

  it('마루가 옮겨가지 않는다 — sin²는 매개변수를 뒤집어도 같은 값이다', () => {
    for (const t of [0.2, 0.35, 0.8]) {
      expect(rightOffsetAt(wavePiece(), true, t)).toBeCloseTo(rightOffsetAt(wavePiece(), false, t), 9)
    }
  })

  it('어느 방향으로 통과해도 양 끝은 여전히 0이다(TC-016-4의 전제)', () => {
    for (const flipped of [false, true]) {
      expect(rightOffsetAt(wavePiece(), flipped, 0)).toBeCloseTo(0, 9)
      expect(rightOffsetAt(wavePiece(), flipped, 1)).toBeCloseTo(0, 9)
    }
  })
})

describe('TC-016-2 — 웨이브는 평지다', () => {
  it('모든 표본의 고도 변화가 0이다', async () => {
    const body = await readFile(path.resolve(process.cwd(), 'fixtures/track/WS67Y2.js.txt'), 'utf8')
    const extracted = extractUpstreamVars(body)
    if (!extracted.ok) throw new Error('추출 실패')
    const parsed = parseTrackString(extracted.text, extracted.compat)
    if (!parsed.ok) throw new Error('파싱 실패')
    const restored = restoreOrder(parsed.pieces)
    if (!restored.ok) throw new Error('복원 실패')

    const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
    const ordered: ParsedPiece[] = []
    for (const pieceId of restored.orderedPieceIds) {
      const found = byId.get(pieceId)
      if (found !== undefined) ordered.push(found)
    }
    const segments = buildElevatedSegments(orientPath(ordered)).segments
    const waves = segments.filter((segment) => segment.pieceClass.startsWith('Chi'))

    console.log(`TC-016-2 웨이브 ${waves.length}개`)
    expect(waves.length).toBeGreaterThan(0)
    for (const wave of waves) {
      expect(wave.absoluteElevationEnd - wave.absoluteElevationStart).toBeCloseTo(0, 9)
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(wave.elevationProfile.heightAt(t)).toBeCloseTo(0, 9)
      }
    }
  })
})

describe('TC-016-4 — 이음새가 벌어지지 않는다', () => {
  it('참조 트랙의 웨이브 앞뒤 이음새 간격이 0이다', async () => {
    const body = await readFile(path.resolve(process.cwd(), 'fixtures/track/WS67Y2.js.txt'), 'utf8')
    const extracted = extractUpstreamVars(body)
    if (!extracted.ok) throw new Error('추출 실패')
    const parsed = parseTrackString(extracted.text, extracted.compat)
    if (!parsed.ok) throw new Error('파싱 실패')
    const restored = restoreOrder(parsed.pieces)
    if (!restored.ok) throw new Error('복원 실패')

    const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
    const ordered: ParsedPiece[] = []
    for (const pieceId of restored.orderedPieceIds) {
      const found = byId.get(pieceId)
      if (found !== undefined) ordered.push(found)
    }
    const oriented = orientPath(ordered)

    // FEAT-003·004가 쓰는 정상 이음새 허용치와 같은 값이다(실측 최대 0.1695px)
    const SEAM_TOLERANCE = 1
    let checked = 0
    let worst = 0
    oriented.forEach((current, index) => {
      if (!current.piece.pieceClass.startsWith('Chi')) return
      const wave = buildPiecePath(current)
      const previous = oriented[index - 1]
      const next = oriented[index + 1]

      if (previous !== undefined) {
        const gap = distanceBetween(buildPiecePath(previous).pointAt(1), wave.pointAt(0))
        worst = Math.max(worst, gap)
        expect(gap).toBeLessThan(SEAM_TOLERANCE)
        checked += 1
      }
      if (next !== undefined) {
        const gap = distanceBetween(wave.pointAt(1), buildPiecePath(next).pointAt(0))
        worst = Math.max(worst, gap)
        expect(gap).toBeLessThan(SEAM_TOLERANCE)
        checked += 1
      }
    })
    console.log(`TC-016-4 웨이브 이음새 ${checked}곳 · 최대 간격 ${worst.toFixed(4)}cm`)
    expect(checked).toBeGreaterThan(0)
  })

  it('웨이브 양 끝이 피스 끝점과 정확히 일치한다', () => {
    const piece = wavePiece()
    // 끝점은 `sin²`가 0이라 기준선 그대로여야 한다. 부동소수 잔차(≈1e-32)는 남으므로
    // 좌표 동일성이 아니라 **간격 0**으로 잰다 — TC가 요구하는 것도 간격이다.
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y)

    const forward = buildPiecePath({ piece, flipped: false })
    expect(gap(forward.pointAt(0), piece.vertex1)).toBeLessThan(1e-9)
    expect(gap(forward.pointAt(1), piece.vertex2)).toBeLessThan(1e-9)

    const backward = buildPiecePath({ piece, flipped: true })
    expect(gap(backward.pointAt(0), piece.vertex2)).toBeLessThan(1e-9)
    expect(gap(backward.pointAt(1), piece.vertex1)).toBeLessThan(1e-9)
  })
})
