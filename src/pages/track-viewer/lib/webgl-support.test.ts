// FEAT-014 순수 축 — 게이트가 **무엇을 묻는가**와 **예외를 어떻게 접는가**.
//
// "미지원 환경에서 3D 렌더가 일어나지 않는다"(TC-014-1의 나머지 절)와 런타임 실패
// degrade(TC-014-3)는 실제 DOM이 있어야 성립하므로 Playwright가 잰다. 여기서 그것까지
// 잰다고 적으면 증명 없는 통과가 된다.
import { describe, expect, it } from 'vitest'

import { detectWebglSupport, probeWebgl } from './webgl-support'
import type { WebglProbeTarget } from './webgl-support'

/** 어떤 contextId를 지원하는지 명시하는 가짜 캔버스. 물어본 순서도 기록한다 */
function stubCanvas(supportedIds: readonly string[], asked: string[] = []): WebglProbeTarget {
  return {
    getContext(contextId: string) {
      asked.push(contextId)
      return supportedIds.includes(contextId) ? {} : null
    },
  }
}

describe('TC-014-1 (순수 축) — 게이트는 렌더러가 만드는 컨텍스트를 묻는다', () => {
  it('webgl2가 되면 지원이다', () => {
    const asked: string[] = []
    expect(detectWebglSupport(() => stubCanvas(['webgl2'], asked))).toBe(true)
    // 지원이면 2차 질의를 하지 않는다 — 진단은 미지원일 때만 필요하다
    expect(asked).toEqual(['webgl2'])
  })

  it('webgl1만 되는 환경은 **미지원**이다 — three 0.185는 WebGL2만 만든다', () => {
    const result = probeWebgl(() => stubCanvas(['webgl', 'experimental-webgl']))
    expect(result.supported).toBe(false)
    // "아예 없다"와 구별되어야 원인을 되짚을 수 있다
    expect(result.legacyOnly).toBe(true)
  })

  it('아무 컨텍스트도 없으면 미지원이고 legacyOnly도 아니다', () => {
    expect(probeWebgl(() => stubCanvas([]))).toEqual({ supported: false, legacyOnly: false })
  })
})

describe('TC-014-3 (순수 축) — 감지 단계의 예외는 앱을 깨뜨리지 않는다', () => {
  it('getContext가 던져도 미지원으로 접는다', () => {
    const thrower: WebglProbeTarget = {
      getContext() {
        throw new Error('GPU access is blocked')
      },
    }
    expect(() => detectWebglSupport(() => thrower)).not.toThrow()
    expect(detectWebglSupport(() => thrower)).toBe(false)
  })

  it('캔버스 생성 자체가 던져도 미지원으로 접는다', () => {
    expect(
      detectWebglSupport(() => {
        throw new Error('document is not available')
      }),
    ).toBe(false)
  })

  it('캔버스를 만들 수 없는 환경(SSR 등)은 미지원이다', () => {
    expect(detectWebglSupport(() => null)).toBe(false)
  })
})
