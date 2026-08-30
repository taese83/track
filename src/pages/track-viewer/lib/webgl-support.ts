// FEAT-014 — WebGL 지원 게이트의 순수 축.
//
// 감지를 `TrackViewerPage`에 인라인하지 않고 떼어낸 이유는 **node에서 잴 수 있게** 하기
// 위해서다. vitest는 `environment: node`라 `document`가 없으므로, 캔버스를 만드는 일만
// 주입 가능한 팩토리로 빼면 "어떤 컨텍스트를 어떤 순서로 묻는가"와 "예외를 삼키는가"를
// 브라우저 없이 검증할 수 있다. 브라우저 축(실제 미지원 환경에서 3D 렌더가 일어나지
// 않는가)은 Playwright가 잰다.

/** `getContext`만 쓰므로 캔버스 전체가 아니라 그 표면만 요구한다 */
export interface WebglProbeTarget {
  getContext(contextId: string): unknown
}

export type CanvasFactory = () => WebglProbeTarget | null

/**
 * 렌더러가 **실제로 만드는** 컨텍스트를 묻는다.
 *
 * 프리뷰 프로토타입은 `webgl`/`experimental-webgl`을 물었지만, 이 앱의 렌더러는
 * three 0.185의 `WebGLRenderer`이고 그 버전은 **WebGL2만 만든다**(r155에서 WebGL1
 * 백엔드가 제거됐다). 그래서 `webgl`만 있는 환경을 "지원"으로 통과시키면 게이트를
 * 지나온 뒤 렌더러가 던진다 — TC-014-1의 "3D 렌더 시도 자체가 발생하지 않는다"가
 * 깨진다. 묻는 대상을 렌더러와 일치시켜야 게이트가 게이트 노릇을 한다.
 *
 * `webgl`은 **판정에 쓰지 않고** 진단으로만 남긴다(아래 `probeWebgl`).
 */
const REQUIRED_CONTEXT_ID = 'webgl2'

/** 진단용 2차 질의 — 판정에는 쓰지 않는다. "WebGL이 아예 없다"와 "WebGL1만 있다"를 가른다 */
const LEGACY_CONTEXT_ID = 'webgl'

export interface WebglProbeResult {
  /** 렌더러가 요구하는 WebGL2를 만들 수 있는가 — 이 값만이 게이트의 판정이다 */
  supported: boolean
  /** WebGL1은 되는데 WebGL2가 안 되는 환경. 안내 문구를 바꾸지는 않고 사실만 남긴다 */
  legacyOnly: boolean
}

function defaultCanvasFactory(): WebglProbeTarget | null {
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

/**
 * 컨텍스트 질의는 **예외를 던질 수 있다**(GPU 차단 정책·컨텍스트 소진). 던진 것을 그대로
 * 올려보내면 마운트 시점의 게이트가 앱 전체를 깨뜨리므로, 여기서 삼키고 "미지원"으로 접는다.
 * 삼키는 범위는 이 질의 하나뿐이다 — 렌더 도중의 실패는 `CanvasErrorBoundary`가 따로 받는다.
 */
function askContext(target: WebglProbeTarget, contextId: string): boolean {
  try {
    return target.getContext(contextId) != null
  } catch {
    return false
  }
}

/** 캔버스 생성도 던질 수 있다(SSR·잠긴 document). 던지면 만들지 못한 것으로 본다 */
function makeTarget(createCanvas: CanvasFactory): WebglProbeTarget | null {
  try {
    return createCanvas()
  } catch {
    return null
  }
}

export function probeWebgl(createCanvas: CanvasFactory = defaultCanvasFactory): WebglProbeResult {
  const target = makeTarget(createCanvas)
  if (target === null) return { supported: false, legacyOnly: false }

  const supported = askContext(target, REQUIRED_CONTEXT_ID)
  if (supported) return { supported: true, legacyOnly: false }

  return { supported: false, legacyOnly: askContext(target, LEGACY_CONTEXT_ID) }
}

/** 게이트가 쓰는 단일 판정 */
export function detectWebglSupport(createCanvas: CanvasFactory = defaultCanvasFactory): boolean {
  return probeWebgl(createCanvas).supported
}
