// 공유 커서의 순수 코어. Provider는 이 함수들을 감싸기만 한다 —
// 순환 갱신 방지의 2차 게이트(component-spec §공유 커서)가 여기 산다.
//
// 왜 리듀서를 따로 두는가: 세 위젯(목록·스트립·캔버스)이 같은 커서를 읽고 쓰는데,
// A가 쓰면 B가 반응하고 B가 다시 쓰는 A→B→A 경로가 생기면 렌더 스톰이 난다.
// 1차 방어는 구조 규칙(쓰기는 직접 사용자 이벤트에서만)이고, 그것이 리팩터로 뚫려도
// **같은 값 재발행이 물리적으로 끊기도록** 동일 참조를 돌려주는 것이 2차 방어다.

/** 커서를 움직인 주체. 디버그·비순환 검증 전용이며 렌더 분기에 쓰지 않는다 */
export type CursorSource = 'list' | 'strip' | 'canvas' | 'initial'

export interface TrackCursorState {
  /** RestoredPath 순서 기준 0-based canonical index */
  currentIndex: number
  totalCount: number
  lastSource: CursorSource
}

export interface CursorBounds {
  totalCount: number
  /**
   * 부분 실패 시 도달 가능한 마지막 인덱스(포함). 전부 도달 가능하면 `totalCount - 1`.
   * 끊긴 지점 이후로 커서를 보내면 화면이 없는 구간을 가리킨다.
   */
  reachableCount: number
}

export function isReachable(bounds: CursorBounds, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < bounds.reachableCount
}

export function initialCursorState(bounds: CursorBounds): TrackCursorState {
  return { currentIndex: 0, totalCount: bounds.totalCount, lastSource: 'initial' }
}

/**
 * 대상 인덱스로 이동. **도달 불가면 no-op**이고 같은 인덱스면 동일 참조를 돌려준다.
 * clamp가 아니라 거부인 이유: 실패 구간을 클릭했을 때 가장 가까운 유효 지점으로
 * 미끄러지면 화면이 "여기까지는 이어져 있다"고 거짓말한다(제품 계약 §5).
 */
export function setCursor(
  state: TrackCursorState,
  bounds: CursorBounds,
  index: number,
  source: CursorSource,
): TrackCursorState {
  if (!isReachable(bounds, index)) return state
  if (index === state.currentIndex) return state
  return { currentIndex: index, totalCount: bounds.totalCount, lastSource: source }
}

/**
 * 상대 이동. 여기서는 **clamp한다** — ←/→ 연타로 끝에 닿는 것은 정상 조작이고,
 * 경계에서 멈추는 편이 아무 일도 안 일어나는 것보다 예측 가능하다.
 * 도달 가능 범위 밖으로는 나가지 않는다.
 */
export function stepBy(
  state: TrackCursorState,
  bounds: CursorBounds,
  delta: number,
  source: CursorSource,
): TrackCursorState {
  if (bounds.reachableCount <= 0) return state
  const target = Math.min(Math.max(state.currentIndex + delta, 0), bounds.reachableCount - 1)
  return setCursor(state, bounds, target, source)
}
