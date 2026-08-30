// performance-budget §1·§3 — 측정 훅. 목표를 세워 두고 측정 경로가 없으면 그 목표는
// NOT_MEASURED로 남는다("훅 구현은 FEAT-006/007 소관"). 여기서 그 자리를 채운다.
//
// 값을 만들어 두는 것이 아니라 **실제 렌더 루프에서 관측한 것만** 쓴다 — 관측 전에는
// 필드가 없고, 없는 채로 읽히면 검증은 NOT_MEASURED가 된다(주장과 증명을 섞지 않는다).

export interface PerfStats {
  /** fetch 완료 → 씬 첫 프레임까지(ms). 첫 프레임 전에는 없다 */
  initialRenderMs?: number
  /** 오빗 조작 중 1초 롤링 평균 fps. 조작 전에는 없다 */
  orbitFps?: number
}

declare global {
  interface Window {
    __perfStats?: PerfStats
  }
}

function store(): PerfStats {
  if (typeof window === 'undefined') return {}
  window.__perfStats ??= {}
  return window.__perfStats
}

/**
 * 측정 시작점. 씬을 만들 데이터가 준비된 시각이며 `targets.md`의 "fetch 완료 시각"이다.
 * 화면이 다시 로드되면 다시 시작한다 — 이전 트랙의 시각으로 재면 값이 무의미하다.
 */
let renderStartedAt: number | null = null

export function markRenderStart(): void {
  renderStartedAt = typeof performance === 'undefined' ? null : performance.now()
  const stats = store()
  delete stats.initialRenderMs
}

export function markFirstFrame(): void {
  if (renderStartedAt === null || typeof performance === 'undefined') return
  store().initialRenderMs = performance.now() - renderStartedAt
  renderStartedAt = null
}

/**
 * 1초 롤링 창의 fps. 프레임 타임스탬프만 보관하고 창 밖은 버린다 —
 * 전체 평균을 쓰면 정지 구간이 조작 중 fps를 희석한다.
 */
const FPS_WINDOW_MS = 1_000

let frameTimes: number[] = []

export function resetOrbitFps(): void {
  frameTimes = []
  const stats = store()
  delete stats.orbitFps
}

export function recordOrbitFrame(now: number): void {
  frameTimes.push(now)
  const cutoff = now - FPS_WINDOW_MS
  while (frameTimes.length > 0 && (frameTimes[0] ?? 0) < cutoff) frameTimes.shift()

  const first = frameTimes[0]
  // 창이 다 차기 전의 값은 프레임 수가 적어 과소·과대 둘 다 나온다 — 채워질 때까지 안 쓴다
  if (first === undefined || frameTimes.length < 2 || now - first < FPS_WINDOW_MS / 2) return
  store().orbitFps = ((frameTimes.length - 1) * 1_000) / (now - first)
}
