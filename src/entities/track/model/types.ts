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

/**
 * 파이프라인 3단계 타입 — 끝점 매칭으로 복원한 진행 순서.
 * 정본은 feature-plan Data Model이다.
 * FEAT-003은 orderedPieceIds만 채운다. 나머지 4필드는 FEAT-004가 계산해 채운다.
 */
export interface RestoredPath {
  /** Str2(START)부터 시작하는 결정적 순서 */
  orderedPieceIds: string[]
  /** XY 평면 폐곡선 여부 */
  isClosedLoop: boolean
  brokenAt: { afterPieceId: string; reason: string } | null
  isZClosed: boolean | null
  zClosureGap: { value: number; grade: 'measured' | 'confirmed' | 'inferred' | 'unknown' } | null
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
  /**
   * 501 — **로컬 fixture 모드 전용.** 이 코드의 녹화본이 없어 업스트림에 묻지 않았다.
   * `TRACK_NOT_FOUND`와 갈라야 하는 이유: fixture 모드는 편집기를 호출하지 않으므로
   * 트랙의 존재 여부를 **알 수 없다**. 둘을 같은 코드로 보내면 화면이 "코드가 맞는지
   * 확인해 주세요"라고 말하는데, 실재하는 코드에 대해 그것은 근거 없는 단정이다.
   * production(`NODE_ENV=production` 또는 `TRACK_UPSTREAM=live`)에서는 발생하지 않는다.
   */
  | 'FIXTURE_NOT_RECORDED'
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
