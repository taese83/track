// FEAT-010 · REQ-F-013 — 근거 등급 배지.
//
// 채널 순서는 협상 불가다(design-system §근거 등급 배지): **1차 텍스트 라벨 → 2차 보더
// 형태 → 3차 색**. 색이 사라져도(forced-colors, 흑백 인쇄, 색각) 라벨과 실선/점선으로
// 등급이 그대로 읽혀야 한다. 그래서 라벨은 prop으로 덮어쓸 수 없다 — 호출부가 "실측"을
// unknown 값에 붙이는 오처방이 등급 체계 전체를 무의미하게 만든다.

export type EvidenceGrade = 'measured' | 'confirmed' | 'inferred' | 'unknown'

export interface EvidenceBadgeProps {
  grade: EvidenceGrade
}

/** 내부 고정 매핑 — override 불가(component-spec §EvidenceBadge) */
const GRADE_LABEL: Record<EvidenceGrade, string> = {
  measured: '실측',
  confirmed: '확인',
  inferred: '추정',
  unknown: '미확인',
}

/**
 * 최저 등급만 점선이다 — 색+형태 이중 구분(fail-segment 점선과 같은 문법).
 * 나머지 3등급은 실선이라 "unknown인가 아닌가"가 색 없이도 갈린다.
 */
const DASHED_GRADE: EvidenceGrade = 'unknown'

/**
 * 4등급 전부 같은 `min-width`를 쓴다. 등급이 바뀌어도 주변 레이아웃이 흔들리지 않게
 * 하기 위한 것이다(layout-spec §Layout stability #3) — "실측"(2자)과 "미확인"(3자)의
 * 폭 차이가 그대로 반영되면 배지가 붙은 값 행이 등급마다 다른 위치에서 끝난다.
 */
const MIN_WIDTH_PX = 56

/**
 * 상시 렌더 단일 상태다. 조건부 숨김·loading variant를 두지 않는다 — 데이터가 아직
 * 없는 구간은 부모가 스켈레톤으로 대체하고, 배지는 "데이터 있음"을 전제한다.
 * 배지를 숨길 수 있게 만들면 "근거를 밝히지 않는" 경로가 생긴다(REQ-F-013의 목적 자체).
 */
export function EvidenceBadge({ grade }: EvidenceBadgeProps) {
  return (
    <span
      data-evidence-badge=""
      data-grade={grade}
      className="inline-flex shrink-0 items-center justify-center px-2 py-px text-[12px] leading-[1.35]"
      style={{
        minWidth: MIN_WIDTH_PX,
        borderRadius: 'var(--radius-badge)',
        borderWidth: 1,
        borderStyle: grade === DASHED_GRADE ? 'dashed' : 'solid',
        borderColor: `var(--color-badge-${grade})`,
        color: `var(--color-badge-${grade})`,
        background: 'var(--color-bg-surface)',
        // caption 토큰의 +0.02em는 여기 쓰지 않는다 — 라벨이 전부 한글이고
        // 타이포 계약이 "한글 letter-spacing 0(양수 금지)"이다(tokens.md §3).
      }}
    >
      {GRADE_LABEL[grade]}
    </span>
  )
}
