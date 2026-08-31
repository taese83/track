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
  advanceFlythrough,
  buildFlythroughPath,
  distanceOfOrder,
  easeToward,
  initialFlythroughState,
  orderAtDistance,
  poseAt,
  scrubTo,
  setPlaying,
} from './flythrough-camera'
import { buildSceneLayout } from './scene-layout'
import type { SceneSegment } from './scene-layout'

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

describe('공유 커서 ↔ 경로 거리 왕복', () => {
  it('구간 인덱스로 옮긴 거리에서 되읽으면 같은 구간이다', async () => {
    const { layout, elevated } = await sceneOf('WS67Y2.js.txt')
    const flythrough = buildFlythroughPath({ segments: layout.segments, elevated })

    for (const order of [0, 1, 17, 64, layout.segments.length - 1]) {
      expect(orderAtDistance(flythrough, distanceOfOrder(flythrough, order))).toBe(order)
    }
  })
})
