// FEAT-014 — TC-014-3의 귀속 규칙(순수 축).
//
// **왜 React 에러 경계가 아닌가(실측 2026-08-30).** 컨텍스트 생성이 실패하면 three의
// `WebGLRenderer`는 `console.error('THREE.WebGLRenderer: …')`를 남기고 예외를 **다시
// 던진다**. 그 던지기는 R3F의 초기화 경로에서 일어나 React 렌더/커밋 밖으로 나가므로
// `componentDidCatch`가 잡지 못한다 — 스텁으로 재현했을 때 화면은 `data-view-state="success"`,
// canvas 1개 그대로였고 예외는 `pageerror`로만 관측됐다. 경계를 두면 이 경로에 대해
// 죽은 코드가 된다.
//
// 그래서 신호는 전역 `error` 이벤트로 받되, **원인 귀속을 추측으로 하지 않는다.** 메시지
// 문자열을 매칭하면(three의 접두사 등) 무관한 에러를 "WebGL 미지원"으로 표기하게 된다.
// 대신 에러가 난 시점에 **실제 캔버스가 컨텍스트를 갖고 있는지 확인한다** — 갖고 있으면
// 그 에러는 3D 실패가 아니고, 못 갖고 있으면 3D는 실제로 무너진 것이다.

/** 확인에 필요한 표면만 요구한다 — 테스트에서 실제 캔버스 없이 규칙을 잴 수 있게 한다 */
export interface CanvasContextProbe {
  getContext(contextId: string): unknown
}

/** 렌더러가 만드는 컨텍스트와 같은 id여야 "그 컨텍스트가 있는가"를 묻는 것이 된다 */
const RENDERER_CONTEXT_ID = 'webgl2'

/**
 * 이미 컨텍스트가 만들어진 캔버스에 같은 id로 다시 물으면 **그 컨텍스트가 그대로 돌아온다**
 * (HTML 표준 — 속성이 달라도 기존 컨텍스트를 반환한다). 만들어지지 않았다면 여기서 새로
 * 만들기를 시도하고, 만들 수 없는 환경이면 null이거나 던진다.
 *
 * @returns 3D가 무너졌다고 판정할 근거가 있으면 true
 */
export function isCanvasBroken(canvas: CanvasContextProbe | null): boolean {
  // 캔버스가 아예 없으면 3D 화면이 아니거나 이미 내려간 뒤다 — 판정 근거가 없다
  if (canvas === null) return false
  try {
    return canvas.getContext(RENDERER_CONTEXT_ID) == null
  } catch {
    return true
  }
}
