// FEAT-008 순수 축 — 자리바꿈이 **어떤 모양인가**를 수치로 가른다.
//
// 화면으로는 완만한 S곡선과 가운데 45% 직선 이동이 둘 다 그럴듯해 보인다. 두 모양을
// 가르는 것은 변화율뿐이라(D-036 ②) 여기가 정본 검증 자리다. 브라우저는 "달라 보인다"까지만
// 확인할 수 있다.
import { describe, expect, it } from 'vitest'

import {
  LANE_CENTERS_CM,
  LANE_PITCH_CM,
  OVERPASS_HEIGHT_CM,
  TRACK_WIDTH_CM,
  isOverpassLane,
  laneBandAt,
  laneOffsetAt,
  laneShiftsCm,
  swapProgress,
} from './lane-model'

const LANE_CHANGE = 'Lan1'
const STRAIGHT = 'Str1'

/** 중앙차분으로 잰 가로 위치의 변화율 */
function lateralRateAt(lane: number, t: number, h = 1e-4): number {
  const a = laneOffsetAt(LANE_CHANGE, lane, t - h).lateralCm
  const b = laneOffsetAt(LANE_CHANGE, lane, t + h).lateralCm
  return (b - a) / (2 * h)
}

describe('D-034 — 레인은 3개·각 12cm·전체 36cm다', () => {
  it('중심 위치가 [−12, 0, +12]다', () => {
    expect(LANE_CENTERS_CM).toEqual([-12, 0, 12])
  })

  it('전체 폭이 상수와 일치한다 — 바깥 반 레인이 빠지면 24cm가 된다(결함 이력)', () => {
    expect(TRACK_WIDTH_CM).toBe(36)
    const outerLo = laneBandAt(STRAIGHT, 0, 0.5).lo.lateralCm
    const outerHi = laneBandAt(STRAIGHT, 2, 0.5).hi.lateralCm
    expect(outerHi - outerLo).toBe(TRACK_WIDTH_CM)
  })

  it('인접 레인 사이에 틈이 없다', () => {
    for (let lane = 0; lane + 1 < LANE_CENTERS_CM.length; lane += 1) {
      expect(laneBandAt(STRAIGHT, lane, 0.5).hi.lateralCm).toBeCloseTo(
        laneBandAt(STRAIGHT, lane + 1, 0.5).lo.lateralCm,
        12,
      )
    }
  })
})

describe('D-033 — 레인은 한 칸씩 순환하고 위치 집합이 보존된다', () => {
  it('0→1, 1→2, 2→0이라 이동량은 [+12, +12, −24]다', () => {
    expect(laneShiftsCm()).toEqual([12, 12, -24])
  })

  it('자리바꿈 뒤 세 자리가 그대로 채워진다', () => {
    const after = LANE_CENTERS_CM.map((_, lane) => laneOffsetAt(LANE_CHANGE, lane, 1).lateralCm)
    expect([...after].sort((a, b) => a - b)).toEqual([...LANE_CENTERS_CM])
    // 좌우 대칭 교환이 아니다 — 그러면 가운데 레인이 제자리에 남는다
    expect(after[1]).not.toBe(LANE_CENTERS_CM[1])
  })
})

describe('TC-008-4 — 가운데 45%에서만 직선으로 건너간다', () => {
  it('t=0.5에서 이동량의 절반에 있다', () => {
    const shift = laneShiftsCm()[0]!
    const at = laneOffsetAt(LANE_CHANGE, 0, 0.5).lateralCm - LANE_CENTERS_CM[0]!
    expect(at).toBeCloseTo(shift / 2, 10)
  })

  it('t=0.1·t=0.9에서 변화율이 0이다 — S곡선이면 0이 아니다', () => {
    expect(lateralRateAt(0, 0.1)).toBeCloseTo(0, 10)
    expect(lateralRateAt(0, 0.9)).toBeCloseTo(0, 10)
    // 이 단언이 두 모양을 가른다: (1−cos πt)/2 라면 t=0.1의 변화율은 이만큼이다
    const sCurveRate = (Math.PI / 2) * Math.sin(Math.PI * 0.1)
    expect(sCurveRate).toBeGreaterThan(0.4)
  })

  it('구간 안에서는 변화율이 일정하다(직선 이동)', () => {
    const shift = laneShiftsCm()[0]!
    const expected = shift / 0.45
    for (const t of [0.35, 0.5, 0.65]) expect(lateralRateAt(0, t)).toBeCloseTo(expected, 5)
  })

  it('구간 경계는 0.275·0.725다', () => {
    expect(swapProgress(0.275)).toBeCloseTo(0, 10)
    expect(swapProgress(0.725)).toBeCloseTo(1, 10)
    expect(swapProgress(0.2)).toBe(0)
    expect(swapProgress(0.8)).toBe(1)
  })
})

describe('TC-008-5 — 두 칸 건너뛰는 레인만 육교로 솟는다', () => {
  it('판별은 색·이름이 아니라 이동 폭이다', () => {
    expect(laneShiftsCm().map(isOverpassLane)).toEqual([false, false, true])
    expect(isOverpassLane(LANE_PITCH_CM)).toBe(false)
  })

  it('육교 레인만 t=0.5에서 8cm까지 솟고 나머지 둘은 0이다', () => {
    const heights = LANE_CENTERS_CM.map((_, lane) => laneOffsetAt(LANE_CHANGE, lane, 0.5).riseCm)
    expect(heights).toEqual([0, 0, OVERPASS_HEIGHT_CM])
  })

  it('마루가 자리바꿈 구간의 중앙에 온다', () => {
    const at = (t: number) => laneOffsetAt(LANE_CHANGE, 2, t).riseCm
    expect(at(0.5)).toBeGreaterThan(at(0.4))
    expect(at(0.5)).toBeGreaterThan(at(0.6))
    expect(at(0.5)).toBe(OVERPASS_HEIGHT_CM)
  })

  it('구간 밖(t<0.275, t>0.725)에서는 0이다', () => {
    for (const t of [0, 0.1, 0.274, 0.726, 0.9, 1]) {
      expect(laneOffsetAt(LANE_CHANGE, 2, t).riseCm).toBeCloseTo(0, 10)
    }
  })

  it('곡선이 피스 전체 t가 아니라 로컬 u의 sin²이다', () => {
    // t=0.4 → u=(0.4−0.275)/0.45. 피스 전체 t로 sin²(πt)를 쓰면 다른 값이 나온다
    const u = (0.4 - 0.275) / 0.45
    expect(laneOffsetAt(LANE_CHANGE, 2, 0.4).riseCm).toBeCloseTo(
      OVERPASS_HEIGHT_CM * Math.sin(Math.PI * u) ** 2,
      10,
    )
  })
})

describe('레인체인지가 아닌 피스는 자리바꿈도 육교도 없다', () => {
  it('가로 위치가 t와 무관하게 고정이다', () => {
    for (const t of [0, 0.3, 0.5, 0.7, 1]) {
      expect(laneOffsetAt(STRAIGHT, 0, t)).toEqual({ lateralCm: -12, riseCm: 0 })
    }
  })
})

describe('교차 형상 — piece-geometry.md §D-033 실측표와 같은 횟수로 만난다', () => {
  /** 두 레인의 가로 위치 대소가 뒤집힌 횟수 */
  function crossings(a: number, b: number): number {
    const samples = 2001
    let count = 0
    let previous = Math.sign(
      laneOffsetAt(LANE_CHANGE, a, 0).lateralCm - laneOffsetAt(LANE_CHANGE, b, 0).lateralCm,
    )
    for (let index = 1; index < samples; index += 1) {
      const t = index / (samples - 1)
      const sign = Math.sign(
        laneOffsetAt(LANE_CHANGE, a, t).lateralCm - laneOffsetAt(LANE_CHANGE, b, t).lateralCm,
      )
      if (sign !== 0 && previous !== 0 && sign !== previous) count += 1
      if (sign !== 0) previous = sign
    }
    return count
  }

  it('lane1×lane2 1회 · lane0×lane2 1회 · lane0×lane1 0회', () => {
    expect(crossings(1, 2)).toBe(1)
    expect(crossings(0, 2)).toBe(1)
    // 바깥으로 밀려난 레인2가 나머지 둘을 가로지르는 것이 교차 형상이다 —
    // 0과 1은 나란히 밀리므로 만나지 않는다
    expect(crossings(0, 1)).toBe(0)
  })

  it('가로지르는 레인이 곧 육교 레인이다 — 같은 높이로 지나가면 서로 통과해 버린다', () => {
    const shifts = laneShiftsCm()
    const crossing = [0, 1, 2].filter((lane) => crossings(lane, 2) > 0 || lane === 2)
    expect(crossing).toContain(2)
    expect(isOverpassLane(shifts[2]!)).toBe(true)
  })
})
