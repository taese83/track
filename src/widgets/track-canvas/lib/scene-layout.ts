// FEAT-006 — 복원된 순서 + 고도 프로파일을 3D 씬 좌표로 배치한다.
//
// 배치의 정본은 편집기 도면이다: 끝점(절대) = position + rotate(offset, angleDeg)
// (`02_design/piece-geometry.md` §좌표 계약). 여기서 좌표를 새로 만들지 않고 그 계약이
// 만든 절대 끝점 위에 형상을 얹기만 한다 — 지어낸 좌표는 도면과 일치할 수 없다.
//
// 축 대응(editor → three): x → x, y → z, 고도 → y(위).
// 편집기 y는 화면 아래로 증가하므로, 위에서 내려다보는 카메라의 up을 -z로 두면 도면과
// 같은 방향으로 보인다. 여기서 y를 뒤집어 넣으면(z = -y) 도면의 거울상이 된다.
import { buildPiecePath, laneRoutesOf } from '@/entities/track/lib/elevation'
import type {
  ElevatedSegment,
  LaneRoute,
  OrientedPiece,
  PiecePath,
} from '@/entities/track/lib/elevation'
import type { ParsedPiece } from '@/entities/track/model/types'

import { compatCorrectionOf } from './compat-correction'
import { isLaneChangeClass } from './lane-model'
import { FULL_CURVED_SAMPLES, mitigationFor, readMitigationOverride } from './perf-mitigation'
import type { MitigationProfile } from './perf-mitigation'
import { directionOf, kindOf } from './segment-encoding'
import { buildUnsupportedPlaceholders, placeholderEdges } from './unsupported-placeholder'
import type { UnsupportedPlaceholder } from './unsupported-placeholder'
import type { SegmentDirection, SegmentKind } from './segment-encoding'

export interface ScenePoint {
  x: number
  /** 고도(위) */
  y: number
  z: number
}

/** 표본 하나. `t`는 피스 안 진행 비율이며 레인 자리바꿈(FEAT-008)이 이 값을 쓴다 */
export interface SceneSample extends ScenePoint {
  t: number
}

export interface SceneSegment {
  pieceId: string
  pieceClass: string
  /** 진행 순서상 위치, 0-based */
  order: number
  /** 렌더 곡선 표본. `points[0]`이 주행 진입점이다 */
  points: SceneSample[]
  /** 수평면 진입 접선(라디안, atan2(dz, dx)). 표본이 아니라 경로에서 잰다 */
  entryTangentRad: number
  /** 수평면 진출 접선(라디안) */
  exitTangentRad: number
  isSupported: boolean
  /** REQ-F-021 보정이 이 세그먼트 좌표에 더해졌는가 */
  compatCorrected: boolean
  /**
   * 세그먼트 유형·방향(FEAT-015). 렌더가 색·형태·텍스트 **세 채널**에 각각 태운다 —
   * 이 둘이 없던 동안 3D 뷰에서 뱅크와 슬로프가 구별되지 않았다.
   * 방향의 출처는 기하가 아니라 **피스의 선언 색**이다(D-014).
   */
  kind: SegmentKind
  direction: SegmentDirection
  /**
   * 씬 좌표(x, z)의 노면 고도. 중심선 표본만으로는 가장자리가 수평이 되어 판 위의
   * 횡경사가 사라진다(FEAT-017 · D-029). 판 밖 세그먼트에는 없다.
   */
  surfaceHeightAt?: (x: number, z: number) => number
  /**
   * 레인별 **명시 경로** 표본(FEAT-018 · D-049). 주행 레인 인덱스 순이며 각 레인의
   * `[0]`이 그 레인의 진입점이다. 있으면 레인 면(`lane-bands`)과 추종 카메라
   * (`flythrough-camera`)가 "중심선 + 가로 오프셋" 대신 이것을 쓴다 — 레인보우 체인저처럼
   * 레인이 서로 다른 중심의 원호를 도는 피스는 오프셋으로 만들 수 없다.
   *
   * **이 표본의 `t`는 그 레인 경로 고유의 호 길이 비율**이지 중심선 `points`의 `t`가 아니다
   * (레인 2의 `t=0.5`는 작은 U턴 꼭짓점, 중심선의 `t=0.5`는 큰 U턴 꼭짓점). 지금은 명시 경로
   * 피스가 전부 평지(`Lan*`)라 `heightAt(t)`·`slopeAt(t)`가 0이지만, 고도가 있는 명시 경로
   * 피스가 생기면 중심선 `t`로 환산해 넘겨야 한다(code-reviewer 2026-09-01).
   */
  lanePaths?: SceneSample[][]
  /**
   * 레인별 노면 높이 함수(FEAT-018 · D-049 ⑦). 씬 좌표 `(x, z)`와 그 레인 표본의 `t`(전이/판
   * 구간 판정)를 받아 절대 높이를 낸다. 올라가는 레인은 판 위에 놓이므로 가장자리 높이가
   * 중심선과 다르다 — `surfaceHeightAt`(FEAT-017)과 같은 이유로, 중심선 높이를 좌우로 복사하면
   * 면이 비틀린다. `lanePaths`와 같은 인덱스다.
   */
  laneSurfaces?: ((x: number, z: number, t: number) => number)[]
}

export interface SceneBounds {
  min: ScenePoint
  max: ScenePoint
  center: ScenePoint
  /** 바운딩박스 대각선 길이. TC-006-1의 정규화 기준이자 카메라 초기 거리의 근거다 */
  diagonal: number
}

export interface SceneLayout {
  segments: SceneSegment[]
  /** 대형 트랙 완화 판정(FEAT-011). 배지 노출과 표본 밀도의 근거다 */
  mitigation: MitigationProfile
  bounds: SceneBounds
  /** 부분 실패로 복원 구간까지만 배치했는가(제품 계약 §5 — 조용히 자르지 않는다) */
  truncated: boolean
  /**
   * 순서에 자리를 얻지 못한 미지원 피스(FEAT-009). 경로에 끼워 넣지 않고 **자기 선언
   * 좌표**에 세운다 — 끝점을 모르는 피스를 이어 붙이면 있지도 않은 연결을 주장하게 된다.
   */
  unsupportedPlaceholders: UnsupportedPlaceholder[]
}

export interface SceneLayoutInput {
  /** FEAT-003 순서에 주행 방향을 입힌 경로(`orientPath` 산출) */
  oriented: readonly OrientedPiece[]
  /** FEAT-005 산출. `order`가 위 경로의 인덱스다 */
  elevated: readonly ElevatedSegment[]
  /** 순서가 전체 피스를 덮지 못했는가(FEAT-004 판정에서 온다) */
  truncated: boolean
  /**
   * 파싱된 피스 전체(FEAT-009). `oriented`는 순서에 자리를 얻은 것만 담으므로 미지원
   * 피스가 여기 없으면 씬이 **그 존재 자체를 모른다** — 실측에서 `UNSUPP` 134피스 중
   * 2개가 3D에 한 개도 들어오지 않았다.
   */
  allPieces?: readonly ParsedPiece[]
  /**
   * 대형 트랙 완화의 대조군 측정용 강제 해제(FEAT-011 · TC-011-2). 기본은 false다 —
   * 완화가 실제로 fps를 개선하는지 재려면 **같은 데이터**에서 완화만 끈 렌더가 필요하다.
   */
  mitigationDisabled?: boolean
}

/**
 * 표본 수. 직선·평지는 두 끝점이면 형상이 정확하고, 원호나 S곡선은 표본이 성기면
 * 이음매 접선각이 실제보다 나쁘게 측정된다(TC-006-1의 ±1°가 표본 밀도에 좌우되면 안 된다).
 *
 * 곡선 표본 수는 **완화 프로파일이 정한다**(FEAT-011) — 정점 수가 여기에 선형이라
 * 대형 트랙의 부하가 대부분 이 값에서 나온다.
 */
const FLAT_SAMPLES = 2

/** `buildPiecePath`가 실제로 원호로 만드는 클래스 — 표본 수는 그 모델을 따라간다 */
const ARC_PIECE_PREFIX = 'Cor'

/** 웨이브(`Chi*`)는 중심선이 직선이지만 경로가 옆으로 휜다(FEAT-016) */
const WAVE_PIECE_PREFIX = 'Chi'

/**
 * **표본 밀도는 중심선의 곡률이 아니라 "화면에서 무엇이 굽는가"를 따른다.**
 *
 * 종전에는 중심선이 직선이면 2표본(양 끝)만 줬다. 그래서 두 번 같은 결함이 났다:
 * 레인체인지는 자리바꿈이 직선으로 눌렸고(FEAT-008이 고쳤다), 웨이브는 경로가 옳게
 * 휘는데 화면이 직선으로 그렸다(FEAT-016이 경로를 고쳤으나 표본은 이 파일 소관이라
 * 그 PR에서 넘겨받았다 — 실측 `maxDeviation=0.000cm`).
 */
function sampleCountOf(
  pieceClass: string,
  segment: ElevatedSegment | undefined,
  curvedSamples: number,
): number {
  if (pieceClass.startsWith(ARC_PIECE_PREFIX)) return curvedSamples
  if (isLaneChangeClass(pieceClass)) return curvedSamples
  if (pieceClass.startsWith(WAVE_PIECE_PREFIX)) return curvedSamples
  if (segment === undefined) return FLAT_SAMPLES
  return segment.elevationProfile.kind === 'flat' ? FLAT_SAMPLES : curvedSamples
}

/**
 * 끝점 접선은 **표본이 아니라 경로에서** 잰다. 표본 현으로 재면 원호 한 스텝의 절반만큼
 * 편향이 생기고(Cor1·24표본이면 45/23 = 1.957°) 이음매 두 개가 마주치면 그대로 더해져,
 * 배치가 정확해도 REQ-F-002의 ±1°를 넘는다 — 표본 밀도가 판정을 좌우하면 안 된다.
 */
const TANGENT_STEP = 1e-6

function tangentAt(path: PiecePath, at: 'entry' | 'exit'): number {
  const [from, to] = at === 'entry' ? [0, TANGENT_STEP] : [1 - TANGENT_STEP, 1]
  const a = path.pointAt(from)
  const b = path.pointAt(to)
  if (a.x === b.x && a.y === b.y) return 0
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/**
 * 명시 레인 경로의 표본 간격(cm). 레인보우 체인저는 반원 두 종류(r 42~54)를 담으므로 표본을
 * **호 길이**로 배분한다 — 피스당 고정 개수로 두면 380cm 경로의 반원이 8° 남짓의 다각형으로
 * 읽힌다(2026-09-01 사용자 지적 "매끄러운 곡선이어야 한다"). 3cm 간격이면 r=42에서 현의
 * 처짐이 0.03cm라 눈에 보이지 않는다. 완화(FEAT-011)는 곡선 표본 비율만큼 간격을 늘린다.
 */
const ROUTE_SAMPLE_SPACING_CM = 3
const MIN_ROUTE_SAMPLES = 16

function routeSampleCount(length: number, curvedSamples: number): number {
  const spacing = (ROUTE_SAMPLE_SPACING_CM * FULL_CURVED_SAMPLES) / Math.max(curvedSamples, 1)
  return Math.max(MIN_ROUTE_SAMPLES, Math.ceil(length / spacing) + 1)
}

function sampleRoute(
  route: LaneRoute,
  count: number,
  elevated: ElevatedSegment | undefined,
  correction: { x: number; y: number },
): SceneSample[] {
  const base = elevated?.absoluteElevationStart ?? 0
  const samples: SceneSample[] = []
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1)
    const flat = route.pointAt(t)
    samples.push({
      t,
      x: flat.x + correction.x,
      // 레인 상승은 고도 프로파일이 아니라 레인 면의 추가 높이다(D-035·D-049) — 여기서 더한다
      y: base + (elevated?.elevationProfile.heightAt(t) ?? 0) + route.riseAt(t),
      z: flat.y + correction.y,
    })
  }
  return samples
}

const EMPTY_BOUNDS: SceneBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 0, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 0 },
  diagonal: 0,
}

function boundsOf(
  segments: readonly SceneSegment[],
  placeholders: readonly UnsupportedPlaceholder[] = [],
): SceneBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  // 플레이스홀더도 바운딩박스에 넣는다 — 빼면 카메라 프레이밍 밖으로 나가 "상시 노출"이
  // 성립하지 않는다(트랙 밖에 선언된 미지원 피스가 화면에서 사라진다). 명시 레인 경로도
  // 같다 — 레인보우 체인저의 큰 U턴은 중심선보다 밖으로 나간다(TC-018-6).
  const points = [
    ...segments.flatMap((segment) => segment.points as readonly ScenePoint[]),
    ...segments.flatMap((segment) => (segment.lanePaths ?? []).flat() as readonly ScenePoint[]),
    ...placeholders.flatMap((placeholder) => placeholderEdges(placeholder).flat()),
  ]

  for (const segment of [{ points }]) {
    for (const point of segment.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      minZ = Math.min(minZ, point.z)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
      maxZ = Math.max(maxZ, point.z)
    }
  }

  if (minX === Number.POSITIVE_INFINITY) return EMPTY_BOUNDS

  const min = { x: minX, y: minY, z: minZ }
  const max = { x: maxX, y: maxY, z: maxZ }
  return {
    min,
    max,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
    diagonal: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ),
  }
}

/**
 * 미지원 피스는 끝점을 모른다 — FEAT-002가 `vertex1 = vertex2 = position`으로 두었으므로
 * 형상이 한 점으로 눌린다. 좌표를 지어내 잇지 않고 그 한 점을 그대로 둔다(FEAT-009가
 * 그 자리에 플레이스홀더를 세운다). 접선은 정의되지 않으므로 0으로 둔다.
 */
export function buildSceneLayout(input: SceneLayoutInput): SceneLayout {
  const elevatedByOrder = new Map(input.elevated.map((segment) => [segment.order, segment]))
  // 판정 기준은 **배치되는 세그먼트 수**다 — 순서에 자리를 얻지 못한 피스는 렌더 부하가 없다
  const mitigation = mitigationFor(
    input.oriented.length,
    input.mitigationDisabled ?? readMitigationOverride(),
  )

  const segments = input.oriented.map((oriented, order): SceneSegment => {
    const { piece } = oriented
    const elevated = elevatedByOrder.get(order)
    const path = buildPiecePath(oriented)
    const correction = compatCorrectionOf(piece)
    const count = sampleCountOf(piece.pieceClass, elevated, mitigation.curvedSamples)
    const base = elevated?.absoluteElevationStart ?? 0

    const points: SceneSample[] = []
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0 : index / (count - 1)
      const flat = path.pointAt(t)
      points.push({
        t,
        x: flat.x + correction.x,
        y: base + (elevated?.elevationProfile.heightAt(t) ?? 0),
        z: flat.y + correction.y,
      })
    }

    const surface = elevated?.elevationProfile.surfaceHeightAt

    // FEAT-018 — 명시 레인 경로가 있는 피스(레인보우 체인저)는 레인마다 따로 표본을 낸다.
    // 중심선 `points`는 그대로 둔다 — 마커·목록·스트립 거리축의 기준이다.
    const routes = laneRoutesOf(oriented)
    const lanePaths = routes?.map((route) =>
      sampleRoute(route, routeSampleCount(route.length, mitigation.curvedSamples), elevated, correction),
    )
    const laneSurfaces = routes?.map(
      (route) => (x: number, z: number, t: number) =>
        base +
        (elevated?.elevationProfile.heightAt(t) ?? 0) +
        route.riseAtPoint({ x: x - correction.x, y: z - correction.y }, t),
    )

    return {
      pieceId: piece.pieceId,
      pieceClass: piece.pieceClass,
      order,
      points,
      entryTangentRad: tangentAt(path, 'entry'),
      exitTangentRad: tangentAt(path, 'exit'),
      isSupported: piece.isSupported,
      compatCorrected: correction.applied,
      kind: kindOf(piece.pieceClass, piece.colorIndex),
      direction: directionOf(piece.pieceClass, piece.colorIndex),
      ...(surface === undefined
        ? {}
        : {
            surfaceHeightAt: (x: number, z: number) =>
              surface({ x: x - correction.x, y: z - correction.y }),
          }),
      ...(lanePaths === undefined ? {} : { lanePaths }),
      ...(laneSurfaces === undefined ? {} : { laneSurfaces }),
    }
  })

  const unsupportedPlaceholders = buildUnsupportedPlaceholders(input.allPieces ?? [])

  return {
    segments,
    mitigation,
    bounds: boundsOf(segments, unsupportedPlaceholders),
    truncated: input.truncated,
    unsupportedPlaceholders,
  }
}
