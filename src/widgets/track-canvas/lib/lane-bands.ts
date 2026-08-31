// FEAT-008 — 중심선 표본을 **레인 3개의 면**으로 편다.
//
// 종전에는 중심선 하나를 전폭 36cm 리본으로 폈다(`buildSegmentGeometry`). 그러면 레인이
// 화면에 없고 자리바꿈도 그릴 곳이 없다. 여기서 레인마다 좌·우 가장자리를 만들되,
// 가장자리는 중심선과 **같은 규칙**을 따른다(piece-geometry.md §D-034).
//
// **이음새가 이 파일의 어려운 부분이다.** 피스마다 자기 끝점의 법선으로 폭을 만들면 두
// 피스의 절단선이 몇 도씩 어긋나 바깥쪽에 삼각 노치가 생긴다. 실제 피스는 진행 방향에
// 수직인 **하나의 직선**으로 잘려 맞물리므로, 이음새에서는 양쪽이 같은 절단선을 쓴다
// (D-036 ④). 그 절단선은 두 접선의 이등분선이고, 가장자리를 그 선 위까지 밀어내는 배율이
// `1/cos(Δ/2)`다 — 그래서 코너에서 **바깥쪽 가장자리가 안쪽보다 길어진다**.
import { LANE_COUNT, LANE_PITCH_CM, laneBandAt } from './lane-model'
import type { SceneSample, SceneSegment } from './scene-layout'

export interface BandPoint {
  x: number
  y: number
  z: number
}

export interface LaneBand {
  lane: number
  /** 진행 방향 왼쪽 가장자리(가로 위치가 작은 쪽) */
  lo: BandPoint[]
  hi: BandPoint[]
}

export interface SegmentBands {
  order: number
  pieceId: string
  pieceClass: string
  isSupported: boolean
  lanes: LaneBand[]
  /**
   * 레인이 명시 경로(FEAT-018)로 **따로** 놓여 서로 맞붙지 않는가. 맞붙은 레인은 경계선을
   * 4줄(바깥 둘 + 사이 둘)로 공유하지만, 따로 놓인 레인은 레인마다 좌·우 둘씩 6줄이다.
   */
  separated: boolean
}

/**
 * 절단선 배율의 상한. 접선이 거의 반대로 꺾이면(Δ→π) `1/cos(Δ/2)`가 발산해 가장자리가
 * 화면 밖으로 튄다. 참조 트랙의 최대 꺾임은 코너 45°(배율 1.08)이므로 이 상한은 정상
 * 형상에 닿지 않는다 — 손상된 데이터에서 폭발하지 않게 두는 안전핀이다.
 */
const MAX_MITER_SCALE = 4

/** 가로 프레임: 가장자리 = 중심 + (nx, nz) × 가로위치 × scale */
interface LateralFrame {
  nx: number
  nz: number
  scale: number
}

function normalizeAngle(radians: number): number {
  let value = radians
  while (value > Math.PI) value -= 2 * Math.PI
  while (value <= -Math.PI) value += 2 * Math.PI
  return value
}

function frameOf(tangentRad: number): LateralFrame {
  return { nx: -Math.sin(tangentRad), nz: Math.cos(tangentRad), scale: 1 }
}

/**
 * 두 접선이 만나는 이음새의 공통 절단선. 이등분선 법선에 `1/cos(Δ/2)`를 곱하면 양쪽
 * 피스의 가장자리가 **같은 점**에 닿는다 — 노치가 생길 자리가 없어진다.
 */
function seamFrame(inRad: number, outRad: number): LateralFrame {
  const delta = normalizeAngle(outRad - inRad)
  const mid = inRad + delta / 2
  const cos = Math.cos(delta / 2)
  const scale = cos === 0 ? MAX_MITER_SCALE : Math.min(Math.abs(1 / cos), MAX_MITER_SCALE)
  return { nx: -Math.sin(mid), nz: Math.cos(mid), scale }
}

/** 표본 사이 국소 접선. 끝 표본은 이음새 프레임이 대신하므로 여기 오지 않는다 */
function localTangentRad(points: readonly SceneSample[], index: number): number {
  const prev = points[Math.max(index - 1, 0)]
  const next = points[Math.min(index + 1, points.length - 1)]
  if (prev === undefined || next === undefined) return 0
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  if (dx === 0 && dz === 0) return 0
  return Math.atan2(dz, dx)
}

/** 첫 표본과 마지막 표본이 맞닿으면 폐곡선이라 그 이음새도 공통 절단선을 쓴다 */
const LOOP_EPSILON_CM = 1

function isClosedLoop(segments: readonly SceneSegment[]): boolean {
  const first = segments[0]?.points[0]
  const lastSegment = segments[segments.length - 1]
  const last = lastSegment?.points[lastSegment.points.length - 1]
  if (first === undefined || last === undefined) return false
  return Math.hypot(first.x - last.x, first.z - last.z) < LOOP_EPSILON_CM
}

/**
 * 세그먼트마다 표본별 가로 프레임. 양 끝은 이웃 피스와 **공유하는** 절단선이고 가운데는
 * 자기 접선이다.
 */
function framesFor(segments: readonly SceneSegment[], index: number): LateralFrame[] {
  const segment = segments[index]
  if (segment === undefined) return []
  const { points } = segment

  const closed = isClosedLoop(segments)
  const previous =
    segments[index - 1] ?? (closed ? segments[segments.length - 1] : undefined)
  const next = segments[index + 1] ?? (closed ? segments[0] : undefined)

  const entry =
    previous === undefined
      ? frameOf(segment.entryTangentRad)
      : seamFrame(previous.exitTangentRad, segment.entryTangentRad)
  const exit =
    next === undefined
      ? frameOf(segment.exitTangentRad)
      : seamFrame(segment.exitTangentRad, next.entryTangentRad)

  return points.map((_, sample) => {
    if (sample === 0) return entry
    if (sample === points.length - 1) return exit
    return frameOf(localTangentRad(points, sample))
  })
}

// 가장자리 높이는 중심선 높이가 아니라 **가장자리 자리의 노면**에서 온다 — 판 위에서는
// 그 둘이 다르고, 그 차이가 곧 횡경사다(FEAT-017 · D-029).
function offsetPoint(
  sample: SceneSample,
  frame: LateralFrame,
  lateralCm: number,
  riseCm: number,
  surface: ((x: number, z: number) => number) | undefined,
): BandPoint {
  const distance = lateralCm * frame.scale
  const x = sample.x + frame.nx * distance
  const z = sample.z + frame.nz * distance
  return {
    x,
    y: (surface === undefined ? sample.y : surface(x, z)) + riseCm,
    z,
  }
}

/** 두 표본 사이 수평 접선. 같은 점이면 0 — 경로 끝에서 이웃 표본이 하나뿐일 때 쓴다 */
function tangentBetween(from: SceneSample, to: SceneSample): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (dx === 0 && dz === 0) return 0
  return Math.atan2(dz, dx)
}

/**
 * FEAT-018 — 명시 경로 레인의 면. 폭은 그 레인 **자신의** 접선에 수직으로 ±6cm다. 양 끝은
 * 이웃 피스와 **공유하는 절단선**(`framesFor`의 entry/exit — 중심선 접선 기준)을 쓴다: 두 팔이
 * 직선이라 레인 접선과 중심선 접선이 같으므로, 이웃이 코너여도 D-036 ④의 미터링이 그대로
 * 성립한다(code-reviewer 2026-09-01).
 */
function routeBand(
  route: readonly SceneSample[],
  lane: number,
  seams: { entry: LateralFrame | undefined; exit: LateralFrame | undefined },
  laneSurface: ((x: number, z: number, t: number) => number) | undefined,
): LaneBand {
  const half = LANE_PITCH_CM / 2
  const last = route.length - 1
  const lo: BandPoint[] = []
  const hi: BandPoint[] = []
  route.forEach((sample, at) => {
    const frame =
      at === 0
        ? (seams.entry ?? frameOf(tangentBetween(sample, route[1] ?? sample)))
        : at === last
          ? (seams.exit ?? frameOf(tangentBetween(route[last - 1] ?? sample, sample)))
          : frameOf(localTangentRad(route, at))
    // 가장자리 높이는 **그 자리의 노면**(레인별 판 함수)에서 온다 — 올라가는 레인이 판 위에 놓인다
    const surface = laneSurface === undefined ? undefined : (x: number, z: number) => laneSurface(x, z, sample.t)
    lo.push(offsetPoint(sample, frame, -half, 0, surface))
    hi.push(offsetPoint(sample, frame, half, 0, surface))
  })
  return { lane, lo, hi }
}

/**
 * 미지원 피스는 끝점을 모르고 형상이 한 점으로 눌려 있다 — 폭을 지어내지 않고 레인을
 * 만들지 않는다(FEAT-009가 그 자리에 플레이스홀더를 세운다).
 */
export function buildLaneBands(segments: readonly SceneSegment[]): SegmentBands[] {
  return segments.map((segment, index) => {
    const frames = framesFor(segments, index)
    const usable = segment.isSupported && segment.points.length >= 2
    const routes = segment.lanePaths
    const separated = usable && routes !== undefined

    const lanes: LaneBand[] = !usable
      ? []
      : routes !== undefined
        ? routes.map((route, lane) =>
            routeBand(
              route,
              lane,
              { entry: frames[0], exit: frames[frames.length - 1] },
              segment.laneSurfaces?.[lane],
            ),
          )
        : Array.from({ length: LANE_COUNT }, (_, lane) => {
          const lo: BandPoint[] = []
          const hi: BandPoint[] = []
          const surface = segment.surfaceHeightAt
          segment.points.forEach((sample, at) => {
            const frame = frames[at]
            if (frame === undefined) return
            const band = laneBandAt(segment.pieceClass, lane, sample.t)
            lo.push(offsetPoint(sample, frame, band.lo.lateralCm, band.lo.riseCm, surface))
            hi.push(offsetPoint(sample, frame, band.hi.lateralCm, band.hi.riseCm, surface))
          })
          return { lane, lo, hi }
        })

    return {
      order: segment.order,
      pieceId: segment.pieceId,
      pieceClass: segment.pieceClass,
      isSupported: segment.isSupported,
      lanes,
      separated,
    }
  })
}

/**
 * 레인 경계선 — 맞붙은 레인은 4줄(바깥 두 줄과 레인 사이 두 줄), 따로 놓인 레인(FEAT-018)은
 * 레인마다 좌·우 둘씩. 색 단독 구분을 보조하는 형태 축이다.
 */
export function boundaryLinesOf(bands: SegmentBands): BandPoint[][] {
  const [first] = bands.lanes
  if (first === undefined) return []
  if (bands.separated) return bands.lanes.flatMap((lane) => [lane.lo, lane.hi])
  return [first.lo, ...bands.lanes.map((lane) => lane.hi)]
}
