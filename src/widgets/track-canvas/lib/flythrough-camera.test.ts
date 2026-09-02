// FEAT-007 — 추종 시점이 복원된 순서를 실제로 따라가는가.
//
// 경로는 참조 트랙(WS67Y2)에서 실측으로 만든다. 손으로 지은 표본으로 재면 배치
// (`orientPath`·`buildPiecePath`·고도 합성)를 통과한 좌표가 아니라 **테스트가 넣은 값**을
// 되읽는 프록시가 된다 — 그러면 배치가 깨져도 이 테스트는 통과한다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateClosure } from '@/entities/track/lib/closure'
import { buildElevatedSegments, orientPath } from '@/entities/track/lib/elevation'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import {
  CAMERA_START_LANE,
  advanceFlythrough,
  buildFlythroughPath,
  distanceOfOrder,
  easeToward,
  fractionalOrderAtDistance,
  initialFlythroughState,
  orderAtDistance,
  poseAt,
  jumpTo,
  scrubTo,
  setPlaying,
} from './flythrough-camera'
import type { FlythroughPath, FlythroughWaypoint } from './flythrough-camera'
import {
  LANE_CENTERS_CM,
  LANE_COUNT,
  LANE_PITCH_CM,
  OVERPASS_HEIGHT_CM,
  isLaneChangeClass,
  laneShiftsCm,
} from './lane-model'
import { buildSceneLayout } from './scene-layout'
import type { SceneSample, SceneSegment } from './scene-layout'

const RAD = Math.PI / 180

/**
 * 프로덕션의 씬 구성(`TrackViewerPage.buildScene`)과 **같은 경로**로 만든다. 복원이
 * 실패해도 FEAT-004가 확보한 연결 구간(`connectedPieceIds`)까지는 배치되며, 부분 실패
 * 트랙(OPENLOOP)이 실제로 3D에 도달하는 길이 이것이다 — 여기서 다른 길로 만들면
 * 테스트가 화면에 없는 씬을 재게 된다.
 */
async function sceneOf(fixture: string) {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', fixture), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`${fixture} 추출 실패`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`${fixture} 파싱 실패`)
  const restored = restoreOrder(parsed.pieces)
  const closure = validateClosure({ pieces: parsed.pieces, restored })

  const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
  const connected: ParsedPiece[] = []
  for (const pieceId of closure.connectedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) connected.push(found)
  }

  const oriented = orientPath(connected)
  const elevated = buildElevatedSegments(oriented).segments
  const truncated = connected.length < parsed.pieces.length
  const layout = buildSceneLayout({ oriented, elevated, truncated, allPieces: parsed.pieces })
  return { layout, elevated, oriented, truncated, pieceCount: parsed.pieces.length }
}

/** 세그먼트 하나가 차지하는 진입→진출 직선거리. 표본 간격의 상한 근거다 */
function chordOf(segment: SceneSegment): number {
  const entry = segment.points[0]
  const exit = segment.points[segment.points.length - 1]
  if (entry === undefined || exit === undefined) return 0
  return Math.hypot(exit.x - entry.x, exit.y - entry.y, exit.z - entry.z)
}

describe('TC-007-1 — START부터 화살표 방향 순서대로 이탈 없이 통과한다', () => {
  it('경로가 START(Str2)에서 시작한다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const first = flythrough.waypoints[0]
    expect(first).toBeDefined()
    expect(first!.order).toBe(0)
    // 복원의 시작점은 Str2다(restore-order §START_PIECE_CLASS) — 경로가 거기서 출발하는지
    // 클래스로 확인한다. 인덱스 0만 보면 배치가 다른 피스로 시작해도 통과한다.
    expect(layout.segments[0]!.pieceClass).toBe('Str2')

    // 첫 지점은 그 세그먼트의 진입점이다(`points[0]`이 주행 진입점이라는 계약)
    const entry = layout.segments[0]!.points[0]!
    expect(first!.x).toBeCloseTo(entry.x, 6)
    expect(first!.z).toBeCloseTo(entry.z, 6)
    expect(first!.distance).toBe(0)
  })

  it('복원된 모든 세그먼트를 순서대로 한 번씩 지난다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    // 순서는 단조 비감소여야 한다 — 뒤섞이면 카메라가 트랙을 왔다 갔다 한다
    const orders = flythrough.waypoints.map((waypoint) => waypoint.order)
    for (let index = 1; index < orders.length; index += 1) {
      expect(orders[index]!).toBeGreaterThanOrEqual(orders[index - 1]!)
    }

    // 빠진 세그먼트가 없어야 한다 — 하나라도 건너뛰면 그 구간을 통과하지 않은 것이다
    const visited = new Set(orders)
    expect(visited.size).toBe(layout.segments.length)
    expect(Math.min(...orders)).toBe(0)
    expect(Math.max(...orders)).toBe(layout.segments.length - 1)
    expect(flythrough.truncated).toBe(false)
  })

  it('연속한 지점 사이가 끊기지 않는다 — 순간이동으로 트랙을 벗어나지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    let maxGap = 0
    for (let index = 1; index < flythrough.waypoints.length; index += 1) {
      const previous = flythrough.waypoints[index - 1]!
      const current = flythrough.waypoints[index]!
      maxGap = Math.max(maxGap, current.distance - previous.distance)
    }

    // 상한의 근거는 **데이터**다: 평지 직선은 표본이 두 끝뿐이라 한 스텝이 곧 그 피스의
    // 길이이므로, 어떤 스텝도 가장 긴 세그먼트의 진입→진출 거리를 넘을 수 없다. 세그먼트를
    // 통째로 건너뛰면 두 피스를 잇는 거리가 되어 이 상한을 넘는다.
    // 실측(WS67Y2): 최대 스텝 54.055cm = Str1/Str2의 길이(±27 오프셋)와 일치한다.
    const longestChord = Math.max(...layout.segments.map(chordOf))
    expect(maxGap).toBeLessThanOrEqual(longestChord + 1e-6)
    expect(maxGap).toBeGreaterThan(0)
    expect(flythrough.length).toBeGreaterThan(0)
  })
})

describe('TC-007-2 — 스크럽은 즉시 컷이 아니라 easing이다', () => {
  it('한 프레임 뒤의 위치가 현재와 목표 사이에 있다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const goal = distanceOfOrder(flythrough, 60)
    expect(goal).toBeGreaterThan(0)

    const scrubbed = scrubTo(initialFlythroughState(), goal)
    const afterOneFrame = advanceFlythrough(scrubbed, 16, flythrough)

    // 즉시 컷이면 한 프레임 만에 목표와 같아진다 — 이 단언이 두 동작을 가른다
    expect(afterOneFrame.distance).toBeGreaterThan(0)
    expect(afterOneFrame.distance).toBeLessThan(goal)
  })

  it('프레임을 거듭하면 목표에 도달한다 — 영영 못 닿지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const goal = distanceOfOrder(flythrough, 60)
    let state = scrubTo(initialFlythroughState(), goal)
    for (let frame = 0; frame < 200; frame += 1) state = advanceFlythrough(state, 16, flythrough)

    expect(state.distance).toBe(goal)
  })

  it('프레임 간격이 흔들려도 같은 시간에 같은 만큼 좁힌다', () => {
    // 한 번의 32ms와 두 번의 16ms가 같아야 한다 — 프레임당 고정량으로 좁히면 어긋난다
    const once = easeToward(0, 100, 32)
    const twice = easeToward(easeToward(0, 100, 16), 100, 16)
    expect(once).toBeCloseTo(twice, 9)
  })

  it('reduced-motion의 jumpTo는 즉시 컷이다 — 다음 프레임이 좁힐 거리가 없다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const goal = distanceOfOrder(flythrough, 60)
    const jumped = jumpTo(initialFlythroughState(), goal)
    expect(jumped.distance).toBe(goal)
    expect(jumped.goal).toBe(goal)
    // seek 구간이 없으므로 이동 중 커서 되쓰기 문제도 성립하지 않는다
    expect(jumped.seeking).toBe(false)
    expect(advanceFlythrough(jumped, 16, flythrough).distance).toBe(goal)
  })
})

describe('TC-007-3 — 일시정지는 즉시 멈추고 현재 위치를 유지한다', () => {
  it('멈춘 뒤에는 프레임이 흘러도 위치가 변하지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    let state = setPlaying(initialFlythroughState(), true)
    for (let frame = 0; frame < 30; frame += 1) state = advanceFlythrough(state, 16, flythrough)
    expect(state.distance).toBeGreaterThan(0)

    const paused = setPlaying(state, false)
    const held = paused.distance
    let after = paused
    for (let frame = 0; frame < 30; frame += 1) after = advanceFlythrough(after, 16, flythrough)

    // 목표가 앞서 있으면 이징이 계속 흘러간다 — "즉시 멈춤"이 아니다
    expect(after.distance).toBe(held)
    expect(after.goal).toBe(held)
  })

  it('재생 속도가 빠르면 같은 시간에 더 멀리 간다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const run = (speed: number) => {
      let state = setPlaying({ ...initialFlythroughState(), speed }, true)
      for (let frame = 0; frame < 60; frame += 1) state = advanceFlythrough(state, 16, flythrough)
      return state.distance
    }

    expect(run(480)).toBeGreaterThan(run(240))
  })
})

describe('TC-007-4 — 카메라 피치가 고도 프로파일 기울기에서 직접 파생된다', () => {
  it('모든 지점의 피치가 atan(slopeAt(t))와 정확히 같다 — 별도 보정이 없다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })
    const byOrder = new Map(elevated.map((segment) => [segment.order, segment]))

    let sloped = 0
    for (const waypoint of flythrough.waypoints) {
      const profile = byOrder.get(waypoint.order)?.elevationProfile
      if (profile === undefined) continue
      const expected = Math.atan(profile.slopeAt(waypoint.t))
      expect(waypoint.pitchRad).toBe(expected)
      if (Math.abs(expected) > 0.001) sloped += 1
    }

    // 참조 트랙에는 슬로프·뱅크가 있다 — 전부 0이면 위 단언이 아무것도 재지 않는다
    expect(sloped).toBeGreaterThan(0)
  })

  it('경사 구간에서 시선이 진행 방향과 함께 위/아래를 향한다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const rising = flythrough.waypoints.find((waypoint) => waypoint.pitchRad > 5 * RAD)
    expect(rising).toBeDefined()

    const pose = poseAt(flythrough, rising!.distance)
    expect(pose).not.toBeNull()
    // 오르막에서는 시선점이 눈보다 높다 — 피치가 시선에 반영되지 않으면 같은 높이가 된다
    expect(pose!.target.y).toBeGreaterThan(pose!.eye.y)
  })

  it('카메라가 노면 위에 있고 표본 사이도 보간된다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const first = flythrough.waypoints[0]!
    const second = flythrough.waypoints[1]!
    const middle = poseAt(flythrough, (first.distance + second.distance) / 2)

    expect(middle).not.toBeNull()
    // 두 표본 사이의 값이지 어느 한쪽으로 붙지 않는다
    const low = Math.min(first.x, second.x)
    const high = Math.max(first.x, second.x)
    expect(middle!.eye.x).toBeGreaterThanOrEqual(low)
    expect(middle!.eye.x).toBeLessThanOrEqual(high)
    // 눈높이는 노면보다 위다 — 노면에 붙으면 시선이 면에 잘린다
    expect(middle!.eye.y).toBeGreaterThan(Math.min(first.y, second.y))
  })
})

describe('TC-007-5 — 부분 실패 트랙에서 복원 구간까지만 가고 멈춘다', () => {
  it('도달 가능 구간까지만 경로를 만들고 오류를 던지지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const reachableCount = 40

    const flythrough = buildFlythroughPath({
      segments: layout.segments,
      elevated,
      reachableCount,
    })

    expect(flythrough.truncated).toBe(true)
    expect(Math.max(...flythrough.waypoints.map((waypoint) => waypoint.order))).toBe(
      reachableCount - 1,
    )

    // 재생해도 끊긴 지점을 넘지 않는다
    let state = setPlaying(initialFlythroughState(), true)
    for (let frame = 0; frame < 2000; frame += 1) state = advanceFlythrough(state, 16, flythrough)
    expect(state.distance).toBeLessThanOrEqual(flythrough.length)
    expect(state.goal).toBe(flythrough.length)
  })

  it('실제 비폐곡선 트랙(OPENLOOP)에서 끊긴 지점까지 가고 오류로 중단되지 않는다', async () => {
    const { layout, elevated, truncated, pieceCount } = await sceneOf('OPENLOOP.js.txt')

    // 실측: 복원은 traversal-incomplete로 실패하고 FEAT-004가 131개 접두부를 낸다.
    // 씬은 그 131개만 배치하며, 132번째는 3D에 자리가 없다.
    expect(pieceCount).toBe(132)
    expect(layout.segments).toHaveLength(131)
    expect(truncated).toBe(true)

    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })
    expect(flythrough.waypoints.length).toBeGreaterThan(0)

    // 끝까지 재생해도 던지지 않고 마지막 배치 구간에서 멈춘다
    let state = setPlaying(initialFlythroughState(), true)
    for (let frame = 0; frame < 3000; frame += 1) state = advanceFlythrough(state, 16, flythrough)
    expect(state.distance).toBe(flythrough.length)
    expect(orderAtDistance(flythrough, state.distance)).toBe(130)
    expect(poseAt(flythrough, flythrough.length)).not.toBeNull()
  })

  it('경로가 비면 자세를 지어내지 않고 null을 준다', () => {
    const empty = buildFlythroughPath({ segments: [], elevated: [] })
    expect(empty.waypoints).toHaveLength(0)
    expect(poseAt(empty, 0)).toBeNull()
  })
})

describe('스크럽 이동 중에는 카메라가 공유 커서를 되쓰지 않는다', () => {
  it('스크럽하면 도착 전까지 seeking이고 도착하면 내려간다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    let state = scrubTo(initialFlythroughState(), distanceOfOrder(flythrough, 79))
    expect(state.seeking).toBe(true)

    // 이동 중에는 계속 seeking — 이 구간에 카메라가 커서를 밀면 사용자가 찍은 79가
    // 카메라의 현재 위치(1·2·3…)로 덮인다(2026-08-31 브라우저 계측에서 79 → 3으로 되밀림)
    state = advanceFlythrough(state, 16, flythrough)
    expect(state.seeking).toBe(true)
    expect(state.distance).toBeLessThan(state.goal)

    for (let frame = 0; frame < 200; frame += 1) state = advanceFlythrough(state, 16, flythrough)
    expect(state.distance).toBe(state.goal)
    expect(state.seeking).toBe(false)
  })

  it('재생은 seek이 아니다 — 추종 중에는 커서를 끌고 간다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    let state = setPlaying(initialFlythroughState(), true)
    expect(state.seeking).toBe(false)
    for (let frame = 0; frame < 60; frame += 1) state = advanceFlythrough(state, 16, flythrough)
    // 재생 중에는 목표가 매 프레임 앞서 거리가 정확히 같아지지 않지만 seek은 아니다
    expect(state.distance).not.toBe(state.goal)
    expect(state.seeking).toBe(false)
  })

  it('제자리 스크럽은 seek이 아니다 — 움직이지 않으므로 되쓸 것도 없다', () => {
    const state = scrubTo(initialFlythroughState(), 0)
    expect(state.seeking).toBe(false)
  })
})

describe('공유 커서 ↔ 경로 거리 왕복', () => {
  it('구간 인덱스로 옮긴 거리에서 되읽으면 같은 구간이다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    for (const order of [0, 1, 17, 64, layout.segments.length - 1]) {
      expect(orderAtDistance(flythrough, distanceOfOrder(flythrough, order))).toBe(order)
    }
  })
})

// TC-012-6 — 스트립 인디케이터가 구간 안에서도 움직이려면 거리축이 소수 인덱스로 와야 한다.
// 여기서 지켜야 할 두 성질: **정수 축과 절대 어긋나지 않는다**(목록과 스트립이 같은 자리를
// 가리킨다)와 **구간 안에서 단조 증가한다**(계단이 사라진다).
describe('TC-012-6 — 연속 진행축(소수 세그먼트 인덱스)', () => {
  it('정수부가 `orderAtDistance`와 경로 전 구간에서 일치한다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const steps = 400
    for (let step = 0; step <= steps; step += 1) {
      const at = (flythrough.length * step) / steps
      const fractional = fractionalOrderAtDistance(flythrough, at)
      // 경계에 정확히 닿으면 소수부가 1.0이 되어 다음 정수와 만난다 — 그 자리는 둘 다 인정한다
      const integer = orderAtDistance(flythrough, at)
      expect(Math.floor(fractional)).toBeGreaterThanOrEqual(integer)
      expect(Math.floor(fractional)).toBeLessThanOrEqual(integer + 1)
      expect(fractional).toBeGreaterThanOrEqual(integer)
      expect(fractional).toBeLessThanOrEqual(integer + 1)
    }
  })

  it('경로 전체에서 단조 증가한다 — 인디케이터가 뒤로 가지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    let previous = -1
    for (let step = 0; step <= 800; step += 1) {
      const value = fractionalOrderAtDistance(flythrough, (flythrough.length * step) / 800)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('정수 축이 멈춰 있는 동안에도 값이 자란다 — 이것이 계단을 없애는 성질이다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    // 정수 축이 같은 값을 유지하는 가장 긴 거리 구간을 찾아 그 안을 잰다
    let bestOrder = 0
    let bestStart = 0
    let bestEnd = 0
    let order = orderAtDistance(flythrough, 0)
    let runStart = 0
    for (const waypoint of flythrough.waypoints) {
      if (waypoint.order === order) continue
      if (waypoint.distance - runStart > bestEnd - bestStart) {
        bestOrder = order
        bestStart = runStart
        bestEnd = waypoint.distance
      }
      order = waypoint.order
      runStart = waypoint.distance
    }
    expect(bestEnd - bestStart).toBeGreaterThan(10)

    const samples = Array.from({ length: 9 }, (_, step) =>
      fractionalOrderAtDistance(flythrough, bestStart + ((bestEnd - bestStart) * step) / 8),
    )
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!).toBeGreaterThan(samples[index - 1]!)
    }
    expect(samples[0]!).toBeCloseTo(bestOrder, 6)
    expect(samples[samples.length - 1]!).toBeCloseTo(bestOrder + 1, 6)
  })

  it('경로 밖 거리는 양 끝으로 잘린다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })
    const last = flythrough.waypoints[flythrough.waypoints.length - 1]!

    expect(fractionalOrderAtDistance(flythrough, -500)).toBe(
      fractionalOrderAtDistance(flythrough, 0),
    )
    expect(fractionalOrderAtDistance(flythrough, flythrough.length + 500)).toBeCloseTo(
      last.order,
      6,
    )
  })

  it('빈 경로에서는 0이다 — 부르는 쪽이 방어하지 않아도 된다', () => {
    expect(fractionalOrderAtDistance({ waypoints: [], length: 0, truncated: false }, 12)).toBe(0)
  })
})

// FEAT-008 · D-047 — 카메라가 중심선이 아니라 레인 위를 달리는가.
// 가로 변위는 `lane-bands.frameOf`와 **같은 프레임**(좌측 법선)으로 되잰다. 다른 프레임으로
// 재면 화면의 레인 면과 카메라가 서로 다른 축 위에 있어도 통과한다.
function tangentRadAt(segment: SceneSegment, index: number): number {
  const { points } = segment
  if (index <= 0) return segment.entryTangentRad
  if (index >= points.length - 1) return segment.exitTangentRad
  const prev = points[index - 1]!
  const next = points[index + 1]!
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  if (dx === 0 && dz === 0) return segment.entryTangentRad
  return Math.atan2(dz, dx)
}

function sampleIndexOf(segment: SceneSegment, waypoint: FlythroughWaypoint): number {
  const index = segment.points.findIndex((sample) => sample.t === waypoint.t)
  if (index < 0) throw new Error(`중심선 표본 없음: order=${waypoint.order} t=${waypoint.t}`)
  return index
}

function sampleOf(segment: SceneSegment, waypoint: FlythroughWaypoint): SceneSample {
  return segment.points[sampleIndexOf(segment, waypoint)]!
}

/** 중심선 표본에서 좌측 법선 방향으로 얼마나 벗어났는가(cm) */
function lateralOf(segment: SceneSegment, waypoint: FlythroughWaypoint): number {
  const index = sampleIndexOf(segment, waypoint)
  const sample = segment.points[index]!
  const tangentRad = tangentRadAt(segment, index)
  const nx = -Math.sin(tangentRad)
  const nz = Math.cos(tangentRad)
  return (waypoint.x - sample.x) * nx + (waypoint.z - sample.z) * nz
}

function waypointsOf(path: FlythroughPath, order: number): FlythroughWaypoint[] {
  return path.waypoints.filter((waypoint) => waypoint.order === order)
}

function laneChangesOf(segments: readonly SceneSegment[]): SceneSegment[] {
  return segments.filter((segment) => isLaneChangeClass(segment.pieceClass))
}

describe('TC-008-2 — 레인체인지 통과 시 카메라가 레인 오프셋을 따른다', () => {
  it('레인체인지 이전 구간은 가운데 레인 그대로다 — 종전 경로와 같은 좌표다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })
    const byOrder = new Map(layout.segments.map((segment) => [segment.order, segment]))

    const laneChangeOrder = laneChangesOf(layout.segments)[0]?.order
    expect(laneChangeOrder).toBeDefined()

    const before = flythrough.waypoints.filter((waypoint) => waypoint.order < laneChangeOrder!)
    expect(before.length).toBeGreaterThan(0)

    for (const waypoint of before) {
      const segment = byOrder.get(waypoint.order)!
      expect(waypoint.lane).toBe(CAMERA_START_LANE)
      expect(Math.abs(lateralOf(segment, waypoint))).toBeLessThanOrEqual(1e-6)
      expect(waypoint.y).toBeCloseTo(sampleOf(segment, waypoint).y, 6)
    }
  })

  it('TC-008-2: 각 레인체인지에서 가로 위치가 그 레인의 자리바꿈 이동량만큼 옮겨간다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const laneChanges = laneChangesOf(layout.segments)
    // 실측 1개(WS67Y2의 Lan1 — README의 "1→2·2→3·3→1"은 그 한 피스 안의 세 레인 순환이다).
    // 0이면 아래 단언이 아무것도 재지 않는다
    console.log(`WS67Y2 레인체인지 세그먼트 수: ${laneChanges.length}`)
    expect(laneChanges.length).toBeGreaterThanOrEqual(1)

    const shifts = laneShiftsCm()
    for (const segment of laneChanges) {
      const points = waypointsOf(flythrough, segment.order)
      expect(points.length).toBeGreaterThanOrEqual(3)

      const lane = points[0]!.lane
      const shift = shifts[lane]!
      const entry = lateralOf(segment, points[0]!)
      const exit = lateralOf(segment, points[points.length - 1]!)
      // 진입 표본이 아직 자리바꿈 구간(가운데 45%) 밖이라는 전제 — 표본이 성기면 여기서 깨진다
      expect(entry).toBeCloseTo(LANE_CENTERS_CM[lane]!, 2)
      expect(exit - entry).toBeCloseTo(shift, 2)

      let middle = points[0]!
      for (const waypoint of points) {
        if (Math.abs(waypoint.t - 0.5) < Math.abs(middle.t - 0.5)) middle = waypoint
      }
      // D-036 ② — 가운데 45% 구간을 직선으로 건너므로 중앙은 절반이다
      expect(Math.abs(lateralOf(segment, middle) - entry - shift / 2)).toBeLessThanOrEqual(0.6)
    }
  })

  it('TC-008-2: 레인체인지를 지날 때마다 레인이 한 칸 순환한다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    const laneChanges = laneChangesOf(layout.segments)
    for (const segment of laneChanges) {
      const inside = waypointsOf(flythrough, segment.order)
      const after = flythrough.waypoints.find((waypoint) => waypoint.order > segment.order)
      if (after === undefined) continue
      expect(after.lane).toBe((inside[0]!.lane + 1) % LANE_COUNT)
    }

    // 경로 끝의 레인은 출발 레인 + 레인체인지 수다. WS67Y2는 레인체인지가 1개라 한 바퀴 뒤
    // 카메라는 레인 2에 있다 — 경로는 되감지 않으므로(advanceFlythrough) 불연속이 아니다.
    const last = flythrough.waypoints[flythrough.waypoints.length - 1]!
    console.log(`레인체인지 ${laneChanges.length}개 · 경로 끝 레인 ${last.lane}`)
    expect(last.lane).toBe((CAMERA_START_LANE + laneChanges.length) % LANE_COUNT)
  })

  it('TC-008-2: 두 칸 건너뛰는 레인을 탈 때만 카메라가 육교 높이만큼 뜬다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const shifts = laneShiftsCm()
    const laneChanges = laneChangesOf(layout.segments)
    expect(laneChanges.length).toBeGreaterThanOrEqual(1)

    // 같은 실데이터에서 출발 레인만 바꿔 두 경로를 모두 잰다 — WS67Y2는 레인체인지가 하나라
    // 가운데 레인 출발(기본)은 한 칸 이동(+12cm)이고 육교 레인은 `startLane`으로만 탈 수 있다
    for (let startLane = 0; startLane < LANE_COUNT; startLane += 1) {
      const flythrough = buildFlythroughPath({ segments: layout.segments, elevated, startLane })
      for (const segment of laneChanges) {
        const points = waypointsOf(flythrough, segment.order)
        const lane = points[0]!.lane
        expect(lane).toBe(startLane)
        const rises = points.map((waypoint) => waypoint.y - sampleOf(segment, waypoint).y)
        const peak = Math.max(...rises)
        console.log(`출발 레인 ${startLane} · 레인체인지 shift ${shifts[lane]}cm · 최대 상승 ${peak.toFixed(2)}cm`)
        if (Math.abs(shifts[lane]!) > LANE_PITCH_CM) {
          // 실측으로 확인할 값 — 중앙 표본 밀도에 좌우된다(마루는 u=0.5)
          expect(peak).toBeCloseTo(OVERPASS_HEIGHT_CM, 0)
        } else {
          expect(Math.max(...rises.map(Math.abs))).toBeLessThanOrEqual(0.01)
        }
      }
    }
  })

  it('TC-008-2: 레인체인지 이음새에서 카메라가 점프하지 않는다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })
    const byOrder = new Map(layout.segments.map((segment) => [segment.order, segment]))

    // 자리바꿈 끝의 가로 위치는 다음 피스에서 옮겨간 레인의 **중심**이다(위치 집합 보존).
    // 표본 밀도와 무관하게 재려고 다음 피스의 진입 프레임에서 그 자리를 직접 계산한다.
    let seams = 0
    for (const segment of laneChangesOf(layout.segments)) {
      const next = byOrder.get(segment.order + 1)
      if (next === undefined) continue
      const entry = next.points[0]
      if (entry === undefined) continue

      const points = waypointsOf(flythrough, segment.order)
      const nextLane = (points[0]!.lane + 1) % LANE_COUNT
      const nx = -Math.sin(next.entryTangentRad)
      const nz = Math.cos(next.entryTangentRad)
      const x = entry.x + nx * LANE_CENTERS_CM[nextLane]!
      const z = entry.z + nz * LANE_CENTERS_CM[nextLane]!

      const exit = points[points.length - 1]!
      seams += 1
      expect(Math.hypot(exit.x - x, exit.z - z)).toBeLessThan(1)
    }
    expect(seams).toBeGreaterThan(0)

    // 어느 한 스텝도 가장 긴 세그먼트의 진입→진출 거리를 넘지 않는다(TC-007-1과 같은 기준) —
    // 레인 오프셋이 붙어도 직선 피스는 평행 이동이라 스텝 길이가 늘지 않는다
    let maxGap = 0
    for (let index = 1; index < flythrough.waypoints.length; index += 1) {
      const previous = flythrough.waypoints[index - 1]!
      const current = flythrough.waypoints[index]!
      maxGap = Math.max(maxGap, current.distance - previous.distance)
    }
    expect(maxGap).toBeLessThanOrEqual(Math.max(...layout.segments.map(chordOf)) + 1e-6)
  })
})
