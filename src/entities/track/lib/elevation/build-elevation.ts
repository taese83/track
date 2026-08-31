// FEAT-005 — 복원된 경로에 고도를 입힌다.
//
// 정본 모델(뒤집힌 이력이 많아 어느 결정이 살아 있는지 명시한다):
//   D-022  현(chord) 규칙 — 피스의 시작·끝을 이은 직선이 지정 각도를 이룬다
//   D-023  H = 진행축 px × **sin**(각도). 진행축은 밑변이 아니라 달린 거리(빗변)다
//   D-029  상승 뱅크와 하강 뱅크 **사이 구간 전체가 하나의 기운 평면**이다.
//          기울기 축은 구간 진입점과 진출점을 잇는 선 — 두 점 높이가 같아야 폐곡선이 닫힌다.
//          (D-027 고원·D-028 지붕은 이 결정이 대체했다)
//   D-040  뱅크 피스는 판이 아니라 **전이 곡선**이다 — 평지와 판 양쪽에 접한다
//   D-041  전이는 기울기가 **단조 증가**해야 한다. 3차 곡선은 판보다 1.69배 가파른 혹을
//          만들었다. 단조 조건의 대가로 판 전체를 `lift`만큼 내려놓아야 이음새가 붙는다
//   D-042  슬로프 20°(confirmed, 사용자 지정 렌더 규칙) · 뱅크 20°(measured, 타미야 공식)
//   D-045  뱅크 구간은 색과 무관하게 **위로** 솟는다
import type {
  ElevatedSegment,
  ElevationProfile,
  EvidenceGrade,
  EvidenceTag,
  OrientedPiece,
  Point,
} from './types'
import { buildPiecePath } from './piece-path'
import type { PiecePath } from './piece-path'

const RAD = Math.PI / 180

// D-042가 각도 드리프트를 해소한 정본이다. 이전 엔트리의 40°·25°·22°·18°는 이력이다.
const SLOPE_ANGLE_DEG = 20
const SLOPE_ANGLE_GRADE: EvidenceGrade = 'confirmed'
const BANK_ANGLE_DEG = 20
const BANK_ANGLE_GRADE: EvidenceGrade = 'measured'

// 고도 변화 피스(Bri·Ban 계열)에 한해 유효한 팔레트 인덱스다 (N-001 해소, 2026-08-28 픽셀 측정)
const RISE_COLOR_INDEX = 3
const FALL_COLOR_INDEX = 2
const COLOR_RULE_GRADE: EvidenceGrade = 'measured'

/** 기울기를 수치 미분할 때 쓰는 매개변수 간격 */
const DERIVATIVE_STEP = 1e-4

type SegmentKind = 'slope' | 'bank' | 'wave' | 'lane-change' | 'plain'
type Direction = 'rise' | 'fall' | 'none'

function kindOf(pieceClass: string): SegmentKind {
  if (pieceClass.startsWith('Bri')) return 'slope'
  if (pieceClass.startsWith('Ban')) return 'bank'
  if (pieceClass.startsWith('Chi')) return 'wave'
  if (pieceClass.startsWith('Lan')) return 'lane-change'
  return 'plain'
}

function directionOf(colorIndex: number): Direction {
  if (colorIndex === RISE_COLOR_INDEX) return 'rise'
  if (colorIndex === FALL_COLOR_INDEX) return 'fall'
  return 'none'
}

interface PlaneSection {
  from: number
  to: number
  /** 구간 기울기(도). 뱅크가 연속이면 누적된다 — 다단 기하는 미구현이다(D-030) */
  levelDeg: number
  origin: Point
  /** 판축(진입·진출을 잇는 선의 법선). 이 방향으로 기운다 */
  up: Point
  /** tan(구간 기울기), 부호 포함 */
  gradient: number
  /** 판을 얼마나 내려놓는가 — 전이가 판 연장선에 못 미치는 만큼이다(D-041) */
  lift: number
  dIn: number
  dOut: number
  kIn: number
  kOut: number
  baseElevation: number
}

function dot(point: Point, origin: Point, axis: Point): number {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
}

/**
 * 뱅크가 기울기를 바꾼다 — 상승 뱅크가 +20°, 하강 뱅크가 −20°를 더한다.
 * 기울기가 0이 아닌 동안이 하나의 판 구간이고 0으로 돌아오면 평지로 복귀한다.
 * 색은 편집기 팔레트이고 우리 진행 방향이 실제 주행과 반대일 수 있으므로,
 * "뱅크는 위로 올라간다"(D-029·D-045)를 기준으로 전체 부호를 한 번 정규화한다.
 */
function findPlaneSections(kinds: readonly SegmentKind[], directions: readonly Direction[]) {
  const bankIndices: number[] = []
  kinds.forEach((kind, index) => {
    if (kind === 'bank') bankIndices.push(index)
  })

  const firstBank = bankIndices[0]
  const globalSign = firstBank !== undefined && directions[firstBank] === 'fall' ? -1 : 1

  const sections: { from: number; to: number; levelDeg: number }[] = []
  let level = 0
  let sectionStart = -1
  for (const index of bankIndices) {
    const step = (directions[index] === 'fall' ? -1 : 1) * globalSign * BANK_ANGLE_DEG
    const before = level
    level += step
    if (before === 0 && level !== 0) sectionStart = index
    else if (before !== 0 && level === 0 && sectionStart >= 0) {
      sections.push({ from: sectionStart, to: index, levelDeg: before })
      sectionStart = -1
    }
  }
  // 0으로 돌아오지 않고 끝난 구간은 마지막 뱅크에서 끊는다 — 열린 채 두면 판이 트랙 끝까지 번진다
  const lastBank = bankIndices[bankIndices.length - 1]
  if (sectionStart >= 0 && lastBank !== undefined) {
    sections.push({ from: sectionStart, to: lastBank, levelDeg: level })
  }
  return sections
}

function buildSection(
  spec: { from: number; to: number; levelDeg: number },
  paths: readonly PiecePath[],
): PlaneSection | null {
  const entryPath = paths[spec.from]
  const exitPath = paths[spec.to]
  if (entryPath === undefined || exitPath === undefined) return null

  const entry = entryPath.pointAt(0)
  const exit = exitPath.pointAt(1)
  const axis = { x: exit.x - entry.x, y: exit.y - entry.y }
  const axisLength = Math.hypot(axis.x, axis.y)
  // 진입·진출을 잇는 축을 수평으로 두고 그 법선으로 기운다 — 두 점 높이가 같아야 폐곡선이 닫힌다
  const up =
    axisLength > 1e-6 ? { x: -axis.y / axisLength, y: axis.x / axisLength } : { x: 0, y: 1 }

  // 진입에서 오르막이 되도록 부호를 맞춘다. 구간이 판축의 어느 쪽으로 뻗는지로 정한다
  const probe = entryPath.pointAt(1 / 6)
  const along = dot(probe, entry, up)
  const sign = (along >= 0 ? 1 : -1) * Math.sign(spec.levelDeg || 1)
  const gradient = sign * Math.tan(Math.abs(spec.levelDeg) * RAD)

  const dIn = dot(entryPath.pointAt(1), entry, up)
  const dOut = dot(exitPath.pointAt(0), entry, up)
  // 진입·진출이 판축 반대편이거나 한쪽이 0이면 전이를 만들 수 없다 — 판만 쓰고 꺾임을 남긴다.
  // 다단 뱅크(D-030 미구현)도 여기로 떨어진다.
  const usable = Math.abs(dIn) > 1e-9 && Math.abs(dOut) > 1e-9 && Math.sign(dIn) === Math.sign(dOut)
  const lift = usable ? (Math.sign(dIn) * Math.min(Math.abs(dIn), Math.abs(dOut))) / 2 : 0

  return {
    from: spec.from,
    to: spec.to,
    levelDeg: spec.levelDeg,
    origin: entry,
    up,
    gradient,
    lift,
    dIn,
    dOut,
    kIn: usable ? lift / (dIn - lift) : 0,
    kOut: usable ? lift / (dOut - lift) : 0,
    baseElevation: 0,
  }
}

/** S곡선 — 양 끝 기울기가 0이라 평지와 접선 연속이다. 모양은 총 상승량을 바꾸지 않는다 */
function sCurve(t: number): number {
  return (1 - Math.cos(Math.PI * t)) / 2
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function planeElevationAtPoint(section: PlaneSection, index: number, point: Point): number {
  const d = dot(point, section.origin, section.up)
  const isEntry = index === section.from
  const isExit = index === section.to

  if ((isEntry || isExit) && section.lift !== 0) {
    // 전이 구간 — 평지와 판 양쪽에 접한다.
    //   g(d) = dEnd/(k+1) · (d/dEnd)^(k+1),  g′(0)=0,  g′(dEnd)=판 기울기
    const dEnd = isEntry ? section.dIn : section.dOut
    const k = isEntry ? section.kIn : section.kOut
    const u = d / dEnd
    // 판축 밖(u∉[0,1])은 클램프가 아니라 이웃 구간의 식으로 잇는다 — 클램프하면 전이 피스
    // 가장자리와 다음 판 피스 사이에 노치가 생긴다. lift 정의상 u=1에서 두 식이 C1로 만난다.
    if (u <= 0) return section.baseElevation
    if (u < 1)
      return section.baseElevation + section.gradient * (dEnd / (k + 1)) * Math.pow(u, k + 1)
  }
  // 전이가 끝난 뒤로는 일정 각도의 평판이다
  return section.baseElevation + section.gradient * (d - section.lift)
}

function numericSlope(elevationAt: (t: number) => number, t: number, pathLength: number) {
  if (pathLength === 0) return 0
  const lo = Math.max(0, t - DERIVATIVE_STEP)
  const hi = Math.min(1, t + DERIVATIVE_STEP)
  if (hi === lo) return 0
  return (elevationAt(hi) - elevationAt(lo)) / ((hi - lo) * pathLength)
}

export interface BuildElevationResult {
  segments: ElevatedSegment[]
  /** 경로를 다 돌고 START로 돌아왔을 때의 누적 고도. 폐합이면 0이다 */
  finalElevation: number
}

/**
 * 복원된 경로에 피스별 고도 프로파일과 누적 절대 고도를 입힌다.
 * 방향(진입·진출 끝점)은 호출자가 정해 넘긴다 — 순서의 소유자는 FEAT-003이다.
 */
export function buildElevatedSegments(path: readonly OrientedPiece[]): BuildElevationResult {
  const paths = path.map((oriented) => buildPiecePath(oriented))
  const kinds = path.map((oriented) => kindOf(oriented.piece.pieceClass))
  const directions = path.map((oriented) => directionOf(oriented.piece.colorIndex))

  const sections: PlaneSection[] = []
  for (const spec of findPlaneSections(kinds, directions)) {
    const section = buildSection(spec, paths)
    if (section !== null) sections.push(section)
  }
  const sectionOf = (index: number): PlaneSection | undefined =>
    sections.find((section) => index >= section.from && index <= section.to)

  const segments: ElevatedSegment[] = []
  let elevation = 0

  path.forEach((oriented, index) => {
    const { piece } = oriented
    const piecePath = paths[index]
    const kind = kinds[index]
    const direction = directions[index]
    if (piecePath === undefined || kind === undefined || direction === undefined) return

    const section = sectionOf(index)
    // 구간의 기준 높이는 진입 시점의 누적 고도다. 구간 안에서는 판이 높이를 결정한다
    if (section !== undefined && index === section.from) section.baseElevation = elevation

    let profile: ElevationProfile
    let start: number
    let end: number

    if (section !== undefined) {
      // 판 위에서는 높이가 **2D 위치**로 정해진다 — 누적기가 아니라 판이 정본이다.
      // 누적기를 그대로 쓰면 구간 안 피스가 전부 진입 높이로 눌려 이음새가 벌어진다.
      const absoluteAt = (point: Point) => planeElevationAtPoint(section, index, point)
      const absolute = (t: number) => absoluteAt(piecePath.pointAt(t))
      start = absolute(0)
      end = absolute(1)
      profile = {
        kind: index === section.from || index === section.to ? 'bankTransition' : 'plane',
        heightAt: (t) => absolute(clamp01(t)) - start,
        slopeAt: (t) => numericSlope(absolute, clamp01(t), piecePath.length),
        surfaceHeightAt: absoluteAt,
      }
    } else if (kind === 'slope' && direction !== 'none') {
      start = elevation
      // 높이는 tan이 아니라 sin이다 — 진행축은 밑변이 아니라 달린 거리다(D-023)
      const chord = Math.hypot(piece.vertex2.x - piece.vertex1.x, piece.vertex2.y - piece.vertex1.y)
      const total = chord * Math.sin(SLOPE_ANGLE_DEG * RAD) * (direction === 'fall' ? -1 : 1)
      profile = {
        kind: 'sCurve',
        heightAt: (t) => total * sCurve(clamp01(t)),
        slopeAt: (t) =>
          piecePath.length === 0
            ? 0
            : (total * Math.PI * Math.sin(Math.PI * clamp01(t))) / (2 * piecePath.length),
      }
      end = start + total
    } else {
      start = elevation
      // 웨이브는 평면상 좌우 흔들림이고 고도를 바꾸지 않는다(D-032).
      // 레인체인지의 육교도 레인별 변형이라 노선 고도가 아니다(D-035).
      profile = { kind: 'flat', heightAt: () => 0, slopeAt: () => 0 }
      end = start
    }

    segments.push({
      pieceId: piece.pieceId,
      pieceClass: piece.pieceClass,
      order: index,
      elevationProfile: profile,
      absoluteElevationStart: start,
      absoluteElevationEnd: end,
      evidenceGrade: evidenceFor(kind, direction, section !== undefined),
      isSupported: piece.isSupported,
    })

    // 구간은 진입 높이로 되돌아오므로(D-029) 누적기는 구간 동안 움직이지 않는다
    elevation = section === undefined ? end : elevation
  })

  return { segments, finalElevation: elevation }
}

function evidenceFor(kind: SegmentKind, direction: Direction, onPlane: boolean): EvidenceTag[] {
  if (onPlane) {
    return [
      { field: 'bankAngleDeg', grade: BANK_ANGLE_GRADE },
      { field: 'colorRule', grade: COLOR_RULE_GRADE },
    ]
  }
  if (kind === 'slope' && direction !== 'none') {
    return [
      { field: 'slopeAngleDeg', grade: SLOPE_ANGLE_GRADE },
      { field: 'colorRule', grade: COLOR_RULE_GRADE },
    ]
  }
  return []
}

/**
 * FEAT-004의 `elevationDeltas` 주입용. 폐합 판정은 피스별 **순** 변화량만 필요하므로
 * 프로파일 전체를 넘기지 않는다 — FEAT-004가 쓰던 현 규칙 근사를 이 산출로 대체한다.
 */
export function elevationDeltasOf(
  result: BuildElevationResult,
): Map<string, { value: number; grade: EvidenceGrade; contributes: boolean }> {
  const deltas = new Map<string, { value: number; grade: EvidenceGrade; contributes: boolean }>()
  for (const segment of result.segments) {
    const value = segment.absoluteElevationEnd - segment.absoluteElevationStart
    const grades = segment.evidenceGrade.map((tag) => tag.grade)
    deltas.set(segment.pieceId, {
      value,
      grade: grades.includes('unknown')
        ? 'unknown'
        : grades.includes('inferred')
          ? 'inferred'
          : grades.includes('confirmed')
            ? 'confirmed'
            : 'measured',
      contributes: value !== 0,
    })
  }
  return deltas
}
