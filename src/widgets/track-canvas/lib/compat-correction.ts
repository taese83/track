// REQ-F-021 — compat=true 트랙의 Cor1 위치 보정.
//
// 편집기는 저장 버전이 `COMPATIBILITY_ID`(26586)보다 오래된 트랙을 그릴 때 45/135/225/315°
// 배치의 `Cor1`에 `Point(11.1, 4.88).rotate(angle)`을 더한다(`00_source/track-editor-data-model.md`).
// FEAT-002는 판정만 하고 좌표를 건드리지 않으며(`compatCorrectionApplied` 메타데이터),
// **가산은 배치 단계인 여기서 한다** — 도면과 일치해야 하는 것은 렌더 좌표이기 때문이다.
//
// 보정은 피스 전체의 평행이동이라 두 끝점이 같은 양만큼 움직인다. 그래서 표본 좌표에
// 더하는 것과 끝점에 더하고 형상을 다시 만드는 것이 같다 — 원호의 중심도 함께 옮겨간다.
import type { ParsedPiece } from '@/entities/track/model/types'

/** 편집기 원문의 보정 벡터(로컬). 등급 measured — `piece-geometry.md` §근거 등급 */
const CORRECTION_LOCAL = { x: 11.1, y: 4.88 }

const RAD = Math.PI / 180

export interface CompatCorrection {
  x: number
  y: number
  applied: boolean
}

const NONE: CompatCorrection = { x: 0, y: 0, applied: false }

/**
 * 이 피스에 더할 절대 보정 벡터. 판정은 FEAT-002가 이미 끝냈으므로 여기서 클래스·각도를
 * 다시 판정하지 않는다 — 두 곳에서 판정하면 규칙이 갈라진다.
 */
export function compatCorrectionOf(piece: ParsedPiece): CompatCorrection {
  if (piece.compatCorrectionApplied !== true) return NONE

  const theta = piece.angleDeg * RAD
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return {
    x: CORRECTION_LOCAL.x * cos - CORRECTION_LOCAL.y * sin,
    y: CORRECTION_LOCAL.x * sin + CORRECTION_LOCAL.y * cos,
    applied: true,
  }
}
