// FEAT-006 — 복원된 순서 + 고도 프로파일을 3D 씬 좌표로 배치한다.
//
// 배치의 정본은 편집기 도면이다: 끝점(절대) = position + rotate(offset, angleDeg)
// (`02_design/piece-geometry.md` §좌표 계약). 여기서 좌표를 새로 만들지 않고 그 계약이
// 만든 절대 끝점 위에 형상을 얹기만 한다 — 지어낸 좌표는 도면과 일치할 수 없다.
//
// 축 대응(editor → three): x → x, y → z, 고도 → y(위).
// 편집기 y는 화면 아래로 증가하므로, 위에서 내려다보는 카메라의 up을 -z로 두면 도면과
// 같은 방향으로 보인다. 여기서 y를 뒤집어 넣으면(z = -y) 도면의 거울상이 된다.
import { buildPiecePath } from '@/entities/track/lib/elevation'
import type { ElevatedSegment, OrientedPiece, PiecePath } from '@/entities/track/lib/elevation'

import { compatCorrectionOf } from './compat-correction'

export interface ScenePoint {
  x: number
  /** 고도(위) */
  y: number
  z: number
}

export interface SceneSegment {
  pieceId: string
  pieceClass: string
  /** 진행 순서상 위치, 0-based */
  order: number
  /** 렌더 곡선 표본. `points[0]`이 주행 진입점이다 */
  points: ScenePoint[]
  /** 수평면 진입 접선(라디안, atan2(dz, dx)). 표본이 아니라 경로에서 잰다 */
  entryTangentRad: number
  /** 수평면 진출 접선(라디안) */
  exitTangentRad: number
  isSupported: boolean
  /** REQ-F-021 보정이 이 세그먼트 좌표에 더해졌는가 */
  compatCorrected: boolean
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
  bounds: SceneBounds
  /** 부분 실패로 복원 구간까지만 배치했는가(제품 계약 §5 — 조용히 자르지 않는다) */
  truncated: boolean
}

export interface SceneLayoutInput {
  /** FEAT-003 순서에 주행 방향을 입힌 경로(`orientPath` 산출) */
  oriented: readonly OrientedPiece[]
  /** FEAT-005 산출. `order`가 위 경로의 인덱스다 */
  elevated: readonly ElevatedSegment[]
  /** 순서가 전체 피스를 덮지 못했는가(FEAT-004 판정에서 온다) */
  truncated: boolean
}

/**
 * 표본 수. 직선·평지는 두 끝점이면 형상이 정확하고, 원호나 S곡선은 표본이 성기면
 * 이음매 접선각이 실제보다 나쁘게 측정된다(TC-006-1의 ±1°가 표본 밀도에 좌우되면 안 된다).
 */
const CURVED_SAMPLES = 24
const FLAT_SAMPLES = 2

/** `buildPiecePath`가 실제로 원호로 만드는 클래스 — 표본 수는 그 모델을 따라간다 */
const ARC_PIECE_PREFIX = 'Cor'

function sampleCountOf(pieceClass: string, segment: ElevatedSegment | undefined): number {
  if (pieceClass.startsWith(ARC_PIECE_PREFIX)) return CURVED_SAMPLES
  if (segment === undefined) return FLAT_SAMPLES
  return segment.elevationProfile.kind === 'flat' ? FLAT_SAMPLES : CURVED_SAMPLES
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

const EMPTY_BOUNDS: SceneBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 0, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 0 },
  diagonal: 0,
}

function boundsOf(segments: readonly SceneSegment[]): SceneBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const segment of segments) {
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

  const segments = input.oriented.map((oriented, order): SceneSegment => {
    const { piece } = oriented
    const elevated = elevatedByOrder.get(order)
    const path = buildPiecePath(oriented)
    const correction = compatCorrectionOf(piece)
    const count = sampleCountOf(piece.pieceClass, elevated)
    const base = elevated?.absoluteElevationStart ?? 0

    const points: ScenePoint[] = []
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0 : index / (count - 1)
      const flat = path.pointAt(t)
      points.push({
        x: flat.x + correction.x,
        y: base + (elevated?.elevationProfile.heightAt(t) ?? 0),
        z: flat.y + correction.y,
      })
    }

    return {
      pieceId: piece.pieceId,
      pieceClass: piece.pieceClass,
      order,
      points,
      entryTangentRad: tangentAt(path, 'entry'),
      exitTangentRad: tangentAt(path, 'exit'),
      isSupported: piece.isSupported,
      compatCorrected: correction.applied,
    }
  })

  return { segments, bounds: boundsOf(segments), truncated: input.truncated }
}
