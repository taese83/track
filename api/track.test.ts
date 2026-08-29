import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RawTrackResponse, ResponseErrorType } from '../src/entities/track/model/types.js'
import { handleTrackRequest } from './track.js'

const asError = (body: unknown) => body as ResponseErrorType
const asData = (body: unknown) => (body as { data: RawTrackResponse }).data

describe('handleTrackRequest — fixture 업스트림', () => {
  beforeEach(() => {
    process.env.TRACK_UPSTREAM = 'fixtures'
  })

  it('정형 공유 URL이면 200과 원문·compat을 그대로 돌려준다 (TC-001-1)', async () => {
    const result = await handleTrackRequest('https://mini4wd-track-editor.pimentoso.com/view/WS67Y2')

    expect(result.status).toBe(200)
    expect(result.headers['cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')

    const data = asData(result.body)
    expect(data.trackCode).toBe('WS67Y2')
    expect(data.compat).toBe(false)
    expect(data.rawData.split('#').filter(Boolean)).toHaveLength(132)
    expect(Number.isNaN(Date.parse(data.fetchedAt))).toBe(false)
  })

  it.each([
    ['형식이 어긋난 URL', 'https://example.com/view/WS67Y2'],
    ['코드 없는 경로', 'https://mini4wd-track-editor.pimentoso.com/view/'],
    ['빈 입력', ''],
  ])('%s는 400 INVALID_INPUT_FORMAT이다 (TC-001-2)', async (_label, input) => {
    const result = await handleTrackRequest(input)

    expect(result.status).toBe(400)
    expect(asError(result.body).code).toBe('INVALID_INPUT_FORMAT')
  })

  it('url 파라미터 자체가 없으면 400이다', async () => {
    expect(asError((await handleTrackRequest(null)).body).code).toBe('INVALID_INPUT_FORMAT')
  })

  it('존재하지 않는 코드는 404 TRACK_NOT_FOUND다 (TC-001-3)', async () => {
    const result = await handleTrackRequest('ZZZZZZ')

    expect(result.status).toBe(404)
    expect(asError(result.body).code).toBe('TRACK_NOT_FOUND')
  })

  it('업스트림 비-2xx는 502 UPSTREAM_FETCH_FAILED다 (TC-001-5)', async () => {
    const result = await handleTrackRequest('SRVERR')

    expect(result.status).toBe(502)
    expect(asError(result.body).code).toBe('UPSTREAM_FETCH_FAILED')
  })

  it('업스트림 지연은 504 UPSTREAM_TIMEOUT이다 (TC-001-5)', async () => {
    const result = await handleTrackRequest('TIMEOUT')

    expect(result.status).toBe(504)
    expect(asError(result.body).code).toBe('UPSTREAM_TIMEOUT')
  })

  it('JS 래퍼가 깨지면 502 UPSTREAM_RESPONSE_UNRECOGNIZED로 구분한다', async () => {
    const result = await handleTrackRequest('BADJS')

    expect(result.status).toBe(502)
    expect(asError(result.body).code).toBe('UPSTREAM_RESPONSE_UNRECOGNIZED')
  })

  it('모든 에러 응답은 캐시 금지다', async () => {
    for (const input of ['bad input', 'ZZZZZZ', 'SRVERR', 'TIMEOUT', 'BADJS']) {
      const result = await handleTrackRequest(input)
      expect(result.headers['cache-control']).toBe('no-store')
    }
  })

  it.each(['OPENLOOP', 'NOSTART', 'UNSUPP', 'LARGE1', 'PARSEFAIL'])(
    '내용이 어긋난 %s도 API 계층에서는 200이다 — 서버는 rawData를 검증하지 않는다',
    async (code) => {
      const result = await handleTrackRequest(code)

      expect(result.status).toBe(200)
      expect(asData(result.body).rawData.length).toBeGreaterThan(0)
    },
  )

  it('compat=true 트랙의 플래그를 보정 없이 그대로 전달한다', async () => {
    const result = await handleTrackRequest('COMPAT1')

    expect(asData(result.body).compat).toBe(true)
    // 서버가 좌표를 손대지 않았음을 원문 대조로 확인한다
    const normal = await handleTrackRequest('WS67Y2')
    expect(asData(result.body).rawData).toBe(asData(normal.body).rawData)
  })
})

describe('handleTrackRequest — 업스트림 호출 계약', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    process.env.TRACK_UPSTREAM = 'live'
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.TRACK_UPSTREAM = 'fixtures'
  })

  it('사용자가 준 URL을 그대로 부르지 않고 코드로 고정 URL을 조립한다', async () => {
    fetchSpy.mockResolvedValue(
      new Response("var compat = false;\nvar text = 'Str1;0;0;0;0';", { status: 200 }),
    )

    await handleTrackRequest('https://mini4wd-track-editor.pimentoso.com/view/WS67Y2?next=//evil.test')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mini4wd-track-editor.pimentoso.com/load/WS67Y2.js')
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('XMLHttpRequest')
    expect(init.redirect).toBe('error')
  })

  it('형식이 어긋난 입력에서는 업스트림 fetch가 아예 발생하지 않는다', async () => {
    await handleTrackRequest('https://evil.test/view/WS67Y2')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('업스트림이 실패해도 재시도하지 않는다 — 요청당 정확히 1회 (REQ-F-019 a)', async () => {
    fetchSpy.mockResolvedValue(new Response('nope', { status: 503 }))

    const result = await handleTrackRequest('WS67Y2')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(asError(result.body).code).toBe('UPSTREAM_FETCH_FAILED')
  })

  it('업스트림 404는 TRACK_NOT_FOUND로, 그 외 비-2xx는 UPSTREAM_FETCH_FAILED로 나눈다', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }))
    expect(asError((await handleTrackRequest('WS67Y2')).body).code).toBe('TRACK_NOT_FOUND')

    fetchSpy.mockResolvedValue(new Response('', { status: 422 }))
    expect(asError((await handleTrackRequest('WS67Y2')).body).code).toBe('UPSTREAM_FETCH_FAILED')
  })

  it('네트워크 예외는 UPSTREAM_FETCH_FAILED, abort는 UPSTREAM_TIMEOUT이다', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network down'))
    expect(asError((await handleTrackRequest('WS67Y2')).body).code).toBe('UPSTREAM_FETCH_FAILED')

    const abort = new Error('aborted')
    abort.name = 'AbortError'
    fetchSpy.mockRejectedValue(abort)
    expect(asError((await handleTrackRequest('WS67Y2')).body).code).toBe('UPSTREAM_TIMEOUT')
  })

  it('User-Agent에 개인 연락처를 하드코딩하지 않는다 — 주입이 없으면 저장소 URL만 보낸다', async () => {
    delete process.env.TRACK_CONTACT
    fetchSpy.mockResolvedValue(
      new Response("var compat = false;\nvar text = 'Str1;0;0;0;0';", { status: 200 }),
    )

    await handleTrackRequest('WS67Y2')

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const ua = (init.headers as Record<string, string>)['User-Agent'] ?? ''
    expect(ua).toContain('mini4wd-track-3d/1.0')
    expect(ua).not.toContain('contact:')
    expect(ua).not.toContain('@')
  })
})
