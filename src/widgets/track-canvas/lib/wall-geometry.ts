// FEAT-020 — 레인 경계의 트랙 벽.
//
// 실물 미니4WD 트랙은 레인마다 벽으로 나뉜 채널이다. 벽이 없으면 3D 형상이 "레인이 그려진
// 판"으로 보이고, 사용자 1순위 성공 조건인 "도면과 3D 나란히 대조"에서 3D 쪽이 실물과 다른
// 물건이 된다. 수치 정본은 `_workspace/02_design/piece-geometry.md` §레인 경계에는 5cm 벽이
// 선다이며 여기에 옮겨 적지 않는다 — 이 파일은 그 규칙을 버퍼로 옮기기만 한다.
//
// **줄 수 판정을 새로 만들지 않는다.** 맞붙은 레인 4줄 / 명시 경로 레인 6줄은 `boundaryLinesOf`가
// 이미 가르는 것과 **같은 질문**이다. 두 곳에 적으면 갈라진다 — 여기서는 그 규칙을 벽이 필요로
// 하는 형태(밑동 + 그 밑동이 속한 레인의 반대편 가장자리)로만 다시 낸다. 반대편이 필요한 이유는
// 법선 계산에 그 자리의 **가로 방향**이 있어야 하기 때문이다.
import type { BandPoint, LaneBand, SegmentBands } from './lane-bands'
import { buildTrackGeometries } from './track-geometry'
import type { ColoredGeometry } from './track-geometry'

/**
 * 벽 높이(cm). **`confirmed`이지 `measured`가 아니다** — 편집기 도면은 2D 평면도라 벽 높이를
 * 담지 않으므로 픽셀 실측으로 확인할 수 없다(레인 폭 12cm와 등급이 다르다). 사용자 지정값이다.
 */
export const WALL_HEIGHT_CM = 5

/** 벽 하나의 밑동과, 법선을 얻기 위한 그 레인의 반대편 가장자리 */
interface WallLine {
  /** 이 벽을 낸 레인. 자기 레인 면에 눌리지 않게 하려고 들고 다닌다 */
  lane: number
  base: readonly BandPoint[]
  /** 밑동에서 트랙 **안쪽**을 향하는 짝. `base`와 같은 길이다 */
  facing: readonly BandPoint[]
}

/**
 * 가로 겹침 판정의 여유(레인 폭 비율). 맞붙은 레인의 **공유 경계**는 t가 정확히 0 또는 1이라
 * 이 여유로 걸러진다 — 걸러 내지 않으면 정상적으로 맞붙은 벽까지 "천장에 눌렸다"고 본다.
 */
const OVERLAP_EPSILON = 0.02

interface Vector {
  x: number
  y: number
  z: number
}

function subtract(a: BandPoint, b: BandPoint): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function normalize(v: Vector): Vector | null {
  const length = Math.hypot(v.x, v.y, v.z)
  if (!(length > 1e-9)) return null
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

function cross(a: Vector, b: Vector): Vector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * 벽이 서는 방향. **세계 좌표 연직이 아니라 그 자리의 노면 법선**이다(PC-017) — 뱅크·판(20°)에서
 * 벽이 노면과 직각을 유지하며 함께 기운다. 연직으로 두면 기운 노면과 벽 사이에 틈이 생기거나
 * 벽이 노면을 파고든다.
 *
 * 가로 방향(밑동 → 반대편 가장자리)과 진행 방향의 외적이다. 진행 방향은 중앙 차분으로 잡되
 * 양 끝은 한쪽만 쓴다. 둘이 평행하거나 표본이 겹쳐 법선을 못 구하면 **연직으로 물러선다** —
 * 벽이 사라지는 것보다 낫고, 그런 표본은 형상이 이미 퇴화한 자리다.
 */
export function wallNormalAt(line: WallLine, at: number): Vector {
  const { base, facing } = line
  const here = base[at]
  const opposite = facing[at]
  if (here === undefined || opposite === undefined) return { x: 0, y: 1, z: 0 }

  const previous = base[at - 1] ?? here
  const next = base[at + 1] ?? here
  const forward = normalize(subtract(next, previous))
  const lateral = normalize(subtract(opposite, here))
  if (forward === null || lateral === null) return { x: 0, y: 1, z: 0 }

  const normal = normalize(cross(forward, lateral))
  if (normal === null) return { x: 0, y: 1, z: 0 }
  // 외적의 부호는 두 벡터의 순서에 달렸다. 위를 향하게 뒤집는다 — 노면이 뒤집히는 경우는 없다.
  return normal.y < 0 ? { x: -normal.x, y: -normal.y, z: -normal.z } : normal
}

/**
 * 벽이 설 자리. `boundaryLinesOf`와 **같은 규칙**이다: 맞붙은 레인은 바깥 둘과 레인 사이 둘로
 * 4줄(이웃이 사이 벽을 공유한다), 명시 경로로 따로 놓인 레인(FEAT-018 `Lan2`)은 서로 맞붙지
 * 않으므로 레인마다 좌·우 6줄이다.
 *
 * 미지원 피스는 레인이 없으므로(`buildLaneBands`가 폭을 지어내지 않는다) 빈 목록이다 —
 * 벽이 "여기 트랙이 있다"를 없는 곳에 주장하지 않는다.
 */
export function wallLinesOf(band: SegmentBands): WallLine[] {
  const usable = band.lanes.filter((lane) => Math.min(lane.lo.length, lane.hi.length) >= 2)
  if (usable.length === 0) return []

  if (band.separated) {
    return usable.flatMap((lane) => [
      { lane: lane.lane, base: lane.lo, facing: lane.hi },
      { lane: lane.lane, base: lane.hi, facing: lane.lo },
    ])
  }

  const first = usable[0]!
  return [
    { lane: first.lane, base: first.lo, facing: first.hi },
    ...usable.map((lane) => ({ lane: lane.lane, base: lane.hi, facing: lane.lo })),
  ]
}

/**
 * 이 밑동 **바로 위**를 지나는 다른 레인 면의 높이. 없으면 `null`이다.
 *
 * 레인체인지에서 두 칸 건너뛰는 레인은 육교로 떠올라 다른 레인 위를 가로지른다(D-035).
 * 그 아래에 있는 벽을 5cm 그대로 세우면 **육교 노면을 뚫고 올라온다** — 실측(2026-09-03):
 * `sin²` 오르내림 구간에서 최대 4.94cm가 도로 위로 솟고, 가장 넓을 때 벽이 육교 면 6cm
 * 안쪽에 서서 3cm 튀어나온다. 자리바꿈의 가운데 42%(육교 바닥이 5cm를 넘는 구간)에서만
 * 저절로 해소된다.
 *
 * 레인체인지 여부를 묻지 않는다 — "위에 다른 레인 면이 있으면 그 아래까지만"이라는 규칙
 * 하나로 족하고, 겹치지 않는 피스에서는 아무 일도 일어나지 않는다.
 */
function ceilingAbove(
  band: SegmentBands,
  ownLane: number,
  foot: BandPoint,
  at: number,
): number | null {
  let lowest: number | null = null
  for (const lane of band.lanes) {
    if (lane.lane === ownLane) continue
    const lo = lane.lo[at]
    const hi = lane.hi[at]
    if (lo === undefined || hi === undefined) continue

    // 가로 방향으로 그 레인 면 안에 있는가. 높이는 빼고 수평면에서만 본다
    const dx = hi.x - lo.x
    const dz = hi.z - lo.z
    const span = dx * dx + dz * dz
    if (!(span > 1e-9)) continue
    const t = ((foot.x - lo.x) * dx + (foot.z - lo.z) * dz) / span
    if (t <= OVERLAP_EPSILON || t >= 1 - OVERLAP_EPSILON) continue

    const surface = lo.y + (hi.y - lo.y) * t
    if (surface <= foot.y) continue // 위가 아니라 같은 높이거나 아래다
    if (lowest === null || surface < lowest) lowest = surface
  }
  return lowest
}

/** 벽 하나를 밑동·상단 두 폴리라인의 띠로 편다 */
function wallStrip(band: SegmentBands, line: WallLine, height: number, lane: number): LaneBand {
  const count = Math.min(line.base.length, line.facing.length)
  const lo: BandPoint[] = []
  const hi: BandPoint[] = []
  for (let at = 0; at < count; at += 1) {
    const foot = line.base[at]!
    const normal = wallNormalAt(line, at)

    // 위에 다른 레인 면이 있으면 그 **바닥까지만** 세운다. 끊는 것이 아니라 낮아지는 것이라
    // 통과 구간에서 벽이 생겼다 말았다 하지 않고 높낮이만 변한다(사용자 선택, 2026-09-03).
    const ceiling = ceilingAbove(band, line.lane, foot, at)
    const rise = Math.max(normal.y, 1e-6)
    const limited =
      ceiling === null ? height : Math.min(height, Math.max((ceiling - foot.y) / rise, 0))

    lo.push({ ...foot })
    hi.push({
      x: foot.x + normal.x * limited,
      y: foot.y + normal.y * limited,
      z: foot.z + normal.z * limited,
    })
  }
  return { lane, lo, hi }
}

/**
 * 세그먼트의 벽들을 레인 면과 같은 형태(`SegmentBands`)로 낸다. 그래야 삼각형 배치를
 * `buildTrackGeometries`가 그대로 맡는다 — 같은 로직을 다시 쓰면 두 곳이 답을 달리할 수 있고,
 * 그때 어긋나는 것은 "벽이 노면 가장자리에 정확히 붙었는가"다.
 */
export function wallBandOf(band: SegmentBands, height: number = WALL_HEIGHT_CM): SegmentBands {
  const lanes = wallLinesOf(band).map((line, index) => wallStrip(band, line, height, index))
  return { ...band, lanes }
}

/**
 * 벽 지오메트리. 색은 **세그먼트 단위**다 — 레인별 밝기 보정(`laneSurfaceColorOf`)을 적용하지
 * 않는 것은 벽을 두 레인이 공유하기 때문이다. 어느 쪽 보정을 따를지 정할 수 없다.
 *
 * 색 단위로 합치므로(그 합침이 `buildTrackGeometries`의 존재 이유다) 벽 528개가 늘어도
 * draw call은 색 종류만큼이다 — 예산에 미치는 영향은 정점·픽셀 비용이지 draw call이 아니다.
 */
export function buildWallGeometries(
  bands: readonly SegmentBands[],
  colorOf: (band: SegmentBands) => string,
  height: number = WALL_HEIGHT_CM,
): ColoredGeometry[] {
  return buildTrackGeometries(
    bands.map((band) => wallBandOf(band, height)),
    (band) => colorOf(band),
  )
}
