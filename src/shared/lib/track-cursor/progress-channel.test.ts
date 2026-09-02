// PC-014 — 연속 진행 채널. 공유 커서와 달리 React 밖에 있으므로 그 계약(같은 값 끊기,
// 늦은 구독자에게 현재 값 주기, 해제)이 여기서 지켜지는지 직접 잰다.
import { describe, expect, it, vi } from 'vitest'

import { createProgressChannel } from './progress-channel'

describe('연속 진행 채널', () => {
  it('발행하면 구독자가 그 값을 받는다', () => {
    const channel = createProgressChannel()
    const seen = vi.fn()
    channel.subscribe(seen)

    channel.publish(17.25)
    channel.publish(17.5)

    expect(seen.mock.calls.map(([value]) => value)).toEqual([null, 17.25, 17.5])
  })

  it('같은 값 재발행은 끊는다 — 정지·seek 중 초당 60번의 헛된 DOM 쓰기를 막는 성질이다', () => {
    const channel = createProgressChannel()
    const seen = vi.fn()
    channel.subscribe(seen)
    seen.mockClear()

    channel.publish(null)
    channel.publish(null)
    channel.publish(3)
    channel.publish(3)

    expect(seen.mock.calls.map(([value]) => value)).toEqual([3])
  })

  it('늦게 붙은 구독자도 현재 값을 즉시 받는다', () => {
    const channel = createProgressChannel()
    channel.publish(42.75)

    const late = vi.fn()
    channel.subscribe(late)

    expect(late).toHaveBeenCalledWith(42.75)
    expect(channel.current()).toBe(42.75)
  })

  it('`null` 복귀가 통지된다 — 구독자는 이걸로 커서 자리로 돌아간다', () => {
    const channel = createProgressChannel()
    const seen = vi.fn()
    channel.publish(9)
    channel.subscribe(seen)
    seen.mockClear()

    channel.publish(null)

    expect(seen).toHaveBeenCalledWith(null)
    expect(channel.current()).toBeNull()
  })

  it('해제하면 더 받지 않고 남은 구독자는 계속 받는다', () => {
    const channel = createProgressChannel()
    const leaving = vi.fn()
    const staying = vi.fn()
    const unsubscribe = channel.subscribe(leaving)
    channel.subscribe(staying)
    leaving.mockClear()
    staying.mockClear()

    unsubscribe()
    channel.publish(5)

    expect(leaving).not.toHaveBeenCalled()
    expect(staying).toHaveBeenCalledWith(5)
  })
})
