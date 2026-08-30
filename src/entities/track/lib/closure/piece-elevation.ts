// 피스 하나가 경로 고도에 더하는 **순 변화량**만 계산한다 — 곡선의 모양(S곡선·전이곡선·기운 판)은
// FEAT-005 소유다. 폐합 판정은 START로 돌아왔을 때의 누적 합만 필요하므로 모양과 무관하다.
// 근거: D-022(현 규칙) · D-023(진행축 px = 차가 달린 거리, 즉 빗변) · D-042(슬로프 20°·뱅크 20°)
// · functional.md L14(색 규칙 measured, 2026-08-28 픽셀 측정).
import type { ParsedPiece } from '../../model/types'

export type EvidenceGrade = 'measured' | 'confirmed' | 'inferred' | 'unknown'

/** 나쁜 등급이 앞. 여러 근거가 섞이면 가장 나쁜 등급이 대표한다 */
const GRADE_RANK: Readonly<Record<EvidenceGrade, number>> = {
  unknown: 0,
  inferred: 1,
  confirmed: 2,
  measured: 3,
}

export function worstGrade(grades: readonly EvidenceGrade[]): EvidenceGrade {
  let worst: EvidenceGrade = 'measured'
  for (const grade of grades) {
    if (GRADE_RANK[grade] < GRADE_RANK[worst]) worst = grade
  }
  return worst
}

// D-042 — 뱅크 20°는 타미야 공식 "バンク角20度"에서 온 measured 값이고,
// 슬로프 20°는 실물 실측이 아닌 사용자 지정 렌더 규칙이라 confirmed다. 등급이 다르므로 따로 둔다.
const SLOPE_ANGLE_DEG = 20
const SLOPE_ANGLE_GRADE: EvidenceGrade = 'confirmed'
const BANK_ANGLE_DEG = 20
const BANK_ANGLE_GRADE: EvidenceGrade = 'measured'

/** 고도 변화 피스(Bri·Ban 계열)에 한해서만 유효한 팔레트 인덱스다 (N-001 해소) */
const RISE_COLOR_INDEX = 3
const FALL_COLOR_INDEX = 2

export interface PieceElevationDelta {
  /** 피스를 통과한 뒤의 순 고도 변화. 상승 +, 하강 −, 고도 변화 없으면 0 */
  value: number
  grade: EvidenceGrade
  /** 0이 아닌 값을 낸 피스만 true — 폐합 오차의 근거 등급은 이들만으로 정한다 */
  contributes: boolean
}

const FLAT: PieceElevationDelta = {
  value: 0,
  grade: 'measured',
  contributes: false,
}

interface ChordRule {
  angleDeg: number
  grade: EvidenceGrade
}

function chordRuleFor(pieceClass: string): ChordRule | null {
  if (pieceClass.startsWith('Bri')) return { angleDeg: SLOPE_ANGLE_DEG, grade: SLOPE_ANGLE_GRADE }
  if (pieceClass.startsWith('Ban')) return { angleDeg: BANK_ANGLE_DEG, grade: BANK_ANGLE_GRADE }
  return null
}

function directionOf(colorIndex: number): 1 | -1 | 0 {
  if (colorIndex === RISE_COLOR_INDEX) return 1
  if (colorIndex === FALL_COLOR_INDEX) return -1
  return 0
}

/**
 * 현(chord) 규칙: `H = 진행축 px × sin(각도)`.
 * 진행축 px는 편집기 좌표에서 잰 두 끝점 사이 거리이며 D-023에 따라 빗변으로 읽는다.
 * 검증: Bri1(54px) × sin20° = 18.47 — D-042가 실측 기록한 "피스당 18.47cm"와 일치한다.
 */
export function computePieceElevationDelta(piece: ParsedPiece): PieceElevationDelta {
  if (!piece.isSupported) return FLAT

  const rule = chordRuleFor(piece.pieceClass)
  if (rule === null) return FLAT

  const direction = directionOf(piece.colorIndex)
  if (direction === 0) return FLAT

  const chordPx = Math.hypot(piece.vertex2.x - piece.vertex1.x, piece.vertex2.y - piece.vertex1.y)
  const value = direction * chordPx * Math.sin((rule.angleDeg * Math.PI) / 180)
  return { value, grade: rule.grade, contributes: true }
}
