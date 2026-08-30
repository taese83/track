// FEAT-008 — 레인 3개의 가로 위치와 자리바꿈. **기하 정본은
// `_workspace/02_design/piece-geometry.md` §레인체인지·§육교(D-033~D-036)**이며 여기서
// 새 값을 만들지 않는다.
//
// 이 파일은 three를 모른다 — 좌표 변환·버퍼 생성과 떼어 두어야 "자리바꿈이 어떤 모양인가"를
// 브라우저 없이 수치로 잴 수 있다(TC-008-4·5가 그 축이다).

/** D-034 — 레인 3개, 각 12cm, 전체 36cm. 인접 레인 사이 틈은 0이다 */
export const LANE_COUNT = 3
export const LANE_PITCH_CM = 12
export const TRACK_WIDTH_CM = LANE_COUNT * LANE_PITCH_CM

/** 레인 중심의 가로 위치 `[−12, 0, +12]`. 인덱스가 곧 레인 번호(0-based)다 */
export const LANE_CENTERS_CM: readonly number[] = Array.from(
  { length: LANE_COUNT },
  (_, lane) => (lane - (LANE_COUNT - 1) / 2) * LANE_PITCH_CM,
)

/** D-036 ② — 자리바꿈은 가운데 45% 구간에서만 일어난다 */
export const SWAP_SPAN = 0.45
const SWAP_START = (1 - SWAP_SPAN) / 2

/** D-035 — 두 칸 건너뛰는 레인이 나머지 위로 넘어가는 높이 */
export const OVERPASS_HEIGHT_CM = 8

/** 레인체인지 피스 클래스 접두사. 색·이름이 아니라 클래스로 가른다 */
const LANE_CHANGE_PREFIX = 'Lan'

export function isLaneChangeClass(pieceClass: string): boolean {
  return pieceClass.startsWith(LANE_CHANGE_PREFIX)
}

/**
 * 자리바꿈 구간의 **로컬 파라미터**. 피스 전체 `t`가 아니다 — 육교 곡선도 이 `u`를 쓴다
 * (D-036 ③). 구간 밖에서는 0/1로 고정되므로 앞뒤가 직선으로 남고 양 끝에서 각지게 꺾인다.
 */
export function swapProgress(t: number): number {
  return Math.min(Math.max((t - SWAP_START) / SWAP_SPAN, 0), 1)
}

/**
 * D-033 — 레인은 **한 칸씩** 순환한다(0→1, 1→2, 2→0). 좌우 대칭 교환(0↔2)이면 두 바퀴
 * 만에 원위치라 공식 API의 `order:[1,2,3]`(세 레인을 다 도는 것)이 나올 수 없다.
 *
 * @returns 레인 인덱스별 가로 이동량(cm). 위치 집합은 보존된다
 */
export function laneShiftsCm(): number[] {
  return LANE_CENTERS_CM.map((from, lane) => {
    const target = LANE_CENTERS_CM[(lane + 1) % LANE_COUNT]
    return (target ?? from) - from
  })
}

/**
 * D-035 — 육교 판별은 색·이름이 아니라 **이동 폭**이다. 한 칸 이동(12cm)은 레인 폭과 같고,
 * 두 칸 건너뛰는 레인만 그보다 크게 움직인다.
 */
export function isOverpassLane(shiftCm: number): boolean {
  return Math.abs(shiftCm) > LANE_PITCH_CM
}

export interface LaneOffset {
  /** 진행축 기준 가로 위치(cm) */
  lateralCm: number
  /** 레인 면의 추가 높이(cm). 육교가 아닌 레인은 0이다 — 고도 변화가 아니다 */
  riseCm: number
}

/**
 * 피스 안 `t`에서 레인 하나의 가로 위치와 높이.
 *
 * 레인체인지가 아닌 피스는 가로 위치가 고정이고 높이도 0이다 — 자리바꿈은 `Lan*`에서만
 * 일어난다. 고도는 여기서 만들지 않는다(`laneOffset`은 수평축 변형이라 FEAT-005의 고도와
 * 독립이다 — `elevation/types.ts`).
 */
export function laneOffsetAt(pieceClass: string, lane: number, t: number): LaneOffset {
  const base = LANE_CENTERS_CM[lane] ?? 0
  if (!isLaneChangeClass(pieceClass)) return { lateralCm: base, riseCm: 0 }

  const shift = laneShiftsCm()[lane] ?? 0
  const u = swapProgress(t)
  return {
    lateralCm: base + shift * u,
    // D-036 ③ — 마루는 자리바꿈 구간의 중앙(u=0.5)이고 구간 밖에서는 0이다
    riseCm: isOverpassLane(shift) ? OVERPASS_HEIGHT_CM * Math.sin(Math.PI * u) ** 2 : 0,
  }
}

/** 레인 면의 좌·우 가장자리 가로 위치. 가장자리는 중심선과 **같은 규칙**으로 생성된다 */
export function laneBandAt(
  pieceClass: string,
  lane: number,
  t: number,
): { lo: LaneOffset; hi: LaneOffset } {
  const center = laneOffsetAt(pieceClass, lane, t)
  const half = LANE_PITCH_CM / 2
  return {
    lo: { lateralCm: center.lateralCm - half, riseCm: center.riseCm },
    hi: { lateralCm: center.lateralCm + half, riseCm: center.riseCm },
  }
}
