// FEAT-019 — "하이라이트가 지금 화면에 보이는가"와 "안 보이면 어디로 얼마나 옮기는가".
//
// three를 모르는 순수 값 계산으로 둔다(`marker-geometry.ts`와 같은 이유) — 카메라 판정은
// 브라우저 없이 재야 한다. 호출자가 `Vector3.project(camera)`로 NDC를 만들어 넘긴다.
//
// **왜 타깃만 옮기는가**: 사용자가 잡아 둔 각도·거리는 그 사람이 만든 시점이다. 클릭 하나로
// 그것을 초기화하면 목록을 훑는 동안 화면이 매번 리셋된다. 타깃만 옮기고 카메라 위치를 같은
// 벡터만큼 함께 밀면 구면 좌표(방위각·극각·거리)가 정의상 보존된다 — 화면은 그리로 가는데
// 시점은 그대로다.

/** 절두체 판정의 안쪽 여유(NDC). 경계에 걸친 대상이 클릭마다 깜빡이지 않게 한다(ASSUMPTION C) */
export const VIEW_MARGIN_NDC = 0.85

/**
 * 하이라이트의 세 색과 불투명도. three 재질은 `var()`를 읽지 못하므로 hex 상수다
 * (design-system tokens §1 — 그래서 이 파생 두 색은 CSS 변수로 내지 않는다).
 *
 * **면과 테두리의 역할이 다르다.** 면은 `primary`를 반투명으로 덧칠해 아래 원본 편집기색이
 * 비쳐 보이게 하는 채널이고 대비를 책임지지 않는다. 판독은 테두리가 진다.
 *
 * **테두리가 두 색인 이유**(PC-016): 단일 색으로는 밝은 평지 노면과 어두운 상승·하강 노면
 * 모두에 3:1을 낼 수 없다 — 밝은 배경에는 어두워야 하고 어두운 배경에는 밝아야 한다.
 * 첫 구현의 `primary` 단색 선은 평지에서 1.10:1이었다(2026-09-03 실측).
 */
export const HIGHLIGHT_FILL = '#A78BFA'
export const HIGHLIGHT_FILL_OPACITY = 0.45
export const HIGHLIGHT_EDGE_LIGHT = '#C4B5FD'
export const HIGHLIGHT_EDGE_DARK = '#2E1065'

/** WCAG 2.2 상대 휘도 */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const channel = (at: number) => {
    const raw = Number.parseInt(value.slice(at, at + 2), 16) / 255
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/**
 * WCAG 2.2 명도 대비. 이 계약(TC-019-8 — 어느 노면에서든 두 톤 중 하나가 3:1)을 **기계가
 * 검사할 수 있게** 두려고 순수 함수로 낸다. 산문으로만 적힌 대비 목표는 다음 색 조정에서
 * 조용히 깨진다 — 실제로 PC-015가 그렇게 1.10:1을 내보냈다.
 */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (high! + 0.05) / (low! + 0.05)
}

/** 두 톤 중 그 배경에서 더 잘 읽히는 쪽의 대비. TC-019-8의 판정값이다 */
export function edgeContrastOn(surfaceHex: string): number {
  return Math.max(
    contrastRatio(HIGHLIGHT_EDGE_LIGHT, surfaceHex),
    contrastRatio(HIGHLIGHT_EDGE_DARK, surfaceHex),
  )
}

/** 타깃 이징 시간(ms). `--duration-*` 토큰 대상 밖이다 — 카메라는 3D 코드 소관(design-system §4) */
export const TARGET_EASE_MS = 300

export interface NdcPoint {
  x: number
  y: number
  /** 깊이. 카메라 뒤이거나 far 밖이면 1을 넘는다 */
  z: number
}

export interface ScenePointLike {
  x: number
  y: number
  z: number
}

/**
 * 대상이 화면 안에 있는가. `z`를 함께 보는 이유: 카메라 **뒤**의 점도 투영하면 x·y가
 * −1~1에 들어올 수 있다(원근 나눗셈의 부호가 뒤집힌다). z만이 앞뒤를 가른다.
 */
export function isPointInView(ndc: NdcPoint, margin: number = VIEW_MARGIN_NDC): boolean {
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) return false
  if (ndc.z < -1 || ndc.z > 1) return false
  return Math.abs(ndc.x) <= margin && Math.abs(ndc.y) <= margin
}

/**
 * 이징 진행도 0~1. smoothstep이라 시작·끝에서 속도가 0이다 — 등속으로 밀면 멈추는 순간이
 * 툭 끊긴다. `durationMs <= 0`(reduced-motion)이면 첫 프레임에 1이 되어 즉시 컷이다.
 */
export function easeProgress(elapsedMs: number, durationMs: number = TARGET_EASE_MS): number {
  if (!(durationMs > 0)) return 1
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1)
  return t * t * (3 - 2 * t)
}

/** 두 점 사이 보간. 타깃 이동의 매 프레임 위치다 */
export function lerpPoint(from: ScenePointLike, to: ScenePointLike, t: number): ScenePointLike {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  }
}
