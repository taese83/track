// TC-013-1(순서·유형) · TC-013-3(미지원 라벨)의 순수 축.
// 실제 참조 트랙으로 잰다 — 합성 입력만 쓰면 132개가 순서대로 나온다는 주장이 검증되지 않는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateClosure } from '@/entities/track/lib/closure'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { buildSectionItems, reachableCountOf, segmentKindOf } from './section-items'

async function pipeline(fixture: string) {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', fixture), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`${fixture} 추출 실패`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`${fixture} 파싱 실패`)
  const restored = restoreOrder(parsed.pieces)
  const closure = validateClosure({ pieces: parsed.pieces, restored })
  return { pieces: parsed.pieces, restored, closure }
}

function piece(overrides: Partial<ParsedPiece>): ParsedPiece {
  return {
    pieceId: 'p',
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

describe('TC-013-1 — 순서대로 나열되고 각 행에 피스 타입·구간 유형이 있다', () => {
  it('참조 트랙 132개가 복원 순서 그대로 행이 된다', async () => {
    const { pieces, restored } = await pipeline('WS67Y2.js.txt')
    if (!restored.ok) throw new Error('순서 복원 실패')

    const items = buildSectionItems({ pieces, orderedPieceIds: restored.orderedPieceIds })

    expect(items).toHaveLength(132)
    // 행 순서가 FEAT-003의 순서와 한 칸도 어긋나지 않아야 한다 — 목록은 그 순서의 표면이다
    expect(items.map((item) => item.id)).toEqual([...restored.orderedPieceIds])
    expect(items.map((item) => item.index)).toEqual(items.map((_, index) => index))

    // 모든 행이 타입과 유형을 갖는다(빈 셀 금지 — 그러면 "표시된다"가 성립하지 않는다)
    for (const item of items) {
      expect(item.pieceType).not.toBe('')
      expect(item.segmentKind).toBeTruthy()
    }

    // 첫 행은 START다 — 순서의 기점이 목록 첫머리에 보여야 한다 (D-038 ①)
    expect(items[0]?.segmentKind).toBe('marker')
    expect(items[0]?.pieceType).toBe('Str2')

    const kinds = new Set(items.map((item) => item.segmentKind))
    console.log(`TC-013-1 유형 분포: ${[...kinds].sort().join(', ')}`)
    // 참조 트랙에는 코너·슬로프·뱅크가 실제로 들어 있다 — 전부 straight로 접히면 안 된다
    for (const kind of ['corner', 'slope', 'bank']) expect(kinds.has(kind as never)).toBe(true)
  })

  it('피스 클래스가 유형을 정한다 — 고도 결과에서 유추하지 않는다', () => {
    expect(segmentKindOf(piece({ pieceClass: 'Str2' }))).toBe('marker')
    expect(segmentKindOf(piece({ pieceClass: 'Str1' }))).toBe('straight')
    expect(segmentKindOf(piece({ pieceClass: 'Cor3' }))).toBe('corner')
    // colorIndex 0이라 고도는 평평하지만 슬로프 계열 피스다
    expect(segmentKindOf(piece({ pieceClass: 'Bri2', colorIndex: 0 }))).toBe('slope')
    expect(segmentKindOf(piece({ pieceClass: 'Ban1' }))).toBe('bank')
    expect(segmentKindOf(piece({ pieceClass: 'Lan1' }))).toBe('lane-change')
    expect(segmentKindOf(piece({ pieceClass: 'Chi1' }))).toBe('wave')
    expect(segmentKindOf(piece({ pieceClass: 'Xyz9', isSupported: false }))).toBe('unsupported')
  })
})

describe('TC-013-3 — 미지원 행은 타입명을 그대로 노출한다', () => {
  it('복원 순서에 못 낀 미지원 피스도 목록에 남고 타입별 라벨이 붙는다', async () => {
    const { pieces, restored } = await pipeline('UNSUPP.js.txt')
    if (!restored.ok) throw new Error('순서 복원 실패')

    // 실측: 134피스 중 미지원 2개는 끝점을 몰라 사슬에 못 껴 복원 순서가 132개다.
    // 순서만 그리면 그 둘이 화면에서 통째로 사라진다 — TC-013-3이 성립하지 않는다.
    expect(pieces).toHaveLength(134)
    expect(restored.orderedPieceIds).toHaveLength(132)

    const items = buildSectionItems({ pieces, orderedPieceIds: restored.orderedPieceIds })
    expect(items).toHaveLength(134)

    const unsupported = items.filter((item) => item.segmentKind === 'unsupported')
    expect(unsupported).toHaveLength(2)

    // 라벨이 타입별로 갈린다 — "미지원 2건"으로 접으면 어느 피스인지 알 수 없다
    const labels = unsupported.map((item) => item.unsupportedLabel).sort()
    console.log(`TC-013-3 미지원 ${unsupported.length}행 · 라벨 ${labels.join(' / ')}`)
    expect(labels).toEqual(['미지원: Wob2', '미지원: Xyz9'])

    // 자리가 없다는 사실이 남고, 커서는 그리로 가지 않는다
    for (const item of unsupported) {
      expect(item.unplacedReason).toBe('unsupported')
      expect(item.failed).toBe(true)
    }
    expect(reachableCountOf(items)).toBe(132)

    // 지원 피스에는 라벨이 붙지 않는다
    for (const item of items.filter((i) => i.segmentKind !== 'unsupported')) {
      expect(item.unsupportedLabel).toBeUndefined()
    }
  })
})

describe('부분 실패 — 끊긴 뒤를 지우지 않고 도달 불가로 표시한다', () => {
  it('이어붙이지 못한 피스가 목록에 남고 커서 한계가 거기서 끊긴다', async () => {
    const { pieces, restored, closure } = await pipeline('OPENLOOP.js.txt')

    // 실측: 복원이 실패(traversal-incomplete)하고 FEAT-004가 131개 진단 접두부를 낸다.
    expect(restored.ok).toBe(false)
    expect(pieces).toHaveLength(132)
    expect(closure.connectedPieceIds).toHaveLength(131)
    expect(closure.orderConfirmed).toBe(false)

    const items = buildSectionItems({ pieces, orderedPieceIds: closure.connectedPieceIds })

    // 132개가 전부 남는다 — 한 개도 사라지지 않는다
    expect(items).toHaveLength(132)
    const unplaced = items.filter((item) => item.failed === true)
    expect(unplaced).toHaveLength(1)
    expect(unplaced[0]?.unplacedReason).toBe('disconnected')

    console.log(
      `부분 실패: 전체 ${items.length}행 · 도달 가능 ${reachableCountOf(items)} · 자리 없음 ${unplaced.length}`,
    )
    expect(reachableCountOf(items)).toBe(131)
  })

  it('전부 이어진 트랙은 비활성 행이 하나도 없다', async () => {
    const { pieces, restored } = await pipeline('WS67Y2.js.txt')
    if (!restored.ok) throw new Error('순서 복원 실패')
    const items = buildSectionItems({ pieces, orderedPieceIds: restored.orderedPieceIds })
    expect(reachableCountOf(items)).toBe(132)
    expect(items.every((item) => item.failed === undefined)).toBe(true)
  })
})
