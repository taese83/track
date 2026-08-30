import { describe, expect, it } from 'vitest'

import type { ParsedPiece } from '../../model/types'
import { buildPiecePath } from './piece-path'

function piece(overrides: Partial<ParsedPiece>): ParsedPiece {
  return {
    pieceId: 'p0',
    pieceClass: 'Str1',
    x: 0,
    y: 0,
    angleDeg: 0,
    colorIndex: 0,
    vertex1: { x: 0, y: 0 },
    vertex2: { x: 54, y: 0 },
    isSupported: true,
    ...overrides,
  }
}

describe('buildPiecePath', () => {
  it('직선은 두 끝점을 잇고 길이가 현과 같다', () => {
    const path = buildPiecePath({ piece: piece({}), flipped: false })

    expect(path.length).toBeCloseTo(54, 9)
    expect(path.pointAt(0)).toEqual({ x: 0, y: 0 })
    expect(path.pointAt(0.5).x).toBeCloseTo(27, 9)
    expect(path.pointAt(1).x).toBeCloseTo(54, 9)
  })

  // 코너를 현으로 다루면 판축 거리가 틀어져 기운 평면 위의 높이가 어긋난다
  it('코너는 원호로 복원되어 현보다 길다', () => {
    const corner = piece({ pieceClass: 'Cor3', vertex1: { x: 0, y: 0 }, vertex2: { x: 60, y: 60 } })
    const path = buildPiecePath({ piece: corner, flipped: false })
    const chord = Math.hypot(60, 60)

    // R = chord / (2 sin(45°)) = chord/√2, 호 길이 = R · 90° = chord·π/(2√2)
    expect(path.length).toBeCloseTo((chord * Math.PI) / (2 * Math.SQRT2), 6)
    expect(path.length).toBeGreaterThan(chord)
  })

  it('원호의 가운데는 현에서 벗어난다', () => {
    const corner = piece({ pieceClass: 'Cor3', vertex1: { x: 0, y: 0 }, vertex2: { x: 60, y: 60 } })
    const mid = buildPiecePath({ piece: corner, flipped: false }).pointAt(0.5)

    expect(Math.hypot(mid.x - 30, mid.y - 30)).toBeGreaterThan(1)
  })

  // 끝점을 맞바꿔 만들면 원호 중심이 현 반대편으로 넘어가 코너가 거울상이 된다(PC-009)
  it('뒤집힌 주행은 형상을 그대로 두고 매개변수만 뒤집는다', () => {
    const corner = piece({ pieceClass: 'Cor3', vertex1: { x: 0, y: 0 }, vertex2: { x: 60, y: 60 } })
    const forward = buildPiecePath({ piece: corner, flipped: false })
    const backward = buildPiecePath({ piece: corner, flipped: true })

    expect(backward.pointAt(0)).toEqual(forward.pointAt(1))
    expect(backward.pointAt(1)).toEqual(forward.pointAt(0))
    expect(backward.pointAt(0.25).x).toBeCloseTo(forward.pointAt(0.75).x, 9)
    expect(backward.pointAt(0.25).y).toBeCloseTo(forward.pointAt(0.75).y, 9)
    expect(backward.length).toBeCloseTo(forward.length, 9)
  })

  it('카탈로그에 없는 선회각이면 직선으로 다룬다', () => {
    const unknown = piece({ pieceClass: 'Xyz9' })

    expect(buildPiecePath({ piece: unknown, flipped: false }).length).toBeCloseTo(54, 9)
  })
})
