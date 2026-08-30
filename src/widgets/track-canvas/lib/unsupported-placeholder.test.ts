// FEAT-009 순수 축 — 미지원 피스가 **생략되지 않는가**, 그리고 각각이 자기 라벨을 갖는가.
//
// 실측(2026-08-31)에서 `UNSUPP` fixture 134피스 중 미지원 2개가 `connectedPieceIds`
// 132에서 빠져 3D 씬에 한 개도 들어오지 않았다 — 화면은 아무것도 그리지 않았고 사용자는
// 피스가 빠졌다는 사실을 알 방법이 없었다. 이 파일이 그 회귀를 잠근다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { validateClosure } from '@/entities/track/lib/closure'
import { buildElevatedSegments, orientPath } from '@/entities/track/lib/elevation'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { buildSceneLayout } from './scene-layout'
import type { SceneLayout } from './scene-layout'
import {
  PLACEHOLDER_HEIGHT_CM,
  buildUnsupportedPlaceholders,
  placeholderEdges,
  unsupportedLabelOf,
} from './unsupported-placeholder'

async function layoutOf(fixture: string): Promise<{
  layout: SceneLayout
  pieces: ParsedPiece[]
  orderedIds: string[]
}> {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', fixture), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`${fixture} 추출 실패`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`${fixture} 파싱 실패`)
  const restored = restoreOrder(parsed.pieces)
  if (!restored.ok) throw new Error(`${fixture} 순서 복원 실패`)

  const closure = validateClosure({ pieces: parsed.pieces, restored })
  const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
  const ordered: ParsedPiece[] = []
  for (const pieceId of closure.connectedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) ordered.push(found)
  }
  const oriented = orientPath(ordered)
  const elevated = buildElevatedSegments(oriented).segments
  return {
    layout: buildSceneLayout({
      oriented,
      elevated,
      truncated: ordered.length < parsed.pieces.length,
      allPieces: parsed.pieces,
    }),
    pieces: parsed.pieces,
    orderedIds: [...closure.connectedPieceIds],
  }
}

let unsupp: Awaited<ReturnType<typeof layoutOf>>
let reference: Awaited<ReturnType<typeof layoutOf>>

beforeAll(async () => {
  unsupp = await layoutOf('UNSUPP.js.txt')
  reference = await layoutOf('WS67Y2.js.txt')
})

describe('TC-009-1 — 미지원 피스를 조용히 생략하지 않는다', () => {
  it('순서에서 빠진 미지원 피스가 플레이스홀더로 남는다', () => {
    const unsupportedPieces = unsupp.pieces.filter((piece) => !piece.isSupported)
    console.log(
      `TC-009-1 피스 ${unsupp.pieces.length} · 순서 ${unsupp.orderedIds.length} · 미지원 ${unsupportedPieces.length}`,
    )
    // 순서가 미지원을 담지 못한다는 사실 자체를 먼저 고정한다 — 이것이 결함의 전제였다
    expect(unsupp.orderedIds.length).toBeLessThan(unsupp.pieces.length)
    expect(unsupportedPieces.length).toBeGreaterThan(0)
    // 그래도 화면에는 남는다
    expect(unsupp.layout.unsupportedPlaceholders).toHaveLength(unsupportedPieces.length)
  })

  it('플레이스홀더는 피스가 스스로 선언한 좌표에 선다 — 경로에 끼워 넣지 않는다', () => {
    for (const placeholder of unsupp.layout.unsupportedPlaceholders) {
      const piece = unsupp.pieces.find((value) => value.pieceId === placeholder.pieceId)
      expect(piece).toBeDefined()
      expect(placeholder.x).toBe(piece!.x)
      expect(placeholder.z).toBe(piece!.y)
    }
  })

  it('와이어프레임이다 — 상자 12모서리를 선분으로 낸다', () => {
    const [first] = unsupp.layout.unsupportedPlaceholders
    expect(first).toBeDefined()
    const edges = placeholderEdges(first!)
    expect(edges).toHaveLength(12)
    // 높이가 0이면 바닥에 눌려 상자로 읽히지 않는다
    const ys = edges.flat().map((point) => point.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(PLACEHOLDER_HEIGHT_CM, 10)
  })

  it('플레이스홀더가 바운딩박스에 들어간다 — 빠지면 카메라 밖으로 나간다', () => {
    for (const placeholder of unsupp.layout.unsupportedPlaceholders) {
      expect(placeholder.x).toBeGreaterThanOrEqual(unsupp.layout.bounds.min.x)
      expect(placeholder.x).toBeLessThanOrEqual(unsupp.layout.bounds.max.x)
      expect(placeholder.z).toBeGreaterThanOrEqual(unsupp.layout.bounds.min.z)
      expect(placeholder.z).toBeLessThanOrEqual(unsupp.layout.bounds.max.z)
    }
  })
})

describe('TC-009-2 — 미지원 피스가 순서 복원 결과를 바꾸지 않는다', () => {
  it('미지원 2개를 끼워 넣어도 나머지 132개의 순서가 같다', () => {
    // `UNSUPP`은 `WS67Y2`에 미지원 2개를 **삽입한** fixture라 `pieceId`(파싱 시 부여하는
    // 인덱스 기반 임시 식별자)가 밀린다. 식별자로 비교하면 삽입 자체가 불일치로 잡히므로,
    // 순서가 실제로 같은지는 **클래스 나열**로 본다.
    const classesOf = (source: typeof unsupp) => {
      const byId = new Map(source.pieces.map((piece) => [piece.pieceId, piece.pieceClass]))
      return source.orderedIds.map((pieceId) => byId.get(pieceId))
    }
    expect(classesOf(unsupp)).toEqual(classesOf(reference))
    console.log(`TC-009-2 순서 ${unsupp.orderedIds.length}개 · 클래스 나열 동일`)
  })

  it('지원 피스의 씬 배치도 그대로다', () => {
    expect(unsupp.layout.segments).toHaveLength(reference.layout.segments.length)
    expect(reference.layout.unsupportedPlaceholders).toHaveLength(0)
  })

  it('미구현으로 처리되는 클래스가 무엇이든 같은 경로를 탄다', () => {
    // TC-009-2의 Given은 "Chi1(wave)이 미구현으로 처리되는 경우"다. 지금 `Chi*`는
    // 지원으로 판정되므로(FEAT-016이 기하를 맡는다) 그 조건을 만들어 확인한다 —
    // 판별은 클래스 이름이 아니라 `isSupported` 하나다.
    const asUnsupported = [
      { pieceId: 'C1', pieceClass: 'Chi1', x: 10, y: 20, angleDeg: 0, colorIndex: 0,
        vertex1: { x: 10, y: 20 }, vertex2: { x: 10, y: 20 }, isSupported: false },
    ] as ParsedPiece[]
    const [placeholder] = buildUnsupportedPlaceholders(asUnsupported)
    expect(placeholder?.label).toBe('미지원: Chi1')
  })
})

describe('TC-009-3 — 각 피스가 개별 라벨을 갖는다', () => {
  it('여러 개를 하나로 뭉뚱그리지 않는다', () => {
    const labels = unsupp.layout.unsupportedPlaceholders.map((value) => value.label)
    console.log(`TC-009-3 라벨 ${JSON.stringify(labels)}`)
    expect(labels.length).toBe(unsupp.pieces.filter((piece) => !piece.isSupported).length)
    // "미지원 2건" 같은 요약이 아니라 타입명이 그대로 나온다
    expect(labels).toContain('미지원: Xyz9')
    expect(labels).toContain('미지원: Wob2')
  })

  it('같은 타입이 여러 개면 라벨도 여러 개다 — 중복 제거하지 않는다', () => {
    const twins = [
      { pieceId: 'A', pieceClass: 'Xyz9', x: 0, y: 0, angleDeg: 0, colorIndex: 0,
        vertex1: { x: 0, y: 0 }, vertex2: { x: 0, y: 0 }, isSupported: false },
      { pieceId: 'B', pieceClass: 'Xyz9', x: 50, y: 0, angleDeg: 0, colorIndex: 0,
        vertex1: { x: 50, y: 0 }, vertex2: { x: 50, y: 0 }, isSupported: false },
    ] as ParsedPiece[]
    const placeholders = buildUnsupportedPlaceholders(twins)
    expect(placeholders).toHaveLength(2)
    expect(placeholders[0]!.x).not.toBe(placeholders[1]!.x)
  })

  it('타입명을 그대로 노출한다', () => {
    expect(unsupportedLabelOf('Wob2')).toBe('미지원: Wob2')
  })
})
