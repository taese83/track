// FEAT-004 — `RestoredPath` 5필드 중 FEAT-003이 채우지 않은 4개(isClosedLoop·brokenAt·isZClosed·
// zClosureGap)를 채운다. 판정만 하고 보정하지 않는다 — 어긋난 고도를 억지로 맞추면 화면이
// "닫혔다"고 거짓말한다(제품 계약 §5 "조용히 숨기지 않는다").
import type { ParsedPiece, RestoredPath } from '../../model/types'
import type { RestoreOrderResult } from '../restore/restore-order'
import type { EvidenceGrade, PieceElevationDelta } from './piece-elevation'
import { computePieceElevationDelta, worstGrade } from './piece-elevation'

// FEAT-003과 같은 값이어야 한다 — 다른 잣대로 재면 "복원은 됐는데 폐곡선은 아니다"가 상시 발생한다.
// 실측 분포(restore-order 주석): 정상 이음새 최대 0.1695px, 매달린 끝 31.67px.
const SEAM_TOLERANCE = 1

// D-042 실측: 뱅크 20° 적용 후 고도 불연속 0.0003cm, 판 구간 평면 잔차 0.0000cm.
// 부동소수 누적 오차는 흡수하고 피스 하나(최소 9.58cm)의 불균형은 반드시 걸리는 자리다.
const Z_CLOSURE_TOLERANCE = 0.01

const INFINITE_GAP = Number.POSITIVE_INFINITY

const START_PIECE_CLASS = 'Str2'

export type BrokenReason =
  /** 복원 자체가 실패해 START부터 이어붙일 수 있는 데까지만 확보했다 */
  | 'order-restore-failed'
  /** 전 피스를 지났지만 마지막 끝점이 START로 돌아오지 않았다 */
  | 'loop-does-not-return-to-start'

export interface ClosureValidation extends Pick<
  RestoredPath,
  'isClosedLoop' | 'isZClosed' | 'zClosureGap'
> {
  brokenAt: { afterPieceId: string; reason: BrokenReason } | null
  /**
   * 이어진 구간. 복원이 성공했으면 순서 전체와 같다. 부분 실패 시 START에서 **양방향**으로
   * 이어진 사슬(D-050 — 뒤쪽 걷기를 뒤집어 앞에 붙인다)이며, 그 사슬만 정상 렌더하고
   * 나머지는 회색으로 내린다(TC-004-2/3). START는 사슬 중간에 올 수 있다.
   */
  connectedPieceIds: string[]
  /**
   * `connectedPieceIds`가 FEAT-003이 확정한 정본 순서인가.
   * false면 FEAT-004가 진단용으로 이어붙인 접두부이며 순서의 정본이 아니다 —
   * `orderedPieceIds`의 소유자는 FEAT-003 하나뿐이다.
   */
  orderConfirmed: boolean
}

interface Point {
  x: number
  y: number
}

type VertexIndex = 0 | 1

const VERTEX_INDICES: readonly VertexIndex[] = [0, 1]

interface Endpoint {
  piece: ParsedPiece
  vertexIndex: VertexIndex
}

function vertexAt(piece: ParsedPiece, vertexIndex: VertexIndex): Point {
  return vertexIndex === 0 ? piece.vertex1 : piece.vertex2
}

function opposite(vertexIndex: VertexIndex): VertexIndex {
  return vertexIndex === 0 ? 1 : 0
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function endpointsOf(pieces: readonly ParsedPiece[]): Endpoint[] {
  const endpoints: Endpoint[] = []
  for (const piece of pieces) {
    for (const vertexIndex of VERTEX_INDICES) endpoints.push({ piece, vertexIndex })
  }
  return endpoints
}

/**
 * 주어진 순서의 각 피스가 어느 끝으로 나가는지 정한다.
 * 이웃마다 가까운 쪽을 그때그때 고르면 31.67px 구멍(참조 트랙 p117↔p118)에서 방향이 뒤집혀
 * 이후 이음새가 통째로 어긋난다 — 사슬 전체의 간격 합을 최소화해야 한 번에 맞는다.
 * START는 화살표(local +x = vertex2) 쪽으로 나가는 것이 고정이다(D-038 ①).
 */
function orientChain(ordered: readonly ParsedPiece[]): VertexIndex[] {
  const length = ordered.length
  const exits: VertexIndex[] = []
  if (length === 0) return exits

  const cost: [number, number][] = ordered.map(() => [INFINITE_GAP, INFINITE_GAP])
  const from: [VertexIndex, VertexIndex][] = ordered.map(() => [0, 0])

  const head = cost[0]
  if (head === undefined) return exits
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
      return exits
    }

    for (const exit of VERTEX_INDICES) {
      const reached = currentCost[exit]
      if (reached === INFINITE_GAP) continue
      const exitPoint = vertexAt(current, exit)
      for (const nextExit of VERTEX_INDICES) {
        const entryPoint = vertexAt(next, opposite(nextExit))
        const total = reached + distance(exitPoint, entryPoint)
        if (total < nextCost[nextExit]) {
          nextCost[nextExit] = total
          nextFrom[nextExit] = exit
        }
      }
    }
  }

  const tail = cost[length - 1]
  if (tail === undefined) return exits
  exits[length - 1] = tail[0] <= tail[1] ? 0 : 1
  for (let index = length - 1; index > 0; index -= 1) {
    const chosen = exits[index]
    const step = from[index]
    if (chosen === undefined || step === undefined) return exits
    exits[index - 1] = step[chosen]
  }
  return exits
}

/**
 * 이웃이 하나도 없는 끝끼리, **서로가 서로의 최근접일 때만** 잇는다.
 * 참조 트랙은 매달린 끝이 정확히 둘이라 FEAT-003이 무조건 이어붙이지만(D-038 ②),
 * 어긋난 트랙은 매달린 끝이 여럿이라 그 규칙이 서지 않는다 — 상호 최근접이면 짝이 유일하므로
 * 원래 있던 구멍은 통과시키고 새로 생긴 끊김에서만 멈출 수 있다.
 */
function mutualDanglingPartners(endpoints: readonly Endpoint[]): Map<Endpoint, Endpoint> {
  const dangling = endpoints.filter((endpoint) => {
    const point = vertexAt(endpoint.piece, endpoint.vertexIndex)
    return !endpoints.some(
      (other) =>
        other.piece !== endpoint.piece &&
        distance(point, vertexAt(other.piece, other.vertexIndex)) <= SEAM_TOLERANCE,
    )
  })

  const nearest = new Map<Endpoint, Endpoint>()
  for (const endpoint of dangling) {
    const point = vertexAt(endpoint.piece, endpoint.vertexIndex)
    let best: Endpoint | undefined
    let bestGap = INFINITE_GAP
    for (const other of dangling) {
      if (other.piece === endpoint.piece) continue
      const gap = distance(point, vertexAt(other.piece, other.vertexIndex))
      if (gap < bestGap) {
        bestGap = gap
        best = other
      }
    }
    if (best !== undefined) nearest.set(endpoint, best)
  }

  const mutual = new Map<Endpoint, Endpoint>()
  for (const [endpoint, partner] of nearest) {
    if (nearest.get(partner) === endpoint) mutual.set(endpoint, partner)
  }
  return mutual
}

/**
 * 복원이 실패했을 때 START부터 이어붙일 수 있는 데까지만 걸어간다.
 * FEAT-003의 전역 탐색(백트래킹)과 달리 되돌아가지 않는다 — 정본 순서를 다시 찾는 것이 아니라
 * "어디서 끊겼는가"를 답하는 진단이기 때문이다.
 *
 * `exitVertex`는 START에서 나가는 끝이다 — 화살표(vertex2) 쪽이 앞, 반대(vertex1) 쪽이 뒤.
 * 이미 지난 피스(`alreadyVisited`)는 다시 밟지 않는다(양방향 걷기에서 앞쪽 사슬과 겹치지 않게).
 */
function walkConnectedPrefix(
  pieces: readonly ParsedPiece[],
  startPiece: ParsedPiece,
  exitVertex: VertexIndex = 1,
  alreadyVisited: ReadonlySet<string> = new Set(),
): ParsedPiece[] {
  const endpoints = endpointsOf(pieces)
  const mutual = mutualDanglingPartners(endpoints)
  const visited = new Set<string>([...alreadyVisited, startPiece.pieceId])
  const walked: ParsedPiece[] = [startPiece]

  let exit: Endpoint | undefined = endpoints.find(
    (endpoint) => endpoint.piece === startPiece && endpoint.vertexIndex === exitVertex,
  )

  while (exit !== undefined) {
    const exitPoint = vertexAt(exit.piece, exit.vertexIndex)

    let best: Endpoint | undefined
    let bestGap = INFINITE_GAP
    for (const candidate of endpoints) {
      if (visited.has(candidate.piece.pieceId)) continue
      const gap = distance(exitPoint, vertexAt(candidate.piece, candidate.vertexIndex))
      if (gap > SEAM_TOLERANCE) continue
      const ties =
        best !== undefined && gap === bestGap && candidate.piece.pieceId < best.piece.pieceId
      if (gap < bestGap || ties) {
        bestGap = gap
        best = candidate
      }
    }

    if (best === undefined) {
      const partner = mutual.get(exit)
      if (partner === undefined || visited.has(partner.piece.pieceId)) break
      best = partner
    }

    visited.add(best.piece.pieceId)
    walked.push(best.piece)
    const chosen = best
    exit = endpoints.find(
      (endpoint) =>
        endpoint.piece === chosen.piece && endpoint.vertexIndex === opposite(chosen.vertexIndex),
    )
  }

  return walked
}

/**
 * START에서 **양방향**으로 이어진 사슬(D-050). 화살표 방향 걷기가 짧게 끝나도(실측 R84APY:
 * 앞 6피스, 뒤 106피스) 트랙은 대개 한 사슬로 이어져 있다 — 뒤쪽 걷기를 뒤집어 앞에 붙이면
 * 사슬은 START를 **화살표 방향으로 통과**하므로 D-038 ①의 출발 방향은 그대로다.
 * 뒤쪽 걷기는 앞쪽이 밟은 피스를 다시 밟지 않는다(두 갈래가 같은 고리에서 만나면 한쪽에서 멈춘다).
 */
function walkConnectedChain(
  pieces: readonly ParsedPiece[],
  startPiece: ParsedPiece,
): ParsedPiece[] {
  const forward = walkConnectedPrefix(pieces, startPiece, 1)
  const backward = walkConnectedPrefix(
    pieces,
    startPiece,
    0,
    new Set(forward.map((piece) => piece.pieceId)),
  )
  return [...backward.slice(1).reverse(), ...forward]
}

function sumElevation(
  ordered: readonly ParsedPiece[],
  overrides: ReadonlyMap<string, PieceElevationDelta> | undefined,
): { value: number; grade: EvidenceGrade } {
  let total = 0
  const grades: EvidenceGrade[] = []
  for (const piece of ordered) {
    const delta = overrides?.get(piece.pieceId) ?? computePieceElevationDelta(piece)
    total += delta.value
    if (delta.contributes) grades.push(delta.grade)
  }
  return { value: total, grade: worstGrade(grades) }
}

export interface ClosureValidationInput {
  /** FEAT-002가 낸 피스 전체 */
  pieces: readonly ParsedPiece[]
  /** FEAT-003의 순서 복원 결과 */
  restored: RestoreOrderResult
  /**
   * FEAT-005가 고도 프로파일을 산출하면 피스별 순 변화량을 여기로 주입한다.
   * 없으면 현(chord) 규칙 기본값을 쓴다 — 폐합의 정본은 누적 합이라 곡선 모양과 무관하다.
   */
  elevationDeltas?: ReadonlyMap<string, PieceElevationDelta>
}

/**
 * XY 폐곡선과 Z(고도) 폐합을 **따로** 판정한다.
 * XY가 닫혀도 상승/하강이 불균형하면 START에서 수직 불연속이 남으므로 한 상태로 합치지 않는다.
 */
export function validateClosure(input: ClosureValidationInput): ClosureValidation {
  const { pieces, restored, elevationDeltas } = input
  const supported = pieces.filter((piece) => piece.isSupported)
  const byId = new Map(supported.map((piece) => [piece.pieceId, piece]))

  const orderConfirmed = restored.ok
  let ordered: ParsedPiece[]
  if (restored.ok) {
    ordered = []
    for (const pieceId of restored.orderedPieceIds) {
      const piece = byId.get(pieceId)
      if (piece !== undefined) ordered.push(piece)
    }
  } else {
    const startPiece = supported.find((piece) => piece.pieceClass === START_PIECE_CLASS)
    ordered = startPiece === undefined ? [] : walkConnectedChain(supported, startPiece)
  }

  const connectedPieceIds = ordered.map((piece) => piece.pieceId)
  const head = ordered[0]
  const last = ordered[ordered.length - 1]

  let isClosedLoop = false
  if (restored.ok && head !== undefined && last !== undefined) {
    const exits = orientChain(ordered)
    const lastExit = exits[ordered.length - 1]
    if (lastExit !== undefined) {
      // START는 vertex2로 나갔으므로 되돌아올 자리는 vertex1이다 (D-038 ①)
      isClosedLoop = distance(vertexAt(last, lastExit), head.vertex1) <= SEAM_TOLERANCE
    }
  }

  const brokenAt: ClosureValidation['brokenAt'] =
    isClosedLoop || last === undefined
      ? null
      : {
          afterPieceId: last.pieceId,
          reason: restored.ok ? 'loop-does-not-return-to-start' : 'order-restore-failed',
        }

  // XY가 열려 있으면 경로가 START로 돌아오지 않으므로 "돌아왔을 때의 고도 차"가 정의되지 않는다
  if (!isClosedLoop) {
    return {
      isClosedLoop,
      brokenAt,
      isZClosed: null,
      zClosureGap: null,
      connectedPieceIds,
      orderConfirmed,
    }
  }

  const gap = sumElevation(ordered, elevationDeltas)
  return {
    isClosedLoop,
    brokenAt,
    isZClosed: Math.abs(gap.value) <= Z_CLOSURE_TOLERANCE,
    zClosureGap: gap,
    connectedPieceIds,
    orderConfirmed,
  }
}
