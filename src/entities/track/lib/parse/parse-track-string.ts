import type { ParsedPiece } from '../../model/types'
import { lookupPieceOffsets } from './piece-catalog'

export type SegmentFailureReason =
  | 'empty-segment'
  | 'field-count-mismatch'
  | 'empty-piece-class'
  | 'non-finite-number'

export interface SegmentFailure {
  /** 말미 빈 세그먼트를 제거하기 전, 원문 '#' 분해 기준 인덱스 */
  segmentIndex: number
  reason: SegmentFailureReason
  /** 원문을 되비추지 않는 파생 요약(필드 수·필드 이름) */
  detail: string
}

export type ParseTrackStringResult =
  | { ok: true; pieces: ParsedPiece[] }
  | { ok: false; reason: 'empty-track' }
  | { ok: false; reason: 'malformed-segment'; failures: SegmentFailure[] }

const FIELD_COUNT = 5
const COMPAT_CORRECTION_ANGLES = new Set([45, 135, 225, 315])

/** `Number('')`·`Number(' ')`가 0이 되는 함정을 막는다 */
function toFiniteNumber(raw: string): number | null {
  if (raw.trim().length === 0) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

interface NumericFields {
  x: number
  y: number
  angleDeg: number
  colorIndex: number
}

/** 성공하면 값 묶음을, 실패하면 처음 어긋난 필드 이름을 돌려준다 */
function readNumericFields(fields: string[]): NumericFields | keyof NumericFields {
  const x = toFiniteNumber(fields[1] ?? '')
  if (x === null) return 'x'
  const y = toFiniteNumber(fields[2] ?? '')
  if (y === null) return 'y'
  const angleDeg = toFiniteNumber(fields[3] ?? '')
  if (angleDeg === null) return 'angleDeg'
  const colorIndex = toFiniteNumber(fields[4] ?? '')
  if (colorIndex === null) return 'colorIndex'
  return { x, y, angleDeg, colorIndex }
}

function rotate(point: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

/**
 * 편집기가 만든 `"클래스;x;y;각도;색"#...` 문자열을 피스 목록으로 옮긴다.
 * 입력은 제3자 데이터이므로 실행·eval하지 않고 타입 검증을 통과한 값만 산출한다.
 * 좌표 계약(회전 뒤 position 가산)은 _workspace/02_design/piece-geometry.md.
 */
export function parseTrackString(rawData: string, compat: boolean): ParseTrackStringResult {
  const segments = rawData.split('#')
  if (segments.length > 0 && segments[segments.length - 1] === '') segments.pop()

  if (segments.length === 0) return { ok: false, reason: 'empty-track' }
  if (segments.length === 1 && segments[0]?.trim() === '') return { ok: false, reason: 'empty-track' }

  const pieces: ParsedPiece[] = []
  const failures: SegmentFailure[] = []

  segments.forEach((segment, segmentIndex) => {
    if (segment.trim().length === 0) {
      failures.push({ segmentIndex, reason: 'empty-segment', detail: '빈 세그먼트' })
      return
    }

    const fields = segment.split(';')
    if (fields.length !== FIELD_COUNT) {
      failures.push({
        segmentIndex,
        reason: 'field-count-mismatch',
        detail: `필드 ${FIELD_COUNT}개가 필요하지만 ${fields.length}개다`,
      })
      return
    }

    const pieceClass = (fields[0] ?? '').trim()
    if (pieceClass.length === 0) {
      failures.push({ segmentIndex, reason: 'empty-piece-class', detail: '클래스가 비어 있다' })
      return
    }

    const numeric = readNumericFields(fields)
    if (typeof numeric === 'string') {
      failures.push({
        segmentIndex,
        reason: 'non-finite-number',
        detail: `${numeric}가 유한한 수가 아니다`,
      })
      return
    }

    const { x, y, angleDeg, colorIndex } = numeric
    const offsets = lookupPieceOffsets(pieceClass)

    // 미지원 클래스는 끝점을 알 수 없다 — 좌표를 지어내지 않고 position으로 둔다
    const rotatedVertex1 = offsets ? rotate(offsets.vertex1, angleDeg) : { x: 0, y: 0 }
    const rotatedVertex2 = offsets ? rotate(offsets.vertex2, angleDeg) : { x: 0, y: 0 }

    const piece: ParsedPiece = {
      pieceId: `p${segmentIndex}`,
      pieceClass,
      x,
      y,
      angleDeg,
      colorIndex,
      vertex1: { x: x + rotatedVertex1.x, y: y + rotatedVertex1.y },
      vertex2: { x: x + rotatedVertex2.x, y: y + rotatedVertex2.y },
      isSupported: offsets !== undefined,
    }

    // REQ-F-021 — 좌표 가산은 FEAT-006이 한다
    if (compat && pieceClass === 'Cor1' && COMPAT_CORRECTION_ANGLES.has(angleDeg)) {
      piece.compatCorrectionApplied = true
    }

    pieces.push(piece)
  })

  if (failures.length > 0) return { ok: false, reason: 'malformed-segment', failures }
  if (pieces.length === 0) return { ok: false, reason: 'empty-track' }

  return { ok: true, pieces }
}
