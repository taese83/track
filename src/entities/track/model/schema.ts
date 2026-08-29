import type { RawTrackResponse } from './types.js'

/**
 * 근거: 실측 예시 WS67Y2(6자). 정확한 길이 규격 미확인 — 보수적으로 4~10자 대문자 영숫자만 허용.
 */
const TRACK_CODE_PATTERN = /^[A-Z0-9]{4,10}$/

export const isTrackCode = (v: string): boolean => TRACK_CODE_PATTERN.test(v)

/** 서버가 조립하는 업스트림 host. 서브도메인·유사 호스트 우회 금지 — 정확 일치만 */
export const ALLOWED_HOST = 'mini4wd-track-editor.pimentoso.com'

export const SOURCE_EDITOR_URL = `https://${ALLOWED_HOST}/`

/**
 * 사용자 입력에서 트랙 코드만 뽑는다. 입력 URL을 그대로 fetch하지 않기 위한 계약의 앞단이며,
 * 추출 실패는 INVALID_INPUT_FORMAT(400)이고 이때 업스트림 fetch는 발생하지 않는다.
 */
export function extractCode(rawUrlParam: string): string | null {
  const trimmed = rawUrlParam.trim()
  if (trimmed === '') return null

  const upper = trimmed.toUpperCase()
  if (isTrackCode(upper)) return upper // 코드를 바로 넣은 편의 입력

  try {
    const u = new URL(trimmed)
    if (u.hostname !== ALLOWED_HOST) return null

    // 경로 마지막 조각만 보면 `/view/`(코드 없음)가 'VIEW'를 코드로 통과시켜 업스트림을 호출한다.
    // REQ-F-005의 정형 입력은 `/view/{CODE}`이므로 두 조각을 함께 요구한다.
    const segments = u.pathname.split('/').filter(Boolean)
    const code = segments.at(-1)?.toUpperCase()
    const container = segments.at(-2)?.toLowerCase()
    if (code === undefined || container !== 'view') return null
    return isTrackCode(code) ? code : null
  } catch {
    return null
  }
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * 검증 강도 공시: ISO_WITH_OFFSET은 형식만 본다 — `2026-13-45T99:99:99Z`처럼 형식은 맞고 값이
 * 성립하지 않는 문자열을 통과시킨다. 이 응답의 유일한 생산자가 우리 서버 함수이므로 이 가드는
 * 신뢰 경계 검증이 아니라 자체 버그·응답 변형에 대한 방어적 체크다. 업스트림 원문 검증은
 * extract-upstream-vars와 UPSTREAM_RESPONSE_UNRECOGNIZED가 담당한다.
 */
export function isRawTrackResponse(v: unknown): v is RawTrackResponse {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.trackCode === 'string' &&
    isTrackCode(o.trackCode) &&
    typeof o.rawData === 'string' &&
    o.rawData.length > 0 &&
    typeof o.fetchedAt === 'string' &&
    ISO_WITH_OFFSET.test(o.fetchedAt) &&
    typeof o.compat === 'boolean'
  )
}
