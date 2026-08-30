import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import type { ParsedPiece } from '../../model/types'
import { parseTrackString } from './parse-track-string'

async function loadFixture(name: string): Promise<{ text: string; compat: boolean }> {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', `${name}.js.txt`), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`fixture ${name} 추출 실패: ${extracted.reason}`)
  return { text: extracted.text, compat: extracted.compat }
}

async function parseFixture(name: string): Promise<ParsedPiece[]> {
  const { text, compat } = await loadFixture(name)
  const result = parseTrackString(text, compat)
  if (!result.ok) throw new Error(`fixture ${name} 파싱 실패: ${result.reason}`)
  return result.pieces
}

function countByClass(pieces: ParsedPiece[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const piece of pieces) counts[piece.pieceClass] = (counts[piece.pieceClass] ?? 0) + 1
  return counts
}

describe('parseTrackString — 성공 경로 (TC-002-1)', () => {
  it('TC-002-1: WS67Y2 실측 원문에서 132피스를 낸다', async () => {
    const pieces = await parseFixture('WS67Y2')

    expect(pieces).toHaveLength(132)
  })

  it('TC-002-1: 모든 피스가 5필드와 끝점을 갖는다', async () => {
    const pieces = await parseFixture('WS67Y2')

    for (const piece of pieces) {
      expect(typeof piece.pieceClass).toBe('string')
      expect(piece.pieceClass.length).toBeGreaterThan(0)
      expect(Number.isFinite(piece.x)).toBe(true)
      expect(Number.isFinite(piece.y)).toBe(true)
      expect(Number.isFinite(piece.angleDeg)).toBe(true)
      expect(Number.isFinite(piece.colorIndex)).toBe(true)
      expect(Number.isFinite(piece.vertex1.x)).toBe(true)
      expect(Number.isFinite(piece.vertex1.y)).toBe(true)
      expect(Number.isFinite(piece.vertex2.x)).toBe(true)
      expect(Number.isFinite(piece.vertex2.y)).toBe(true)
    }
  })

  it('TC-002-1: 클래스 분포를 고정한다', async () => {
    const pieces = await parseFixture('WS67Y2')

    expect(countByClass(pieces)).toEqual({
      Cor1: 64,
      Str1: 50,
      Bri1: 10,
      Ban1: 4,
      Chi1: 2,
      Lan1: 1,
      Str2: 1,
    })
  })

  it('TC-002-1: pieceId는 132개 안에서 유일하다', async () => {
    const pieces = await parseFixture('WS67Y2')

    expect(new Set(pieces.map((piece) => piece.pieceId)).size).toBe(132)
  })

  it('말미 #로 생긴 빈 세그먼트 1개는 관대하게 무시한다', async () => {
    const { text } = await loadFixture('WS67Y2')

    expect(text.endsWith('#')).toBe(true)
    expect(text.split('#')).toHaveLength(133)
  })
})

describe('parseTrackString — 끝점 회전·이동', () => {
  it('angle 0이면 카탈로그 오프셋이 position에 그대로 더해진다', () => {
    const result = parseTrackString('Str1;199.039;680.984;0;0', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const piece = result.pieces[0]
    expect(piece?.vertex1.x).toBeCloseTo(172.039, 3)
    expect(piece?.vertex1.y).toBeCloseTo(680.984, 3)
    expect(piece?.vertex2.x).toBeCloseTo(226.039, 3)
    expect(piece?.vertex2.y).toBeCloseTo(680.984, 3)
  })

  it('angle 90이면 오프셋이 원점 기준으로 회전한 뒤 position이 더해진다', () => {
    const result = parseTrackString('Str1;100;200;90;0', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const piece = result.pieces[0]
    expect(piece?.vertex1.x).toBeCloseTo(100, 6)
    expect(piece?.vertex1.y).toBeCloseTo(173, 6)
    expect(piece?.vertex2.x).toBeCloseTo(100, 6)
    expect(piece?.vertex2.y).toBeCloseTo(227, 6)
  })

  it('비대칭 오프셋(Cor1)도 회전 공식을 그대로 따른다', () => {
    const result = parseTrackString('Cor1;0;0;45;0', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const piece = result.pieces[0]
    expect(piece?.vertex1.x).toBeCloseTo(-12.727922, 5)
    expect(piece?.vertex1.y).toBeCloseTo(-24.041631, 5)
    expect(piece?.vertex2.x).toBeCloseTo(3.11127, 5)
    expect(piece?.vertex2.y).toBeCloseTo(14.142136, 5)
  })

  it('실측 원문의 첫 피스(Cor1;121.111;641.142;225;0) 끝점을 고정한다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const first = pieces[0]

    expect(first?.pieceClass).toBe('Cor1')
    expect(first?.angleDeg).toBe(225)
    expect(first?.vertex1.x).toBeCloseTo(133.838922, 3)
    expect(first?.vertex1.y).toBeCloseTo(665.183631, 3)
    expect(first?.vertex2.x).toBeCloseTo(117.99973, 3)
    expect(first?.vertex2.y).toBeCloseTo(626.999864, 3)
  })

  it('실측 원문의 angle 90 직선도 회전 결과를 갖는다', async () => {
    const pieces = await parseFixture('WS67Y2')
    const rotated = pieces.find((piece) => piece.pieceClass === 'Str1' && piece.angleDeg === 90)

    expect(rotated).toBeDefined()
    if (!rotated) return
    expect(rotated.vertex1.x).toBeCloseTo(rotated.x, 6)
    expect(rotated.vertex1.y).toBeCloseTo(rotated.y - 27, 6)
    expect(rotated.vertex2.x).toBeCloseTo(rotated.x, 6)
    expect(rotated.vertex2.y).toBeCloseTo(rotated.y + 27, 6)
  })
})

describe('parseTrackString — 실패 계약 (TC-002-2, TC-002-3)', () => {
  it('TC-002-2: PARSEFAIL은 실패하고 사유에 세그먼트 위치가 담긴다', async () => {
    const { text, compat } = await loadFixture('PARSEFAIL')
    const result = parseTrackString(text, compat)

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'malformed-segment') {
      throw new Error('malformed-segment 실패를 기대했다')
    }
    expect(result.failures.length).toBeGreaterThanOrEqual(2)
    expect(
      result.failures.some((f) => f.segmentIndex === 30 && f.reason === 'non-finite-number'),
    ).toBe(true)
    expect(result.failures.some((f) => f.reason === 'field-count-mismatch')).toBe(true)
    expect(result.failures[result.failures.length - 1]?.segmentIndex).toBe(
      text.split('#').length - 1,
    )
  })

  it('TC-002-2: 실패 객체가 원문 전체를 복사해 담지 않는다', async () => {
    const { text, compat } = await loadFixture('PARSEFAIL')
    const result = parseTrackString(text, compat)

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'malformed-segment') return
    for (const failure of result.failures) {
      expect(failure.detail.length).toBeLessThan(80)
      expect(failure.detail).not.toContain(';')
    }
  })

  it.each([
    ['빈 문자열', ''],
    ['#만 있는 입력', '#'],
    ['##만 있는 입력', '##'],
    ['공백만 있는 입력', '   '],
  ])('TC-002-3: 피스가 없는 입력은 실패한다 — %s', (_label, raw) => {
    expect(parseTrackString(raw, false).ok).toBe(false)
  })

  it.each([
    ['필드가 모자란 세그먼트', 'Cor1;62'],
    ['필드가 남는 세그먼트', 'Str1;0;0;0;0;0'],
    ['클래스가 빈 세그먼트', ';0;0;0;0'],
    ['x가 빈 문자열', 'Str1;;0;0;0'],
    ['y가 NaN 문자열', 'Str1;0;NaN;0;0'],
    ['각도가 공백', 'Str1;0;0; ;0'],
    ['색이 수가 아님', 'Str1;0;0;0;red'],
  ])('TC-002-3: 세그먼트가 어긋나면 실패한다 — %s', (_label, raw) => {
    expect(parseTrackString(raw, false).ok).toBe(false)
  })

  it('TC-002-3: 중간 빈 세그먼트는 말미와 달리 실패다', () => {
    const result = parseTrackString('Str1;0;0;0;0##Str1;1;1;0;0', false)

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'malformed-segment') return
    expect(result.failures).toEqual([
      { segmentIndex: 1, reason: 'empty-segment', detail: expect.any(String) },
    ])
  })

  it('말미 # 하나는 실패가 아니다', () => {
    const result = parseTrackString('Str1;0;0;0;0#', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces).toHaveLength(1)
  })

  it('START(Str2) 부재는 파싱 실패가 아니다 — FEAT-003의 판정이다', async () => {
    const pieces = await parseFixture('NOSTART')

    expect(pieces).toHaveLength(131)
    expect(pieces.some((piece) => piece.pieceClass === 'Str2')).toBe(false)
  })

  it('카탈로그가 임의 각도를 지원하므로 8배수 밖 각도도 통과한다', () => {
    const result = parseTrackString('Str1;0;0;37.5;0', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces[0]?.angleDeg).toBe(37.5)
  })
})

describe('parseTrackString — compat 보정 메타데이터 (TC-002-4, TC-002-5)', () => {
  it('TC-002-4: compat=false면 어떤 피스에도 부여하지 않는다', async () => {
    const pieces = await parseFixture('WS67Y2')

    expect(pieces.some((piece) => 'compatCorrectionApplied' in piece)).toBe(false)
  })

  it('TC-002-5: compat=true면 45/135/225/315°의 Cor1 32개에만 부여한다', async () => {
    const { text, compat } = await loadFixture('COMPAT1')
    const result = parseTrackString(text, compat)

    expect(compat).toBe(true)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces).toHaveLength(132)

    const corrected = result.pieces.filter((piece) => piece.compatCorrectionApplied === true)
    expect(corrected).toHaveLength(32)
    for (const piece of corrected) {
      expect(piece.pieceClass).toBe('Cor1')
      expect([45, 135, 225, 315]).toContain(piece.angleDeg)
    }
  })

  it('TC-002-5: compat=true여도 조건 밖 피스에는 부여하지 않는다', async () => {
    const { text, compat } = await loadFixture('COMPAT1')
    const result = parseTrackString(text, compat)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const untouched = result.pieces.filter((piece) => !('compatCorrectionApplied' in piece))
    expect(untouched).toHaveLength(100)
    for (const piece of untouched) {
      expect(piece.pieceClass === 'Cor1' && [45, 135, 225, 315].includes(piece.angleDeg)).toBe(false)
    }
  })

  it('TC-002-5: 각도가 맞아도 Cor1이 아니면 부여하지 않는다', () => {
    const result = parseTrackString('Cor2;0;0;45;0#Str1;0;0;45;0#Cor1;0;0;90;0', true)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces.some((piece) => 'compatCorrectionApplied' in piece)).toBe(false)
  })
})

describe('parseTrackString — 미지원 클래스 (FEAT-009 판정 근거)', () => {
  it('카탈로그 밖 클래스는 실패가 아니라 isSupported=false다', async () => {
    const pieces = await parseFixture('UNSUPP')

    expect(pieces).toHaveLength(134)
    const unsupported = pieces.filter((piece) => !piece.isSupported)
    expect(unsupported.map((piece) => piece.pieceClass)).toEqual(['Xyz9', 'Wob2'])
  })

  it('미지원 피스는 끝점을 지어내지 않고 position에 둔다', async () => {
    const pieces = await parseFixture('UNSUPP')
    const unsupported = pieces.filter((piece) => !piece.isSupported)

    for (const piece of unsupported) {
      expect(piece.vertex1).toEqual({ x: piece.x, y: piece.y })
      expect(piece.vertex2).toEqual({ x: piece.x, y: piece.y })
    }
  })

  it('카탈로그 23종은 전부 isSupported=true다', () => {
    const classes = [
      'Str1', 'Str2', 'Str3', 'Str4', 'Str5', 'Str6',
      'Cor1', 'Cor2', 'Cor3', 'Cor4', 'Cor5',
      'Ban1', 'Ban2',
      'Bri1', 'Bri2', 'Bri3', 'Bri4',
      'Lan1', 'Lan2', 'Lan3', 'Lan4',
      'Chi1', 'Chi2',
    ]
    const result = parseTrackString(classes.map((c) => `${c};0;0;0;0`).join('#'), false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces).toHaveLength(23)
    expect(result.pieces.every((piece) => piece.isSupported)).toBe(true)
  })

  it('Object.prototype 이름을 클래스로 넣어도 지원 판정이 새지 않는다', () => {
    const result = parseTrackString('constructor;0;0;0;0#toString;1;1;0;0', false)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pieces.every((piece) => !piece.isSupported)).toBe(true)
  })
})
