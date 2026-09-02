# Feature Plan — Feature List·페이지 그룹

## Page Groups

| Page Group ID | Page | Route/Screen | Order |
|---|---|---|---|
| PAGE-001 | 트랙 뷰어 (단일 라우트, 다중 화면 상태) | `/` — input / loading / error / 3d-view / partial-failure / webgl-fallback / profile-strip / section-list | 1 |
| PAGE-000 | Common (출처 링크·디버그 영역 등 전역 책임) | all | 99 |

이 서비스는 단일 라우트 SPA다. 진입점이 여럿(입력·로딩·에러·3D뷰·부분실패·WebGL대체)이지만 계약(§16)에 따라
Page Group을 늘리지 않고 아래 Feature List의 `Screen` 열에 화면 상태를 유지한다. `PAGE-000`은 어느 화면에도
종속되지 않는 전역 책임(FEAT-001의 출처 링크 상시 노출)에만 부여한다.


## Feature List

| ID | Feature | User Value (1 line) | Priority | Page Group | Screen | Scope |
|---|---|---|---|---|---|---|
| FEAT-001 | URL 입력 및 서버사이드 fetch | 공유 링크만으로 트랙을 조회할 수 있다 | Must | PAGE-001 | input, loading, error | keep |
| FEAT-002 | 트랙 문자열 파싱 → 피스 목록 | 원본 문자열을 신뢰 가능한 피스 목록으로 변환한다 | Must | PAGE-001 | loading, error | keep |
| FEAT-003 | 진행 순서 복원 (끝점 매칭) | 순서 없는 배치에서 결정적인 주행 순서를 되찾는다 | Must | PAGE-001 | loading, error | keep |
| FEAT-004 | 폐곡선 검증 및 부분 실패 노출 | 데이터가 불완전해도 확인 가능한 만큼은 보여준다 | Must | PAGE-001 | 3d-view, partial-failure | keep |
| FEAT-005 | 고도 프로파일 생성 (슬로프 S곡선·뱅크 로그곡선) | 평면 배치를 실제 오르내림으로 재현한다 | Must | PAGE-001 | 3d-view | keep |
| FEAT-006 | 3D 씬 생성과 카메라 오빗 (형상 일치) | 도면과 일치하는 형상을 자유롭게 둘러본다 | Must | PAGE-001 | 3d-view | keep |
| FEAT-007 | 트랙 추종 시점 (플라이스루) | 코스를 따라가며 주행 감각으로 확인한다 | Must | PAGE-001 | 3d-view, profile-strip | keep |
| FEAT-008 | 레인체인지 표현 | 좌우 차선 이동 구간을 시각적으로 구분한다 | Must | PAGE-001 | 3d-view, section-list | keep |
| FEAT-018 | 레인보우 체인저(Lan2) 기하 | U턴형 레인체인지를 편집기 도면대로 레인별 명시 경로로 그린다 — 안쪽 레인은 작은 U턴, 나머지 둘은 한 칸 안으로 옮겨 큰 U턴 | Should | PAGE-001 | 3d-view | keep (2026-09-01 사용자 요청, D-049) |
| FEAT-009 | 미지원 피스 노출 | 모르는 부분을 조용히 숨기지 않고 알려준다 | Must | PAGE-001 | 3d-view, section-list | keep |
| FEAT-010 | 근거 등급 표기 (정직성) | 추정치와 실측치를 구분해 신뢰 범위를 알린다 | Must | PAGE-001 | 3d-view, profile-strip | keep |
| FEAT-011 | 대형 트랙 성능 완화 | 큰 트랙에서도 조작감을 유지한다 | Must | PAGE-001 | 3d-view | keep |
| FEAT-012 | 하단 프로파일 스트립 (표면) | 고도 변화를 한눈에 보고 원하는 지점으로 바로 이동한다 | Must | PAGE-001 | profile-strip | keep |
| FEAT-013 | 텍스트 구간 목록 (표면) | 전체 구간을 목록으로 훑고 특정 지점으로 점프한다 | Must | PAGE-001 | section-list | keep |
| FEAT-014 | WebGL 미지원 감지 및 2D 대체 표현 | 3D를 못 봐도 트랙 정보를 확인할 수 있다 | Must | PAGE-001 | webgl-fallback | keep |
| FEAT-019 | 3D 씬의 현재 구간 하이라이트 | 목록·스트립에서 고른 구간이 실제 트랙 어디인지 3D에서 바로 보인다 | Must | PAGE-001 | 3d-view, section-list, profile-strip | keep (2026-09-02 사용자 요청, PC-015) |

