// FEAT-010 — 화면에 노출할 근거 등급 항목을 파이프라인 산출에서 **끌어낸다**.
//
// 중요한 규율 하나: 등급도 각도 값도 여기서 다시 적지 않는다. 등급은 FEAT-005가
// `ElevatedSegment.evidenceGrade`에 이미 태깅했고(`types.ts` — "R1 등급 체계. FEAT-010이
// 소비한다"), 각도는 프로파일에서 미분해 얻는다. 상수를 복사해 오면 상류가 각도를 바꿀 때
// (D-042가 실제로 22°→20°로 바꿨다) 화면만 옛 값을 계속 주장하게 된다 — REQ-F-013이
// 막으려는 바로 그 실패다.
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import type { EvidenceGrade } from '@/shared/ui/EvidenceBadge/EvidenceBadge'

export interface EvidenceRow {
  /** `EvidenceTag.field` 또는 총계 항목의 합성 키 */
  field: string
  label: string
  /** 절대 단위를 쓰지 않는다(R2) — 각도는 무차원 비율이 아니라 각이라 R2 대상이 아니다 */
  value: string
  grade: EvidenceGrade
}

const FIELD_LABEL: Record<string, string> = {
  slopeAngleDeg: '슬로프 최급경사',
  bankAngleDeg: '뱅크 최급경사',
  colorRule: '상승/하강 색 규칙',
}

/**
 * 기울기 표본 수. 전이곡선은 양 끝에서 기울기가 0이고 가운데가 가장 급하므로 두 끝점만
 * 보면 최급경사를 0으로 읽는다 — 구간을 촘촘히 훑어야 한다.
 */
const SLOPE_SAMPLES = 64

const RAD_TO_DEG = 180 / Math.PI

function maxSlopeDegOf(segments: readonly ElevatedSegment[]): number {
  let max = 0
  for (const segment of segments) {
    for (let i = 0; i <= SLOPE_SAMPLES; i += 1) {
      const angle = Math.abs(Math.atan(segment.elevationProfile.slopeAt(i / SLOPE_SAMPLES)))
      if (angle > max) max = angle
    }
  }
  return max * RAD_TO_DEG
}

/**
 * 각도를 갖지 않는 필드. 숫자를 만들어 붙이지 않고 무엇으로 판정했는지만 적는다 —
 * 없는 수치를 그럴듯하게 채우는 것이 이 기능이 금지하려는 행위다.
 */
const NON_NUMERIC_FIELD_VALUE: Record<string, string> = {
  colorRule: '팔레트 인덱스로 판정',
}

/**
 * 태깅된 항목을 **빠짐없이** 행으로 만든다(TC-010-3의 1:1 대조 대상). 목록의 출처는
 * 세그먼트에 실제로 붙은 태그뿐이라, 상류가 태그를 늘리거나 줄이면 화면이 따라 움직인다.
 * 같은 field에 서로 다른 등급이 섞여 들어오면 **가장 낮은 등급으로 접는다** — 일부만
 * 실측인 값을 통째로 "실측"이라 부르면 정직성 계약이 깨진다.
 */
const GRADE_RANK: Record<EvidenceGrade, number> = {
  measured: 3,
  confirmed: 2,
  inferred: 1,
  unknown: 0,
}

export function buildEvidenceRows(elevated: readonly ElevatedSegment[]): EvidenceRow[] {
  const byField = new Map<string, { grade: EvidenceGrade; segments: ElevatedSegment[] }>()

  for (const segment of elevated) {
    for (const tag of segment.evidenceGrade) {
      const entry = byField.get(tag.field)
      if (entry === undefined) {
        byField.set(tag.field, { grade: tag.grade, segments: [segment] })
        continue
      }
      entry.segments.push(segment)
      if (GRADE_RANK[tag.grade] < GRADE_RANK[entry.grade]) entry.grade = tag.grade
    }
  }

  const rows: EvidenceRow[] = []
  for (const [field, entry] of byField) {
    const nonNumeric = NON_NUMERIC_FIELD_VALUE[field]
    rows.push({
      field,
      label: FIELD_LABEL[field] ?? field,
      value: nonNumeric ?? `${maxSlopeDegOf(entry.segments).toFixed(1)}°`,
      grade: entry.grade,
    })
  }
  // 등급이 아니라 field 이름으로 정렬한다 — 등급순이면 상류가 등급을 바꿀 때 행이
  // 자리를 옮겨 시선이 흔들린다(layout-spec §Layout stability).
  return rows.sort((a, b) => a.field.localeCompare(b.field))
}

/**
 * 총계 2건. 등급의 출처는 TC-010-5다 — 피스 수는 정수 카운트라 `confirmed`,
 * 총 길이는 편집기 `l`이 우리 파이프라인에 들어오지 않아 `unknown`이다.
 *
 * **총 길이에 수치를 적지 않는 것은 결함이 아니라 정직 표기다.** 파싱 입력
 * (`클래스;x;y;각도;색`)에 `l`이 없다 — 190.84는 편집기의 다른 응답에만 있는 값이라
 * 여기서 만들어 낼 수 없다. 좌표에서 계산한 경로 길이를 "편집기 l 단위"라고 적으면
 * 다른 양을 같은 이름으로 부르는 위조가 된다. R2(절대 미터 표기 금지)도 그대로 지킨다.
 */
export function buildTotalsRows(totalPieceCount: number): EvidenceRow[] {
  return [
    {
      field: 'totalPieceCount',
      label: '총 피스 수',
      value: `${totalPieceCount}피스`,
      grade: 'confirmed',
    },
    {
      field: 'totalLength',
      label: '총 길이',
      value: '편집기 l 단위 미수집',
      grade: 'unknown',
    },
  ]
}
