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

  // 회귀(2026-08-30 사용자 보고): FTSBH1은 업스트림에 **실재한다**(실측 GET /load/FTSBH1.js
  // → 200 · 3343B). 그런데 fixture 모드가 녹화본 부재를 404 "존재하지 않는 코드"로 접어
  // 화면이 "코드가 맞는지 확인해 주세요"라고 말했다. fixture 모드는 편집기를 호출하지
  // 않으므로(api-schema §9) 존재 여부를 알 수 없다 — 아는 것만 말해야 한다.
  it('녹화본이 없는 코드는 404가 아니라 501 FIXTURE_NOT_RECORDED다', async () => {
    const result = await handleTrackRequest('https://mini4wd-track-editor.pimentoso.com/view/FTSBH1')

    expect(result.status).toBe(501)
    const error = asError(result.body)
    expect(error.code).toBe('FIXTURE_NOT_RECORDED')
    // 묻지 않았다는 사실이 메시지에 남아야 한다 — 로그만 보는 사람도 오해하지 않도록
    expect(error.message).toContain('upstream was not contacted')
    // 존재를 부정하지 않는다
    expect(error.message).not.toContain('does not exist')
  })

  it('예약 코드 ZZZZZZ만 "존재하지 않음"을 뜻한다 — 두 판정이 갈린다', async () => {
    const missing = asError((await handleTrackRequest('ZZZZZZ')).body)
    const unrecorded = asError((await handleTrackRequest('FTSBH1')).body)

    expect(missing.code).not.toBe(unrecorded.code)
    // 둘 다 캐시되지 않는다(api-schema §7 — 에러 응답 캐시 금지)
    for (const input of ['ZZZZZZ', 'FTSBH1']) {
      expect((await handleTrackRequest(input)).headers['cache-control']).toBe('no-store')
    }
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

describe('handleTrackRequest — auto 모드 (TRACK_UPSTREAM 미지정, TC-001-9)', () => {
  const fetchSpy = vi.fn()
  const OK_RESPONSE = () => new Response("var compat = false;\nvar text = 'Str1;0;0;0;0';", { status: 200 })

  beforeEach(() => {
    delete process.env.TRACK_UPSTREAM
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.TRACK_UPSTREAM = 'fixtures'
  })

  it('녹화본이 있는 코드는 업스트림에 묻지 않는다 — 오프라인 결정성', async () => {
    const result = await handleTrackRequest('WS67Y2')

    expect(result.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('예약 코드 ZZZZZZ는 녹화본 판정 그대로 404 TRACK_NOT_FOUND다', async () => {
    const result = await handleTrackRequest('ZZZZZZ')

    expect(result.status).toBe(404)
    expect(asError(result.body).code).toBe('TRACK_NOT_FOUND')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('녹화본이 없는 코드는 업스트림을 정확히 1회 호출해 200을 돌려준다 (TC-001-9)', async () => {
    fetchSpy.mockResolvedValue(OK_RESPONSE())

    const result = await handleTrackRequest('https://mini4wd-track-editor.pimentoso.com/view/FTSBH1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mini4wd-track-editor.pimentoso.com/load/FTSBH1.js')
    expect(result.status).toBe(200)
    expect(asData(result.body).trackCode).toBe('FTSBH1')
  })

  it('녹화본이 없고 업스트림도 404면 501이 아니라 TRACK_NOT_FOUND다 (TC-001-9)', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }))

    const result = await handleTrackRequest('FTSBH1')

    expect(result.status).toBe(404)
    expect(asError(result.body).code).toBe('TRACK_NOT_FOUND')
  })

  it("TRACK_UPSTREAM='auto' 명시도 미지정과 같다", async () => {
    process.env.TRACK_UPSTREAM = 'auto'
    fetchSpy.mockResolvedValue(OK_RESPONSE())

    const result = await handleTrackRequest('FTSBH1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mini4wd-track-editor.pimentoso.com/load/FTSBH1.js')
    expect(result.status).toBe(200)
  })

  it('production에서 미지정은 live다 — 녹화본이 있어도 업스트림을 부른다', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    fetchSpy.mockResolvedValue(OK_RESPONSE())
    try {
      const result = await handleTrackRequest('WS67Y2')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(result.status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
    }
  })

  it("TRACK_UPSTREAM='fixtures' 명시는 종전대로 501이고 업스트림을 부르지 않는다", async () => {
    process.env.TRACK_UPSTREAM = 'fixtures'

    const result = await handleTrackRequest('FTSBH1')

    expect(result.status).toBe(501)
    expect(asError(result.body).code).toBe('FIXTURE_NOT_RECORDED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
