// 복원된 순서(FEAT-003)에 주행 방향을 입혀 `OrientedPiece`를 만든다.
// `orderedPieceIds`는 어느 끝으로 들어가고 나가는지를 담지 못하는데, 코너의 원호와
// 고도 프로파일은 그 방향에 따라 달라진다.
//
// 이음새마다 가까운 쪽을 그때그때 고르면 참조 트랙의 31.67px 구멍에서 방향이 뒤집혀
// 이후가 통째로 어긋나므로, 사슬 전체의 간격 합을 최소화한다.
//
// **중복 고지**: `lib/closure/validate-closure.ts`의 `orientChain`이 같은 계산을 한다.
// 두 티켓(FEAT-004·FEAT-005)이 병렬 단위라 서로의 경로를 고칠 수 없어 각자 갖고 있다 —
// 소유자가 하나인 공유 모듈로 올리는 것이 후속 정리 대상이다.
import type { ParsedPiece } from '../../model/types'
import type { OrientedPiece, Point } from './types'

type VertexIndex = 0 | 1

const VERTEX_INDICES: readonly VertexIndex[] = [0, 1]

function vertexAt(piece: ParsedPiece, index: VertexIndex): Point {
  return index === 0 ? piece.vertex1 : piece.vertex2
}

function opposite(index: VertexIndex): VertexIndex {
  return index === 0 ? 1 : 0
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function orientPath(ordered: readonly ParsedPiece[]): OrientedPiece[] {
  const length = ordered.length
  if (length === 0) return []

  const INFINITE = Number.POSITIVE_INFINITY
  const cost: [number, number][] = ordered.map(() => [INFINITE, INFINITE])
  const from: [VertexIndex, VertexIndex][] = ordered.map(() => [0, 0])
  const head = cost[0]
  if (head === undefined) return []
  // START는 화살표(local +x = vertex2) 쪽으로 나간다 (D-038 ①)
  head[1] = 0

  for (let index = 0; index + 1 < length; index += 1) {
    const current = ordered[index]
    const next = ordered[index + 1]
    const currentCost = cost[index]
    const nextCost = cost[index + 1]
    const nextFrom = from[index + 1]
    if (
      current === undefined ||
      next === undefined ||
      currentCost === undefined ||
      nextCost === undefined ||
      nextFrom === undefined
    ) {
      return []
    }
    for (const exit of VERTEX_INDICES) {
      const reached = currentCost[exit]
      if (reached === INFINITE) continue
      const exitPoint = vertexAt(current, exit)
      for (const nextExit of VERTEX_INDICES) {
        const total = reached + distance(exitPoint, vertexAt(next, opposite(nextExit)))
        if (total < nextCost[nextExit]) {
          nextCost[nextExit] = total
          nextFrom[nextExit] = exit
        }
      }
    }
  }

  const tail = cost[length - 1]
  if (tail === undefined) return []
  const exits: VertexIndex[] = []
  exits[length - 1] = tail[0] <= tail[1] ? 0 : 1
  for (let index = length - 1; index > 0; index -= 1) {
    const chosen = exits[index]
    const step = from[index]
    if (chosen === undefined || step === undefined) return []
    exits[index - 1] = step[chosen]
  }

  // vertex2로 나가면 정방향, vertex1로 나가면 뒤집힌 주행이다
  return ordered.map((piece, index) => ({ piece, flipped: exits[index] === 0 }))
}
