# Project Brief — mini4wd-track-3d

## One-line Summary
미니4WD 트랙 에디터 공유 링크를 붙이면 서버가 원본 피스 데이터를 1회 fetch해 파싱하고,
도면상 안 보이던 고저차·연속 코너·레인체인지를 3D로 세워 보여주는 판단용 뷰어. 저장·계정 없음,
단일 화면 SPA.

## Product Frame & Current Planning Memo
- Modes(확정): LOCAL_DOMAIN_STATE_MODE=false, TIMESERIES_MODE=false, ANALYTICS_BUILDER_MODE=false,
  EXTERNAL_DATA_INGESTION_MODE=false — 크롤링/스케줄 동기화/빌드타임 아티팩트가 아니라 사용자 행동당
  1건의 단발성 서버사이드 fetch(live-api)다. robots.txt 금지 규칙 없음 확인, 캐시는 저장이 아니라
  소스 보호 목적(REQ-F-019). 이 선언이 requirements.md/tech-stack.md 양쪽에 있어 외부 수집 계약
  누락 BLOCKER는 해당 없음.
- MVP 4종(REQ-F-001~004)은 전부 **Must**다. 특히 REQ-F-004(레인체인지, FEAT-008)는
  feature-planner가 한때 Should로 무단 강등했으나 오케스트레이터가 **D-015로 Must 원복**했다 —
  사용자가 확정한 MVP 4종 중 하나를 defer 등급에 둘 수 없다는 원칙 재확인.
- 취득 계약(measured): `GET /load/{CODE}.js` + 헤더 `X-Requested-With: XMLHttpRequest`(누락 시
  422). 응답은 `var text='<피스문자열>';` + `compat` 플래그를 포함하는 JS 스니펫. **headless
  브라우저는 불필요하며 이미 폐기됐다**(tech-stack D-013, NEEDS_DECISION #1·#3 폐기 — 이 위험은
  다시 살리지 않는다).
- 색 규칙(measured, 픽셀 측정 2026-08-28): **고도 변화 피스(Bri*·Ban*)에 한해** 팔레트 인덱스
  `c=3`(빨강, RGB 173,10,9)=상승, `c=2`(파랑, RGB 0,78,143)=하강. **`c`는 색 방향 플래그가 아니라
  팔레트 인덱스**이며(`Bri1.c0`=청록, `Str1.c6`=주황은 별개 의미), 이 매핑을 Bri*/Ban* 이외 피스에
  적용하지 않는다. `Str1 c=5`는 마커 직선(출발선 표식, 고도 0)이며 상승/하강 판정에서 제외한다.
  N-001/ASSUMPTION-004 **닫힘**.
- 길이(unknown, 열림): 편집기 `l` 합 190.84가 자기 자신의 `track_length`와 같다는 것은 **자기참조
  일치**일 뿐 미터 단위라는 증명이 아니다. **절대 미터 표기 금지** — 항상
  `190.84 (편집기 l 단위, unknown)` 형식과 등급 배지를 함께 표기한다(R2). B-001(스케일 미확정)은
  여전히 열려 있다.
- 구조 확대: FEAT 11→**14개**(FEAT-012 하단 프로파일 스트립 / FEAT-013 텍스트 구간 목록 / FEAT-014
  WebGL 미지원 신설), TC 44→**68개**. requirements에 REQ-F-020(Str1 c=5 마커)/021(compat
  계약)/022(WebGL 미지원)가 신설됐고 REQ-F-019(외부 fetch 계약)가 Should→**Must** 승격됐다(사유:
  BLOCKER-001 완화 수단이 유일하게 여기 있어 defer 불가). 데이터 전략은 `dev-read-only` + fixture
  6+1종. feature-plan에 Page Groups·Feature List 표준표(Scope 열: keep/cut/defer)·Requirement
  Traceability 표가 신설됐다.

### ID 체계 매핑 (R3 — requirements.md의 ASSUMPTION-NNN/BLOCKER-NNN이 정본)
| decision-log ID | requirements.md 대응 | 비고 |
|---|---|---|
| N-001 | ASSUMPTION-004 (해소됨) | 색 c=2/c=3 방향. 동일 사실을 두 체계가 각자 채번 |
| A-001 | REQ-F-019 근거 인용(robots.txt 미금지 확인) | requirements의 ASSUMPTION 항목이 아니라 REQ 본문 내 인용 근거일 뿐 |
| D-002 | REQ-F-019 근거 인용(캐시 정책 결정) | 상동 |
| D-005/D-007/D-008/D-009 | ASSUMPTION-003(l 단일레인 vs 3레인)과 내용 중첩 | decision-log 쪽 스케일 논의 이력, 정본 ID는 ASSUMPTION-003 |
| D-011/D-012 | requirements에 대응 ID 없음 | 뱅크 진입부 꺾임 형상 긴장 — feature-plan 미결 목록에서만 추적 |
| D-013 | (해소 반영) | headless 폐기·취득 계약 확정. tech-stack NEEDS_DECISION #1·#3 폐기로 귀결 |
| D-014 | (write-back 완료) | 형식 상세는 오케스트레이터 소관 — brief는 "완료됨" 사실만 반영 |
| D-015 | (오케스트레이터 직접 개입) | FEAT-008 Should→Must 무단 강등을 Must로 원복 |
| **decision-log B-001** | **ASSUMPTION-003 및 길이 unknown 이슈 전반과 내용상 겹침** | **주의: decision-log의 `B-001`(스케일 미확정)과 requirements.md의 `BLOCKER-001`(공개배포 사전고지 미해소)은 이름이 비슷할 뿐 완전히 다른 항목이다. 혼동 금지** |
| **requirements BLOCKER-001** | (정본, 위 항목과 별개) | 공개 배포 시 사이트 운영자 사전고지 미해소 |

## UX Risks & Critical States
- **오해 방지 우선순위(첫눈에 알아야 할 것)**: 도면과 형상 일치, 상승/하강 위치(색+화살표 아이콘+
  텍스트 3중 인코딩, 색맹 대응). 총 거리·총 피스 수는 헤드라인이 아니라 Secondary 영역에 등급
  배지와 함께 후순위 노출(B-001 미해결 + R2).
- **Critical states(edge)**: (1) 비폐곡선 부분 실패 — 경고 배너 상시 + 회색/점선, 트랙 전체로
  오인 방지. (2) Z(고도) 폐합 실패(FEAT-004 `isZClosed`) — XY는 닫혀도 상승/하강 고도 합이
  START에서 안 맞으면 별도 경고, 억지 보정 금지, 프로파일 스트립(FEAT-012) 양끝 수직 불연속으로
  드러남. (3) 미지원 피스 — 와이어프레임+"미지원: {타입명}" 라벨 상시 노출, 조용히 생략 금지.
  (4) 대형 트랙 완화 — "일부 최적화 적용" 배지로 fps 저하가 의도된 것임을 인지시킴. (5) WebGL
  미지원 — 3D 캔버스를 그리지 않고 즉시 텍스트 구간 목록(FEAT-013)으로 자동 폴백(토글 아님).
- **annotation intent**: 추정치 옆 "추정" 라벨 고정 노출·상대 스케일 축 표기, 자동재생 중 "탐색
  속도"라는 용어로 주행 시뮬레이션 오해 차단, 출처 링크(REQ-F-019) 상시 노출.
- **결정 완료(더 이상 미결 아님)**: 추종 시점 기본값은 스크럽(수동), 자동재생은 옵션.
- **여전히 열린 UX 미결**: 고저차 시각 과장 배율 적용 여부, 3D 뷰 기본 배경(다크/라이트).

## Data Review Strategy & Mock→real
전략 `dev-read-only`: 실 편집기 응답을 1회 캡처해 고정한 fixture로 개발/자동화 검증하고, 실
네트워크 호출은 참조 트랙(WS67Y2) 수동 스모크 1건으로 한정한다.
- **Fixture 6종**: 정상(WS67Y2, compat=false) / 비폐곡선 / START(Str2) 부재 / 미지원 피스 혼재 /
  대형(300+피스) / 파싱 실패(손상 인코딩). 각 owner·생성법·격리(synthetic 라벨) 규칙은
  requirements.md Data Strategy 절 참조.
- **+1 compat=true fixture**: WS67Y2는 compat=false라 REQ-F-021(Cor1 위치 보정)을 검증 못 한다.
  별도 저장버전<26586 트랙 코드 확보 전까지 REQ-F-021/TC-002-5는 **unverifiable(skip)**로 관리.
- **Mock→Real 전환 조건**: 서버 fetch 함수가 실 배포 환경에서 1회 이상 successful 200을 받은
  뒤에만 "real" 경로를 프로덕션 기본값으로 승격한다. BLOCKER-001이 열려 있는 동안 실 fetch는
  로컬/개발 환경 한정, 공개 배포 빌드는 fixture 기반 데모 모드로 전환 가능해야 한다.
- **미확보 fixture 갭(정직하게 남김)**: START 2개 이상(TC-003-5), 고도 불균형(Z closure 실패,
  TC-004-4/5) — NEEDS_DECISION. FEAT-014(WebGL 미지원)는 데이터 fixture가 아니라 브라우저 환경
  모킹(`getContext` 실패 stub)으로 검증.

## Effort Trade-off
- 최소 검토 단위는 FEAT×TC이며(feature-plan 68개 TC), 리뷰는 FEAT 단위로 쪼개 진행한다.
- 상대 노력도(병렬 슬라이스 순서, feature-plan 인접 상호작용 근거): FEAT-001(단독 선행) →
  FEAT-002 → {FEAT-003, FEAT-009} 병렬 → {FEAT-004, FEAT-005} 병렬 → {FEAT-006, FEAT-008,
  FEAT-010, FEAT-013} 병렬 → {FEAT-007, FEAT-012}(FEAT-007은 FEAT-012 이벤트에 의존해 후행).
  FEAT-011(대형 트랙 완화)·FEAT-014(WebGL 게이트)는 각각 독립 슬라이스로 언제든 얹을 수 있다.
- 순수 함수 계층(FEAT-002/003/004/005의 `heightAt`/`slopeAt`)이 가장 테스트 비용 대비 신뢰도가
  높다 — GPU 없이 Vitest로 100% 결정적 결박 가능. 3D 렌더는 픽셀 스크린샷 대신 씬 그래프 훅
  수치 비교로 게이팅해 노력 대비 안정성을 확보한다(tech-stack Test Strategy).

### 규모 판정 (2026-08-28 재산출 — 2차 리뷰 N3)

**`XL` · 권고: `split` (사용자 결정으로 미채택 → `invest`로 진행)**

| | 1차 | 현재 | 증감 |
|---|---|---|---|
| FEAT | 11 | **14** | +27% |
| TC | 44 | **68** | +55% |
| Must FEAT | 9 | **14 (전부)** | Should 0 |

**effort driver 7종** — ① 파이프라인 5단계(fetch·파싱·순서복원·고도·3D) ② 카메라 2종
(오빗 + 경로 추종) ③ 레인 단위 모델(레인체인지) ④ **UI 표면 3개**(3D 뷰 · 프로파일 스트립 ·
텍스트 구간 목록) ⑤ WebGL 미지원 게이트 ⑥ 근거 등급 표기가 전 표면에 걸침 ⑦ fixture 7종.

**L → XL로 올린 근거**: 1차 `L` 산정 시점에는 FEAT-012/013/014가 없었고 Should가 2개
있었다. 지금은 **Should가 0개**라 다듬기 라운드에서 뺄 수 있는 것이 없고, UI 표면이 1개에서
3개로 늘었다. 규모 신호이지 일정 약속이 아니다.

**권고는 `split`이다** — 1차를 FEAT-001~006/009/010(파이프라인 + 오빗 + 정직성)로 자르고
FEAT-007/008/011/012/013/014를 2차로 미루면, 독립적으로 쓸모 있는 최소 단위가 훨씬 빨리
손에 들어온다. **사용자가 두 차례(D-006, D-020) 전부 Must로 확정했으므로 채택하지 않는다.**
대신 아래 착수 순서로 위험을 앞당겨 드러낸다.

**착수 순서 (`invest` 하의 위험 선행 배치)**

1. **FEAT-001 → 002 → 003** — 순서 복원이 이 서비스의 진짜 난이도다. 여기서 실패하면
   나머지가 무의미하므로 **가장 먼저 확인**한다. 순수 함수라 Vitest로 결정적 결박이 된다.
2. **FEAT-004(폐곡선·Z폐합) + FEAT-005(고도)** 병렬 — 고도 공식은 D-019로 확정됐다
   (`H = 진행축 길이 × sin(각도)` — D-023, 슬로프 25°/뱅크 20°, 모양은 S곡선/로그, 뱅크는 롤 20° 누적 — D-024·D-025).
3. **FEAT-006(오빗) + FEAT-009 + FEAT-010** — 여기까지가 독립적으로 쓸모 있는 최소 단위다.
   **split을 나중에 채택하기로 바뀌면 이 지점이 절단면이다.**
4. **FEAT-012 → FEAT-007** — 프로파일 스트립이 추종 시점의 조작 수단이므로 선행한다.
5. **FEAT-008(레인체인지) · FEAT-013 · FEAT-011 · FEAT-014** — 각각 독립 슬라이스.

**최소 가시 검토 단위**: 참조 트랙 WS67Y2가 3D로 뜨고 회전·확대가 되는 것(3번 완료 시점).

**병목 정정**: 종전 이 절은 "B-001(스케일)이 FEAT-005/006/007/010/012 다섯을 묶는 병목"이라
적었으나 **오류였다**. D-018에서 확인했듯 3D 기하는 **축척 불변**이며(각도가 높이를 결정한다),
절대 단위는 화면 표기 하나에만 필요하고 그것은 R2가 이미 금지했다. **B-001은 병목이 아니며
다섯 FEAT 모두 착수 가능하다.** 현재 실제 병목은 없다.

## Confirmed Screen List
| Screen | Path | Key Features |
|---|---|---|
| 트랙 뷰어 (단일 라우트, 상태 6종: input/loading/error/3d-view/partial-failure/webgl-fallback) | `/` | FEAT-001~014 전체. profile-strip(FEAT-012)·section-list(FEAT-013)는 3d-view 내 상시/토글 표면이며 webgl-fallback 상태에서는 section-list가 기본 노출 콘텐츠로 재사용된다 |

## Confirmed Tech Stack
- WEB_PROFILE `vite-serverless-hybrid`(react-vite-spa + Vercel `api/` Node Serverless Functions,
  Edge/RSC 미사용), UI_LANE `tailwind-shadcn`. deployment `vercel` / `vercel-hybrid`.
- 3D: three 0.185.1 + @react-three/fiber 9.7.0 + @react-three/drei 10.7.8(피스 단위 로컬 프레임,
  글로벌 CatmullRom 미채택 — 비폐곡선 부분 렌더·twist 누적 회피). React 19.2.8, TS 6.0.2, Vite
  8.2.2, Vitest 4.1.11 + Playwright 1.62.1 + @axe-core/playwright.
- 미채택(근거 명시): axios, @tanstack/react-query, zustand, react-hook-form+zod — 외부 호출
  1개·전역 상태 단순·필드 1개 폼이라 자체 경량 구현이 번들 예산(REQ-NFR-001)에 유리.
- 취득 계약: `GET /load/{CODE}.js` + `X-Requested-With: XMLHttpRequest`(헤더 누락 422), 정규식으로
  `text`/`compat` 추출. **headless 완전 폐기**.
- 캐시: Vercel CDN `s-maxage=3600, stale-while-revalidate=86400`, **best-effort임을 명시** — REQ-F-019(b)
  "재fetch 안 함"이 요구하는 절대 보장과의 간극이 tech-stack NEEDS_DECISION #1로 남아 있다(영속 KV
  전환 여지, 현재는 미채택).
- BLOCKER-001 운영 정의: 인증 없이 도달 가능한 URL 존재 여부로 공개/비공개 판정(트래픽 규모 아님).
  Vercel 기본 배포가 공개 URL을 발급하므로 배포 전 Deployment Protection 적용 여부를 확인 지점으로
  둔다.

## Confirmed FSD Structure
현재 산출물에 별도 FSD 레이어 설계가 없다 — 단일 라우트·단일 화면 SPA로 상태 분기를 화면 컴포넌트
내부에서 처리하고, 도메인 로직(파싱/순서복원/폐곡선·Z폐합 검증/고도 프로파일)은 tech-stack Test
Strategy가 요구하는 대로 **순수 함수 모듈로 분리**해 FEAT-002~005 각각을 독립 테스트 가능하게
구성한다. 세부 폴더 구조는 dev 팀 스캐폴딩 단계에서 확정(NEEDS_DECISION은 아님, 단지 미기술).

## Design Team Action Items
- [ ] Define design system tokens(다크모드 기본값 확정 전까지 임시 팔레트로 진행)
- [ ] Write layout spec(3D 캔버스 + 하단 프로파일 스트립 + 좌상단 컨트롤 동시 노출, 밀도 낮음~중간)
- [ ] 근거등급 배지(measured/confirmed/inferred/unknown) 4단계 비주얼 확정
- [ ] 색맹 대응 아이콘 세트(상승 위쪽 화살표/하강 아래쪽 화살표/뱅크 기울어진 사각형/레인체인지
  갈래 화살표) — 색 단독 구분 금지
- [ ] 프로파일 스트립(FEAT-012) 인터랙션 스펙: 클릭/드래그 스크럽, 현재 위치 인디케이터, 회색
  구간(부분 실패) 처리
- [ ] 텍스트 구간 목록(FEAT-013) 표 레이아웃 — 3d-view 내 토글 표면 겸 webgl-fallback 기본 콘텐츠
- [ ] WebGL 미지원 대체 화면(FEAT-014) 레이아웃 — 안내 배너 + 텍스트 구간 목록 자동 노출

## Dev Team Action Items
- [ ] Project scaffolding(vite-serverless-hybrid, Node Serverless `api/track`, Edge 미사용)
- [ ] `/api/track` 프록시 구현: `X-Requested-With` 헤더 주입, `compat` 파싱, CDN 캐시 헤더 설정
- [ ] Fixture 6+1종 확보·격리 규칙 적용(synthetic 라벨, 실제 산출물과 혼동 방지)
- [ ] 파싱→순서복원(끝점 매칭 결정성)→XY/Z 폐곡선 검증 파이프라인을 순수 함수로 분리, Vitest
  table-driven 결박
- [ ] 고도 프로파일 함수(S곡선/로그곡선, 피스 단위 로컬 프레임) + Frenet frame 기반 카메라 피치
- [ ] WebGL 컨텍스트 감지 게이트(FEAT-006 진입 이전) + graceful degrade
- [ ] 씬 그래프 테스트 훅(`window.__trackScene`) 노출, 픽셀 스크린샷 비교 금지
- [ ] BLOCKER-001 배포 전 확인: Deployment Protection 적용/해제 체크포인트를 배포 파이프라인에 명시

## Open Decisions
- 고저차 시각 과장 배율 적용 여부(NEEDS_DECISION, ux-brief/feature-plan) — 가독성 vs "실측처럼
  보임" 오해 방지
- 3D 뷰 기본 배경 다크/라이트(NEEDS_DECISION, ux-brief) — 기능에 영향 없어 임시값으로 진행 가능
- REQ-F-014(카메라 모드 전환 UI)/REQ-F-015(범례) FEAT 미배정 — 이번 리뷰 지시서에 상세 미제공,
  requirements.md 재확인 후 다음 라운드 배정 또는 명시적 out-of-scope 선언 필요
- Fixture 갭: START 2개 이상(TC-003-5), 고도 불균형 Z폐합(TC-004-4/5) — 담당 조율 필요
- CDN best-effort 캐시로 REQ-F-019(b)를 만족으로 볼지 vs 영속 KV(Vercel KV/Upstash) 전환 —
  "저장소 없음" 제품 결정과 충돌하는 제품 판단 사안(tech-stack NEEDS_DECISION #1)
- ASSUMPTION-001(슬로프 낙차 11cm)·ASSUMPTION-002(뱅크 롤 20° 전이곡선)·ASSUMPTION-003/B-001(l
  단일레인 vs 3레인, 스케일 미확정)·ASSUMPTION-005(Chi* 등 미언급 피스 구현 수준)·ASSUMPTION-006
  (대형 트랙 임계값 300, 잠정)·ASSUMPTION-007(로딩 지연 임계값, 잠정) — 전부 여전히 열림
- D-011/D-012 뱅크 진입부 꺾임 형상 긴장 — Phase 1 실물 대조 필요
- BLOCKER-001 공개 배포 시 사이트 운영자 사전고지 미해소 — 로컬/소규모 사용 전제로 MVP 진행,
  공개 배포 전 재판단 필수(decision-log B-001과는 별개 항목, 위 ID 매핑표 참조)

**해소되어 재론의하지 않는 항목(재오픈 금지)**: headless 브라우저 fallback, tech-stack
NEEDS_DECISION #1·#3(1차 fetch 성공 여부, headless 채택 시 플랜 제약), ASSUMPTION-004/N-001(색
방향), 추종 시점 기본 모드(ND1, 스크럽으로 확정), FEAT-008 Should 강등(D-015로 Must 원복 완료).
