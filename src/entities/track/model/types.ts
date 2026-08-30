/**
 * 파이프라인 1단계 타입 — 서버 fetch 결과.
 * 정본은 feature-plan Data Model이며 api-schema는 이 타입을 재정의하지 않는다.
 * zod 미채택(tech-stack Architecture Decisions "폼") — 수기 선언 + schema.ts 타입가드.
 */
export interface RawTrackResponse {
  /** schema.ts TRACK_CODE_PATTERN 충족 */
  trackCode: string
  /** "클래스;x;y;각도;색"을 '#'로 이은 원본 문자열. 서버는 내용을 검증하지 않는다 */
  rawData: string
  /** 클라이언트 캐시 판단용. UTC 오프셋 포함 ISO 8601 */
  fetchedAt: string
  /** parseInt(저장버전) < COMPATIBILITY_ID(26586). 서버는 보정을 적용하지 않고 그대로 전달 */
  compat: boolean
}

/**
 * 파이프라인 2단계 타입 — rawData 파싱 결과. 원본 데이터에 순서 개념이 없어 목록도 순서를 뜻하지 않는다.
 * 정본은 feature-plan Data Model이다.
 */
export interface ParsedPiece {
  /** 파싱 시 부여하는 임시 식별자 */
  pieceId: string
  /** 카탈로그 23종 + 미지원 문자열 */
  pieceClass: string
  x: number
  y: number
  angleDeg: number
  /** 팔레트 인덱스(방향 플래그 아님) */
  colorIndex: number
  /** 회전·이동 적용 후 절대 좌표계 끝점 */
  vertex1: { x: number; y: number }
  vertex2: { x: number; y: number }
  /** FEAT-009 판단 근거 */
  isSupported: boolean
  /** REQ-F-021 — 좌표 가산은 FEAT-006이 소비한다 */
  compatCorrectionApplied?: boolean
}

export type TrackErrorCode =
  /** 400 — 코드/URL 형식 불일치. allowlist 밖 host 포함 */
  | 'INVALID_INPUT_FORMAT'
  /** 404 — 존재하지 않는 코드 */
  | 'TRACK_NOT_FOUND'
  /** 502 — 편집기 비-2xx 응답(422 CSRF 포함) 또는 네트워크 오류 */
  | 'UPSTREAM_FETCH_FAILED'
  /** 504 — 고정 timeout 초과 */
  | 'UPSTREAM_TIMEOUT'
  /** 502 — compat/text 변수 추출 실패(편집기 응답 포맷 변경 등) */
  | 'UPSTREAM_RESPONSE_UNRECOGNIZED'
  /** 500 — 위 어디에도 속하지 않는 예외 */
  | 'INTERNAL_ERROR'

export interface ResponseSuccessType<T> {
  statusCode: 200
  isSuccess: true
  data: T
}

export interface ResponseErrorType {
  statusCode: number
  isSuccess: false
  code: TrackErrorCode
  /** 로그용. 클라이언트 문구 분기는 code만으로 한다 */
  message: string
}

export type TrackApiResponse = ResponseSuccessType<RawTrackResponse> | ResponseErrorType
