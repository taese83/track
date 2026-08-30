/**
 * 완전 실패 화면이 문구를 분기하는 축.
 *
 * component-spec의 4종(`network`/`parse`/`not-closed-fatal`/`timeout`)에 `not-found`와
 * `invalid-input`을 더했다 — TC-001-3("트랙을 찾을 수 없습니다")과 TC-001-2("유효하지 않은
 * 링크입니다")가 확정 문구를 요구하는데 4종만으로는 둘 다 `network`로 뭉개져 서로 다른 원인이
 * 같은 메시지를 받는다(TC-001-5의 "원인이 구분된 에러 메시지" 요구와 정면 충돌).
 * 디자인 프리뷰도 같은 문제를 별도 messageKey로 우회했다.
 *
 * `start-piece-missing`은 FEAT-003이 더했다 — 순서 복원의 실패는 파싱이 끝난 뒤에 일어나므로
 * `parse` 문구("해석하지 못했습니다")로 뭉개면 TC-003-4가 요구하는 START 부재 문구가 나오지 않는다.
 */
export type LoadErrorReason =
  | 'network'
  | 'parse'
  | 'not-closed-fatal'
  | 'timeout'
  | 'not-found'
  /**
   * 로컬 fixture 모드에 이 코드의 녹화본이 없다. `not-found`와 갈라 둔다 —
   * 서버가 업스트림에 묻지 않았으므로 "없는 코드"라고 말할 근거가 없다.
   */
  | 'fixture-not-recorded'
  | 'invalid-input'
  | 'start-piece-missing'

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** ASSUMPTION-007 임계값 초과. 로딩 자리를 유지한 채 문구만 추가된다 */
  | { status: 'slow' }
  | { status: 'error'; reason: LoadErrorReason; rawSnippet?: string }
  | { status: 'success' }
