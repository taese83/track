// FEAT-004가 열어 둔 주입 구멍이 FEAT-005의 산출로 실제로 닫히는지 확인한다.
// FEAT-004는 곡선을 기다리지 않으려고 현 규칙 근사를 자체 계산했고, 진짜 값이 나오면
// `elevationDeltas`로 대체하도록 열어 뒀다(FEAT-004 경계 판단 2).
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { validateClosure } from '../closure/validate-closure'
import { parseTrackString } from '../parse/parse-track-string'
import { restoreOrder } from '../restore/restore-order'
import { buildElevatedSegments, elevationDeltasOf } from './build-elevation'
import { orientPath } from './orient-path'

async function referencePieces(): Promise<ParsedPiece[]> {
  const body = await readFile(
    path.resolve(process.cwd(), 'fixtures/track', 'WS67Y2.js.txt'),
    'utf8',
  )
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error('참조 트랙 추출 실패')
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error('참조 트랙 파싱 실패')
  return parsed.pieces
}

describe('FEAT-004 폐합 판정에 실제 프로파일을 주입한다', () => {
  it('현 규칙 근사를 실제 산출로 바꿔도 폐합 판정이 유지된다', async () => {
    const pieces = await referencePieces()
    const restored = restoreOrder(pieces)
    if (!restored.ok) throw new Error('순서 복원 실패')

    const byId = new Map(pieces.map((item) => [item.pieceId, item]))
    const ordered: ParsedPiece[] = []
    for (const pieceId of restored.orderedPieceIds) {
      const found = byId.get(pieceId)
      if (found !== undefined) ordered.push(found)
    }
    const elevationDeltas = elevationDeltasOf(buildElevatedSegments(orientPath(ordered)))

    const injected = validateClosure({ pieces, restored, elevationDeltas })

    expect(injected.isZClosed).toBe(true)
    // 정확히 0은 아니다 — 이음새의 XY 간격(최대 0.17px)이 판 위에서 미세한 고도 불연속을
    // 만들고 그것이 누적된다(D-042 실측 0.0003cm/이음새). 실측 3.5e-6으로 그 규모 안이다.
    expect(Math.abs(injected.zClosureGap?.value ?? Number.NaN)).toBeLessThan(0.001)
    // 뱅크는 measured, 슬로프는 confirmed — 섞이면 나쁜 쪽이 대표한다
    expect(injected.zClosureGap?.grade).toBe('confirmed')
  })

  it('판 구간 안 피스는 개별로 고도를 바꾸지만 구간 전체로는 상쇄된다', async () => {
    const pieces = await referencePieces()
    const restored = restoreOrder(pieces)
    if (!restored.ok) throw new Error('순서 복원 실패')

    const byId = new Map(pieces.map((item) => [item.pieceId, item]))
    const ordered: ParsedPiece[] = []
    for (const pieceId of restored.orderedPieceIds) {
      const found = byId.get(pieceId)
      if (found !== undefined) ordered.push(found)
    }
    const built = buildElevatedSegments(orientPath(ordered))
    const section = built.segments.slice(37, 43)

    expect(
      section.some((segment) => segment.absoluteElevationEnd !== segment.absoluteElevationStart),
    ).toBe(true)
    const net = section.reduce(
      (sum, segment) => sum + (segment.absoluteElevationEnd - segment.absoluteElevationStart),
      0,
    )
    // 구간은 수학적으로 정확히 상쇄되지만 이음새의 XY 간격이 남긴 불연속만큼 잔차가 있다
    expect(Math.abs(net)).toBeLessThan(0.001)
  })
})
