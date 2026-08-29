import { describe, expect, it } from 'vitest'

import { extractCode, isRawTrackResponse, isTrackCode } from './schema'

describe('isTrackCode', () => {
  it.each(['WS67Y2', 'ABCD', 'A1B2C3D4E5'])('대문자 영숫자 4~10자를 통과시킨다: %s', (code) => {
    expect(isTrackCode(code)).toBe(true)
  })

  it.each(['abc', 'ws67y2', 'ABC', 'A1B2C3D4E5F', 'WS-67Y', 'WS 67Y2', ''])(
    '규격 밖은 거부한다: %s',
    (code) => {
      expect(isTrackCode(code)).toBe(false)
    },
  )
})

describe('extractCode', () => {
  it('정형 공유 URL에서 코드를 뽑는다', () => {
    expect(extractCode('https://mini4wd-track-editor.pimentoso.com/view/WS67Y2')).toBe('WS67Y2')
  })

  it('소문자 코드도 대문자로 정규화한다', () => {
    expect(extractCode('https://mini4wd-track-editor.pimentoso.com/view/ws67y2')).toBe('WS67Y2')
    expect(extractCode('ws67y2')).toBe('WS67Y2')
  })

  it('코드만 넣은 편의 입력을 허용한다', () => {
    expect(extractCode('  WS67Y2  ')).toBe('WS67Y2')
  })

  it.each([
    ['다른 호스트', 'https://example.com/view/WS67Y2'],
    ['유사 서브도메인', 'https://evil.mini4wd-track-editor.pimentoso.com/view/WS67Y2'],
    ['호스트 접미사 위장', 'https://mini4wd-track-editor.pimentoso.com.evil.test/view/WS67Y2'],
    ['자격증명 삽입', 'https://mini4wd-track-editor.pimentoso.com@evil.test/view/WS67Y2'],
  ])('allowlist 밖 host는 거부한다 — %s', (_label, input) => {
    expect(extractCode(input)).toBeNull()
  })

  it.each([
    ['빈 문자열', ''],
    ['공백', '   '],
    ['코드 없는 경로', 'https://mini4wd-track-editor.pimentoso.com/view/'],
    ['view 컨테이너가 없는 경로', 'https://mini4wd-track-editor.pimentoso.com/WS67Y2'],
    ['다른 컨테이너 경로', 'https://mini4wd-track-editor.pimentoso.com/edit/WS67Y2'],
    ['루트 경로', 'https://mini4wd-track-editor.pimentoso.com/'],
    ['규격 밖 코드', 'https://mini4wd-track-editor.pimentoso.com/view/WS-67Y2'],
    ['URL이 아닌 문자열', 'not a url at all'],
  ])('형식이 어긋나면 null이다 — %s', (_label, input) => {
    expect(extractCode(input)).toBeNull()
  })
})

describe('isRawTrackResponse', () => {
  const valid = {
    trackCode: 'WS67Y2',
    rawData: 'Str1;0;0;0;0',
    fetchedAt: '2026-08-30T01:02:03.456Z',
    compat: false,
  }

  it('정상 응답을 통과시킨다', () => {
    expect(isRawTrackResponse(valid)).toBe(true)
    expect(isRawTrackResponse({ ...valid, fetchedAt: '2026-08-30T01:02:03+09:00' })).toBe(true)
  })

  it.each([
    ['null', null],
    ['문자열', 'nope'],
    ['빈 rawData', { ...valid, rawData: '' }],
    ['규격 밖 trackCode', { ...valid, trackCode: 'ws' }],
    ['오프셋 없는 시각', { ...valid, fetchedAt: '2026-08-30T01:02:03' }],
    ['compat 타입 불일치', { ...valid, compat: 'false' }],
  ])('어긋난 응답을 거부한다 — %s', (_label, input) => {
    expect(isRawTrackResponse(input)).toBe(false)
  })

  it('공시된 간극: 형식만 보므로 값이 성립하지 않는 시각도 통과한다', () => {
    expect(isRawTrackResponse({ ...valid, fetchedAt: '2026-13-45T99:99:99Z' })).toBe(true)
  })
})
