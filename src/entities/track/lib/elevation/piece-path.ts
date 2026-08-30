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

/**
 * FEAT-016 — 웨이브(`Chi*`)는 **고도가 아니라 평면상 옆으로 튀어나온 곡면**이다(D-032).
 *
 * 편집기는 위에서 내려다본 2D 도면이고 고도를 그릴 수단이 없다 — 슬로프조차 평평하게
 * 그리고 색으로만 오르내림을 표시한다. 그렇다면 `Chi1` 이미지에서 띠가 눈에 보이게 휘어
 * 있는 것은 **평면상 휘어진 것**일 수밖에 없다. 종전 구현은 `Chi*`를 `wave`로 분류만 하고
 * 횡돌출을 만들지 않았다 — 이 조항이 FEAT-005 산문에만 있고 TC가 하나도 없었기 때문이다.
 */
const WAVE_PIECE_PREFIX = 'Chi'

/** 돌출량(cm). D-032의 픽셀 측정값이며 등급은 `measured`다 */
const WAVE_AMPLITUDE = 5

/**
 * 모양은 `sin²(πt)` — 부풀림이 피스 전체에 퍼진다.
 *
 * **가운데로 모을 수 없다(기하 한계, 2026-08-31 실측).** 레인 면은 중심선에서 ±18cm
 * 오프셋이라 중심선의 곡률반경이 반폭보다 작아지면 안쪽 가장자리가 자기 자신을 접는다
 * (offset curve self-intersection). 실측 최소 곡률반경:
 *
 * | 형상 | 최소 R | 판정 |
 * |---|---|---|
 * | 전구간 `sin²` 5cm | 29.5cm | OK |
 * | 전구간 `sin²` 8cm | 18.5cm | OK(반폭 18cm에 아슬아슬) |
 * | 구간 0.8 · 8cm | 11.8cm | 접힘 |
 * | 구간 0.6 · 8cm | 0.1cm | 접힘 |
 *
 * 관계식은 `R ≈ 29.5 × (5/돌출량) × 구간²`다 — Ω처럼 좁고 깊게 만들수록 제곱으로
 * 나빠진다. 지수를 2 미만으로 낮춰 마루를 납작하게 만드는 것도 안 된다: `sin^q`의 2계
 * 도함수가 `sin^(q−2)`라 q<2면 구간 경계에서 곡률이 **발산**한다.
 *
 * Ω(옴) 자 형태를 그리려면 `lane-bands`가 오프셋 접힘을 처리해야 한다 — 그것은 이 파일이
 * 아니라 캔버스 위젯의 일이다.
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
     * 돌출 방향은 **진행 방향 기준 오른쪽**이다.
     *
     * D-032 본문의 픽셀 실측이 오른쪽이었고, 같은 날 §개정에서 사용자 재지정으로 왼쪽이
     * 됐다. 화면에서 반대로 보인다는 사용자 지정(2026-08-31)으로 **1차 실측 방향으로
     * 되돌린다.** 좌표 변환 결함이 아니다 — 편집기 `(x, y)`의 왼손 방향 `(ty, −tx)`는
     * 씬 `(x, z)` 매핑에서 `(tz, 0, −tx)`가 되고 이는 씬의 `up × travel`과 같다(핸디드니스
     * 보존). 즉 종전 코드는 개정이 정한 "왼쪽"을 정확히 그리고 있었다.
     *
     * 진행 방향이 곧 기준이므로 `flipped`면 기준축도 뒤집어야 한다 — vertex1→vertex2
     * 방향으로 고정하면 역방향 통과에서 돌출이 반대편으로 나온다(TC-016-3).
     *
     * 편집기 y는 화면 아래로 증가한다. 진행 방향 `(dx, dy)`의 오른손 쪽은 `(−dy, dx)`다.
     */
    const travelX = flipped ? from.x - to.x : to.x - from.x
    const travelY = flipped ? from.y - to.y : to.y - from.y
    const sideX = chord === 0 ? 0 : -travelY / chord
    const sideY = chord === 0 ? 0 : travelX / chord

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
        return { x: base.x + sideX * bow, y: base.y + sideY * bow }
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
