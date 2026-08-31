import type { ParsedPiece } from '../../model/types'

export type EvidenceGrade = 'measured' | 'confirmed' | 'inferred' | 'unknown'

export interface Point {
  x: number
  y: number
}

/**
 * 진행 순서와 **주행 방향**이 정해진 피스. `ParsedPiece`의 끝점은 카탈로그 순서라
 * 주행이 어느 쪽으로 지나는지를 담지 못한다 — 코너의 원호는 진입점이 뒤바뀌면 거울상이
 * 되므로(PC-009) 형상은 vertex1→vertex2로 만들고 `flipped`로 표본만 뒤집는다.
 * 방향 배정 자체는 이 모듈의 책임이 아니다 — 순서의 소유자(FEAT-003)와 그것을 소비하는
 * 화면이 정해서 넘긴다.
 */
export interface OrientedPiece {
  piece: ParsedPiece
  /** 주행이 vertex2 → vertex1 방향이면 true */
  flipped: boolean
}

/**
 * 고도 프로파일의 종류.
 * `data-model.md`는 `'flat' | 'sCurve' | 'logCurve'`로 적었으나 `logCurve`는 D-029의
 * 로그 곡선 뱅크 모델이고 **D-041이 그 구현을 대체했다** — 뱅크는 기울기가 단조 증가하는
 * 전이 곡선이고 그 사이 구간은 기운 평면이다. 폐기된 모델의 이름을 남기면 코드가
 * 뒤집힌 결정을 인코딩한다. 문서 정정은 후속으로 남긴다.
 */
export type ElevationProfileKind = 'flat' | 'sCurve' | 'bankTransition' | 'plane'

export interface ElevationProfile {
  kind: ElevationProfileKind
  /** t ∈ [0,1]. 세그먼트 진입점 기준 **상대** 높이 */
  heightAt(t: number): number
  /** t ∈ [0,1]. 진행 방향 기울기 dz/ds(무차원). 각도는 atan으로 얻는다 */
  slopeAt(t: number): number
  /**
   * 편집기 2D 좌표 → **절대** 고도. 중심선 밖(노면 가장자리)의 높이를 아는 유일한 통로다.
   * 판 위에서만 정의된다 — `flat`·`sCurve`는 채우지 않는다(FEAT-017 · D-029).
   * 불변식: `surfaceHeightAt(path.pointAt(t)) === absoluteElevationStart + heightAt(t)`
   */
  surfaceHeightAt?(point: Point): number
}

export interface EvidenceTag {
  field: string
  grade: EvidenceGrade
}

/**
 * `data-model.md`의 `ElevatedSegment` 중 **FEAT-005가 채우는 부분**.
 * `laneOffset`(FEAT-008)은 고도와 독립된 수평축 변형이라 여기서 만들지 않는다.
 */
export interface ElevatedSegment {
  pieceId: string
  pieceClass: string
  /** 진행 순서상 위치, 0-based */
  order: number
  elevationProfile: ElevationProfile
  /** 경로 누적 절대 고도(세그먼트 시작점) */
  absoluteElevationStart: number
  /** 경로 누적 절대 고도(세그먼트 종료점) */
  absoluteElevationEnd: number
  /** R1 등급 체계. FEAT-010이 소비한다 */
  evidenceGrade: EvidenceTag[]
  isSupported: boolean
}
