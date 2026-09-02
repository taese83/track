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
