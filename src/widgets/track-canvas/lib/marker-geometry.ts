// FEAT-015 형태 채널 — 유형 표식을 트랙 위에 얹는다.
//
// 표식은 **진행 방향에 정렬한다.** 카메라가 궤도로 도는 화면에서는 "화면 위"가 고정이
// 아니라, 화면 좌표에 맞춘 표식은 회전하면 뜻이 뒤집힌다. 진행축에 맞추면 어느 각도에서
// 보든 "앞으로 오르는 화살표"가 같은 뜻이다.
//
// 모양은 단위 좌표(−1~1)의 삼각형 목록이다 — three를 모르는 순수 값이라 "두 유형의 표식이
// 실제로 다른가"를 브라우저 없이 잴 수 있다(TC-015-1).
import type { MarkerShape } from './segment-encoding'

/**
 * 표식 반지름(cm). 레인 하나(12cm)를 채우는 크기다 — 4.5cm로 뒀을 때 실측에서 트랙 폭의
 * 4분의 1밖에 안 돼 형태 채널이 화면에서 읽히지 않았다(2026-08-31 캡처 확인).
 * 전폭 36cm는 넘지 않으므로 트랙을 덮지는 않는다.
 */
export const MARKER_RADIUS_CM = 6

/** 표면 위로 띄우는 높이(cm). 0이면 z-fighting으로 표식이 깜빡인다 */
export const MARKER_LIFT_CM = 2.5

/** 단위 좌표 정점 [앞뒤, 좌우]. 앞(+)이 진행 방향이다 */
type UnitPoint = readonly [number, number]

const ARROW_UP: UnitPoint[] = [
  [1, 0],
  [-0.7, 0.85],
  [-0.7, -0.85],
]

/** 앞뒤를 뒤집은 같은 삼각형 — 방향이 형태에 실린다 */
const ARROW_DOWN: UnitPoint[] = ARROW_UP.map(([forward, side]) => [-forward, side])

const DIAMOND: UnitPoint[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** 갈래 — 레인체인지가 레인을 건너가는 모양 */
const FORK: UnitPoint[] = [
  [-1, -0.25],
  [-1, 0.25],
  [0, 0.25],
  [1, 1],
  [1, 0.5],
  [0.25, -0.25],
]

/** 물결 — 웨이브의 횡돌출을 납작한 지그재그로 말한다 */
const WAVE: UnitPoint[] = [
  [-1, -0.3],
  [-0.35, 0.7],
  [0.35, -0.7],
  [1, 0.3],
  [0.35, -0.2],
  [-0.35, 0.2],
]

/** 깃발 — 출발선 표식 */
const FLAG: UnitPoint[] = [
  [-0.9, -0.15],
  [-0.9, 0.15],
  [0.2, 0.15],
  [0.2, 1],
  [0.9, 0.4],
  [0.2, -0.15],
]

const SHAPE_OUTLINE: Record<MarkerShape, UnitPoint[]> = {
  'arrow-up': ARROW_UP,
  'arrow-down': ARROW_DOWN,
  diamond: DIAMOND,
  wave: WAVE,
  fork: FORK,
  flag: FLAG,
  none: [],
}

/** 표식의 외곽선(닫힌 다각형). 정점 순서가 곧 모양이다 */
export function markerOutline(shape: MarkerShape): UnitPoint[] {
  return SHAPE_OUTLINE[shape]
}

/**
 * 삼각형 부채꼴로 채운다. 볼록하지 않은 모양(갈래·물결)도 정점 순서를 따라 채우면
 * 실루엣이 유지된다 — 표식은 작아서 내부 겹침이 화면에서 드러나지 않는다.
 */
export function markerTriangles(shape: MarkerShape): [UnitPoint, UnitPoint, UnitPoint][] {
  const outline = markerOutline(shape)
  const triangles: [UnitPoint, UnitPoint, UnitPoint][] = []
  for (let index = 1; index + 1 < outline.length; index += 1) {
    triangles.push([outline[0]!, outline[index]!, outline[index + 1]!])
  }
  return triangles
}

export interface MarkerPlacement {
  /** 표식 중심의 세계 좌표 */
  x: number
  y: number
  z: number
  /** 진행 방향(라디안, atan2(dz, dx)) */
  headingRad: number
  shape: MarkerShape
}

/** 단위 좌표를 진행축에 맞춰 세계 좌표로 옮긴다 */
export function placeMarkerPoint(
  placement: MarkerPlacement,
  point: UnitPoint,
  radiusCm = MARKER_RADIUS_CM,
): { x: number; y: number; z: number } {
  const [forward, side] = point
  const cos = Math.cos(placement.headingRad)
  const sin = Math.sin(placement.headingRad)
  // 진행축 (cos, sin), 좌우축은 그 법선 (−sin, cos)
  return {
    x: placement.x + (forward * cos - side * sin) * radiusCm,
    y: placement.y + MARKER_LIFT_CM,
    z: placement.z + (forward * sin + side * cos) * radiusCm,
  }
}
