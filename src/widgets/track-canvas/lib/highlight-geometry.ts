// FEAT-019 — 공유 커서가 가리키는 구간을 3D 씬에서 짚는 버퍼.
//
// **왜 별도 버퍼인가**: `buildTrackGeometries`는 색 단위로 면을 합친다 — 면 396개를 색
// 종류(≤8)만큼의 draw call로 줄이는 것이 그 합침의 목적이다(`track-geometry.ts` 머리말).
// 그래서 씬에는 "세그먼트 하나"라는 렌더 단위가 존재하지 않는다. 구간 하나만 다르게
// 보이게 하려면 합친 버퍼를 도로 쪼개거나(합침의 목적을 되돌린다) 그 구간분만 따로 세워
// 얹어야 한다. 후자를 고른다 — 커서가 바뀔 때 다시 만드는 것이 전체가 아니라 132분의
// 1이고, **원본 표면색이 손대지 않은 채 남는다**(design-system §1: 하이라이트는 덧칠이지
// 치환이 아니다. 치환하면 그 구간에서 편집기 원본색 대조가 사라진다).
//
// 면은 기존 `buildTrackGeometries`를 그대로 재사용한다. 같은 삼각형 배치 로직을 여기에
// 다시 쓰면 두 곳이 답을 달리할 수 있고, 그때 어긋나는 것은 "하이라이트가 트랙 위에
// 정확히 얹혔는가"다.
import { BufferAttribute, BufferGeometry } from 'three'

import type { BandPoint, LaneBand, SegmentBands } from './lane-bands'
import { buildTrackGeometries } from './track-geometry'

/** 면 오버레이를 노면 위로 띄우는 높이(cm). 0이면 z-fighting으로 하이라이트가 깜빡인다 */
export const HIGHLIGHT_SURFACE_LIFT_CM = 0.6

/** 테두리는 면보다 더 띄운다 — 같은 높이면 자기 오버레이 안에 파묻혀 형태 채널이 사라진다 */
export const HIGHLIGHT_OUTLINE_LIFT_CM = 1.4

/**
 * 테두리 한 톤의 폭(cm). 두 톤이 나란히 깔리므로 실제 테두리는 이 값의 두 배다(ASSUMPTION E).
 *
 * **왜 선이 아니라 폭을 가진 띠인가**: WebGL의 선 굵기는 대부분 플랫폼에서 1px로 고정되어
 * three의 `linewidth`가 무시된다. 132피스 전체 보기에서 한 구간의 윤곽선은 17px밖에 되지
 * 않아(2026-09-02 실측) 대비를 고쳐도 얇으면 여전히 안 보인다. 씬 단위 폭이라 확대하면
 * 함께 굵어지고 축소하면 함께 가늘어진다 — 트랙의 일부처럼 거동한다.
 */
export const HIGHLIGHT_BORDER_WIDTH_CM = 2

/** `buildTrackGeometries`가 색으로 묶을 때 쓰는 임의 키. 실제 색은 렌더가 정한다 */
const SINGLE_BUCKET = 'highlight'

/**
 * 빈 지오메트리도 `position`을 갖는다 — 속성이 아예 없는 BufferGeometry를 three의 mesh에
 * 넘기면 경계 계산·렌더 경로가 `undefined`를 만난다. 그릴 것이 없는 것과 형태가 깨진 것은
 * 다르다.
 */
function emptyGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3))
  return geometry
}

export interface HighlightGeometry {
  /** 레인 면을 덮는 반투명 오버레이 */
  surface: BufferGeometry
  /** 둘레 바깥쪽 띠 — 밝은 톤. 어두운 노면에서 이쪽이 읽힌다 */
  borderLight: BufferGeometry
  /** 그 안쪽에 나란히 붙는 띠 — 어두운 톤. 밝은 평지에서 이쪽이 읽힌다 */
  borderDark: BufferGeometry
}

/** 띠 하나를 이루는 두 가장자리 폴리라인 */
interface Strip {
  lo: BandPoint[]
  hi: BandPoint[]
}

function liftPoints(points: readonly BandPoint[], lift: number): BandPoint[] {
  return points.map((point) => ({ x: point.x, y: point.y + lift, z: point.z }))
}

function liftBand(band: SegmentBands, lift: number): SegmentBands {
  const lanes: LaneBand[] = band.lanes.map((lane) => ({
    lane: lane.lane,
    lo: liftPoints(lane.lo, lift),
    hi: liftPoints(lane.hi, lift),
  }))
  return { ...band, lanes }
}

/**
 * 하이라이트할 구간이 렌더 가능한가. 미지원 피스는 레인이 없고(`buildLaneBands`가 폭을
 * 지어내지 않는다) 표본이 하나뿐인 레인은 면이 되지 않는다.
 */
export function isHighlightable(band: SegmentBands | null | undefined): band is SegmentBands {
  if (band === null || band === undefined) return false
  return band.lanes.some((lane) => Math.min(lane.lo.length, lane.hi.length) >= 2)
}

/**
 * 구간의 **바깥 둘레**. `boundaryLinesOf`와 다른 것을 묻는다 — 그쪽은 레인 사이 경계까지
 * 포함하는 형태 축(색 단독 구분 금지)이고, 여기는 "이 구간이 어디서 시작해 어디서
 * 끝나는가"의 테두리다. 레인 사이 선까지 그리면 하이라이트가 트랙 무늬와 섞인다.
 *
 * 맞붙은 레인은 바깥 둘 (첫 레인의 `lo`와 마지막 레인의 `hi`)이 곧 둘레다. 명시 경로로
 * 따로 놓인 레인(FEAT-018)은 서로 맞붙지 않으므로 레인마다 자기 둘레를 갖는다.
 */
export function outerRingsOf(band: SegmentBands): { lo: BandPoint[]; hi: BandPoint[] }[] {
  const usable = band.lanes.filter((lane) => Math.min(lane.lo.length, lane.hi.length) >= 2)
  if (usable.length === 0) return []
  if (band.separated) return usable.map((lane) => ({ lo: [...lane.lo], hi: [...lane.hi] }))

  const first = usable[0]!
  const last = usable[usable.length - 1]!
  return [{ lo: [...first.lo], hi: [...last.hi] }]
}

/**
 * `from`에서 `to` 쪽으로 `distance`만큼 간 점. **반대쪽 가장자리를 넘지 않는다** — 좁은
 * 구간(명시 경로의 레인 하나는 12cm)에서 띠가 반대편으로 뒤집히면 면이 접힌다.
 */
function towards(from: BandPoint, to: BandPoint, distance: number): BandPoint {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const length = Math.hypot(dx, dy, dz)
  if (length === 0) return { ...from }
  const k = Math.min(distance / length, 1)
  return { x: from.x + dx * k, y: from.y + dy * k, z: from.z + dz * k }
}

/** 가장자리 폴리라인을 마주 보는 쪽으로 `distance`만큼 안쪽으로 민 폴리라인 */
function insetEdge(edge: readonly BandPoint[], facing: readonly BandPoint[], distance: number) {
  return edge.map((point, at) => towards(point, facing[at] ?? point, distance))
}

/**
 * 마구리(진입·진출)에서 진행 방향으로 `distance`만큼 들어간 단면. 표본 간격보다 깊이 들어가야
 * 하면 첫 스팬 전체로 잘린다 — 짧은 피스에서 다음 단면을 넘어가지 않게 한다.
 */
function crossAtDepth(ring: Strip, endIndex: number, nextIndex: number, distance: number) {
  return {
    lo: towards(ring.lo[endIndex]!, ring.lo[nextIndex]!, distance),
    hi: towards(ring.hi[endIndex]!, ring.hi[nextIndex]!, distance),
  }
}

/**
 * 둘레를 따라가는 띠 한 겹. `inner`~`outer` 거리 구간을 채운다(둘 다 구간 **안쪽** 방향).
 * 양 옆 두 줄에 진입·진출 마구리 두 장을 더해 **닫힌 고리**를 만든다 — 마구리가 없으면
 * 구간의 시작과 끝이 열려 어디까지가 이 구간인지가 끊긴다.
 */
function borderStrips(ring: Strip, near: number, far: number): Strip[] {
  const count = Math.min(ring.lo.length, ring.hi.length)
  if (count < 2) return []
  const last = count - 1

  const strips: Strip[] = [
    { lo: insetEdge(ring.lo, ring.hi, near), hi: insetEdge(ring.lo, ring.hi, far) },
    { lo: insetEdge(ring.hi, ring.lo, near), hi: insetEdge(ring.hi, ring.lo, far) },
  ]

  for (const [endIndex, nextIndex] of [
    [0, 1],
    [last, last - 1],
  ] as const) {
    const nearCross = crossAtDepth(ring, endIndex, nextIndex, near)
    const farCross = crossAtDepth(ring, endIndex, nextIndex, far)
    strips.push({ lo: [nearCross.lo, nearCross.hi], hi: [farCross.lo, farCross.hi] })
  }

  return strips
}

/** 띠 여러 장을 버퍼 하나로. 삼각형 배치는 `buildTrackGeometries`가 정본이다 */
function stripsToGeometry(strips: readonly Strip[]): BufferGeometry {
  if (strips.length === 0) return emptyGeometry()
  const lanes: LaneBand[] = strips.map((strip, lane) => ({ lane, lo: strip.lo, hi: strip.hi }))
  const [bucket] = buildTrackGeometries(
    [
      {
        order: 0,
        pieceId: '',
        pieceClass: '',
        isSupported: true,
        lanes,
        separated: false,
      },
    ],
    () => SINGLE_BUCKET,
  )
  return bucket?.geometry ?? new BufferGeometry()
}

/**
 * 둘레의 두 톤 띠. 바깥이 밝은 톤, 그 안쪽에 어두운 톤이 나란히 붙는다 — 어느 노면 위에서든
 * 둘 중 하나가 3:1을 넘는다(TC-019-8, `highlight-visibility.ts`의 색 상수가 정본).
 * 둘 다 구간 **안쪽**으로만 깔린다: 바깥으로 내밀면 이웃 구간을 덮는다.
 */
export function buildHighlightBorders(
  band: SegmentBands,
  width: number = HIGHLIGHT_BORDER_WIDTH_CM,
): { light: BufferGeometry; dark: BufferGeometry } {
  const rings = outerRingsOf(liftBand(band, HIGHLIGHT_OUTLINE_LIFT_CM))
  const light: Strip[] = []
  const dark: Strip[] = []
  for (const ring of rings) {
    light.push(...borderStrips(ring, 0, width))
    dark.push(...borderStrips(ring, width, width * 2))
  }
  return { light: stripsToGeometry(light), dark: stripsToGeometry(dark) }
}

/** 레인 면을 덮는 오버레이. 삼각형 배치는 `buildTrackGeometries`가 정본이다 */
export function buildHighlightSurface(band: SegmentBands): BufferGeometry {
  const [bucket] = buildTrackGeometries(
    [liftBand(band, HIGHLIGHT_SURFACE_LIFT_CM)],
    () => SINGLE_BUCKET,
  )
  return bucket?.geometry ?? emptyGeometry()
}

export function buildHighlightGeometry(band: SegmentBands): HighlightGeometry {
  const borders = buildHighlightBorders(band)
  return {
    surface: buildHighlightSurface(band),
    borderLight: borders.light,
    borderDark: borders.dark,
  }
}
