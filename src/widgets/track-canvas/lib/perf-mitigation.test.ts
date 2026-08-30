// FEAT-011 순수 축 — 임계값과 경계 구간의 판정.
// fps 개선 자체는 브라우저에서만 잴 수 있다(TC-011-2는 Playwright가 A/B로 잰다).
import { describe, expect, it } from 'vitest'

import {
  BOUNDARY_RANGE_START,
  FULL_CURVED_SAMPLES,
  LARGE_TRACK_THRESHOLD,
  REDUCED_CURVED_SAMPLES,
  isBoundaryRange,
  mitigationFor,
} from './perf-mitigation'

describe('TC-011-1 — 300피스를 초과하면 완화 상태다', () => {
  it('301에서 전환된다', () => {
    expect(mitigationFor(LARGE_TRACK_THRESHOLD + 1).mitigated).toBe(true)
  })

  it('완화 상태는 표본을 줄이고 라벨을 끈다', () => {
    const profile = mitigationFor(304)
    expect(profile.curvedSamples).toBe(REDUCED_CURVED_SAMPLES)
    expect(profile.showSegmentLabels).toBe(false)
  })
})

describe('TC-011-3 — 참조 트랙 규모에서는 완화하지 않는다', () => {
  it('132피스는 완화 상태가 아니다', () => {
    const profile = mitigationFor(132)
    expect(profile.mitigated).toBe(false)
    expect(profile.curvedSamples).toBe(FULL_CURVED_SAMPLES)
    expect(profile.showSegmentLabels).toBe(true)
  })

  it('임계값 정확히 300은 아직 완화하지 않는다 — "초과"가 조건이다', () => {
    expect(mitigationFor(LARGE_TRACK_THRESHOLD).mitigated).toBe(false)
  })
})

describe('TC-011-4 — 경계 구간(132~300)은 구현체 재량이다', () => {
  it('경계 구간을 판정할 수 있다', () => {
    expect(isBoundaryRange(BOUNDARY_RANGE_START)).toBe(true)
    expect(isBoundaryRange(250)).toBe(true)
    expect(isBoundaryRange(LARGE_TRACK_THRESHOLD)).toBe(true)
    expect(isBoundaryRange(131)).toBe(false)
    expect(isBoundaryRange(301)).toBe(false)
  })

  it('이 구현은 경계 구간에서 완화하지 않는다 — 그 선택이 결함이 아니다', () => {
    for (const count of [132, 200, 300]) {
      expect(mitigationFor(count).mitigated).toBe(false)
    }
  })
})

describe('TC-011-2 — 대조군을 만들 수 있다', () => {
  it('강제 해제하면 같은 피스 수에서도 완화하지 않는다', () => {
    // 데이터를 바꾸면 대조군이 성립하지 않는다 — **같은 데이터**에서 완화만 꺼야 한다
    expect(mitigationFor(304).mitigated).toBe(true)
    expect(mitigationFor(304, true).mitigated).toBe(false)
    expect(mitigationFor(304, true).curvedSamples).toBe(FULL_CURVED_SAMPLES)
  })
})
