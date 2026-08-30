// REQ-F-021 — compat=true의 Cor1 위치 보정이 배치 좌표에 실제로 더해지는가.
//
// FEAT-002는 메타데이터만 붙이고 좌표를 건드리지 않으므로, 이 가산이 빠지면 구버전 트랙은
// 조용히 어긋난 채 렌더된다 — 화면만 봐서는 드러나지 않는 종류의 결함이라 수치로 잡는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { orientPath } from '@/entities/track/lib/elevation'
import { buildElevatedSegments } from '@/entities/track/lib/elevation'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { compatCorrectionOf } from './compat-correction'
import { buildSceneLayout } from './scene-layout'

const RAD = Math.PI / 180

function pieceOf(overrides: Partial<ParsedPiece>): ParsedPiece {
  return {
    pieceId: 'p0',
    pieceClass: 'Cor1',
    x: 0,
    y: 0,
    angleDeg: 0,
    colorIndex: 0,
    vertex1: { x: -26, y: -8 },
    vertex2: { x: 12.2, y: 7.8 },
    isSupported: true,
    ...overrides,
  }
}

async function fixtureLayout(fixture: string) {
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
  return { compat: extracted.compat, layout: buildSceneLayout({ oriented, elevated, truncated: false }) }
}

describe('REQ-F-021 — compat 위치 보정', () => {
  it('메타데이터가 없으면 보정하지 않는다', () => {
    expect(compatCorrectionOf(pieceOf({}))).toEqual({ x: 0, y: 0, applied: false })
  })

  it('보정 벡터는 편집기 원문 그대로 (11.1, 4.88)을 배치 각도로 회전한 것이다', () => {
    expect(compatCorrectionOf(pieceOf({ angleDeg: 0, compatCorrectionApplied: true }))).toEqual({
      x: 11.1,
      y: 4.88,
      applied: true,
    })

    const at45 = compatCorrectionOf(pieceOf({ angleDeg: 45, compatCorrectionApplied: true }))
    const cos = Math.cos(45 * RAD)
    const sin = Math.sin(45 * RAD)
    expect(at45.x).toBeCloseTo(11.1 * cos - 4.88 * sin, 10)
    expect(at45.y).toBeCloseTo(11.1 * sin + 4.88 * cos, 10)

    // 보정 크기는 회전과 무관하게 일정하다 — 각도별로 다른 양이 더해지면 회전이 아니다
    for (const angleDeg of [45, 135, 225, 315]) {
      const correction = compatCorrectionOf(pieceOf({ angleDeg, compatCorrectionApplied: true }))
      expect(Math.hypot(correction.x, correction.y)).toBeCloseTo(Math.hypot(11.1, 4.88), 10)
    }
  })

  it('compat=true fixture에서 보정 대상 세그먼트만 원본 좌표에서 밀려난다', async () => {
    const corrected = await fixtureLayout('COMPAT1.js.txt')
    const plain = await fixtureLayout('WS67Y2.js.txt')

    expect(corrected.compat).toBe(true)
    expect(plain.compat).toBe(false)

    // 두 fixture는 저장 버전만 다른 같은 원문이다(fixtures/track/README.md) — 그래서
    // 좌표 차이는 전적으로 보정에서 온다. 비교 대상이 정확히 겹치는 이 성질이 없으면
    // "밀려났다"를 보정 탓으로 돌릴 수 없다.
    const plainById = new Map(plain.layout.segments.map((segment) => [segment.pieceId, segment]))

    let movedCount = 0
    let unmovedCount = 0
    for (const segment of corrected.layout.segments) {
      const before = plainById.get(segment.pieceId)
      const after = segment.points[0]
      const origin = before?.points[0]
      if (after === undefined || origin === undefined) throw new Error(`${segment.pieceId} 누락`)

      const shift = Math.hypot(after.x - origin.x, after.z - origin.z)
      if (segment.compatCorrected) {
        expect(shift).toBeCloseTo(Math.hypot(11.1, 4.88), 6)
        movedCount += 1
      } else {
        expect(shift).toBe(0)
        unmovedCount += 1
      }
    }

    console.log(`REQ-F-021 보정 적용 ${movedCount}개 / 미적용 ${unmovedCount}개`)
    expect(movedCount).toBeGreaterThan(0)
    expect(unmovedCount).toBeGreaterThan(0)
  })
})
