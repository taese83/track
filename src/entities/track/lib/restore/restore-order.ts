// D-038 · D-039 — 네 규칙(START 화살표 · 매달린 끝 2개 잇기 · 좌표 정확 일치 우선 · 백트래킹)이
// 함께 있어야 답이 나온다. 하나라도 빠지면 참조 트랙에서 복원이 멈춘다.
import type { ParsedPiece, RestoredPath } from '../../model/types'

export type StartSelectionReason = 'only-start-piece' | 'first-start-piece-in-input'

export interface StartSelection {
  pieceId: string
  reason: StartSelectionReason
  /** 입력 배열에 등장한 순서 그대로의 Str2 목록 */
  candidatePieceIds: string[]
}

/** FEAT-003이 소유하는 RestoredPath의 부분. 나머지 4필드는 FEAT-004가 채운다 */
export interface RestoreOrderSuccess extends Pick<RestoredPath, 'orderedPieceIds'> {
  ok: true
  start: StartSelection
}

export type RestoreOrderFailureReason =
  | 'start-piece-missing'
  | 'traversal-incomplete'
  | 'search-budget-exceeded'

export interface RestoreOrderFailure {
  ok: false
  reason: RestoreOrderFailureReason
}

export type RestoreOrderResult = RestoreOrderSuccess | RestoreOrderFailure

const START_PIECE_CLASS = 'Str2'

// 실측 분포(change-scope "선행 실측"): 정상 이음새의 최대 간격 0.1695px, 매달린 끝 22.33px.
// 두 자릿수 간극 사이에 두어 어느 쪽으로도 오분류되지 않게 한다.
const SEAM_TOLERANCE = 1

// 입체교차의 두 무리는 0.06px 떨어져 있다 — 이보다 좁아야 무리가 갈린다 (D-039)
const CLUSTER_TOLERANCE = 0.02

// 실측 탐색 비용 212노드. 지수 폭발이 아니므로 여유롭게 두되 무한 탐색은 막는다
const SEARCH_NODE_BUDGET = 200_000

interface Point {
  x: number
  y: number
}

type VertexIndex = 0 | 1

const VERTEX_INDICES: readonly VertexIndex[] = [0, 1]

interface TrackNode {
  pieceId: string
  vertices: readonly [Point, Point]
  visited: boolean
}

interface Endpoint {
  node: TrackNode
  vertexIndex: VertexIndex
}

interface Candidate {
  node: TrackNode
  entryVertex: VertexIndex
  gap: number
  /** 진행 방향과 후보 진행 방향의 내적. 1에 가까울수록 직진 */
  continuity: number
}

function vertexAt(node: TrackNode, vertexIndex: VertexIndex): Point {
  return vertexIndex === 0 ? node.vertices[0] : node.vertices[1]
}

function pointOf(endpoint: Endpoint): Point {
  return vertexAt(endpoint.node, endpoint.vertexIndex)
}

function opposite(vertexIndex: VertexIndex): VertexIndex {
  return vertexIndex === 0 ? 1 : 0
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function unitVector(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: 0, y: 0 }
  return { x: dx / length, y: dy / length }
}

function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.node === b.node && a.vertexIndex === b.vertexIndex
}

function comparePieceId(a: Candidate, b: Candidate): number {
  if (a.node.pieceId !== b.node.pieceId) return a.node.pieceId < b.node.pieceId ? -1 : 1
  return a.entryVertex - b.entryVertex
}

function compareByGap(a: Candidate, b: Candidate): number {
  return a.gap === b.gap ? comparePieceId(a, b) : a.gap - b.gap
}

function compareByContinuity(a: Candidate, b: Candidate): number {
  return a.continuity === b.continuity ? comparePieceId(a, b) : b.continuity - a.continuity
}

type Bridge = readonly [Endpoint, Endpoint] | null

function isBridged(a: Endpoint, b: Endpoint, bridge: Bridge): boolean {
  if (bridge === null) return false
  const [first, second] = bridge
  return (
    (sameEndpoint(first, a) && sameEndpoint(second, b)) ||
    (sameEndpoint(first, b) && sameEndpoint(second, a))
  )
}

/**
 * 매달린 끝: ① 이웃이 하나도 없는 끝, 또는 ② 이웃은 있으나 그 이웃들이 **이미 서로 정확히
 * 짝지어져** 있어 자기 짝이 아닌 끝(D-051 — "끼어든 끝"). 실측 R84APY: 코너 p0의 끝이 세로
 * 직선 이음새(p70↔p71, 정확 일치)에 0.285px 붙어 있어 ①로는 매달린 끝이 하나(p60)뿐이었고,
 * 실제 짝인 p60(16px 벌어짐)과 이어지지 못해 112피스 폐곡선이 통째로 복원 실패였다.
 * 정확 일치가 이음새의 신호라는 TC-003-3의 논리를 그대로 뒤집은 것이다 — 이음새의 두 끝이
 * 서로 정확히 맞물려 있으면 그 옆의 세 번째 끝은 거기 속하지 않는다.
 */
function isExactlyPaired(endpoint: Endpoint, endpoints: readonly Endpoint[]): boolean {
  const point = pointOf(endpoint)
  return endpoints.some(
    (other) => other.node !== endpoint.node && distance(point, pointOf(other)) <= CLUSTER_TOLERANCE,
  )
}

/** `endpoint`를 뺀, `around`와 정확히 겹친 끝의 수(자기 자신 포함) */
function exactClusterSize(around: Endpoint, excluding: Endpoint, endpoints: readonly Endpoint[]): number {
  const point = pointOf(around)
  return endpoints.filter(
    (other) => other.node !== excluding.node && distance(point, pointOf(other)) <= CLUSTER_TOLERANCE,
  ).length
}

function isDangling(endpoint: Endpoint, endpoints: readonly Endpoint[]): boolean {
  const point = pointOf(endpoint)
  const neighbours = endpoints.filter(
    (other) => other.node !== endpoint.node && distance(point, pointOf(other)) <= SEAM_TOLERANCE,
  )
  if (neighbours.length === 0) return true
  if (isExactlyPaired(endpoint, endpoints)) return false
  // 이웃이 속한 정확 무리가 (나를 빼고) **짝수**면 그들끼리 다 짝지어지므로 나는 끼어든 끝이다.
  // 홀수면 하나가 남으니 내가 그 짝이다 — 참조 트랙 실측: 입체교차 p47·p51·p52가 정확히 겹치고
  // p38이 0.17px 옆에 있어, 짝수 조건이 없으면 p38이 매달린 끝으로 오판돼 복원이 통째로 실패한다.
  return neighbours.every((neighbour) => {
    const size = exactClusterSize(neighbour, endpoint, endpoints)
    return size >= 2 && size % 2 === 0
  })
}

/** 매달린 끝이 정확히 둘이면 이을 곳이 하나뿐이라 모호함이 없다 (D-038 ②) */
function findDanglingBridge(nodes: readonly TrackNode[]): Bridge {
  const endpoints: Endpoint[] = []
  for (const node of nodes) {
    for (const vertexIndex of VERTEX_INDICES) endpoints.push({ node, vertexIndex })
  }

  const dangling = endpoints.filter((endpoint) => isDangling(endpoint, endpoints))

  const [first, second] = dangling
  if (dangling.length !== 2 || first === undefined || second === undefined) return null
  return [first, second]
}

/**
 * 좌표가 정확히 일치하는 쪽을 먼저 내고, 같은 무리 안에서만 접선 연속성으로 가른다.
 * 무리를 넘어 접선을 쓰면 입체교차에서 틀린 쪽이 더 직진으로 나온다 (D-039).
 */
function candidatesFrom(exit: Endpoint, nodes: readonly TrackNode[], bridge: Bridge): Candidate[] {
  const exitPoint = pointOf(exit)
  const heading = unitVector(vertexAt(exit.node, opposite(exit.vertexIndex)), exitPoint)

  const found: Candidate[] = []
  for (const node of nodes) {
    if (node.visited) continue
    for (const entryVertex of VERTEX_INDICES) {
      const entry: Endpoint = { node, vertexIndex: entryVertex }
      const entryPoint = pointOf(entry)
      const gap = distance(exitPoint, entryPoint)
      if (gap > SEAM_TOLERANCE && !isBridged(exit, entry, bridge)) continue

      const forward = unitVector(entryPoint, vertexAt(node, opposite(entryVertex)))
      found.push({
        node,
        entryVertex,
        gap,
        continuity: heading.x * forward.x + heading.y * forward.y,
      })
    }
  }

  found.sort(compareByGap)
  const best = found[0]
  if (best === undefined) return found

  const bestPoint = vertexAt(best.node, best.entryVertex)
  const cluster: Candidate[] = []
  const others: Candidate[] = []
  for (const candidate of found) {
    const point = vertexAt(candidate.node, candidate.entryVertex)
    if (distance(point, bestPoint) <= CLUSTER_TOLERANCE) cluster.push(candidate)
    else others.push(candidate)
  }
  cluster.sort(compareByContinuity)

  return [...cluster, ...others]
}

/**
 * 순서 없는 피스 배치에서 START(Str2)부터 시작하는 진행 순서를 복원한다.
 * 입력은 제3자 편집기가 만든 데이터이며 좌표 계산 외의 해석을 하지 않는다.
 */
export function restoreOrder(pieces: readonly ParsedPiece[]): RestoreOrderResult {
  const startCandidates = pieces.filter((piece) => piece.pieceClass === START_PIECE_CLASS)
  const startPiece = startCandidates[0]
  if (startPiece === undefined) return { ok: false, reason: 'start-piece-missing' }

  // 미지원 피스는 끝점을 모르므로 순서에 들어갈 수 없다 — 판단은 FEAT-009가 한다
  const nodes: TrackNode[] = pieces
    .filter((piece) => piece.isSupported)
    .map((piece) => ({
      pieceId: piece.pieceId,
      vertices: [piece.vertex1, piece.vertex2] as const,
      visited: false,
    }))

  const startNode = nodes.find((node) => node.pieceId === startPiece.pieceId)
  if (startNode === undefined) return { ok: false, reason: 'start-piece-missing' }

  const bridge = findDanglingBridge(nodes)
  const startEntry: Endpoint = { node: startNode, vertexIndex: 0 }

  const order: TrackNode[] = [startNode]
  startNode.visited = true

  let remainingBudget = SEARCH_NODE_BUDGET
  let budgetExhausted = false

  function closesLoop(exit: Endpoint): boolean {
    return (
      distance(pointOf(exit), pointOf(startEntry)) <= SEAM_TOLERANCE ||
      isBridged(exit, startEntry, bridge)
    )
  }

  function advance(exit: Endpoint): boolean {
    if (order.length === nodes.length) return closesLoop(exit)

    for (const candidate of candidatesFrom(exit, nodes, bridge)) {
      if (remainingBudget <= 0) {
        budgetExhausted = true
        return false
      }
      remainingBudget -= 1

      candidate.node.visited = true
      order.push(candidate.node)
      const next: Endpoint = { node: candidate.node, vertexIndex: opposite(candidate.entryVertex) }
      if (advance(next)) return true
      order.pop()
      candidate.node.visited = false

      if (budgetExhausted) return false
    }

    return false
  }

  // START의 화살표(local +x = vertex2) 쪽으로 나간다 (D-038 ①)
  const traversed = advance({ node: startNode, vertexIndex: 1 })
  if (!traversed) {
    return { ok: false, reason: budgetExhausted ? 'search-budget-exceeded' : 'traversal-incomplete' }
  }

  return {
    ok: true,
    orderedPieceIds: order.map((node) => node.pieceId),
    start: {
      pieceId: startPiece.pieceId,
      reason: startCandidates.length === 1 ? 'only-start-piece' : 'first-start-piece-in-input',
      candidatePieceIds: startCandidates.map((piece) => piece.pieceId),
    },
  }
}
