// 공유 커서의 **유일한 소유자**(component-spec §소유권). 목록·스트립·캔버스는 셋 다
// 읽고 쓰는 대칭 소비자이며 어느 하나가 진짜 소유자가 아니다.
//
// `TrackViewerPage`가 화면 상태 `3D 표시`/`부분 실패`/`WebGL 미지원`에 진입할 때만
// 마운트한다 — `입력 대기`/`로딩`/`완전 실패`는 경로 자체가 없어 커서가 성립하지 않는다.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  initialCursorState,
  isReachable as isReachableAt,
  setCursor as reduceSetCursor,
  stepBy as reduceStepBy,
} from './cursor-reducer'
import type { CursorBounds, CursorSource, TrackCursorState } from './cursor-reducer'
import { createProgressChannel } from './progress-channel'
import type { ProgressListener } from './progress-channel'

export interface TrackCursorApi extends TrackCursorState {
  setCursor: (index: number, source: CursorSource) => void
  /** ←/→, Home/End용 상대 이동 */
  stepBy: (delta: number, source: CursorSource) => void
  /** 부분 실패 시 실패 구간 이후 false */
  isReachable: (index: number) => boolean
  /**
   * 연속 진행축 발행(PC-014). 커서와 **다른 축**이며 재렌더를 만들지 않으므로 렌더 루프
   * 안에서 불러도 된다 — §순환 갱신 방지책 1차 게이트의 대상이 아니다(그 금지는 커서에
   * 대한 것이다). 발행자는 추종 카메라 하나뿐이고 `null`은 "연속 진행 없음"이다.
   */
  publishProgress: (fractionalIndex: number | null) => void
  /** 연속 진행축 구독. 구독자는 프로파일 스트립 하나뿐이다 */
  subscribeProgress: (listener: ProgressListener) => () => void
}

const TrackCursorContext = createContext<TrackCursorApi | null>(null)

export interface TrackCursorProviderProps {
  totalCount: number
  /**
   * 도달 가능한 세그먼트 수. 부분 실패면 복원된 구간까지만이다.
   * 생략하면 전부 도달 가능으로 본다.
   */
  reachableCount?: number
  children: ReactNode
}

export function TrackCursorProvider({
  totalCount,
  reachableCount,
  children,
}: TrackCursorProviderProps) {
  const bounds = useMemo<CursorBounds>(
    () => ({ totalCount, reachableCount: reachableCount ?? totalCount }),
    [totalCount, reachableCount],
  )
  const [state, setState] = useState<TrackCursorState>(() => initialCursorState(bounds))

  // 리듀서가 같은 참조를 돌려주면 React가 재렌더를 건너뛴다 — 2차 게이트가 여기서 값을 갖는다
  const setCursor = useCallback(
    (index: number, source: CursorSource) =>
      setState((prev) => reduceSetCursor(prev, bounds, index, source)),
    [bounds],
  )
  const stepBy = useCallback(
    (delta: number, source: CursorSource) =>
      setState((prev) => reduceStepBy(prev, bounds, delta, source)),
    [bounds],
  )
  const isReachable = useCallback((index: number) => isReachableAt(bounds, index), [bounds])

  // 채널은 Provider 수명 동안 하나다. `api`가 커서 변화마다 새 객체가 되어도 아래 두
  // 콜백의 참조는 고정이라 구독이 구간마다 다시 걸리지 않는다.
  const channelRef = useRef<ReturnType<typeof createProgressChannel>>(undefined)
  channelRef.current ??= createProgressChannel()
  const publishProgress = useCallback(
    (fractionalIndex: number | null) => channelRef.current?.publish(fractionalIndex),
    [],
  )
  const subscribeProgress = useCallback(
    (listener: ProgressListener) => channelRef.current?.subscribe(listener) ?? (() => {}),
    [],
  )

  const api = useMemo<TrackCursorApi>(
    () => ({ ...state, setCursor, stepBy, isReachable, publishProgress, subscribeProgress }),
    [state, setCursor, stepBy, isReachable, publishProgress, subscribeProgress],
  )

  return <TrackCursorContext.Provider value={api}>{children}</TrackCursorContext.Provider>
}

/**
 * Provider 밖에서 부르면 던진다 — 커서 없는 화면에 소비자를 얹는 실수를 개발 단계에서
 * 드러내기 위함이다. 기본값을 돌려주면 그 화면은 늘 0번 구간을 가리킨 채 조용히 산다.
 */
export function useTrackCursor(): TrackCursorApi {
  const api = useContext(TrackCursorContext)
  if (api === null) {
    throw new Error('useTrackCursor는 <TrackCursorProvider> 안에서만 쓸 수 있습니다')
  }
  return api
}
