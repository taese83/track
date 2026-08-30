// FEAT-012 — 고도 프로파일을 스트립이 그릴 수 있는 **상대 스케일** 표본으로 바꾼다.
//
// **절대 단위를 만들지 않는다**(R2 · B-001 미해소). `absoluteElevationStart`는 편집기
// px에서 온 누적값이고 그것이 실물 몇 cm인지는 확정되지 않았다 — 그래서 여기서 0~1로
// 정규화하고, 화면은 그 사실을 축에 적는다(TC-012-4).
//
// 세그먼트 유형은 `SegmentKind` 대신 **라벨 문자열**로 받는다. component-spec은
// `segmentKind: SegmentKind`로 적었지만 그 타입의 소유자는 `widgets/section-list`이고,
// 위젯이 위젯을 import하면 FSD 경계가 깨진다. 유형이 필요한 곳은 `aria-valuetext` 한
// 군데뿐이라 라벨만 받으면 충분하다 — 소비자(page)가 자기 쪽에서 매핑한다.

export interface ProfileStripPoint {
  /** 세그먼트 순서, 0-based */
  index: number
  /** 상대 스케일 0~1. 절대 단위가 아니다 */
  elevationRelative: number
  /** "슬로프"·"코너" 같은 사람이 읽는 유형 라벨 */
  kindLabel: string
  /** 부분 실패로 도달할 수 없는 구간 */
  failed?: boolean
}

export interface ProfileSourceSegment {
  order: number
  absoluteElevationStart: number
  absoluteElevationEnd: number
  kindLabel: string
}

export interface ProfileScale {
  /** 정규화에 쓴 절대 고도 범위. 화면에 숫자로 내보내지 않는다 — 눈금 계산용이다 */
  min: number
  max: number
  /** max − min. 0이면 평평한 트랙이다 */
  span: number
}

export interface ProfileModel {
  points: ProfileStripPoint[]
  scale: ProfileScale
  /**
   * 폐합 실패 시 그래프 양 끝단의 수직 불연속(상대 스케일). null이면 폐합됐거나
   * 판정하지 못한 것이다 — **보정해서 이어붙이지 않는다**(제품 계약 §5).
   */
  closureGapRelative: number | null
}

/** 범위가 0일 때 곡선이 그려질 높이. 위아래 어느 쪽에도 치우치지 않게 한가운데 둔다 */
const FLAT_LEVEL = 0.5

export interface BuildProfileInput {
  segments: readonly ProfileSourceSegment[]
  /**
   * 도달 가능한 세그먼트 수. 이 뒤의 표본은 `failed`로 내려간다 —
   * 회색으로 그리고 클릭을 막는 근거다(TC-012-3).
   */
  reachableCount?: number
  /** `ClosureValidation.zClosureGap.value`. 절대 고도 차이라 여기서 정규화한다 */
  closureGapAbsolute?: number | null
}

export function buildProfileModel({
  segments,
  reachableCount,
  closureGapAbsolute = null,
}: BuildProfileInput): ProfileModel {
  if (segments.length === 0) {
    return { points: [], scale: { min: 0, max: 0, span: 0 }, closureGapRelative: null }
  }

  const elevations = segments.flatMap((segment) => [
    segment.absoluteElevationStart,
    segment.absoluteElevationEnd,
  ])
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const span = max - min

  const reachable = reachableCount ?? segments.length
  const normalize = (value: number) => (span === 0 ? FLAT_LEVEL : (value - min) / span)

  const points = segments.map((segment, at): ProfileStripPoint => {
    const point: ProfileStripPoint = {
      index: segment.order,
      elevationRelative: normalize(segment.absoluteElevationStart),
      kindLabel: segment.kindLabel,
    }
    // 도달 불가 구간만 표시한다 — 전부에 false를 달면 실패가 있다는 신호가 희석된다
    return at < reachable ? point : { ...point, failed: true }
  })

  return {
    points,
    scale: { min, max, span },
    closureGapRelative:
      closureGapAbsolute === null || closureGapAbsolute === undefined || span === 0
        ? null
        : closureGapAbsolute / span,
  }
}

/**
 * 화살표 이동은 **도달 가능한 경계에서 멈춘다** — 실패 지점 너머로 넘어가지 않는다
 * (component-spec §ProfileStrip). 건너뛰지 않는 것이 핵심이다: 건너뛰면 사용자가
 * 실패 구간의 존재를 모른 채 지나간다.
 */
export function clampToReachable(index: number, points: readonly ProfileStripPoint[]): number {
  const last = points.findIndex((point) => point.failed === true)
  const maxIndex = last === -1 ? points.length - 1 : Math.max(last - 1, 0)
  return Math.min(Math.max(index, 0), maxIndex)
}

/** 클릭·드래그가 가리키는 최근접 표본. 실패 구간을 가리키면 null이다(TC-012-3 1차 방어) */
export function pointAtRatio(
  ratio: number,
  points: readonly ProfileStripPoint[],
): ProfileStripPoint | null {
  if (points.length === 0) return null
  const at = Math.round(Math.min(Math.max(ratio, 0), 1) * (points.length - 1))
  const point = points[at]
  if (point === undefined || point.failed === true) return null
  return point
}

/**
 * y축 눈금. data-viz 원칙의 nice number 4~6개다. **값을 라벨로 쓰지 않는다** —
 * 절대 단위가 확정되지 않았으므로 눈금은 위치만 준다.
 */
export function axisTicks(count = 5): number[] {
  return Array.from({ length: count }, (_, at) => at / (count - 1))
}
