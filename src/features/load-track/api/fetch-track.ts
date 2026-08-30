import { isRawTrackResponse } from '@/entities/track/model/schema'
import type { RawTrackResponse, TrackErrorCode } from '@/entities/track/model/types'

import type { LoadErrorReason } from '../model/types'

export type FetchTrackResult =
  | { ok: true; data: RawTrackResponse }
  | { ok: false; reason: LoadErrorReason; detail: string }

/**
 * 서버 에러 코드 → 화면 문구 축. 클라이언트는 `code`만으로 분기하고 `message`는 로그용이다
 * (api-schema §6). 원인이 구분되지 않으면 TC-001-5가 요구하는 "원인별 메시지"가 성립하지 않는다.
 */
const REASON_BY_CODE: Record<TrackErrorCode, LoadErrorReason> = {
  INVALID_INPUT_FORMAT: 'invalid-input',
  TRACK_NOT_FOUND: 'not-found',
  UPSTREAM_FETCH_FAILED: 'network',
  UPSTREAM_TIMEOUT: 'timeout',
  UPSTREAM_RESPONSE_UNRECOGNIZED: 'parse',
  FIXTURE_NOT_RECORDED: 'fixture-not-recorded',
  INTERNAL_ERROR: 'network',
}

function isTrackErrorCode(v: unknown): v is TrackErrorCode {
  return typeof v === 'string' && v in REASON_BY_CODE
}

export async function fetchTrack(urlParam: string, signal?: AbortSignal): Promise<FetchTrackResult> {
  let payload: unknown
  try {
    const response = await fetch(`/api/track?url=${encodeURIComponent(urlParam)}`, {
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
    payload = await response.json()
  } catch (error) {
    // 네트워크 자체가 끊긴 경우 — 서버 봉투가 없으므로 코드 매핑이 불가능하다
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'network', detail }
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'parse', detail: 'response was not a JSON object' }
  }

  const envelope = payload as Record<string, unknown>
  if (envelope.isSuccess === true) {
    if (!isRawTrackResponse(envelope.data)) {
      return { ok: false, reason: 'parse', detail: 'success envelope did not carry a valid RawTrackResponse' }
    }
    return { ok: true, data: envelope.data }
  }

  const code = envelope.code
  const detail = typeof envelope.message === 'string' ? envelope.message : 'unknown server error'
  if (!isTrackErrorCode(code)) {
    return { ok: false, reason: 'network', detail }
  }
  return { ok: false, reason: REASON_BY_CODE[code], detail }
}
