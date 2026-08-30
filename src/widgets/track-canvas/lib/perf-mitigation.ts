// FEAT-011 — 대형 트랙 완화.
//
// 임계값은 **300피스**다(참조 트랙 132의 약 2.3배, 잠정 ASSUMPTION-006). 132~300은
// "경계 구간"이며 완화 여부가 Must가 아니라 구현체 재량이다 — 이 구현은 경계 구간에서
// 완화하지 않는다(그 선택이 결함이 아님을 TC-011-4가 명시한다).
//
// **완화의 정본은 표본 밀도다.** 정점 수는 표본 수에 선형이고, 곡선 피스(코너·슬로프·
// 뱅크·레인체인지·웨이브)가 24표본을 쓰므로 여기가 부하의 대부분이다. 라벨(DOM)도 함께
// 줄인다 — 300피스가 넘으면 비평지 라벨이 수십 개가 되어 매 프레임 위치가 갱신된다.

/** ASSUMPTION-006 — 잠정 임계값. 초과하면 완화 상태로 전환한다 */
export const LARGE_TRACK_THRESHOLD = 300

/** 경계 구간의 아래끝. 참조 트랙 규모다 */
export const BOUNDARY_RANGE_START = 132

/** 완화하지 않을 때의 곡선 표본 수(FEAT-006이 정한 값) */
export const FULL_CURVED_SAMPLES = 24

/** 완화 상태의 곡선 표본 수. 정점을 3분의 1로 줄인다 */
export const REDUCED_CURVED_SAMPLES = 8

export interface MitigationProfile {
  /** 완화 상태인가 — 배지 노출의 근거다 */
  mitigated: boolean
  /** 곡선 피스의 표본 수 */
  curvedSamples: number
  /** 세그먼트 유형 라벨(FEAT-015)을 그리는가 */
  showSegmentLabels: boolean
}

/** 화면에 그대로 노출하는 문구(TC-011-1) */
export const LARGE_TRACK_NOTICE = '대형 트랙: 일부 최적화 적용'

export function isBoundaryRange(pieceCount: number): boolean {
  return pieceCount >= BOUNDARY_RANGE_START && pieceCount <= LARGE_TRACK_THRESHOLD
}

/**
 * @param pieceCount 씬에 배치된 세그먼트 수
 * @param disabled 대조군 측정용 강제 해제(TC-011-2). 기본은 false다 —
 *   완화가 실제로 fps를 개선하는지 재려면 **같은 데이터**에서 완화만 끈 렌더가 필요하고,
 *   데이터를 바꾸면 대조군이 성립하지 않는다.
 */
export function mitigationFor(pieceCount: number, disabled = false): MitigationProfile {
  const mitigated = !disabled && pieceCount > LARGE_TRACK_THRESHOLD
  return {
    mitigated,
    curvedSamples: mitigated ? REDUCED_CURVED_SAMPLES : FULL_CURVED_SAMPLES,
    showSegmentLabels: !mitigated,
  }
}
