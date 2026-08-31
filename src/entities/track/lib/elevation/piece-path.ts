// 피스 내부의 2D 진행 경로. 코너를 현으로만 다루면 기운 평면 위의 높이가 틀어진다 —
// 판축 거리 d는 **피스 안쪽 점의 위치**로 정해지기 때문이다.
// 근거: piece-shapes 카탈로그(현 각도의 2배가 선회각) · D-036(끝점 고정, 가운데만 부푼다)
import { centerlineRouteOf } from './lane-routes'
import { toAbsolutePath } from './local-path'
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

/**
 * FEAT-016 — 웨이브(`Chi*`)는 **고도가 아니라 평면상 옆으로 튀어나온 곡면**이다(D-032).
 *
 * 편집기는 위에서 내려다본 2D 도면이고 고도를 그릴 수단이 없다 — 슬로프조차 평평하게
 * 그리고 색으로만 오르내림을 표시한다. 그렇다면 `Chi1` 이미지에서 띠가 눈에 보이게 휘어
 * 있는 것은 **평면상 휘어진 것**일 수밖에 없다. 종전 구현은 `Chi*`를 `wave`로 분류만 하고
 * 횡돌출을 만들지 않았다 — 이 조항이 FEAT-005 산문에만 있고 TC가 하나도 없었기 때문이다.
 */
const WAVE_PIECE_PREFIX = 'Chi'

/** 돌출량(cm). 픽셀 측정값이며 D-032 개정에서 5cm로 되돌아와 측정값과 정확히 일치한다 */
const WAVE_AMPLITUDE = 5

/**
 * 모양은 `sin²(πt)`다 — 양 끝 기울기가 0이라 앞뒤 직선과 매끄럽게 잇고 마루도 각지지
 * 않는다("양 끝은 직선"과 "각진 것이 아니라 곡면"을 동시에 만족한다, D-032 개정).
 * 1차 확정이던 삼각형 `1 − |2t − 1|`은 사용자 재지정으로 폐기됐다.
 *
 * `sin²(π(1 − t)) = sin²(πt)`라 **매개변수를 뒤집어도 같은 값**이다 — 역방향 통과에서
 * 마루가 옮겨가지 않는다.
 */
function waveBow(t: number): number {
  return Math.sin(Math.PI * t) ** 2 * WAVE_AMPLITUDE
}

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

  // FEAT-018 — 끝이 같은 변에 있는 U턴형 피스는 현·선회각으로 복원할 수 없다. 도면 실측
  // 로컬 경로가 있으면 그것이 중심선이다(`lane-routes.ts`, D-049).
  const route = centerlineRouteOf(piece.pieceClass)
  if (route !== undefined) return toAbsolutePath(route, piece, flipped)

  const from = piece.vertex1
  const to = piece.vertex2
  const turnDeg = Object.prototype.hasOwnProperty.call(TURN_DEG, piece.pieceClass)
    ? TURN_DEG[piece.pieceClass]
    : undefined

  const forward = (t: number): number => (flipped ? 1 - t : t)
  const arc = turnDeg === undefined ? null : arcOf(from, to, turnDeg)

  if (arc === null) {
    const chord = distance(from, to)
    const isWave = piece.pieceClass.startsWith(WAVE_PIECE_PREFIX)

    /**
     * 돌출 방향은 **편집기 2D 좌표에서 `n = [−tan.y, tan.x]`의 양의 방향**이다.
     *
     * 종전 구현은 `(tan.y, −tan.x)`를 써서 **부호가 반대**였다 — 프리뷰와 나란히 놓으면
     * 웨이브가 서로 반대편으로 튀어나왔고, 사용자가 프리뷰 쪽이 맞다고 확정했다
     * (2026-08-31). 원인은 "왼쪽/오른쪽"이라는 낱말이다: 편집기 좌표에서 재는 것과
     * 투영된 화면에서 보는 것이 달라, D-032 개정의 "왼쪽"을 편집기 좌표로 읽으면 부호가
     * 뒤집힌다. 그래서 정본이 낱말 대신 **이 벡터**로 방향을 정한다.
     *
     * 진행 방향이 기준이므로 `flipped`면 기준축도 뒤집는다 — vertex1→vertex2로 고정하면
     * 역방향 통과에서 돌출이 반대편으로 나온다(TC-016-3).
     */
    const travelX = flipped ? from.x - to.x : to.x - from.x
    const travelY = flipped ? from.y - to.y : to.y - from.y
    const bowX = chord === 0 ? 0 : -travelY / chord
    const bowY = chord === 0 ? 0 : travelX / chord

    return {
      // 곡면 돌출로 실제 경로는 현보다 길지만, 웨이브는 고도 변화가 0이라(D-032)
      // `length`를 쓰는 유일한 소비자인 기울기 계산에 영향을 주지 않는다. 현을 유지해
      // 다른 직선과 같은 규칙을 쓴다.
      length: chord,
      pointAt(t) {
        const s = forward(t)
        const base = {
          x: from.x + (to.x - from.x) * s,
          y: from.y + (to.y - from.y) * s,
        }
        if (!isWave) return base
        const bow = waveBow(t)
        return { x: base.x + bowX * bow, y: base.y + bowY * bow }
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
