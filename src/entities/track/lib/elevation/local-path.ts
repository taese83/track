// FEAT-018 — 피스 **로컬 좌표**의 합성 경로(직선·원호 이어붙이기)와 절대 좌표 변환.
//
// `piece-path.ts`는 두 끝점과 선회각에서 원호 하나를 복원한다 — 끝이 같은 변에 있는
// U턴형 피스(레인보우 체인저 `Lan2`)는 그 방식으로는 만들 수 없다. 여기서는 도면 실측
// 좌표(`piece-geometry.md` §레인보우 체인저)를 로컬 좌표 그대로 이어 붙이고, 배치 계약
// (`끝점 = position + rotate(offset, angleDeg)`)과 **같은 변환**으로 절대 좌표에 놓는다.
import type { ParsedPiece } from '../../model/types'
import type { PiecePath } from './piece-path'
import type { Point } from './types'

const RAD = Math.PI / 180

/** 로컬 좌표의 경로. `t ∈ [0,1]`은 **호 길이 비례**다 — 직선·원호가 섞여도 속도가 일정하다 */
export interface LocalPath {
  pointAt(t: number): Point
  length: number
}

/** 합성 경로의 한 조각. `s`는 조각 안 호 길이(0 ≤ s ≤ length) */
export interface PathPart {
  length: number
  at(s: number): Point
}

export function line(from: Point, to: Point): PathPart {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  return {
    length,
    at(s) {
      const ratio = length === 0 ? 0 : s / length
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
    },
  }
}

/**
 * 원호. 각도는 도(°)이며 편집기 좌표(y 아래로 증가)에서 `θ → (cx + r cosθ, cy + r sinθ)`다 —
 * −90°가 중심 **위**, 0°가 오른쪽, +90°가 아래. `fromDeg → toDeg`로 진행한다.
 */
export function arc(center: Point, radius: number, fromDeg: number, toDeg: number): PathPart {
  const sweep = (toDeg - fromDeg) * RAD
  const length = Math.abs(radius * sweep)
  return {
    length,
    at(s) {
      const ratio = length === 0 ? 0 : s / length
      const angle = fromDeg * RAD + sweep * ratio
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
    },
  }
}

/** 조각을 이어 붙인다. 빈 목록이면 원점에 머무는 길이 0 경로다 */
export function composite(parts: readonly PathPart[]): LocalPath {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  return {
    length,
    pointAt(t) {
      const clamped = Math.min(Math.max(t, 0), 1)
      let remaining = clamped * length
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index]!
        const last = index === parts.length - 1
        if (remaining <= part.length || last) return part.at(Math.min(remaining, part.length))
        remaining -= part.length
      }
      return { x: 0, y: 0 }
    },
  }
}

/** `piece-geometry.md` §좌표 계약 — 파서의 끝점 회전과 같은 식이어야 끝점이 맞물린다 */
function rotate(point: Point, angleDeg: number): Point {
  const rad = angleDeg * RAD
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

/**
 * 로컬 경로를 피스의 위치·각도로 절대 좌표에 놓는다. 형상은 언제나 로컬 정의 방향으로
 * 만들고 주행이 반대면 매개변수만 뒤집는다(`piece-path.ts`와 같은 규약 — 끝점을 맞바꿔
 * 만들면 원호가 거울상이 된다).
 */
export function toAbsolutePath(
  local: LocalPath,
  piece: Pick<ParsedPiece, 'x' | 'y' | 'angleDeg'>,
  flipped: boolean,
): PiecePath {
  return {
    length: local.length,
    pointAt(t) {
      const rotated = rotate(local.pointAt(flipped ? 1 - t : t), piece.angleDeg)
      return { x: piece.x + rotated.x, y: piece.y + rotated.y }
    },
  }
}
