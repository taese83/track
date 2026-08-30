// 피스 내부의 2D 진행 경로. 코너를 현으로만 다루면 기운 평면 위의 높이가 틀어진다 —
// 판축 거리 d는 **피스 안쪽 점의 위치**로 정해지기 때문이다.
// 근거: piece-shapes 카탈로그(현 각도의 2배가 선회각) · D-036(끝점 고정, 가운데만 부푼다)
import type { OrientedPiece, Point } from './types'

/** 피스 타입별 선회각(도). 없으면 직선이다 */
const TURN_DEG: Readonly<Record<string, number>> = {
  Cor1: 45,
  Cor2: 45,
  Cor3: 90,
  Cor4: 90,
  Cor5: 45,
}

const RAD = Math.PI / 180

interface Arc {
  center: Point
  radius: number
  startAngle: number
  sweep: number
}

export interface PiecePath {
  /** t ∈ [0,1]에서의 절대 좌표. t=0이 주행 진입점이다 */
  pointAt(t: number): Point
  /** 피스 내부 2D 경로 길이. 직선은 현, 코너는 원호 길이다 */
  length: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * 현과 선회각으로 원호를 복원한다: `R = chord / (2 sin(turn/2))`.
 * 중심은 현의 수직이등분선 위에 두고 부호를 진행 방향으로 고정한다 — 진입점을 바꿔
 * 만들면 중심이 현 반대편으로 넘어가 코너가 거울상이 된다.
 */
function arcOf(from: Point, to: Point, turnDeg: number): Arc | null {
  const chord = distance(from, to)
  const half = (turnDeg / 2) * RAD
  const sine = Math.sin(half)
  if (chord === 0 || sine === 0) return null

  const radius = chord / (2 * sine)
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const normal = { x: -(to.y - from.y) / chord, y: (to.x - from.x) / chord }
  const offset = Math.sqrt(Math.max(radius * radius - (chord / 2) ** 2, 0))
  const center = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset }

  const startAngle = Math.atan2(from.y - center.y, from.x - center.x)
  const endAngle = Math.atan2(to.y - center.y, to.x - center.x)
  let sweep = endAngle - startAngle
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI

  return { center, radius, startAngle, sweep }
}

/**
 * 형상은 언제나 vertex1 → vertex2로 만들고, 주행이 반대면 매개변수만 뒤집는다.
 * 끝점을 맞바꿔 만들면 원호 중심이 넘어가 거울상이 된다(PC-009에서 실제로 겪은 결함).
 */
export function buildPiecePath(oriented: OrientedPiece): PiecePath {
  const { piece, flipped } = oriented
  const from = piece.vertex1
  const to = piece.vertex2
  const turnDeg = Object.prototype.hasOwnProperty.call(TURN_DEG, piece.pieceClass)
    ? TURN_DEG[piece.pieceClass]
    : undefined

  const forward = (t: number): number => (flipped ? 1 - t : t)
  const arc = turnDeg === undefined ? null : arcOf(from, to, turnDeg)

  if (arc === null) {
    const chord = distance(from, to)
    return {
      length: chord,
      pointAt(t) {
        const s = forward(t)
        return { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s }
      },
    }
  }

  return {
    length: Math.abs(arc.radius * arc.sweep),
    pointAt(t) {
      const angle = arc.startAngle + arc.sweep * forward(t)
      return {
        x: arc.center.x + arc.radius * Math.cos(angle),
        y: arc.center.y + arc.radius * Math.sin(angle),
      }
    },
  }
}
