import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { parseTrackString } from '../parse/parse-track-string'
import { restoreOrder } from '../restore/restore-order'
import { validateClosure } from './validate-closure'

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

function pieceById(pieces: readonly ParsedPiece[], pieceId: string): ParsedPiece {
  const piece = pieces.find((candidate) => candidate.pieceId === pieceId)
  if (piece === undefined) throw new Error(`${pieceId}를 찾을 수 없다`)
  return piece
}

function validateFixture(pieces: readonly ParsedPiece[]) {
  return validateClosure({ pieces, restored: restoreOrder(pieces) })
}

/**
 * "고도 불균형" 공용 fixture는 아직 없다(TC-004-5 NEEDS_DECISION). 여기서는 참조 트랙의
 * 하강 피스 하나를 상승 팔레트로 바꿔 합성한다 — `colorIndex`는 좌표에 관여하지 않으므로
 * XY 기하는 한 점도 바뀌지 않고 상승/하강 균형만 깨진다(`MULTISTART` 합성과 같은 논리).
 */
function withUnbalancedElevation(pieces: readonly ParsedPiece[]): ParsedPiece[] {
  let flipped = false
  return pieces.map((piece) => {
    if (flipped || !piece.pieceClass.startsWith('Bri') || piece.colorIndex !== 2) return piece
    flipped = true
    return { ...piece, colorIndex: 3 }
  })
}

describe('validateClosure — XY 폐곡선', () => {
  it('TC-004-1: 참조 트랙은 폐곡선으로 판정되고 끊긴 지점이 없다', async () => {
    const result = validateFixture(await parseFixture('WS67Y2'))

    expect(result.isClosedLoop).toBe(true)
    expect(result.brokenAt).toBeNull()
    expect(result.orderConfirmed).toBe(true)
    expect(result.connectedPieceIds).toHaveLength(132)
  })

  // 참조 트랙에는 p117↔p118 사이 31.67px 구멍이 실제로 있고 FEAT-003이 매달린 끝 규칙으로 잇는다
  // (D-038 ②). 폐합을 "모든 이음새가 붙었는가"로 재면 정상 트랙이 비폐곡선으로 뒤집힌다 —
  // 판정 기준은 **START로 되돌아왔는가** 하나뿐이다.
  it('TC-004-1: 중간에 매달린 끝이 있어도 START로 되돌아오면 폐곡선이다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const left = pieceById(pieces, 'p117').vertex2
    const right = pieceById(pieces, 'p118').vertex1
    const seam = Math.hypot(left.x - right.x, left.y - right.y)

    // 참조 트랙 실측: 이 두 끝은 31.67px 벌어져 있고 정상 이음새(최대 0.17px)와 자릿수가 다르다
    expect(seam).toBeCloseTo(31.67, 2)
    expect(validateFixture(pieces).isClosedLoop).toBe(true)
  })

  it('TC-004-2: 어긋난 트랙은 비폐곡선으로 판정되고 끊긴 지점을 지목한다', async () => {
    const result = validateFixture(await parseFixture('OPENLOOP'))

    expect(result.isClosedLoop).toBe(false)
    expect(result.brokenAt).not.toBeNull()
    expect(result.brokenAt?.reason).toBe('order-restore-failed')
  })

  // "연결 가능한 구간까지만 정상 렌더" — 렌더가 통째로 멈추지 않으려면 이을 수 있는 구간이
  // 남아 있어야 한다. OPENLOOP은 떨어져 나간 피스 1개를 뺀 131개가 여전히 이어진다.
  it('TC-004-2: 복원이 실패해도 이어지는 구간은 그대로 넘겨 렌더를 중단시키지 않는다', async () => {
    const pieces = await parseFixture('OPENLOOP')
    const supported = pieces.filter((piece) => piece.isSupported)
    const result = validateFixture(pieces)

    expect(result.connectedPieceIds.length).toBeGreaterThan(0)
    expect(result.connectedPieceIds.length).toBeLessThan(supported.length)
    expect(new Set(result.connectedPieceIds).size).toBe(result.connectedPieceIds.length)
  })

  // 진단용 접두부를 정본 순서로 오인하면 `orderedPieceIds`에 소유자가 둘이 된다
  it('TC-004-2: 복원 실패 시의 구간은 정본 순서가 아님을 표시한다', async () => {
    expect(validateFixture(await parseFixture('OPENLOOP')).orderConfirmed).toBe(false)
    expect(validateFixture(await parseFixture('WS67Y2')).orderConfirmed).toBe(true)
  })

  // TC-004-3의 화면 판정(회색·점선 유지, 정상 구간 조작)은 FEAT-006 소유다.
  // 여기서 지킬 수 있는 것은 그 표시가 기대는 데이터가 회전·확대로 재평가돼도 바뀌지 않는다는 것뿐이다.
  it('TC-004-3: 같은 입력을 다시 판정해도 끊긴 구간이 그대로 유지된다', async () => {
    const pieces = await parseFixture('OPENLOOP')
    const first = validateFixture(pieces)
    const second = validateFixture(pieces)

    expect(second.connectedPieceIds).toEqual(first.connectedPieceIds)
    expect(second.brokenAt).toEqual(first.brokenAt)
  })
})

describe('validateClosure — Z(고도) 폐합', () => {
  it('TC-004-4: 상승·하강이 상쇄되는 참조 트랙은 고도도 닫힌 것으로 판정된다', async () => {
    const result = validateFixture(await parseFixture('WS67Y2'))

    expect(result.isZClosed).toBe(true)
    expect(result.zClosureGap?.value ?? Number.NaN).toBeCloseTo(0, 6)
  })

  // 뱅크 20°는 measured(타미야 공식)지만 슬로프 20°는 confirmed(사용자 지정 렌더 규칙)다 —
  // 섞이면 나쁜 쪽이 대표해야 FEAT-010이 과장 없이 표기한다
  it('TC-004-4: 폐합 오차에는 가장 나쁜 근거 등급이 붙는다', async () => {
    expect(validateFixture(await parseFixture('WS67Y2')).zClosureGap?.grade).toBe('confirmed')
  })

  it('TC-004-5: XY가 닫혀도 상승·하강이 불균형하면 고도 폐합은 실패로 판정된다', async () => {
    const pieces = withUnbalancedElevation(await parseFixture('WS67Y2'))
    const result = validateFixture(pieces)

    expect(result.isClosedLoop).toBe(true)
    expect(result.isZClosed).toBe(false)
  })

  // "억지로 보정해 맞추지 않는다" — 어긋난 값을 0으로 끌어당기면 화면이 닫혔다고 거짓말한다
  it('TC-004-5: 어긋난 고도는 계산된 값 그대로 노출하고 보정하지 않는다', async () => {
    const pieces = withUnbalancedElevation(await parseFixture('WS67Y2'))
    const result = validateFixture(pieces)

    // 하강 슬로프 하나를 상승으로 뒤집었으므로 차이는 슬로프 1개 낙차(18.47)의 2배다
    expect(result.zClosureGap?.value ?? Number.NaN).toBeCloseTo(2 * 18.4691, 3)
  })

  it('TC-004-5: 고도 폐합이 실패해도 XY 판정과 이어지는 구간은 그대로 남는다', async () => {
    const result = validateFixture(withUnbalancedElevation(await parseFixture('WS67Y2')))

    expect(result.brokenAt).toBeNull()
    expect(result.connectedPieceIds).toHaveLength(132)
  })

  // TC-004-6의 스트립 렌더는 FEAT-012 소유다. FEAT-004가 보증할 것은 그 그래프가 그릴
  // 양 끝단 불연속의 크기, 즉 zClosureGap이 START 기준 절대 고도 차이라는 사실이다.
  it('TC-004-6: zClosureGap은 START 시작·종료 고도의 차이와 같다', async () => {
    const pieces = withUnbalancedElevation(await parseFixture('WS67Y2'))
    const result = validateFixture(pieces)

    const deltas = new Map(
      pieces.map((piece) => [
        piece.pieceId,
        { value: 0, grade: 'measured' as const, contributes: false },
      ]),
    )
    const zeroed = validateClosure({
      pieces,
      restored: restoreOrder(pieces),
      elevationDeltas: deltas,
    })

    // FEAT-005가 피스별 순 변화량을 주입하면 폐합 판정이 그 값을 따른다
    expect(zeroed.zClosureGap?.value).toBe(0)
    expect(zeroed.isZClosed).toBe(true)
    expect(result.zClosureGap?.value).not.toBe(0)
  })

  it('XY가 열려 있으면 되돌아온 지점이 없어 Z 폐합은 계산하지 않는다', async () => {
    const result = validateFixture(await parseFixture('OPENLOOP'))

    expect(result.isZClosed).toBeNull()
    expect(result.zClosureGap).toBeNull()
  })

  it('START가 없어 복원이 실패하면 이어붙일 구간도 없다', async () => {
    const result = validateFixture(await parseFixture('NOSTART'))

    expect(result.isClosedLoop).toBe(false)
    expect(result.connectedPieceIds).toHaveLength(0)
    expect(result.brokenAt).toBeNull()
  })
})
