// FEAT-007 — 트랙 추종 시점의 상태 수학. 렌더러와 분리한 순수 코어다.
//
// 오빗 카메라(`orbit-camera.ts`)가 **트랙을 바깥에서 도는** 궤도를 다루는 것과 달리
// 여기서는 **트랙 위를 달리는** 궤도를 다룬다. 둘은 표현이 다르다 — 오빗은 타깃 둘레의
// 구면 좌표이고, 추종은 경로 위의 **누적 거리 하나**다. 거리를 축으로 두면 스크럽·자동
// 재생·일시정지가 전부 같은 값 하나를 옮기는 일이 되어 세 조작이 서로 어긋나지 않는다.
//
// 경로는 좌표를 새로 만들지 않는다. `buildSceneLayout`이 이미 배치한 표본을 그대로 잇고,
// 피치만 고도 프로파일에서 가져온다 — 여기서 높이를 다시 계산하면 화면의 노면과 카메라가
// 서로 다른 트랙 위에 있게 된다.
import type { ElevatedSegment } from '@/entities/track/lib/elevation'

import type { SceneSegment } from './scene-layout'

export interface FlythroughWaypoint {
  /** 이 지점이 속한 세그먼트의 진행 순서(`SceneSegment.order`) */
  order: number
  /** 피스 안 진행 비율 */
  t: number
  x: number
  /** 고도(위) */
  y: number
  z: number
  /** 수평 진행 방향(라디안, `atan2(dz, dx)`) */
  headingRad: number
  /**
   * 진행 방향 피치(라디안). `atan(slopeAt(t))` — 고도 프로파일의 기울기에서 **곧장** 온다.
   * 표본 사이 높이차로 재지 않는 것은 그 값이 표본 밀도에 좌우되기 때문이다(FEAT-011의
   * 완화가 곡선 표본을 24 → 8로 줄이면 같은 지점의 피치가 달라진다). 프로파일은 밀도와
   * 무관한 해석 도함수다.
   */
  pitchRad: number
  /** 경로 시작점부터의 누적 거리 */
  distance: number
}

export interface FlythroughPath {
  waypoints: FlythroughWaypoint[]
  /** 전체 경로 길이 */
  length: number
  /**
   * 복원이 끊겨 경로가 트랙 전체를 덮지 못했는가(FEAT-004 부분 실패). 조용히 자르지
   * 않는 것이 제품 계약이므로 이 사실을 밖으로 낸다.
   */
  truncated: boolean
}

export interface FlythroughPathInput {
  segments: readonly SceneSegment[]
  elevated: readonly ElevatedSegment[]
  /**
   * 도달 가능한 세그먼트 수. 부분 실패면 복원된 구간까지만이다(공유 커서의
   * `reachableCount`와 같은 축). 생략하면 전부 도달 가능으로 본다.
   */
  reachableCount?: number
}

/**
 * 같은 자리로 볼 거리(cm). 세그먼트 이음새에서 앞 세그먼트의 마지막 표본과 뒤 세그먼트의
 * 첫 표본은 **같은 점**이라 그대로 이으면 길이 0인 구간이 생기고 진행 방향이 정의되지
 * 않는다. 이음새 실측 최대 벌어짐이 0.17px이므로 그보다 크게 둔다.
 */
const SEAM_EPSILON = 0.5

function headingOf(from: FlythroughWaypoint, to: FlythroughWaypoint): number {
  return Math.atan2(to.z - from.z, to.x - from.x)
}

/**
 * 복원된 순서를 따라 카메라가 지날 경로를 만든다. 표본 순서가 곧 주행 순서이며
 * `points[0]`이 진입점이라는 `SceneSegment` 계약을 그대로 따른다 — 여기서 순서를 다시
 * 정하지 않는다.
 */
export function buildFlythroughPath(input: FlythroughPathInput): FlythroughPath {
  const elevatedByOrder = new Map(input.elevated.map((segment) => [segment.order, segment]))
  const ordered = [...input.segments].sort((a, b) => a.order - b.order)
  const reachable = input.reachableCount ?? ordered.length
  const usable = ordered.slice(0, Math.max(0, reachable))

  const waypoints: FlythroughWaypoint[] = []
  let distance = 0

  for (const segment of usable) {
    const profile = elevatedByOrder.get(segment.order)?.elevationProfile
    for (const point of segment.points) {
      const previous = waypoints[waypoints.length - 1]
      // 이음새의 중복 점은 버린다 — 남기면 진행 방향이 없는 구간이 생긴다.
      if (
        previous !== undefined &&
        Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) < SEAM_EPSILON
      ) {
        continue
      }
      if (previous !== undefined) {
        distance += Math.hypot(
          point.x - previous.x,
          point.y - previous.y,
          point.z - previous.z,
        )
      }
      waypoints.push({
        order: segment.order,
        t: point.t,
        x: point.x,
        y: point.y,
        z: point.z,
        headingRad: 0,
        // 프로파일이 없는 세그먼트(미지원 등)는 기울기를 **모른다** — 0으로 두는 것은
        // 평지라는 주장이 아니라 "말할 근거가 없다"는 뜻이며, 화면에서는 수평이 된다.
        pitchRad: Math.atan(profile?.slopeAt(point.t) ?? 0),
        distance,
      })
    }
  }

  // 진행 방향은 **다음 지점**을 향한다. 마지막 지점만 앞 구간의 방향을 물려받는다 —
  // 거기서 방향을 0으로 두면 트랙 끝에서 카메라가 갑자기 +x를 본다.
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    waypoints[index]!.headingRad = headingOf(waypoints[index]!, waypoints[index + 1]!)
  }
  const last = waypoints[waypoints.length - 1]
  const beforeLast = waypoints[waypoints.length - 2]
  if (last !== undefined && beforeLast !== undefined) last.headingRad = beforeLast.headingRad

  return {
    waypoints,
    length: distance,
    truncated: usable.length < ordered.length,
  }
}

export interface FlythroughPose {
  /** 카메라 위치 */
  eye: { x: number; y: number; z: number }
  /** 시선이 향하는 점 */
  target: { x: number; y: number; z: number }
  headingRad: number
  pitchRad: number
}

/**
 * 노면에서 카메라를 띄우는 높이(cm). 노면에 정확히 붙이면 시선이 트랙 면에 잘려 앞이
 * 보이지 않는다. 미니카 시점이라기보다 "트랙을 따라가는 관찰자"의 눈높이다.
 */
const EYE_HEIGHT = 12

/** 시선이 앞을 보는 거리(cm). 짧으면 코너에서 벽만 보이고 길면 회전이 굼떠 보인다 */
const LOOK_AHEAD = 60

/** 두 각도를 최단 호로 보간한다 — ±180° 경계에서 반대로 돌지 않게 한다 */
function lerpAngle(a: number, b: number, ratio: number): number {
  let delta = b - a
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return a + delta * ratio
}

function lerp(a: number, b: number, ratio: number): number {
  return a + (b - a) * ratio
}

/**
 * 경로 위 누적 거리에서 카메라 자세를 얻는다. 표본 사이는 보간하므로 표본 밀도가
 * 카메라의 부드러움을 좌우하지 않는다.
 * 경로가 비면 `null` — 자세를 지어내지 않는다.
 */
export function poseAt(path: FlythroughPath, distance: number): FlythroughPose | null {
  const { waypoints } = path
  if (waypoints.length === 0) return null

  const clamped = Math.min(Math.max(distance, 0), path.length)

  // 이분 탐색 — 대형 트랙(300피스 초과)에서 매 프레임 선형 탐색하면 그 자체가 부하다.
  let lo = 0
  let hi = waypoints.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (waypoints[mid]!.distance <= clamped) lo = mid
    else hi = mid
  }

  const from = waypoints[lo]!
  const to = waypoints[hi] ?? from
  const span = to.distance - from.distance
  const ratio = span > 0 ? (clamped - from.distance) / span : 0

  const headingRad = lerpAngle(from.headingRad, to.headingRad, ratio)
  const pitchRad = lerpAngle(from.pitchRad, to.pitchRad, ratio)
  const eye = {
    x: lerp(from.x, to.x, ratio),
    y: lerp(from.y, to.y, ratio) + EYE_HEIGHT,
    z: lerp(from.z, to.z, ratio),
  }

  return {
    eye,
    target: {
      x: eye.x + LOOK_AHEAD * Math.cos(pitchRad) * Math.cos(headingRad),
      y: eye.y + LOOK_AHEAD * Math.sin(pitchRad),
      z: eye.z + LOOK_AHEAD * Math.cos(pitchRad) * Math.sin(headingRad),
    },
    headingRad,
    pitchRad,
  }
}

/** 세그먼트 진입점의 누적 거리. 공유 커서(구간 인덱스)를 경로 축으로 옮긴다 */
export function distanceOfOrder(path: FlythroughPath, order: number): number {
  const found = path.waypoints.find((waypoint) => waypoint.order >= order)
  return found?.distance ?? path.length
}

/** 누적 거리에서 세그먼트 인덱스로 되돌린다 — 자동 재생이 공유 커서를 끌고 간다 */
export function orderAtDistance(path: FlythroughPath, distance: number): number {
  const pose = path.waypoints
  if (pose.length === 0) return 0
  const clamped = Math.min(Math.max(distance, 0), path.length)
  let current = pose[0]!.order
  for (const waypoint of pose) {
    if (waypoint.distance > clamped) break
    current = waypoint.order
  }
  return current
}

export interface FlythroughState {
  /** 화면에 실제로 반영되는 위치 */
  distance: number
  /** 이징이 향하는 목표. 스크럽·재생이 이 값을 옮긴다 */
  goal: number
  playing: boolean
  /** 자동 재생 속도(cm/초) */
  speed: number
  /**
   * 스크럽 목표로 **이동하는 중**인가. 도착하면 스스로 내려간다.
   *
   * 이 플래그가 필요한 이유: 카메라는 재생 중 공유 커서를 밀지만, 스크럽으로 이동하는
   * 동안에는 밀면 안 된다. 사용자가 79번 구간을 찍었는데 카메라가 따라가며 1·2·3…을
   * 커서에 되쓰면 목록·스트립이 **뒤로 끌려갔다가** 다시 올라온다 — 사용자의 의도를
   * 카메라의 현재 위치가 덮어쓰는 것이다(2026-08-31 브라우저 계측: 클릭 직후 커서가
   * 79에서 3으로 되밀렸다).
   */
  seeking: boolean
}

/** 기본 재생 속도(cm/초). 참조 트랙(약 1,900cm)을 한 바퀴 도는 데 대략 8초다 */
export const DEFAULT_SPEED = 240

export function initialFlythroughState(speed: number = DEFAULT_SPEED): FlythroughState {
  return { distance: 0, goal: 0, playing: false, speed, seeking: false }
}

/**
 * 이징의 시간 상수(ms). 목표까지 남은 거리의 일정 **비율**을 매 프레임 좁히므로 프레임
 * 간격이 흔들려도 궤적이 같다 — 프레임당 고정량으로 좁히면 저프레임에서 이징이 느려진다.
 */
const EASE_TIME_CONSTANT_MS = 220

/** 이보다 가까우면 목표에 붙인다(cm). 없으면 지수 접근이 영원히 끝나지 않는다 */
const EASE_SNAP_CM = 0.5

/**
 * 목표를 향해 한 프레임만큼 다가간다. **즉시 컷이 아니다**(TC-007-2) — 한 프레임 뒤의
 * 값은 늘 현재와 목표 **사이**에 있으며, 목표에 충분히 가까울 때만 붙는다.
 */
export function easeToward(current: number, goal: number, deltaMs: number): number {
  if (deltaMs <= 0) return current
  if (Math.abs(goal - current) <= EASE_SNAP_CM) return goal
  return current + (goal - current) * (1 - Math.exp(-deltaMs / EASE_TIME_CONSTANT_MS))
}

/**
 * 한 프레임 진행한다. 재생 중이면 목표를 속도만큼 앞으로 밀고, 어느 경우든 현재 위치는
 * 목표를 향해 이징한다. 경로 끝에서 멈춘다 — 되감지 않는 것은 트랙이 폐곡선이어도
 * "끝까지 갔다"는 사실이 화면에서 사라지면 안 되기 때문이다.
 */
export function advanceFlythrough(
  state: FlythroughState,
  deltaMs: number,
  path: FlythroughPath,
): FlythroughState {
  const goal = state.playing
    ? Math.min(state.goal + (state.speed * deltaMs) / 1000, path.length)
    : state.goal
  const distance = easeToward(state.distance, goal, deltaMs)
  // 목표에 닿으면 seek이 끝난다. 재생 중에는 목표가 매 프레임 앞서므로 정확히 같아지지
  // 않는데, 그 상태는 seek이 아니라 **추종**이다 — 재생이 켜지는 순간 내려 둔다.
  return { ...state, goal, distance, seeking: state.seeking && distance !== goal }
}

/**
 * 재생·일시정지를 전환한다. **멈출 때 목표를 현재 위치로 끌어당긴다**(TC-007-3) —
 * 그러지 않으면 이징이 남은 거리를 계속 좁혀 "즉시 멈추고 현재 위치를 유지한다"가
 * 성립하지 않는다. 누르고도 카메라가 조금 더 흘러가는 것은 멈춘 것이 아니다.
 */
export function setPlaying(state: FlythroughState, playing: boolean): FlythroughState {
  // 재생을 켜면 seek이 아니다 — 이후의 진행은 사용자가 지정한 한 지점으로의 이동이 아니라
  // 트랙을 따라가는 추종이고, 그때는 카메라가 공유 커서를 끌고 가는 것이 맞다.
  if (playing) return { ...state, playing: true, seeking: false }
  return { ...state, playing: false, goal: state.distance, seeking: false }
}

/**
 * 스크럽 — 목표만 옮긴다. 현재 위치는 이징이 따라간다(즉시 컷 금지).
 * 도착할 때까지 `seeking`이라 카메라가 공유 커서를 되쓰지 않는다.
 */
export function scrubTo(state: FlythroughState, distance: number): FlythroughState {
  if (distance === state.distance) return { ...state, goal: distance, seeking: false }
  return { ...state, goal: distance, seeking: true }
}

/**
 * 즉시 컷 — `prefers-reduced-motion`용이다(component-spec §TrackCanvas "카메라 전환 즉시
 * 컷"). 이징 자체가 모션이므로 줄이는 게 아니라 **건너뛴다** — 목표와 위치를 함께 옮기면
 * 다음 프레임의 이징이 좁힐 거리가 없다. seek 구간이 없으므로 커서 되쓰기 문제도 없다.
 */
export function jumpTo(state: FlythroughState, distance: number): FlythroughState {
  return { ...state, distance, goal: distance, seeking: false }
}
