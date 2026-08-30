// FEAT-015 — 세그먼트 유형·방향을 **색·형태·텍스트 세 채널**로 인코딩한다.
//
// `design-system/tokens.md`가 REQ-NFR-003을 **협상 불가**로 못박는다: "상승/하강은 항상
// 색 + 형태 + 텍스트. 색 단독 사용은 design-reviewer 거부 사유다." 종전 구현은
// `surfaceColorOf`가 색 하나만 돌려주고 `SceneSegment`에 `kind`도 `direction`도 없어서
// **3D 뷰에서 뱅크와 슬로프가 구별되지 않았다**(2026-08-30 발견).
//
// **방향의 출처는 기하가 아니라 피스의 선언 색이다**(D-014 — `Bri*`/`Ban*`에 한해 `c=3`
// 상승, `c=2` 하강). 종전 `surfaceColorOf`는 실제 고도 변화량으로 색을 정했는데, 그러면
// 하강색 뱅크가 D-045에 따라 위로 솟을 때 화면이 그것을 "상승"이라고 말한다 — 선언과
// 기하의 불일치가 **지워진다**. 세 채널을 모두 선언에 맞추고 기하는 그대로 두면, 그
// 불일치가 사용자에게 보인다(TC-015-4).

export type SegmentKind = 'slope' | 'bank' | 'wave' | 'lane-change' | 'marker' | 'plain'
export type SegmentDirection = 'rise' | 'fall' | 'none'

/** D-014 — 고도 변화 피스에 한해 유효한 팔레트 인덱스(2026-08-28 픽셀 측정) */
const RISE_COLOR_INDEX = 3
const FALL_COLOR_INDEX = 2

/**
 * D-014 N-002 — `Str1 c=5`는 빨강·파랑 반반의 **마커 직선**(출발선 표식)이며 고도 변화가
 * 없다. 슬로프로 오인하면 안 된다.
 */
const MARKER_COLOR_INDEX = 5

const KIND_PREFIX: readonly (readonly [string, SegmentKind])[] = [
  ['Bri', 'slope'],
  ['Ban', 'bank'],
  ['Chi', 'wave'],
  ['Lan', 'lane-change'],
]

export function kindOf(pieceClass: string, colorIndex: number): SegmentKind {
  for (const [prefix, kind] of KIND_PREFIX) {
    if (pieceClass.startsWith(prefix)) return kind
  }
  if (pieceClass.startsWith('Str') && colorIndex === MARKER_COLOR_INDEX) return 'marker'
  return 'plain'
}

/**
 * 방향은 **고도 변화 피스에서만** 의미가 있다(D-014가 D-003을 좁힌 대목). `Str1.c6`은
 * 주황이고 `Bri1.c0`은 청록인데 둘 다 고도와 무관하다 — 팔레트 인덱스를 방향 플래그로
 * 읽으면 평지가 상승으로 표기된다.
 */
export function directionOf(pieceClass: string, colorIndex: number): SegmentDirection {
  const kind = kindOf(pieceClass, colorIndex)
  if (kind !== 'slope' && kind !== 'bank') return 'none'
  if (colorIndex === RISE_COLOR_INDEX) return 'rise'
  if (colorIndex === FALL_COLOR_INDEX) return 'fall'
  return 'none'
}

/** 형태 채널의 표식. 색을 지워도 이것만으로 유형이 갈려야 한다 */
export type MarkerShape =
  | 'arrow-up'
  | 'arrow-down'
  | 'diamond'
  | 'wave'
  | 'fork'
  | 'flag'
  | 'none'

/**
 * 유형·방향 → 표식.
 *
 * REQ-NFR-003이 예시로 든 것은 셋뿐이다(↑/↓ 화살표 · 뱅크 기울인 사각형 · 레인체인지
 * 갈래). 웨이브와 마커의 표식은 지정돼 있지 않은데, 형태 채널이 유형을 갈라야 하므로
 * 비워 둘 수 없다 — 나머지와 겹치지 않는 모양을 골랐고 그 사실을 여기 적는다.
 *
 * **뱅크는 방향과 무관하게 마름모다.** 뱅크의 형태 축은 "뱅크임"을 말하고, 방향은
 * 텍스트가 말한다 — 뱅크를 화살표로 그리면 슬로프와 형태가 같아져 TC-015-1이 깨진다.
 */
export function markerShapeOf(kind: SegmentKind, direction: SegmentDirection): MarkerShape {
  if (kind === 'bank') return 'diamond'
  if (kind === 'wave') return 'wave'
  if (kind === 'lane-change') return 'fork'
  if (kind === 'marker') return 'flag'
  if (kind === 'slope') return direction === 'fall' ? 'arrow-down' : 'arrow-up'
  return 'none'
}

/** 뱅크는 윤곽까지 파선으로 구분한다(프리뷰의 `stroke-dasharray`에 대응) */
export function hasDashedOutline(kind: SegmentKind): boolean {
  return kind === 'bank'
}

const KIND_TEXT: Record<SegmentKind, string> = {
  slope: '슬로프',
  bank: '뱅크',
  wave: '웨이브',
  'lane-change': '레인체인지',
  marker: '마커',
  plain: '평지',
}

const DIRECTION_TEXT: Record<SegmentDirection, string> = {
  rise: '상승',
  fall: '하강',
  none: '',
}

/**
 * 텍스트 채널. 방향이 있는 유형은 "뱅크(하강)"처럼 괄호로 덧붙인다 — 색을 못 보는
 * 사용자에게 이 문자열이 유일한 방향 정보원이다.
 *
 * **선언 방향을 그대로 적는다.** 기하가 반대로 움직여도(하강색 뱅크가 위로 솟는 D-045)
 * 문구를 기하에 맞춰 고치지 않는다 — 그러면 불일치가 지워진다(TC-015-4).
 */
export function segmentTextOf(kind: SegmentKind, direction: SegmentDirection): string {
  const suffix = DIRECTION_TEXT[direction]
  return suffix === '' ? KIND_TEXT[kind] : `${KIND_TEXT[kind]}(${suffix})`
}

/** 텍스트 라벨을 붙일 가치가 있는 유형. 평지 132개에 "평지"를 다 붙이면 화면이 글자로 덮인다 */
export function isLabelled(kind: SegmentKind): boolean {
  return kind !== 'plain'
}

export interface SegmentEncoding {
  kind: SegmentKind
  direction: SegmentDirection
  shape: MarkerShape
  text: string
  dashedOutline: boolean
  labelled: boolean
}

export function encodeSegment(pieceClass: string, colorIndex: number): SegmentEncoding {
  const kind = kindOf(pieceClass, colorIndex)
  const direction = directionOf(pieceClass, colorIndex)
  return {
    kind,
    direction,
    shape: markerShapeOf(kind, direction),
    text: segmentTextOf(kind, direction),
    dashedOutline: hasDashedOutline(kind),
    labelled: isLabelled(kind),
  }
}
