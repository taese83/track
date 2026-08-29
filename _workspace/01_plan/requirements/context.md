# Requirements — 맥락·화면·ID 체계

## Modes
- LOCAL_DOMAIN_STATE_MODE: false — 계정·저장·목록·CRUD 없음. 붙여넣고 보면 끝(확정 사실).
- TIMESERIES_MODE: false — 실시간 메트릭/텔레메트리 아님. 플라이스루는 카메라 애니메이션이지 시계열 데이터 스트림이 아니다.
- ANALYTICS_BUILDER_MODE: false — metric/dimension 조합 대시보드 아님.
- EXTERNAL_DATA_INGESTION_MODE: false — 스케줄 동기화/크롤링/빌드타임 아티팩트가 아니라 사용자 요청 시점의 단발성 서버사이드 fetch(live-api). robots.txt에 금지 규칙 없음을 확인했고(사용자 행동당 1건 fetch), 동일 트랙 코드 재요청 시 서버가 원본 응답을 캐시해 origin fetch를 최소화한다(best-effort CDN 캐시) — 이는 사용자 데이터 저장이 아니라 소스 보호 목적의 캐시다(REQ-F-019).


## ID System (canonical — R3)
- 본 문서의 `ASSUMPTION-NNN`/`BLOCKER-NNN`을 프로젝트 전체의 정본 ID로 삼는다. `decision-log.md`의
  `A-00x`/`N-00x`는 별도 채번 체계이며, 이 문서를 포함해 어느 산출물에서 인용하든 항상
  `(decision-log A-002)`처럼 출처를 병기해 이 문서의 `ASSUMPTION-NNN`과 혼동하지 않는다.


## Service Overview
- 핵심 가치: 미니4WD 트랙 편집기 공유 URL을 붙이면 도면으로는 안 보이는 구간별 고저차·연속 코너를 3D로 세워 보여줘 세팅·주행 전략 판단 근거를 제공한다.
- 주 사용자: 코스를 분석해 세팅을 짜는 플레이어. 관람용이 아니라 판단용.
- 핵심 시나리오 3가지: (1) 링크 붙여넣어 트랙 전체 형상을 360도로 훑어본다 (2) 슬로프·뱅크 구간에서 높이 변화를 입체로 확인한다 (3) START부터 화살표 방향으로 따라가며 레인체인지·고저차를 구간별로 체감한다.
- 대상 화면: 단일 화면(입력 + 3D 뷰 + 상태/범례). 현재 pain: 2D 도면은 고저차·연속 코너 감이 오지 않음. 성공 기준: 참조 트랙(WS67Y2, 132피스)을 붙이면 도면과 일치하는 형상이 오류 없이 렌더되고 플라이스루로 전 구간을 통과할 수 있다.


## Product Frame Trace
본 문서는 planning-context.md 대신 오케스트레이터가 전달한 확정 사실/미결 목록을 1차 소스로 사용했다(발췌가 충분하다고 명시됨). REQ-F-001~004는 "사용자가 확정한 MVP 4종"에 1:1 대응, REQ-F-005~013은 "확정된 사실"(피스 인코딩, 진행순서 없음, 고도 모델, 저장 없음)과 "요구할 것" 2·3·4항에서 도출했다.
REQ-F-020~022는 적대 리뷰(`plan-review.md` #2/#3/#16)에서 확보한 measured 증거(색 인덱스 픽셀 측정, compat 계약)와
WebGL 미지원 경로 누락 지적에 대응해 신설했다(`review-response.md` requirements-analyst 절 참조).


## Screen List
1. 메인 뷰어 화면 — URL 입력, 3D 트랙 뷰, 상태/범례/근거등급 패널을 한 화면에서 제공.

