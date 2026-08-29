# Requirements — 데이터 전략·fixture

## Required APIs
- GET /api/track?url={encoded_share_url} — serverless function이 편집기에서 원본 인코딩 문자열을 fetch해 반환(파싱은 클라이언트 또는 동일 함수, 세부는 tech-advisor).


## Data Strategy
**전략: `dev-read-only`.** 개발/검증은 실제 편집기 응답을 1회 캡처해 고정한 fixture 세트로 진행한다.
서버사이드 fetch 함수(REQ-F-005/REQ-F-019)는 실 코드로 구현하되, 자동화 테스트는 캡처 fixture를 소스로
삼는다. 실 네트워크 호출은 수동 스모크 테스트(참조 트랙 WS67Y2 1건)로 한정한다.

**Mock → Real 전환 조건**
- 서버사이드 fetch 함수가 실제 배포 환경에서 1회 이상 successful 200 응답을 받은 뒤에만 "real" 경로를
  프로덕션 기본값으로 승격한다.
- BLOCKER-001(사전고지 미해소)이 열려 있는 동안에는 실 fetch를 로컬/개발 환경에서만 실행하고, 공개
  배포 빌드에서는 fixture 기반 데모 모드로 전환 가능해야 한다(전환 스위치 구현은 tech-advisor 영역).

**Fixture 6종** (owner / 생성 방법 / 격리 규칙)

| # | Fixture | 대응 REQ | Owner | 생성 방법 | 격리 규칙 |
|---|---|---|---|---|---|
| 1 | 정상 트랙 (참조 WS67Y2, 132피스) | REQ-F-001/002/003/004/006 | requirements-analyst 확보, dev 저장 | 실제 `GET /load/WS67Y2.js` 응답을 1회 캡처해 원문 그대로 저장 | 캡처 시각·요청 헤더를 fixture 메타데이터에 기록, 원본 문자열 수정 금지 |
| 2 | 비폐곡선(끝점 불일치) | REQ-F-007 | dev, 수동 제작 | 정상 fixture의 마지막 피스 좌표를 의도적으로 어긋나게 편집 | "synthetic" 라벨 필수, 실제 편집기에서 재현되지 않음을 주석으로 명시 |
| 3 | START(Str2) 부재 | REQ-F-006 | dev, 수동 제작 | 정상 fixture에서 Str2 항목을 제거 | synthetic 라벨, 제거한 항목 수를 diff로 기록 |
| 4 | 미지원 피스 타입 혼재 | REQ-F-008 | dev, 수동 제작 | 정상 fixture 중간에 23종 정의 밖 가상 클래스명을 삽입 | synthetic 라벨, 가상 클래스명임을 주석 명시(실제 편집기 산출물 아님) |
| 5 | 대형 트랙(임계값 부근, ASSUMPTION-006) | REQ-F-012 | dev, 스크립트 생성 | 정상 fixture 피스 배열을 반복 복제해 300+피스로 확장 | synthetic 라벨, 복제 배율을 메타데이터에 기록 |
| 6 | 파싱 실패(손상 인코딩) | REQ-F-011 | dev, 수동 제작 | 정상 fixture 문자열 중간을 임의로 잘라내거나 인코딩을 깨뜨림 | synthetic 라벨, 손상 위치를 diff로 기록 |

- 추가로 **compat=true 캡처 fixture**(REQ-F-021 전용, 위 6종과 별도)가 필요하다 — 참조 트랙 WS67Y2는
  `compat=false`라 6종만으로는 REQ-F-021을 검증할 수 없다. `compat=true`(저장 버전 < 26586)인 실제
  트랙 코드 1건을 추가 캡처해야 하며, 확보 전까지 REQ-F-021은 unverifiable로 TC에 명시한다.
- 44개 TC 중 최소 8개(비폐곡선/START 부재/미지원 피스/대형/파싱 실패 각 검증 TC 및 compat 관련 TC)는
  위 fixture 없이는 실행 불가하다 — feature-planner는 TC 작성 시 이 표의 fixture 번호를 전제조건으로
  참조한다.

