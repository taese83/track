import { describe, expect, it } from 'vitest'

import type { ParsedPiece } from '../../model/types'
import { computePieceElevationDelta, worstGrade } from './piece-elevation'

function piece(overrides: Partial<ParsedPiece>): ParsedPiece {
  return {
    pieceId: 'p0',
    pieceClass: 'Str1',
    x: 0,
    y: 0,
    angleDeg: 0,
    colorIndex: 0,
    vertex1: { x: -27, y: 0 },
    vertex2: { x: 27, y: 0 },
    isSupported: true,
    ...overrides,
  }
}

describe('computePieceElevationDelta', () => {
  // D-042가 실측 기록한 "슬로프 20°에서 피스당 18.47cm"와 대조한다.
  // 이 숫자가 어긋나면 현 규칙 구현이 문서와 갈라진 것이다.
  it('Bri1 상승(c=3)은 현 54px × sin20° = 18.47을 낸다', () => {
    const delta = computePieceElevationDelta(piece({ pieceClass: 'Bri1', colorIndex: 3 }))
    expect(delta.value).toBeCloseTo(18.47, 2)
    expect(delta.contributes).toBe(true)
  })

  it('Bri1 하강(c=2)은 같은 크기의 음수를 낸다', () => {
    const rise = computePieceElevationDelta(piece({ pieceClass: 'Bri1', colorIndex: 3 }))
    const fall = computePieceElevationDelta(piece({ pieceClass: 'Bri1', colorIndex: 2 }))
    expect(fall.value).toBeCloseTo(-rise.value, 10)
  })

  it('Ban1은 현 28px × sin20° = 9.58을 내고 등급이 measured다 (타미야 공식 20°)', () => {
    const delta = computePieceElevationDelta(
      piece({
        pieceClass: 'Ban1',
        colorIndex: 3,
        vertex1: { x: -14, y: 0 },
        vertex2: { x: 14, y: 0 },
      }),
    )
    expect(delta.value).toBeCloseTo(9.58, 2)
    expect(delta.grade).toBe('measured')
  })

  it('슬로프 각도는 사용자 지정 렌더 규칙이라 confirmed다 (D-042)', () => {
    expect(computePieceElevationDelta(piece({ pieceClass: 'Bri1', colorIndex: 3 })).grade).toBe(
      'confirmed',
    )
  })

  // c는 방향 플래그가 아니라 팔레트 인덱스다 — 고도 변화 피스가 아니면 색으로 방향을 읽으면 안 된다
  it('Str1의 마커색(c=5)은 고도를 바꾸지 않는다 (REQ-F-020)', () => {
    const delta = computePieceElevationDelta(piece({ pieceClass: 'Str1', colorIndex: 5 }))
    expect(delta.value).toBe(0)
    expect(delta.contributes).toBe(false)
  })

  it('Bri 계열이어도 상승·하강 팔레트(c=3/2)가 아니면 고도를 바꾸지 않는다', () => {
    expect(computePieceElevationDelta(piece({ pieceClass: 'Bri1', colorIndex: 0 })).value).toBe(0)
  })

  it('미지원 피스는 끝점을 신뢰할 수 없어 고도에 기여하지 않는다', () => {
    const delta = computePieceElevationDelta(
      piece({ pieceClass: 'Xyz9', colorIndex: 3, isSupported: false }),
    )
    expect(delta.contributes).toBe(false)
  })
})

describe('worstGrade', () => {
  it('가장 나쁜 등급이 대표한다', () => {
    expect(worstGrade(['measured', 'confirmed'])).toBe('confirmed')
    expect(worstGrade(['confirmed', 'unknown', 'measured'])).toBe('unknown')
  })

  it('기여한 근거가 없으면 measured다 — 0은 카탈로그가 보증하는 사실이다', () => {
    expect(worstGrade([])).toBe('measured')
  })
})
