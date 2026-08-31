// D-051 — "끼어든 끝"도 매달린 끝이다. 실측 R84APY: 코너 p0의 끝이 세로 직선 이음새(p70↔p71,
// 정확 일치)에 0.285px 붙어 있어 종전 규칙(이웃 없음)으로는 매달린 끝이 p60 하나뿐이었고,
// 실제 짝 p60(16px 벌어짐)과 브리지가 걸리지 않아 112피스 폐곡선이 통째로 복원 실패였다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { validateClosure } from '../closure/validate-closure'
import { parseTrackString } from '../parse/parse-track-string'
import { restoreOrder } from './restore-order'

async function parseFixture(name: string): Promise<ParsedPiece[]> {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', `${name}.js.txt`), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`fixture ${name} 추출 실패: ${extracted.reason}`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`fixture ${name} 파싱 실패: ${parsed.reason}`)
  return parsed.pieces
}

describe('restoreOrder — 끼어든 끝 (D-051, 실측 R84APY)', () => {
  it('세 끝이 모인 이음새에서 정확히 짝지어진 둘을 빼고 남은 끝을 매달린 끝으로 세어 브리지가 걸린다', async () => {
    const pieces = await parseFixture('R84APY')
    const restored = restoreOrder(pieces)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return

    expect(restored.orderedPieceIds).toHaveLength(112)
    expect(new Set(restored.orderedPieceIds).size).toBe(112)
    expect(restored.start).toEqual({ pieceId: 'p61', reason: 'only-start-piece', candidatePieceIds: ['p61'] })
    // START → 코너 2 → 직선 → 레인보우 체인저 → 직선 p60 → (16px 브리지) → 코너 p0 → …
    expect(restored.orderedPieceIds.slice(0, 7)).toEqual(['p61', 'p57', 'p58', 'p59', 'p96', 'p60', 'p0'])
    // 세로 직선 p70은 정확히 맞물린 안쪽 코너 p71로 이어진다 — 0.285px 붙은 p0 쪽이 아니다
    const at70 = restored.orderedPieceIds.indexOf('p70')
    expect(at70).toBeGreaterThan(0)
    const neighbours = [restored.orderedPieceIds[at70 - 1], restored.orderedPieceIds[at70 + 1]]
    expect(neighbours).toContain('p71')
    expect(neighbours).not.toContain('p0')
  })

  it('복원된 순서는 폐곡선으로 판정된다', async () => {
    const pieces = await parseFixture('R84APY')
    const result = validateClosure({ pieces, restored: restoreOrder(pieces) })
    expect(result.orderConfirmed).toBe(true)
    expect(result.isClosedLoop).toBe(true)
    expect(result.connectedPieceIds).toHaveLength(112)
    expect(result.brokenAt).toBeNull()
    console.log(`D-051 R84APY 폐곡선 · Z 폐합 ${String(result.isZClosed)} · 고도 차 ${result.zClosureGap?.value.toFixed(3) ?? '—'}`)
  })

  it('D-050: 앞쪽 걷기가 막히면 START 양방향 사슬을 넘긴다 — p59·p60을 지운 R84APY', async () => {
    // 둘을 지우면 매달린 끝이 넷(브리지 불성립)이라 복원이 실패하고, 화살표 방향 걷기는 일찍
    // 막힌다. 그래도 반대 방향으로는 고리 대부분이 이어진다 — 사슬은 START를 화살표 방향으로
    // 통과하고(뒤쪽 걷기를 뒤집어 앞에 붙임) START는 사슬 뒤쪽에 온다.
    const pieces = (await parseFixture('R84APY')).filter(
      (piece) => piece.pieceId !== 'p59' && piece.pieceId !== 'p60',
    )
    const restored = restoreOrder(pieces)
    expect(restored.ok).toBe(false)
    const result = validateClosure({ pieces, restored })
    expect(result.orderConfirmed).toBe(false)
    expect(new Set(result.connectedPieceIds).size).toBe(result.connectedPieceIds.length)
    expect(result.connectedPieceIds.length).toBeGreaterThan(100)

    const at = result.connectedPieceIds.indexOf('p61')
    expect(at).toBeGreaterThan(90) // START 앞으로 고리 대부분이 이어진다
    expect(at).toBeLessThan(result.connectedPieceIds.length - 1) // 화살표 방향으로도 이어진다
    expect(result.connectedPieceIds[at + 1]).toBe('p57')
    expect(result.connectedPieceIds[0]).not.toBe('p61')
    expect(result.brokenAt?.reason).toBe('order-restore-failed')
  })

  it('참조 트랙(WS67Y2)의 복원 결과는 종전과 같다 — 규칙 정교화가 정상 이음새를 건드리지 않는다', async () => {
    const restored = restoreOrder(await parseFixture('WS67Y2'))
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.orderedPieceIds).toHaveLength(132)
  })
})
