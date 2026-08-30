// FEAT-006 — 오빗 카메라의 상태 수학. 렌더러와 분리한 순수 코어다.
//
// 드래그·휠은 `OrbitControls`가 내장으로 처리하지만 키보드는 그렇지 않다: drei의 기본
// `keys`는 방향키를 **팬**에 묶는데 a11y-responsive §포커스 순서는 방향키를 **회전**,
// `+`/`-`를 줌으로 규정한다. 그래서 키보드 경로만 여기서 계산해 컨트롤에 넣는다.
//
// 구면 좌표(방위각·극각·거리)를 쓰는 것은 OrbitControls의 내부 표현과 같기 때문이다 —
// 다른 표현으로 계산하면 마우스 조작과 키보드 조작이 서로 다른 궤도를 그린다.

export interface OrbitState {
  /** 방위각(라디안). y축 둘레 회전 */
  azimuthRad: number
  /** 극각(라디안). 0 = 바로 위, π = 바로 아래 */
  polarRad: number
  /** 타깃까지의 거리 */
  distance: number
}

/** 한 번 눌렀을 때의 회전량. 마우스 한 획과 비슷한 체감으로 두되 과잉 회전은 피한다 */
const KEY_ROTATE_RAD = (5 * Math.PI) / 180
/** 한 번 눌렀을 때의 줌 배율. 휠 한 칸과 같은 크기다 */
const KEY_ZOOM_FACTOR = 1.1

/**
 * 극각 한계. 0이나 π에 정확히 닿으면 시선과 up 벡터가 평행해져 방위각이 정의되지 않고
 * 카메라가 튄다. 지면 아래로 내려가지 않도록 아래쪽은 수평(π/2)에서 멈춘다 —
 * 트랙은 바닥 위의 물체이므로 밑에서 올려다보는 시점은 정보가 없다.
 */
const MIN_POLAR_RAD = 0.05
const MAX_POLAR_RAD = Math.PI / 2 - 0.05

/** 거리 한계는 씬 크기에 상대적이다 — 절대값으로 두면 트랙 규모가 바뀔 때 못 쓴다 */
const MIN_DISTANCE_RATIO = 0.05
const MAX_DISTANCE_RATIO = 4

export interface OrbitLimits {
  minDistance: number
  maxDistance: number
  minPolarRad: number
  maxPolarRad: number
}

export function orbitLimitsFor(diagonal: number): OrbitLimits {
  const span = diagonal > 0 ? diagonal : 1
  return {
    minDistance: span * MIN_DISTANCE_RATIO,
    maxDistance: span * MAX_DISTANCE_RATIO,
    minPolarRad: MIN_POLAR_RAD,
    maxPolarRad: MAX_POLAR_RAD,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 트랙 전체가 화면에 들어오는 초기 거리.
 * 바운딩박스 외접구의 반지름을 수직 화각 안에 넣고 여백을 준다 — 대각선을 쓰는 것은
 * 어느 방향으로 돌려도 잘리지 않게 하기 위해서다(회전 중에 잘리면 오빗의 뜻이 없다).
 */
const FRAMING_MARGIN = 1.15

export function initialOrbitFor(diagonal: number, verticalFovDeg: number): OrbitState {
  const radius = (diagonal > 0 ? diagonal : 1) / 2
  const halfFov = (verticalFovDeg / 2) * (Math.PI / 180)
  return {
    // 도면을 그대로 내려다보는 방향에서 시작하지 않는다 — 고도 프로파일이 3D라는 사실이
    // 첫 프레임에 보여야 한다(FEAT-005 산출이 평면으로 보이면 없는 것과 같다).
    azimuthRad: 0,
    polarRad: (55 * Math.PI) / 180,
    distance: (radius / Math.tan(halfFov)) * FRAMING_MARGIN,
  }
}

/** a11y-responsive §포커스 순서가 규정한 키. 그 밖의 키는 이 위젯이 삼키지 않는다 */
const ROTATE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
const ZOOM_IN_KEYS = new Set(['+', '=', 'Add'])
const ZOOM_OUT_KEYS = new Set(['-', '_', 'Subtract'])

export function isOrbitKey(key: string): boolean {
  return ROTATE_KEYS.has(key) || ZOOM_IN_KEYS.has(key) || ZOOM_OUT_KEYS.has(key)
}

/**
 * 키 입력을 오빗 상태로 옮긴다. 다루지 않는 키는 `null` — 호출자가 그때만
 * `preventDefault`를 하지 않고 브라우저 기본 동작(스크롤·확대)을 남겨 두게 하기 위함이다.
 */
export function applyOrbitKey(
  state: OrbitState,
  key: string,
  limits: OrbitLimits,
): OrbitState | null {
  if (!isOrbitKey(key)) return null

  const next = { ...state }
  if (key === 'ArrowLeft') next.azimuthRad = state.azimuthRad - KEY_ROTATE_RAD
  else if (key === 'ArrowRight') next.azimuthRad = state.azimuthRad + KEY_ROTATE_RAD
  else if (key === 'ArrowUp') next.polarRad = state.polarRad - KEY_ROTATE_RAD
  else if (key === 'ArrowDown') next.polarRad = state.polarRad + KEY_ROTATE_RAD
  else if (ZOOM_IN_KEYS.has(key)) next.distance = state.distance / KEY_ZOOM_FACTOR
  else next.distance = state.distance * KEY_ZOOM_FACTOR

  next.polarRad = clamp(next.polarRad, limits.minPolarRad, limits.maxPolarRad)
  next.distance = clamp(next.distance, limits.minDistance, limits.maxDistance)
  return next
}
