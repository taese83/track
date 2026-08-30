import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { parseTrackString } from '../parse/parse-track-string'
import type { RestoreOrderSuccess } from './restore-order'
import { restoreOrder } from './restore-order'

interface Point {
  x: number
  y: number
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

function requireItem<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`인덱스 ${index}가 범위 밖이다`)
  return item
}

function pieceById(pieces: readonly ParsedPiece[], pieceId: string): ParsedPiece {
  const piece = pieces.find((candidate) => candidate.pieceId === pieceId)
  if (piece === undefined) throw new Error(`${pieceId}를 찾을 수 없다`)
  return piece
}

function gap(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestGap(point: Point, piece: ParsedPiece): number {
  return Math.min(gap(point, piece.vertex1), gap(point, piece.vertex2))
}

function nearestOtherPieceGap(
  pieces: readonly ParsedPiece[],
  ownerId: string,
  point: Point,
): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const piece of pieces) {
    if (piece.pieceId === ownerId) continue
    nearest = Math.min(nearest, nearestGap(point, piece))
  }
  return nearest
}

function neighborsOf(orderedPieceIds: readonly string[], pieceId: string): string[] {
  const index = orderedPieceIds.indexOf(pieceId)
  if (index < 0) throw new Error(`${pieceId}가 순서에 없다`)
  const size = orderedPieceIds.length
  return [
    requireItem(orderedPieceIds, (index + size - 1) % size),
    requireItem(orderedPieceIds, (index + 1) % size),
  ]
}

function restored(pieces: readonly ParsedPiece[]): RestoreOrderSuccess {
  const result = restoreOrder(pieces)
  if (!result.ok) throw new Error(`복원 실패: ${result.reason}`)
  return result
}

/** 배열 순서 의존을 드러내기 위한 결정적 셔플(Lehmer LCG) */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items]
  let state = seed
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647
    const j = state % (i + 1)
    const held = requireItem(shuffled, i)
    shuffled[i] = requireItem(shuffled, j)
    shuffled[j] = held
  }
  return shuffled
}

describe('restoreOrder — 참조 트랙 복원 (TC-003-1)', () => {
  it('TC-003-1: WS67Y2에서 START로 시작하는 132개 순서를 낸다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const result = restored(pieces)

    expect(result.orderedPieceIds).toHaveLength(132)
    expect(new Set(result.orderedPieceIds).size).toBe(132)
    expect([...result.orderedPieceIds].sort()).toEqual([...pieces.map((p) => p.pieceId)].sort())
    expect(pieceById(pieces, requireItem(result.orderedPieceIds, 0)).pieceClass).toBe('Str2')
    expect(result.start.reason).toBe('only-start-piece')
  })

  it('TC-003-1: 마지막 피스의 진출 끝점이 START의 진입 끝점으로 돌아온다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds

    const start = pieceById(pieces, requireItem(ids, 0))
    const last = pieceById(pieces, requireItem(ids, ids.length - 1))
    const beforeLast = pieceById(pieces, requireItem(ids, ids.length - 2))

    const entryIsVertex1 = nearestGap(last.vertex1, beforeLast) < nearestGap(last.vertex2, beforeLast)
    const exitPoint = entryIsVertex1 ? last.vertex2 : last.vertex1

    expect(gap(exitPoint, start.vertex1)).toBeLessThan(0.001)
  })

  it('TC-003-1: 순서에 중복이 없고 132개를 정확히 한 번씩 쓴다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds

    const seen = new Map<string, number>()
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1)
    expect(seen.size).toBe(132)
    expect([...seen.values()].every((count) => count === 1)).toBe(true)
  })
})

describe('restoreOrder — 결정성 (TC-003-2)', () => {
  it('TC-003-2: 파싱부터 3회 반복해도 같은 순서를 낸다', async () => {
    const runs: string[][] = []
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pieces = await parseFixture('WS67Y2')
      runs.push(restored(pieces).orderedPieceIds)
    }

    expect(requireItem(runs, 1)).toEqual(requireItem(runs, 0))
    expect(requireItem(runs, 2)).toEqual(requireItem(runs, 0))
  })

  it('TC-003-2: 입력 배열을 섞어도 같은 순서를 낸다 — 후보 정렬이 기하와 pieceId만 본다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const baseline = restored(pieces).orderedPieceIds

    for (const seed of [1, 7, 4242]) {
      expect(restored(shuffle(pieces, seed)).orderedPieceIds).toEqual(baseline)
    }
  })

  it('START 선택만은 배열 순서에 의존한다 — MULTISTART를 뒤집으면 다른 START를 고른다', async () => {
    const pieces = await parseFixture('MULTISTART')
    const forward = restored(pieces)
    const reversed = restored([...pieces].reverse())

    expect(reversed.start.pieceId).not.toBe(forward.start.pieceId)
    expect(reversed.start.candidatePieceIds).toEqual(
      [...forward.start.candidatePieceIds].reverse(),
    )
    expect(requireItem(reversed.orderedPieceIds, 0)).toBe(reversed.start.pieceId)
  })
})

describe('restoreOrder — 입체교차 (TC-003-3)', () => {
  it('TC-003-3: raw 인덱스가 가리키는 피스가 실측과 같다', async () => {
    const pieces = await parseFixture('WS67Y2')

    expect(requireItem(pieces, 18)).toMatchObject({
      pieceClass: 'Cor1',
      x: 661.111,
      y: 641.142,
      angleDeg: 225,
    })
    expect(requireItem(pieces, 25)).toMatchObject({
      pieceClass: 'Cor1',
      x: 666,
      y: 601,
      angleDeg: 270,
    })
    expect(requireItem(pieces, 31)).toMatchObject({
      pieceClass: 'Str1',
      x: 658.023,
      y: 599.945,
      angleDeg: 270,
    })
    expect(requireItem(pieces, 32)).toMatchObject({
      pieceClass: 'Cor1',
      x: 650.023,
      y: 652.945,
      angleDeg: 90,
    })
  })

  it('TC-003-3: 네 끝점이 두 무리로 갈리고 무리 안에서만 좌표가 맞물린다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const a1 = requireItem(pieces, 18).vertex2
    const a2 = requireItem(pieces, 25).vertex1
    const b1 = requireItem(pieces, 31).vertex1
    const b2 = requireItem(pieces, 32).vertex1

    expect(gap(a1, a2)).toBeLessThan(0.001)
    expect(gap(b1, b2)).toBeLessThan(0.001)
    expect(gap(a1, b1)).toBeGreaterThan(0.02)
    expect(gap(a1, b1)).toBeLessThan(0.1)
  })

  it('TC-003-3: 무리 A끼리·무리 B끼리 잇는다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds

    expect(neighborsOf(ids, requireItem(pieces, 18).pieceId)).toContain(
      requireItem(pieces, 25).pieceId,
    )
    expect(neighborsOf(ids, requireItem(pieces, 31).pieceId)).toContain(
      requireItem(pieces, 32).pieceId,
    )
  })

  it('TC-003-3: D-039가 배제한 오답(#18↔#31)을 고르지 않는다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds

    expect(neighborsOf(ids, requireItem(pieces, 18).pieceId)).not.toContain(
      requireItem(pieces, 31).pieceId,
    )
  })
})

describe('restoreOrder — 출발 방향 (TC-003-6)', () => {
  it('TC-003-6: START의 진출은 vertex2(화살표) 쪽이다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds
    const start = pieceById(pieces, requireItem(ids, 0))
    const second = pieceById(pieces, requireItem(ids, 1))

    expect(nearestGap(start.vertex2, second)).toBeLessThan(0.001)
    expect(nearestGap(start.vertex1, second)).toBeGreaterThan(1)
  })
})

describe('restoreOrder — START 부재 (TC-003-4)', () => {
  it('TC-003-4: NOSTART는 성공 결과를 내지 않고 START 부재로 실패한다', async () => {
    const pieces = await parseFixture('NOSTART')
    const result = restoreOrder(pieces)

    expect(pieces).toHaveLength(131)
    expect(pieces.some((piece) => piece.pieceClass === 'Str2')).toBe(false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('start-piece-missing')
  })
})

describe('restoreOrder — START가 여럿 (TC-003-5)', () => {
  it('TC-003-5: MULTISTART는 WS67Y2에서 Str1 한 항목만 Str2로 바꾼 합성본이다', async () => {
    const pieces = await parseFixture('MULTISTART')
    const reference = await parseFixture('WS67Y2')
    const geometry = (list: readonly ParsedPiece[]): string[] =>
      list.map((piece) => `${piece.x};${piece.y};${piece.angleDeg};${piece.colorIndex}`)

    expect(pieces).toHaveLength(132)
    expect(geometry(pieces)).toEqual(geometry(reference))
    expect(pieces.filter((piece) => piece.pieceClass === 'Str2')).toHaveLength(2)
    expect(reference.filter((piece) => piece.pieceClass === 'Str2')).toHaveLength(1)
    expect(requireItem(pieces, 6).pieceClass).toBe('Str2')
    expect(requireItem(reference, 6).pieceClass).toBe('Str1')
  })

  it('TC-003-5: 배열 내 최초 등장 Str2를 고르고 선택 근거를 결과에 담는다', async () => {
    const pieces = await parseFixture('MULTISTART')
    const result = restored(pieces)
    const starts = pieces.filter((piece) => piece.pieceClass === 'Str2')

    expect(result.start.pieceId).toBe(requireItem(starts, 0).pieceId)
    expect(result.start.reason).toBe('first-start-piece-in-input')
    expect(result.start.candidatePieceIds).toEqual(starts.map((piece) => piece.pieceId))
    expect(requireItem(result.orderedPieceIds, 0)).toBe(requireItem(pieces, 6).pieceId)
  })

  it('TC-003-5: 고르지 않은 Str2도 일반 피스로 순서에 들어간다', async () => {
    const pieces = await parseFixture('MULTISTART')
    const result = restored(pieces)
    const starts = pieces.filter((piece) => piece.pieceClass === 'Str2')

    expect(result.orderedPieceIds).toHaveLength(132)
    expect(result.orderedPieceIds).toContain(requireItem(starts, 1).pieceId)
  })
})

describe('restoreOrder — 매달린 끝 (D-038 ②)', () => {
  it('매달린 끝 2개는 다른 어떤 피스와도 1px 안에서 만나지 않는다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const dangling1 = requireItem(pieces, 117)
    const dangling2 = requireItem(pieces, 118)

    expect(nearestOtherPieceGap(pieces, dangling1.pieceId, dangling1.vertex2)).toBeGreaterThan(20)
    expect(nearestOtherPieceGap(pieces, dangling2.pieceId, dangling2.vertex1)).toBeGreaterThan(20)
  })

  it('그 둘을 서로 이어 #117과 #118이 인접한다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const ids = restored(pieces).orderedPieceIds

    expect(neighborsOf(ids, requireItem(pieces, 117).pieceId)).toContain(
      requireItem(pieces, 118).pieceId,
    )
  })
})
