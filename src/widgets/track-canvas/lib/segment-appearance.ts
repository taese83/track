// 세그먼트 표면색. design-system §1 "상승/하강은 원본 편집기 색을 쓴다"를 그대로 따른다 —
// 팔레트를 새로 고르면 사용자 1순위 성공 조건인 "도면과 3D 나란히 대조"가 깨진다.
import type { SegmentDirection } from './segment-encoding'

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

/**
 * 가운데 레인을 가르는 밝기 차(0~255). **`filter`를 쓰지 않는다** — SVG/CSS filter는 도형을
 * 별도 래스터화해 가장자리에 얇은 검은 실선을 남긴다(D-036 ⑤). 프리뷰는 같은 규칙을
 * 자기 팔레트의 고정 hex로 적었는데(`#3a4048`→`#454b55` 등) 이 구현의 표면색은 편집기
 * 원본색이라 base가 다르다 — 그래서 hex가 아니라 **규칙**("아주 살짝 밝게")을 옮긴다.
 */
const MID_LANE_LIFT = 14

/** 가운데 레인 인덱스. 레인 3개의 한가운데다 */
const MID_LANE = 1

function lift(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return `#${channels.map((c) => Math.min(c + amount, 255).toString(16).padStart(2, '0')).join('')}`
}

/**
 * 레인별 표면색. 가운데 레인만 살짝 밝다 — 세 레인이 한 덩어리로 보이지 않게 하는 축이고,
 * 형태 축(경계선)은 `buildBoundaryGeometry`가 따로 낸다.
 */
export function laneSurfaceColorOf(baseColor: string, lane: number): string {
  return lane === MID_LANE ? lift(baseColor, MID_LANE_LIFT) : baseColor
}

/**
 * 표면색. **방향의 출처는 기하가 아니라 피스의 선언 색이다**(D-014).
 *
 * 종전에는 `absoluteElevationEnd − absoluteElevationStart`의 부호로 색을 정했다. 그러면
 * 하강색(c=2) 뱅크가 D-045에 따라 **위로 솟을 때 화면이 그것을 "상승"이라고 말한다** —
 * 선언과 기하의 불일치가 색 채널에서 지워진다. 세 채널을 모두 선언에 맞추면 그 불일치가
 * 남고, 텍스트가 무엇을 선언했는지 말한다(TC-015-4).
 */
export function surfaceColorOf(isSupported: boolean, direction: SegmentDirection): string {
  if (!isSupported) return UNSUPPORTED_SURFACE
  if (direction === 'rise') return RISE_SURFACE
  if (direction === 'fall') return FALL_SURFACE
  return FLAT_SURFACE
}
