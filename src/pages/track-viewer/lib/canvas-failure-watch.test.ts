// FEAT-014 — TC-014-3 귀속 규칙의 순수 축. "언제 3D 실패로 볼 것인가"만 잰다.
// 전역 error 이벤트가 실제로 들어오는가·그 뒤 화면이 대체 표현으로 바뀌는가는 Playwright가 잰다.
import { describe, expect, it } from 'vitest'

import { isCanvasBroken } from './canvas-failure-watch'

describe('TC-014-3 (순수 축) — 무관한 에러를 3D 실패로 귀속하지 않는다', () => {
  it('컨텍스트가 살아 있으면 실패로 보지 않는다', () => {
    expect(isCanvasBroken({ getContext: () => ({}) })).toBe(false)
  })

  it('캔버스가 없으면 판정하지 않는다 — "근거 없음"은 "실패"가 아니다', () => {
    expect(isCanvasBroken(null)).toBe(false)
  })

  it('컨텍스트를 못 만들면 실패다', () => {
    expect(isCanvasBroken({ getContext: () => null })).toBe(true)
  })

  it('확인 자체가 던지면 실패다 — 확인이 앱을 깨뜨려서는 안 된다', () => {
    expect(
      isCanvasBroken({
        getContext() {
          throw new Error('컨텍스트 소진')
        },
      }),
    ).toBe(true)
  })

  it('렌더러가 쓰는 것과 같은 컨텍스트 id로 묻는다', () => {
    const asked: string[] = []
    isCanvasBroken({
      getContext(id: string) {
        asked.push(id)
        return {}
      },
    })
    expect(asked).toEqual(['webgl2'])
  })
})
