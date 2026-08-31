import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractCode, ALLOWED_HOST } from '../src/entities/track/model/schema.js'
import type {
  RawTrackResponse,
  ResponseErrorType,
  TrackErrorCode,
} from '../src/entities/track/model/types.js'
import { extractUpstreamVars } from '../src/shared/lib/track/extract-upstream-vars.js'

/** api-schema §2 — 고정 timeout. 초과 시 즉시 UPSTREAM_TIMEOUT, 재시도 없음 */
const UPSTREAM_TIMEOUT_MS = 8_000

/**
 * REQ-F-019 (c) — 식별 가능한 User-Agent.
 * 연락처는 의도적으로 비워 둔다: 운영자 개인 이메일을 외부 사이트로 내보내지 않는다.
 * 공개 배포(BLOCKER-001 사전고지) 시점에 운영 주체가 `TRACK_CONTACT`로 주입한다.
 */
const USER_AGENT_BASE = 'mini4wd-track-3d/1.0 (+https://github.com/taese83/track'

/** api-schema §7 — 200만 CDN 캐시(best-effort), 에러는 캐시 금지 */
const CACHE_CONTROL_SUCCESS = 'public, s-maxage=3600, stale-while-revalidate=86400'
const CACHE_CONTROL_ERROR = 'no-store'

const ERROR_STATUS: Record<TrackErrorCode, number> = {
  INVALID_INPUT_FORMAT: 400,
  TRACK_NOT_FOUND: 404,
  UPSTREAM_FETCH_FAILED: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_RESPONSE_UNRECOGNIZED: 502,
  FIXTURE_NOT_RECORDED: 501,
  INTERNAL_ERROR: 500,
}

export interface TrackHandlerResult {
  status: number
  headers: Record<string, string>
  body: unknown
}

function fail(code: TrackErrorCode, message: string): TrackHandlerResult {
  const status = ERROR_STATUS[code]
  const body: ResponseErrorType = { statusCode: status, isSuccess: false, code, message }
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE_CONTROL_ERROR },
    body,
  }
}

function succeed(data: RawTrackResponse): TrackHandlerResult {
  return {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE_CONTROL_SUCCESS,
    },
    body: { statusCode: 200, isSuccess: true, data },
  }
}

// ---------------------------------------------------------------------------
// 업스트림 취득 — 실제 fetch / fixture 두 경로
// ---------------------------------------------------------------------------

type UpstreamOutcome =
  | { kind: 'ok'; body: string }
  | { kind: 'not-found' }
  | { kind: 'failed'; detail: string }
  | { kind: 'timeout' }
  /** fixture 모드에서만 나온다 — 업스트림에 묻지 않았으므로 존재 여부를 모른다 */
  | { kind: 'not-recorded' }

/**
 * fixture 모드에서 파일로 녹화할 수 없는 실패를 합성하는 예약 코드 (fixtures/track/README.md).
 * **"존재하지 않는 코드"도 예약 코드다** — api-schema §9가 그것을 에러 fixture 1종으로
 * 규정했기 때문이다. 녹화본이 없다는 사실에서 "업스트림에 없다"를 유도하지 않는다.
 */
const RESERVED_FIXTURE_CODES: Record<string, UpstreamOutcome | 'slow'> = {
  ZZZZZZ: { kind: 'not-found' },
  SRVERR: { kind: 'failed', detail: 'fixture: upstream responded 503' },
  TIMEOUT: { kind: 'timeout' },
  SLOWLY: 'slow',
}

/** fixture 모드에서 SLOWLY 코드가 지연시킬 시간 — 클라이언트 slow 임계값(1400ms)을 넘긴다 */
const FIXTURE_SLOW_DELAY_MS = 2_200

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/track')

async function readFixture(code: string): Promise<UpstreamOutcome> {
  const reserved = RESERVED_FIXTURE_CODES[code]
  if (reserved !== undefined && reserved !== 'slow') return reserved
  if (reserved === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, FIXTURE_SLOW_DELAY_MS))
    return readFixtureFile('WS67Y2')
  }
  return readFixtureFile(code)
}

async function readFixtureFile(code: string): Promise<UpstreamOutcome> {
  try {
    const body = await readFile(path.join(fixtureDir, `${code}.js.txt`), 'utf8')
    return { kind: 'ok', body }
  } catch {
    // 녹화본이 없다 ≠ 업스트림에 없다. fixture 모드는 편집기를 호출하지 않으므로
    // (api-schema §9) 존재 여부를 **알 수 없다** — 아는 것만 말한다.
    return { kind: 'not-recorded' }
  }
}

async function fetchUpstream(code: string): Promise<UpstreamOutcome> {
  const contact = process.env.TRACK_CONTACT
  const userAgent = contact === undefined ? `${USER_AGENT_BASE})` : `${USER_AGENT_BASE}; contact:${contact})`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    // 사용자가 준 URL을 그대로 쓰지 않는다 — 코드만 뽑아 서버가 직접 조립한다(SSRF 차단).
    const response = await fetch(`https://${ALLOWED_HOST}/load/${code}.js`, {
      method: 'GET',
      headers: {
        // 이 헤더가 없으면 편집기(Rails)가 422를 반환한다 — 실측(2026-08-28)
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': userAgent,
        Accept: 'text/javascript, */*;q=0.1',
      },
      signal: controller.signal,
      redirect: 'error', // 조립한 고정 URL 밖으로 새어나가지 않는다
    })

    if (response.status === 404) return { kind: 'not-found' }
    if (!response.ok) return { kind: 'failed', detail: `upstream responded ${response.status}` }
    return { kind: 'ok', body: await response.text() }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { kind: 'timeout' }
    const detail = error instanceof Error ? error.message : String(error)
    return { kind: 'failed', detail }
  } finally {
    clearTimeout(timer)
  }
}

type UpstreamMode = 'fixtures' | 'live' | 'auto'

function resolveUpstreamMode(): UpstreamMode {
  const mode = process.env.TRACK_UPSTREAM
  if (mode === 'fixtures' || mode === 'live' || mode === 'auto') return mode
  return process.env.NODE_ENV === 'production' ? 'live' : 'auto'
}

// api-schema §9 · D-046
async function readUpstream(code: string, mode: UpstreamMode): Promise<UpstreamOutcome> {
  if (mode === 'live') return fetchUpstream(code)
  const recorded = await readFixture(code)
  if (mode === 'fixtures' || recorded.kind !== 'not-recorded') return recorded
  return fetchUpstream(code)
}

// ---------------------------------------------------------------------------
// 핸들러 코어 (런타임 비의존 — Vercel 핸들러와 Vite dev 미들웨어가 함께 쓴다)
// ---------------------------------------------------------------------------

export async function handleTrackRequest(urlParam: string | null): Promise<TrackHandlerResult> {
  try {
    if (urlParam === null) {
      return fail('INVALID_INPUT_FORMAT', 'query parameter "url" is required')
    }

    const code = extractCode(urlParam)
    if (code === null) {
      // 여기서 끝난다 — 업스트림 fetch는 발생하지 않는다(api-schema §1)
      return fail('INVALID_INPUT_FORMAT', 'could not extract a track code from the given input')
    }

    // 사용자 요청 1회당 업스트림 fetch 정확히 1회. 자동 재시도·백오프·프리페치 없음(REQ-F-019 a)
    const outcome = await readUpstream(code, resolveUpstreamMode())

    switch (outcome.kind) {
      case 'not-found':
        return fail('TRACK_NOT_FOUND', `track ${code} does not exist upstream`)
      case 'not-recorded':
        return fail(
          'FIXTURE_NOT_RECORDED',
          `track ${code} is not recorded in local fixtures; upstream was not contacted`,
        )
      case 'timeout':
        return fail('UPSTREAM_TIMEOUT', `upstream did not respond within ${UPSTREAM_TIMEOUT_MS}ms`)
      case 'failed':
        return fail('UPSTREAM_FETCH_FAILED', outcome.detail)
      case 'ok':
        break
    }

    const extracted = extractUpstreamVars(outcome.body)
    if (!extracted.ok) {
      return fail(
        'UPSTREAM_RESPONSE_UNRECOGNIZED',
        `could not extract compat/text from upstream response (${extracted.reason})`,
      )
    }

    // 서버는 rawData를 검증·보정하지 않는다. compat도 그대로 전달만 한다(api-schema §3).
    return succeed({
      trackCode: code,
      rawData: extracted.text,
      fetchedAt: new Date().toISOString(),
      compat: extracted.compat,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return fail('INTERNAL_ERROR', detail)
  }
}

// ---------------------------------------------------------------------------
// Vercel Node Serverless Function 엔트리
// ---------------------------------------------------------------------------

interface MinimalRequest {
  url?: string | undefined
  method?: string | undefined
}
interface MinimalResponse {
  status: (code: number) => MinimalResponse
  setHeader: (name: string, value: string) => unknown
  json: (body: unknown) => unknown
}

export default async function handler(req: MinimalRequest, res: MinimalResponse): Promise<void> {
  if (req.method !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    res.setHeader('cache-control', CACHE_CONTROL_ERROR)
    res.status(405).json({ statusCode: 405, isSuccess: false, code: 'INVALID_INPUT_FORMAT', message: 'method not allowed' })
    return
  }

  const requested = new URL(req.url ?? '/', 'http://localhost')
  const result = await handleTrackRequest(requested.searchParams.get('url'))

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
  res.status(result.status).json(result.body)
}
