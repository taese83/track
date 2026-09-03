// FEAT-020 — 트랙 벽의 순수 축.
//
// 브라우저에서 확인할 수 있는 것은 "벽이 보인다"까지다. **높이가 정말 5cm인가**·**뱅크에서
// 노면과 직각인가**·**줄 수가 맞는가**는 좌표로만 드러난다. 특히 각도는 화면으로 그럴듯해
// 보이면서 몇 도씩 틀어질 수 있다(piece-geometry.md §결함 이력의 폭 24cm 사고와 같은 종류).
import { describe, expect, it } from 'vitest'

import type { BandPoint, LaneBand, SegmentBands } from './lane-bands'
import { buildWallGeometries, WALL_HEIGHT_CM, wallBandOf, wallLinesOf, wallNormalAt } from './wall-geometry'

/** 진행축 x를 따라 표본 `count`개, 가로는 z로 벌린 평평한 레인 */
function flatLane(lane: number, count: number, y = 0): LaneBand {
  const at = (side: number): BandPoint[] =>
    Array.from({ length: count }, (_, index) => ({
      x: index * 10,
      y,
      z: lane * 12 + side * 6,
    }))
  return { lane, lo: at(-1), hi: at(1) }
}

/**
 * 진행축 x를 따라가되 노면이 z축 둘레로 `tiltDeg`만큼 기운 레인 — 뱅크의 단면이다.
 * 가로 방향이 (0, sin, cos)이므로 법선은 (0, cos, −sin)이어야 한다.
 */
function bankedLane(lane: number, count: number, tiltDeg: number): LaneBand {
  const rad = (tiltDeg * Math.PI) / 180
  const half = 6
  const at = (side: number): BandPoint[] =>
    Array.from({ length: count }, (_, index) => ({
      x: index * 10,
      y: side * half * Math.sin(rad),
      z: lane * 12 + side * half * Math.cos(rad),
    }))
  return { lane, lo: at(-1), hi: at(1) }
}

function bandOf(lanes: LaneBand[], overrides: Partial<SegmentBands> = {}): SegmentBands {
  return {
    order: 3,
    pieceId: 'p3',
    pieceClass: 'Str1',
    isSupported: true,
    lanes,
    separated: false,
    ...overrides,
  }
}

const THREE_LANES = () => [flatLane(0, 4), flatLane(1, 4), flatLane(2, 4)]

describe('wallLinesOf — 줄 수는 boundaryLinesOf와 같은 규칙이다', () => {
  it('맞붙은 레인 셋은 4줄 — 바깥 둘 + 레인 사이 둘(이웃이 공유한다)', () => {
    expect(wallLinesOf(bandOf(THREE_LANES()))).toHaveLength(4)
  })

  it('명시 경로로 따로 놓인 레인(FEAT-018)은 레인마다 좌·우 6줄', () => {
    expect(wallLinesOf(bandOf(THREE_LANES(), { separated: true }))).toHaveLength(6)
  })

  it('미지원 피스에는 벽이 없다 — 없는 트랙을 있다고 주장하지 않는다', () => {
    expect(wallLinesOf(bandOf([], { isSupported: false }))).toHaveLength(0)
  })

  it('면이 되지 않는 레인은 빠진다', () => {
    expect(wallLinesOf(bandOf([flatLane(0, 1), flatLane(1, 4)]))).toHaveLength(2)
  })

  it('맞붙은 레인의 4줄이 실제 바깥·사이 경계다 — 같은 자리를 두 번 세우지 않는다', () => {
    const lanes = THREE_LANES()
    const zs = wallLinesOf(bandOf(lanes)).map((line) => line.base[0]!.z)
    expect(zs).toEqual([-6, 6, 18, 30])
  })
})

describe('wallNormalAt', () => {
  it('평지에서는 연직이다', () => {
    const [line] = wallLinesOf(bandOf(THREE_LANES()))
    const normal = wallNormalAt(line!, 1)

    expect(normal.y).toBeCloseTo(1, 9)
    expect(Math.hypot(normal.x, normal.z)).toBeCloseTo(0, 9)
  })

  it('뱅크 20°에서 노면과 직각을 유지하며 함께 기운다 — 각도 차 1° 미만(TC-020-2)', () => {
    const tilt = 20
    const rad = (tilt * Math.PI) / 180
    const [line] = wallLinesOf(bandOf([bankedLane(0, 5, tilt)]))
    const normal = wallNormalAt(line!, 2)

    // 노면이 z축 둘레로 기울면 법선은 (0, cos, ∓sin)이다
    const expected = { x: 0, y: Math.cos(rad), z: -Math.sin(rad) }
    const dot = normal.x * expected.x + normal.y * expected.y + normal.z * expected.z
    const angleDeg = (Math.acos(Math.min(Math.abs(dot), 1)) * 180) / Math.PI

    expect(angleDeg).toBeLessThan(1)
    // 기울었다는 사실 자체도 확인한다 — 연직으로 물러선 것과 구분되어야 한다
    expect(Math.abs(normal.z)).toBeCloseTo(Math.sin(rad), 6)
  })

  it('언제나 위를 향한다 — 외적 부호가 뒤집혀도 벽이 바닥을 뚫지 않는다', () => {
    for (const band of [bandOf(THREE_LANES()), bandOf([bankedLane(0, 5, 20)])]) {
      for (const line of wallLinesOf(band)) {
        for (let at = 0; at < line.base.length; at += 1) {
          expect(wallNormalAt(line, at).y).toBeGreaterThan(0)
        }
      }
    }
  })

  it('표본이 겹쳐 방향을 못 구하면 연직으로 물러선다 — 벽이 사라지지 않는다', () => {
    const degenerate = { lane: 0, base: [{ x: 0, y: 0, z: 0 }], facing: [{ x: 0, y: 0, z: 0 }] }
    expect(wallNormalAt(degenerate, 0)).toEqual({ x: 0, y: 1, z: 0 })
  })
})

describe('wallBandOf', () => {
  it('벽 상단이 노면에서 정확히 5cm다 (TC-020-1)', () => {
    const band = wallBandOf(bandOf(THREE_LANES()))

    for (const wall of band.lanes) {
      for (let at = 0; at < wall.lo.length; at += 1) {
        const foot = wall.lo[at]!
        const top = wall.hi[at]!
        const height = Math.hypot(top.x - foot.x, top.y - foot.y, top.z - foot.z)
        expect(height).toBeCloseTo(WALL_HEIGHT_CM, 9)
      }
    }
  })

  it('뱅크에서도 높이가 5cm다 — 기울어도 짧아지지 않는다', () => {
    const band = wallBandOf(bandOf([bankedLane(0, 5, 20)]))
    const wall = band.lanes[0]!
    const foot = wall.lo[2]!
    const top = wall.hi[2]!

    expect(Math.hypot(top.x - foot.x, top.y - foot.y, top.z - foot.z)).toBeCloseTo(
      WALL_HEIGHT_CM,
      9,
    )
    // 연직 높이는 5cm보다 **낮다** — 기울었다는 증거다
    expect(top.y - foot.y).toBeLessThan(WALL_HEIGHT_CM)
  })

  it('밑동이 레인 가장자리 그대로다 — 노면과 벽 사이에 틈이 없다', () => {
    const lanes = THREE_LANES()
    const band = wallBandOf(bandOf(lanes))

    expect(band.lanes[0]!.lo).toEqual(lanes[0]!.lo)
    expect(band.lanes[3]!.lo).toEqual(lanes[2]!.hi)
  })

  it('레인이 올라가면 벽 밑동도 함께 올라간다 — 육교 레인의 벽이 따라 떠오른다(TC-020-5)', () => {
    const raised = wallBandOf(bandOf([flatLane(0, 4, 8)]))
    expect(raised.lanes[0]!.lo.every((point) => point.y === 8)).toBe(true)
    expect(raised.lanes[0]!.hi.every((point) => point.y === 8 + WALL_HEIGHT_CM)).toBe(true)
  })

  it('세그먼트 메타데이터를 보존한다 — 색 판정이 order로 원본을 찾는다', () => {
    const band = wallBandOf(bandOf(THREE_LANES(), { order: 42 }))
    expect(band.order).toBe(42)
    expect(band.isSupported).toBe(true)
  })
})

describe('buildWallGeometries', () => {
  it('색 단위로 합친다 — 벽이 528개여도 draw call은 색 종류만큼이다', () => {
    const bands = [
      bandOf(THREE_LANES(), { order: 0 }),
      bandOf(THREE_LANES(), { order: 1 }),
      bandOf(THREE_LANES(), { order: 2 }),
    ]
    const colors = ['#870000', '#002869', '#870000']

    const built = buildWallGeometries(bands, (band) => colors[band.order]!)
    expect(built.map((entry) => entry.color).sort()).toEqual(['#002869', '#870000'])
  })

  it('미지원 피스는 버퍼에 아무것도 더하지 않는다 (TC-020-4)', () => {
    const only = buildWallGeometries([bandOf(THREE_LANES())], () => '#828892')
    const withUnsupported = buildWallGeometries(
      [bandOf(THREE_LANES()), bandOf([], { order: 1, isSupported: false })],
      () => '#828892',
    )

    const count = (built: typeof only) =>
      built[0]!.geometry.getAttribute('position').array.length

    expect(count(withUnsupported)).toBe(count(only))
  })

  it('벽 줄 수만큼 정점이 늘어난다 — 맞붙은 레인 4줄 × 표본 × (밑동·상단)', () => {
    const samples = 5
    const built = buildWallGeometries([bandOf([flatLane(0, samples), flatLane(1, samples)])], () => '#828892')

    // 맞붙은 레인 둘이면 벽 3줄. 줄마다 표본 5개 × 2점
    expect(built[0]!.geometry.getAttribute('position').array.length / 3).toBe(3 * samples * 2)
  })
})

describe('육교 아래에서는 천장까지만 선다 (TC-020-5, PC-017)', () => {
  /**
   * 레인 0(z ∈ [−6, 6], y = 0) 위를 **어긋나게** 가로지르는 육교 레인(z ∈ [0, 12], y = floor).
   * 어긋나야 아래 레인의 벽 z=+6이 육교 면 **한가운데**(t = 0.5)에 놓인다 — 딱 맞게 겹쳐 두면
   * 벽이 공유 경계(t = 0 또는 1)로 잡혀 여유에 걸러지고, 검사가 아무것도 재지 않는다.
   */
  function crossing(floor: number): SegmentBands {
    const under = flatLane(0, 4)
    const over: LaneBand = {
      lane: 2,
      lo: under.lo.map((point) => ({ x: point.x, y: floor, z: 0 })),
      hi: under.hi.map((point) => ({ x: point.x, y: floor, z: 12 })),
    }
    return bandOf([under, over], { pieceClass: 'Lan1' })
  }

  /** 그 벽이 실제로 얼마나 섰는가(밑동 → 상단 거리) */
  function heights(band: SegmentBands, wall: number): number[] {
    const strip = band.lanes[wall]!
    return strip.lo.map((foot, at) => {
      const top = strip.hi[at]!
      return Math.hypot(top.x - foot.x, top.y - foot.y, top.z - foot.z)
    })
  }

  // wallLinesOf 순서: [under.lo(z=−6), under.hi(z=+6), over.hi(z=+12)]
  const COVERED = 1
  const CLEAR = 0

  it('육교 바닥이 5cm보다 낮으면 덮인 벽이 그 바닥까지만 선다 — 노면을 뚫지 않는다', () => {
    const band = wallBandOf(crossing(3))
    for (const height of heights(band, COVERED)) expect(height).toBeCloseTo(3, 9)
  })

  it('덮이지 않은 벽은 그대로 5cm다 — 필요 없는 데까지 깎지 않는다', () => {
    const band = wallBandOf(crossing(3))
    for (const height of heights(band, CLEAR)) expect(height).toBeCloseTo(WALL_HEIGHT_CM, 9)
  })

  it('육교 바닥이 5cm보다 높으면 덮인 벽도 5cm 그대로다', () => {
    const band = wallBandOf(crossing(6))
    for (const height of heights(band, COVERED)) expect(height).toBeCloseTo(WALL_HEIGHT_CM, 9)
  })

  it('바닥이 0에 가까우면 그 자리 벽이 0으로 눕는다 — 끊기는 것이 아니라 낮아진다', () => {
    const band = wallBandOf(crossing(0.001))
    expect(Math.max(...heights(band, COVERED))).toBeLessThan(0.01)
    // 정점은 그대로 있다 — 띠가 사라져 구멍이 나지 않는다
    expect(band.lanes[COVERED]!.lo).toHaveLength(4)
  })

  it('육교 레인 자신의 벽은 아래 레인에 눌리지 않는다 — 위가 아니라 아래다', () => {
    const band = wallBandOf(crossing(3))
    for (const height of heights(band, 2)) expect(height).toBeCloseTo(WALL_HEIGHT_CM, 9)
  })

  it('맞붙은 레인의 공유 경계는 천장으로 보지 않는다 — 정상 인접이 눌림으로 읽히면 안 된다', () => {
    const band = wallBandOf(bandOf(THREE_LANES()))
    for (const wall of band.lanes) {
      for (let at = 0; at < wall.lo.length; at += 1) {
        expect(wall.hi[at]!.y - wall.lo[at]!.y).toBeCloseTo(WALL_HEIGHT_CM, 9)
      }
    }
  })
})
