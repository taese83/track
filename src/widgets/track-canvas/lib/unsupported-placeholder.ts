// FEAT-009 — 미지원 피스를 **조용히 생략하지 않는다**.
//
// 실측(2026-08-31): `UNSUPP` fixture는 134피스인데 `connectedPieceIds`가 132다. 미지원
// 피스는 끝점을 모르므로(FEAT-002가 `vertex1 = vertex2 = position`으로 둔다) 순서 복원이
// 자리를 주지 못하고, 그래서 3D 씬에 **한 개도 들어오지 않았다.** 화면은 그 자리에 아무것도
// 그리지 않았고 사용자는 피스가 빠졌다는 사실을 알 방법이 없었다.
//
// **경로 위에 끼워 넣지 않는다.** 끝점을 모르는 피스를 이어 붙이면 화면이 있지도 않은
// 연결을 주장한다(제품 계약 §5, FEAT-004가 부분 실패에서 세운 규칙과 같다). 대신 피스가
// **스스로 선언한 편집기 좌표**에 플레이스홀더를 세운다 — 그 좌표는 원문에 있는 사실이다.
import type { ParsedPiece } from '@/entities/track/model/types'

import { TRACK_WIDTH_CM } from './lane-model'

/**
 * 플레이스홀더 상자의 길이(cm). 미지원 피스는 카탈로그에 없어 **실제 길이를 모른다** —
 * 직선 1칸(54cm, `piece-geometry.md` §좌표 계약)을 명목값으로 쓰고, 이것이 측정값이 아니라는
 * 사실은 라벨의 "미지원" 표기가 말한다. 실제 길이를 아는 척하는 값을 넣지 않는다.
 */
export const PLACEHOLDER_LENGTH_CM = 54

/** 와이어프레임 높이(cm) — 바닥에 눌리지 않고 상자로 읽히는 최소 높이 */
export const PLACEHOLDER_HEIGHT_CM = 12

/**
 * 고도는 **모른다.** 미지원 피스는 경로에 자리가 없어 누적 고도가 정의되지 않는다 —
 * 0(바닥)에 두고 그 사실을 숨기지 않는다. 임의의 높이를 주면 화면이 없는 정보를 주장한다.
 */
const PLACEHOLDER_BASE_Y = 0

export interface UnsupportedPlaceholder {
  pieceId: string
  pieceClass: string
  /** 편집기 좌표를 씬 축으로 옮긴 중심(x → x, y → z) */
  x: number
  y: number
  z: number
  angleRad: number
  /** 화면에 그대로 노출하는 문구. 타입명을 뭉뚱그리지 않는다(TC-009-3) */
  label: string
}

const RAD = Math.PI / 180

export function unsupportedLabelOf(pieceClass: string): string {
  return `미지원: ${pieceClass}`
}

/**
 * 미지원 피스 목록 → 플레이스홀더. **피스마다 하나씩** 만든다 — 여러 개를 "미지원 N건"으로
 * 합치면 각 위치를 잃고 TC-009-3("하나로 뭉뚱그리지 않는다")이 깨진다.
 */
export function buildUnsupportedPlaceholders(
  pieces: readonly ParsedPiece[],
): UnsupportedPlaceholder[] {
  return pieces
    .filter((piece) => !piece.isSupported)
    .map((piece) => ({
      pieceId: piece.pieceId,
      pieceClass: piece.pieceClass,
      x: piece.x,
      y: PLACEHOLDER_BASE_Y,
      z: piece.y,
      angleRad: piece.angleDeg * RAD,
      label: unsupportedLabelOf(piece.pieceClass),
    }))
}

/** 상자 한 모서리의 두 끝점(선분). 와이어프레임은 면이 아니라 **선**이다 */
export type PlaceholderEdge = readonly [
  { x: number; y: number; z: number },
  { x: number; y: number; z: number },
]

/**
 * 축 정렬 상자를 피스 각도로 돌려 12개 모서리를 낸다.
 *
 * 면이 아니라 와이어프레임인 것이 요구다 — 채워 그리면 "여기 트랙이 있다"로 읽힌다.
 * 뚫린 상자는 "무언가 있는데 그릴 수 없다"를 말한다.
 */
export function placeholderEdges(placeholder: UnsupportedPlaceholder): PlaceholderEdge[] {
  const halfLength = PLACEHOLDER_LENGTH_CM / 2
  const halfWidth = TRACK_WIDTH_CM / 2
  const cos = Math.cos(placeholder.angleRad)
  const sin = Math.sin(placeholder.angleRad)

  const corner = (forward: number, side: number, up: number) => ({
    x: placeholder.x + forward * halfLength * cos - side * halfWidth * sin,
    y: placeholder.y + up * PLACEHOLDER_HEIGHT_CM,
    z: placeholder.z + forward * halfLength * sin + side * halfWidth * cos,
  })

  const bottom = [corner(-1, -1, 0), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0)]
  const top = [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)]

  const edges: PlaceholderEdge[] = []
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4
    edges.push([bottom[index]!, bottom[next]!])
    edges.push([top[index]!, top[next]!])
    edges.push([bottom[index]!, top[index]!])
  }
  return edges
}
