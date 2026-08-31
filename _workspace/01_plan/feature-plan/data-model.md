# Feature Plan — 데이터 모델·인접 상호작용

## Data Model

파이프라인 각 단계는 서로 다른 타입이다 — "피스"와 "복원된 경로"와 "고도 프로파일이 붙은 3D 세그먼트"를 같은 타입으로 뭉개지 않는다.

```ts
// 1. 원본 응답 (서버 fetch 결과, FEAT-001 출력)
interface RawTrackResponse {
  trackCode: string
  rawData: string          // "클래스;x;y;각도;색" 을 '#'로 이은 원본 문자열
  fetchedAt: string        // 캐시 판단용(REQ-F-019, Must)
  compat: boolean          // parseInt(저장버전) < COMPATIBILITY_ID(26586). REQ-F-021. FEAT-002가 파싱해 소비
}

// 2. 파싱된 피스 — 순서 없음 (FEAT-002 출력)
interface ParsedPiece {
  pieceId: string           // 파싱 시 부여하는 임시 식별자. 원본 데이터에 순서 개념 없음
  pieceClass: string        // "Str1" | "Cor1" | "Bri1" | "Ban1" | "Lan1" | "Chi1" 등 23종 + 미지원 문자열
  x: number
  y: number
  angleDeg: number
  colorIndex: number        // 팔레트 인덱스(방향 플래그 아님). 고도 변화 피스(Bri*/Ban*)에 한해
                             // c=3=상승·c=2=하강(measured, D-014 — decision-log N-001 해소).
                             // Str1.c5=마커 직선(고도 0, REQ-F-020), 그 외 c값은 별도 팔레트 의미(예: Str1.c6=주황)
  vertex1: { x: number; y: number }   // 회전·이동 적용 후 절대 좌표계 끝점
  vertex2: { x: number; y: number }
  isSupported: boolean      // FEAT-009 판단 근거
  compatCorrectionApplied?: boolean   // pieceClass==='Cor1'이고 45/135/225/315°일 때 compat=true면 true(REQ-F-021).
                                       // FEAT-006 배치 단계가 소비. WS67Y2(compat=false)로는 항상 undefined/false
}

// 3. 복원된 경로 — 순서 있음, XY/Z 폐합 검증 포함 (FEAT-003/004 출력)
interface RestoredPath {
  orderedPieceIds: string[]   // Str2(START)부터 시작하는 결정적 순서
  isClosedLoop: boolean       // XY 평면 폐곡선 여부
  brokenAt: { afterPieceId: string; reason: string } | null   // XY 비폐곡선일 때만 존재
  isZClosed: boolean | null   // 고도(Z) 폐합 여부. isClosedLoop가 false면 계산 불가하여 null
  zClosureGap: { value: number; grade: 'measured' | 'confirmed' | 'inferred' | 'unknown' } | null
                              // START 시작/종료 절대고도 차이. FEAT-004가 산출, FEAT-012가 소비
}

// 4. 고도 프로파일이 붙은 3D 세그먼트 — 렌더 최종 입력 (FEAT-005~008 출력, FEAT-006/007/008/012 소비)
interface ElevatedSegment {
  pieceId: string
  pieceClass: string
  order: number                // RestoredPath 상의 위치, 0-based
  laneOffset: number           // 레인체인지 수평 오프셋(FEAT-008). 고도와 독립적인 필드로 분리
  elevationProfile: {
    kind: 'flat' | 'sCurve' | 'bankTransition' | 'plane'   // Str1.c5 마커 직선은 'flat'. 'logCurve'(D-029 로그 곡선)는 D-041이 대체 — 뱅크는 전이 곡선(bankTransition), 그 사이는 기운 평면(plane)
    heightAt(t: number): number   // t ∈ [0,1], 세그먼트 로컬 상대 높이(중심선). 곡면 메시 생성용
    slopeAt(t: number): number    // 이음매 접선 검증(±1°, REQ-F-002)·카메라 피치(FEAT-007) 파생용
    surfaceHeightAt?(point: { x: number; y: number }): number   // FEAT-017. 판 구간(bankTransition·plane)에서만 정의 — 편집기 2D 좌표 → 절대 고도. 렌더러가 레인 가장자리 높이를 이 함수로 정해 횡경사가 생긴다. 중심선에서는 absoluteElevationStart + heightAt(t)와 일치(불변식)
  }
  absoluteElevationStart: number   // 경로 누적 절대 고도(세그먼트 시작점). FEAT-004 Z 폐합·FEAT-012 프로파일 스트립 소비
  absoluteElevationEnd: number     // 세그먼트 종료점의 누적 절대 고도
  evidenceGrade: Array<{ field: string; grade: 'measured' | 'confirmed' | 'inferred' | 'unknown' }>   // R1 등급 체계. FEAT-010 소비
  isSupported: boolean          // FEAT-009 소비
}
```


## 인접 상호작용

- FEAT-001(fetch)이 실패하면 FEAT-002~014 전체는 비활성 상태를 유지한다. 파이프라인은 순차 의존이므로 FEAT-001은 단독으로 먼저 완결 가능한 단위다.
- FEAT-002(파싱)와 FEAT-003(순서 복원)은 서로 다른 실패 모드를 가진 별도 모듈이다. 파싱은 성공했지만 순서 복원이 실패(FEAT-004, 비폐곡선)하는 경우가 실제 요구사항이므로 두 실패를 하나의 에러 타입으로 합치면 REQ-F-007 검증 자체가 불가능해진다.
- FEAT-002에서 파생된 compat 플래그(REQ-F-021)는 FEAT-006(배치)이 Cor1 위치 보정을 적용할 때 소비한다 — 파싱과 배치 보정을 같은 단계에 합치면 compat=false(WS67Y2)만으로는 보정 로직 자체를 검증할 수 없다는 사실이 드러나지 않는다.
- FEAT-005(고도 프로파일)는 피스 단위로 독립 계산 가능해 FEAT-003(순서 복원)의 완료를 기다리지 않고 병렬 개발할 수 있다 — 순서 복원 담당과 곡선 수학(S곡선/로그곡선) 담당을 분리 가능.
- FEAT-004의 Z 폐합 검증 결과(`zClosureGap`)는 FEAT-012(프로파일 스트립)가 그래프 양 끝단 수직 불연속 표시에 소비한다(TC-004-6, TC-012-5).
- FEAT-006(정적 오빗 카메라)과 FEAT-007(경로 추종 카메라)은 같은 3D 씬을 공유하되 카메라 컨트롤러는 별도 컴포넌트/훅으로 분리한다. "전체 조망"과 "경로 재생"이라는 서로 다른 책임을 같은 hook에 숨기면 이후 전환 애니메이션(부드러운 컷) 요구가 꼬인다.
- FEAT-007(추종 카메라)은 하단 프로파일 스트립의 렌더링·인디케이터를 직접 소유하지 않는다 — 표면 자체의 소유자는 FEAT-012다. FEAT-007은 FEAT-012가 발생시키는 스크럽/클릭/키보드 이벤트를 구독해 카메라를 이동시킬 뿐이다.
- FEAT-008(레인체인지)은 FEAT-005(고도)와 FEAT-006(배치) 둘 다에 의존하지만, `laneOffset`은 `elevationProfile`과 독립된 수평축 변형이므로 데이터 모델에서부터 필드를 분리해 서로 다른 담당자가 동시에 작업할 수 있게 한다. FEAT-008의 텍스트 구간 목록 표기(TC-008-3)는 FEAT-013이 소유한 표면 위에 레인체인지를 한 세그먼트 유형으로 얹는 것일 뿐 목록 자체의 렌더·조작 책임은 FEAT-013에 있다.
- FEAT-009(미지원 표시)와 FEAT-010(근거등급)은 "조용히 생략하지 않는다"는 같은 정직성 UI 패턴(라벨/배지 상시 노출)을 공유하지만 트리거 조건이 다르다 — 미지원은 `pieceClass` 기준, 근거등급은 개별 수치 필드 기준이다. 하나의 배지 컴포넌트를 재사용하되 판정 로직은 분리한다. FEAT-009의 목록 표기(TC-013-3)도 FEAT-013 표면 위에 출력되며 3D 뷰의 플레이스홀더 렌더(TC-009-1)와는 별도 표시 경로다.
- FEAT-011(대형 트랙 완화)의 배지 노출 컴포넌트는 FEAT-006의 렌더 파이프라인 내부 최적화 로직과 분리한다 — 완화 기법(LOD, 인스턴싱 등, 세부는 tech-advisor 소관)이 바뀌어도 배지 노출 조건 로직은 영향받지 않아야 한다.
- FEAT-014(WebGL 미지원)는 FEAT-006(3D 씬 생성) 진입 이전 단계에서 게이트처럼 동작한다 — WebGL 컨텍스트 감지가 실패하면 FEAT-006~008의 3D 렌더 경로 전체를 건너뛰고 FEAT-013(텍스트 구간 목록)을 대체 표현으로 재사용한다(TC-014-2, TC-013-5).
- 병렬 작업 가능 단위: {FEAT-001} 완료 후 → {FEAT-002} → {FEAT-003, FEAT-009(피스 지원여부 판정)} 병렬 → {FEAT-004, FEAT-005} 병렬 → {FEAT-006, FEAT-008, FEAT-010, FEAT-013} 병렬 → {FEAT-007, FEAT-012}(FEAT-007은 FEAT-012의 이벤트에 의존하므로 FEAT-012 착수 이후 통합). {FEAT-011}은 FEAT-006 골격이 나온 뒤 언제든 얹을 수 있는 독립 슬라이스다. {FEAT-014}는 FEAT-006 착수 이전에 게이트로 먼저 얹을 수 있어 독립적으로 선행 개발 가능하다.

