// FEAT-015 순수 축 — 세 채널이 **각각 독립적으로** 유형·방향을 말하는가.
//
// REQ-NFR-003의 요구는 "어느 하나를 제거해도 남은 둘로 판별 가능"이다(TC-015-2). 그것은
// 화면을 보고는 확인할 수 없다 — 채널별 산출을 직접 비교해야 한다.
import { describe, expect, it } from 'vitest'

import {
  directionOf,
  encodeSegment,
  hasDashedOutline,
  isLabelled,
  kindOf,
  markerShapeOf,
  segmentTextOf,
} from './segment-encoding'
import type { SegmentKind } from './segment-encoding'

const KINDS: SegmentKind[] = ['slope', 'bank', 'wave', 'lane-change', 'marker', 'plain']

describe('유형 판별 — 클래스 접두사, 마커는 색까지 본다', () => {
  it('접두사로 네 유형을 가른다', () => {
    expect(kindOf('Bri1', 3)).toBe('slope')
    expect(kindOf('Ban1', 2)).toBe('bank')
    expect(kindOf('Chi1', 0)).toBe('wave')
    expect(kindOf('Lan1', 0)).toBe('lane-change')
    expect(kindOf('Cor1', 0)).toBe('plain')
  })

  it('D-014 N-002 — `Str1 c=5`는 마커 직선이지 슬로프가 아니다', () => {
    expect(kindOf('Str1', 5)).toBe('marker')
    expect(kindOf('Str1', 6)).toBe('plain')
  })
})

describe('D-014 — 방향은 고도 변화 피스에서만 의미가 있다', () => {
  it('c=3은 상승, c=2는 하강이다', () => {
    expect(directionOf('Bri1', 3)).toBe('rise')
    expect(directionOf('Bri1', 2)).toBe('fall')
    expect(directionOf('Ban1', 3)).toBe('rise')
    expect(directionOf('Ban1', 2)).toBe('fall')
  })

  it('고도와 무관한 피스의 팔레트 인덱스를 방향으로 읽지 않는다', () => {
    // `Str1.c6`은 주황이고 `Bri1.c0`은 청록이다 — 둘 다 고도와 무관하다
    expect(directionOf('Str1', 3)).toBe('none')
    expect(directionOf('Cor1', 2)).toBe('none')
    expect(directionOf('Bri1', 0)).toBe('none')
    expect(directionOf('Chi1', 3)).toBe('none')
  })
})

describe('TC-015-1 — 뱅크와 슬로프가 색 외에 형태로도 구분된다', () => {
  it('같은 방향이어도 형태가 다르다', () => {
    const slope = encodeSegment('Bri1', 3)
    const bank = encodeSegment('Ban1', 3)
    expect(slope.direction).toBe(bank.direction)
    // 방향이 같아 색이 같아도 형태가 갈려야 한다 — 이것이 이 TC의 전부다
    expect(slope.shape).not.toBe(bank.shape)
    expect(bank.shape).toBe('diamond')
  })

  it('뱅크는 방향과 무관하게 마름모다 — 화살표로 그리면 슬로프와 겹친다', () => {
    expect(markerShapeOf('bank', 'rise')).toBe('diamond')
    expect(markerShapeOf('bank', 'fall')).toBe('diamond')
  })

  it('뱅크만 윤곽이 파선이다', () => {
    expect(hasDashedOutline('bank')).toBe(true)
    for (const kind of KINDS.filter((value) => value !== 'bank')) {
      expect(hasDashedOutline(kind)).toBe(false)
    }
  })
})

describe('TC-015-2 — 어느 한 채널을 지워도 남은 둘로 판별된다', () => {
  const samples = [
    ['Bri1', 3],
    ['Bri1', 2],
    ['Ban1', 3],
    ['Ban1', 2],
    ['Chi1', 0],
    ['Lan1', 0],
    ['Str1', 5],
  ] as const

  it('형태 채널만으로 유형이 갈린다(색·텍스트 제거)', () => {
    const shapes = new Map<string, string>()
    for (const [pieceClass, colorIndex] of samples) {
      const encoding = encodeSegment(pieceClass, colorIndex)
      if (encoding.kind === 'slope') continue // 슬로프는 방향까지 형태에 실린다 — 아래에서 따로 본다
      const previous = shapes.get(encoding.shape)
      expect(previous ?? encoding.kind).toBe(encoding.kind)
      shapes.set(encoding.shape, encoding.kind)
    }
    // 유형마다 서로 다른 표식이어야 한다
    expect(new Set(shapes.keys()).size).toBe(shapes.size)
  })

  it('텍스트 채널만으로 유형과 방향이 갈린다(색·형태 제거)', () => {
    const texts = samples.map(([pieceClass, colorIndex]) =>
      encodeSegment(pieceClass, colorIndex).text,
    )
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts).toContain('뱅크(상승)')
    expect(texts).toContain('뱅크(하강)')
    expect(texts).toContain('슬로프(하강)')
  })

  it('방향이 있는 유형은 세 채널이 모두 방향을 말한다', () => {
    const fall = encodeSegment('Bri1', 2)
    expect(fall.direction).toBe('fall')
    expect(fall.shape).toBe('arrow-down')
    expect(fall.text).toContain('하강')
  })

  it('평지는 라벨을 달지 않는다 — 132개에 "평지"를 붙이면 화면이 글자로 덮인다', () => {
    expect(isLabelled('plain')).toBe(false)
    for (const kind of KINDS.filter((value) => value !== 'plain')) {
      expect(isLabelled(kind)).toBe(true)
    }
  })
})

describe('TC-015-4 — 선언과 기하의 불일치를 지우지 않는다', () => {
  it('하강색 뱅크는 형태·텍스트가 선언 방향(하강)을 그대로 말한다', () => {
    const encoding = encodeSegment('Ban1', 2)
    expect(encoding.direction).toBe('fall')
    expect(encoding.text).toBe('뱅크(하강)')
    // D-045 — 기하는 위로 솟는다. 그래도 문구를 "상승"으로 고치지 않는다
    expect(encoding.text).not.toContain('상승')
  })

  it('텍스트가 유형과 방향을 함께 말한다', () => {
    expect(segmentTextOf('bank', 'fall')).toBe('뱅크(하강)')
    expect(segmentTextOf('wave', 'none')).toBe('웨이브')
  })
})
