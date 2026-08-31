// FEAT-018 · D-049 — 레인보우 체인저(`Lan2`)의 중심선과 **레인별 명시 경로**.
//
// 값은 전부 `_workspace/02_design/piece-geometry.md` §레인보우 체인저의 도면 픽셀 실측이다 —
// 여기서 새 수치를 만들지 않는다. 로컬 좌표는 편집기 규약(원점 = 도면 중심, y 아래로 증가)이고
// **뒤집히지 않은 주행**(vertex1 팔로 진입, +x 방향)을 기준으로 적는다.
//
// 이 피스는 레인 2가 큰 U턴과 다른 중심의 원호를 돌기 때문에 "중심선 + 가로 오프셋"으로
// 만들 수 없다 — 그래서 레인마다 경로를 따로 둔다. 위상은 D-033의 한 칸 순환과 같다
// (진입 좌→우 A,B,C → 진출 좌→우 C,A,B).
import type { PiecePath } from './piece-path'
import { arc, composite, line, toAbsolutePath } from './local-path'
import type { LocalPath } from './local-path'
import type { OrientedPiece, Point } from './types'

/** D-034 — 레인 3개 · 12cm. widgets의 `lane-model`과 같은 값이나 entities는 그것을 모른다 */
const ROUTE_LANE_COUNT = 3
const LANE_PITCH = 12

/** 두 팔의 중심선 y와 진입 x(끝점 카탈로그 `[-90, ∓54]`) */
const ENTRY_X = -90
const ARM_Y = 54

/** 레인 0·1이 12cm 안쪽으로 **직선** 이동하는 x 구간(도면 실측) */
const SHIFT_FROM_X = -28
const SHIFT_TO_X = 8

/** 큰 U턴 — 중심 (15,0), 레인 0·1이 각각 반지름 54·42로 돈다(도면 절단선 실측) */
const OUTER_CENTER: Point = { x: 15, y: 0 }
const OUTER_LANE_RADII: readonly number[] = [54, 42]

/** 작은 U턴 — 레인 2 전용, 중심 (−51.5, 12)·반지름 54(진회색 밴드 실측) */
const INNER_CENTER: Point = { x: -51.5, y: 12 }
const INNER_RADIUS = 54

/** 반원: 중심 **위**(−90°)에서 오른쪽을 지나 아래(+90°)로 */
const HALF_TURN_FROM_DEG = -90
const HALF_TURN_TO_DEG = 90

/**
 * 레인 2는 **육교**다(D-035의 "두 칸 건너뛰는 레인" — 진입 자리 2에서 진출 자리 0으로).
 * 작은 U턴이 진출 팔의 레인 0·1(y=54·42)을 가로지르므로 같은 높이면 서로 통과해 버린다.
 * 도면의 진회색 그라데이션 밴드가 그 오버패스 음영이다. 높이는 D-035와 같은 8cm이고,
 * 원호 전체가 고원이며 양쪽 직선에서 30cm 램프(`sin²` 완화, 양 끝 기울기 0)로 오르내린다.
 */
const OVERPASS_HEIGHT = 8
const OVERPASS_RAMP_LENGTH = 30

/** 로컬 경로 + 호 길이 `s`에서의 육교 상승(cm). 없으면 0 */
interface LaneRouteDefinition {
  path: LocalPath
  riseAtLength?: (s: number) => number
}

/** 매끄러운 램프: u ∈ [0,1] → 0..1, 양 끝 기울기 0 */
function easeRamp(u: number): number {
  const clamped = Math.min(Math.max(u, 0), 1)
  return Math.sin((Math.PI / 2) * clamped) ** 2
}

/**
 * [rampStart, plateauStart]에서 오르고 [plateauEnd, plateauEnd + ramp]에서 내리는 고원 프로파일.
 * 램프가 경로 안에 들어오도록 호출자가 길이를 보장한다.
 */
function plateauRise(plateauStart: number, plateauEnd: number): (s: number) => number {
  const rampStart = plateauStart - OVERPASS_RAMP_LENGTH
  const rampEnd = plateauEnd + OVERPASS_RAMP_LENGTH
  return (s) => {
    if (s <= rampStart || s >= rampEnd) return 0
    if (s < plateauStart) return OVERPASS_HEIGHT * easeRamp((s - rampStart) / OVERPASS_RAMP_LENGTH)
    if (s <= plateauEnd) return OVERPASS_HEIGHT
    return OVERPASS_HEIGHT * easeRamp((rampEnd - s) / OVERPASS_RAMP_LENGTH)
  }
}

function lan2Centerline(): LocalPath {
  const radius = OUTER_LANE_RADII[0]!
  return composite([
    line({ x: ENTRY_X, y: -ARM_Y }, { x: OUTER_CENTER.x, y: -ARM_Y }),
    arc(OUTER_CENTER, radius, HALF_TURN_FROM_DEG, HALF_TURN_TO_DEG),
    line({ x: OUTER_CENTER.x, y: ARM_Y }, { x: ENTRY_X, y: ARM_Y }),
  ])
}

/** 레인 0·1 — 안쪽 이동 뒤 큰 U턴. 진입 y = −54 − 12 + 12·lane, 진출 y = 반지름 */
function lan2OuterLane(lane: 0 | 1): LocalPath {
  const radius = OUTER_LANE_RADII[lane]!
  const entryY = -ARM_Y - LANE_PITCH + LANE_PITCH * lane
  const shiftedY = entryY + LANE_PITCH
  return composite([
    line({ x: ENTRY_X, y: entryY }, { x: SHIFT_FROM_X, y: entryY }),
    line({ x: SHIFT_FROM_X, y: entryY }, { x: SHIFT_TO_X, y: shiftedY }),
    line({ x: SHIFT_TO_X, y: shiftedY }, { x: OUTER_CENTER.x, y: shiftedY }),
    arc(OUTER_CENTER, radius, HALF_TURN_FROM_DEG, HALF_TURN_TO_DEG),
    line({ x: OUTER_CENTER.x, y: radius }, { x: ENTRY_X, y: radius }),
  ])
}

/** 레인 2 — 곧장 작은 U턴(육교). 진입 y = −42, 진출 y = 66(가장 바깥 자리) */
function lan2InnerLane(): LaneRouteDefinition {
  const entryY = -ARM_Y + LANE_PITCH
  const exitY = INNER_CENTER.y + INNER_RADIUS
  const approach = line({ x: ENTRY_X, y: entryY }, { x: INNER_CENTER.x, y: entryY })
  const turn = arc(INNER_CENTER, INNER_RADIUS, HALF_TURN_FROM_DEG, HALF_TURN_TO_DEG)
  const departure = line({ x: INNER_CENTER.x, y: exitY }, { x: ENTRY_X, y: exitY })
  return {
    path: composite([approach, turn, departure]),
    // 고원 = 원호 전체. 램프 30cm는 직선 38.5cm 안에 들어온다(양 끝에서 0으로 돌아온다)
    riseAtLength: plateauRise(approach.length, approach.length + turn.length),
  }
}

interface RouteSet {
  centerline: LocalPath
  /** 뒤집히지 않은 주행 기준, 진입 레인 인덱스 순 */
  lanes: readonly LaneRouteDefinition[]
}

const ROUTE_SETS: Readonly<Record<string, RouteSet>> = {
  Lan2: {
    centerline: lan2Centerline(),
    lanes: [{ path: lan2OuterLane(0) }, { path: lan2OuterLane(1) }, lan2InnerLane()],
  },
}

/** 절대 좌표 레인 경로. `riseAt`은 육교 상승(cm) — 고도 프로파일과 독립인 레인 면의 추가 높이다 */
export interface LaneRoute extends PiecePath {
  riseAt(t: number): number
}

function routeSetOf(pieceClass: string): RouteSet | undefined {
  return Object.prototype.hasOwnProperty.call(ROUTE_SETS, pieceClass)
    ? ROUTE_SETS[pieceClass]
    : undefined
}

/** 명시 경로 모델이 있는 피스인가 — `buildPiecePath`가 선회각보다 먼저 본다 */
export function centerlineRouteOf(pieceClass: string): LocalPath | undefined {
  return routeSetOf(pieceClass)?.centerline
}

/**
 * 뒤집힌 주행에서 주행 레인 j가 타는 **로컬 경로 인덱스**. 진출 자리 (k+1) mod 3을 반대편에서
 * 진입 레인으로 읽으면 j = 2 − ((k+1) mod 3)이고, 이를 k로 풀면 (4 − j) mod 3이다 —
 * 그래서 뒤집어도 순환은 한 칸(j → (j+1) mod 3)으로 유지된다(D-033).
 */
function flippedRouteIndex(lane: number): number {
  return (4 - lane) % ROUTE_LANE_COUNT
}

/**
 * 주행 레인 인덱스 순의 절대 좌표 레인 경로. 명시 모델이 없는 피스면 `undefined` —
 * 그 피스는 종전대로 중심선 + 가로 오프셋(FEAT-008)이다.
 */
export function laneRoutesOf(oriented: OrientedPiece): LaneRoute[] | undefined {
  const set = routeSetOf(oriented.piece.pieceClass)
  if (set === undefined) return undefined
  return Array.from({ length: ROUTE_LANE_COUNT }, (_, lane) => {
    const index = oriented.flipped ? flippedRouteIndex(lane) : lane
    const definition = set.lanes[index]!
    const absolute = toAbsolutePath(definition.path, oriented.piece, oriented.flipped)
    const rise = definition.riseAtLength
    return {
      ...absolute,
      riseAt(t) {
        if (rise === undefined) return 0
        const local = oriented.flipped ? 1 - t : t
        return rise(local * definition.path.length)
      },
    }
  })
}
