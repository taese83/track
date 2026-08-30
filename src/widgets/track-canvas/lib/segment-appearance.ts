// 세그먼트 표면색. design-system §1 "상승/하강은 원본 편집기 색을 쓴다"를 그대로 따른다 —
// 팔레트를 새로 고르면 사용자 1순위 성공 조건인 "도면과 3D 나란히 대조"가 깨진다.
import type { ElevatedSegment } from '@/entities/track/lib/elevation'

/** design-system tokens §2. 3D 표면 전용 원본 실측색이며 텍스트에는 쓰지 않는다 */
const RISE_SURFACE = '#AD0A09'
const FALL_SURFACE = '#004E8F'

/**
 * 고도가 변하지 않는 구간의 표면색. **design-system에 대응 토큰이 없다** — §2 팔레트는
 * rise/fall/fail-segment만 3D 표면색으로 정의했고 평지 트랙 색은 정하지 않았다.
 * 편집기 원본색을 쓰려면 팔레트 인덱스별 실측이 필요한데 확보된 것은 상승/하강 두 개뿐이다
 * (`build-elevation.ts` "고도 변화 피스에 한해 유효한 팔레트 인덱스").
 * 그래서 계측기 톤의 무채색을 잠정값으로 두고, 실패 구간(`#5C636C`)보다 밝게 두어
 * "트랙 아님" 신호와 섞이지 않게 한다.
 */
const FLAT_SURFACE = '#A8AEB8'

/** design-system tokens §2 `fail-segment` — 무채색으로 "트랙 아님"을 말한다 */
const UNSUPPORTED_SURFACE = '#5C636C'

/** 고도 변화로 보기에는 너무 작은 값(부동소수 잔차·이음새 미세 단차) */
const ELEVATION_EPSILON = 1e-6

export function surfaceColorOf(
  isSupported: boolean,
  elevated: ElevatedSegment | undefined,
): string {
  if (!isSupported) return UNSUPPORTED_SURFACE
  if (elevated === undefined) return FLAT_SURFACE

  const delta = elevated.absoluteElevationEnd - elevated.absoluteElevationStart
  if (delta > ELEVATION_EPSILON) return RISE_SURFACE
  if (delta < -ELEVATION_EPSILON) return FALL_SURFACE
  return FLAT_SURFACE
}
