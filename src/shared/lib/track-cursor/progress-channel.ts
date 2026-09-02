// 연속 진행 채널의 순수 코어(PC-014). 공유 커서와 **같은 Provider가 소유하지만 다른 축**이다.
//
// 왜 커서를 소수 인덱스로 올리지 않았는가: 커서는 목록·스트립·캔버스 셋이 함께 읽는 React
// state다. 거기에 프레임 단위 값을 넣으면 132행 목록이 매 프레임 스크롤을 다시 계산한다 —
// component-spec §공유 커서 계약이 렌더 스톰을 막으려고 세운 규칙과 정면으로 어긋난다.
// 그래서 축을 하나 더 두되 **React 밖에** 둔다: 값은 클로저에 담기고 구독자에게 직접 간다.
// 발행은 어떤 재렌더도 만들지 않으므로 렌더 루프 안에서 불러도 된다.

/** `null`은 "연속 진행 없음" — 구독자는 공유 커서 위치로 돌아간다 */
export type ProgressListener = (fractionalIndex: number | null) => void

export interface ProgressChannel {
  publish: (fractionalIndex: number | null) => void
  /** 해제 함수를 돌려준다. 구독 즉시 현재 값으로 한 번 통지한다 */
  subscribe: (listener: ProgressListener) => () => void
  /** 마지막으로 발행된 값 */
  current: () => number | null
}

export function createProgressChannel(): ProgressChannel {
  const listeners = new Set<ProgressListener>()
  let latest: number | null = null

  return {
    publish(fractionalIndex) {
      // 같은 값 재발행은 끊는다. 정지·seek 중에는 매 프레임 `null`이 들어오는데 그때마다
      // 구독자를 깨우면 아무 것도 바뀌지 않는 DOM 쓰기가 초당 60번 생긴다.
      if (fractionalIndex === latest) return
      latest = fractionalIndex
      for (const listener of listeners) listener(fractionalIndex)
    },
    subscribe(listener) {
      listeners.add(listener)
      // 늦게 붙은 구독자에게도 현재 값을 준다 — 다음 발행까지 기다리면 재생 중에 붙은
      // 스트립이 커서 위치에 멈춰 있다.
      listener(latest)
      return () => {
        listeners.delete(listener)
      }
    },
    current: () => latest,
  }
}
