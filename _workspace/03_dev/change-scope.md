# change-scope — bug-fix (FEAT-004 · TC-004-2 회귀 · R84APY)

`/web-orchestrator` Iterate 라운드(2026-09-01). 티켓 없음 — 사용자 직접 요청("기능 오류 검토 - R84APY 트랙이
그려지지 않고 있어"). REQUEST_TYPE `bug-fix`. 스키마 정본: minimal-change-contract.md · 아래 JSON이 기계 정본.

CHANGE_MODE: existing-change
REQUEST: 공유 코드 R84APY(실재 트랙, 112피스)를 넣으면 3D가 아니라 "트랙 데이터가 심각하게 손상되어 표시할 수
  없습니다" 에러 화면이 뜬다. 트랙이 그려져야 한다.
OBSERVED_BASELINE (2026-09-01 실측 · `pnpm dev` localhost:5179 · auto 모드):
  - 서버 `GET /api/track?url=R84APY` → **200**, rawData 2948자 · compat=false. 파싱 112피스 · 미지원 0 ·
    클래스 Cor1/Str1/Ban1/Chi1/Bri1/Str2/Lan2. 결함은 클라이언트 파이프라인이다.
  - `restoreOrder` → `traversal-incomplete`. 원인은 **편집기 원본의 형상**: 세로 직선 위 (271.85,357.10)에 끝점 3개
    (p70 v2 · p71 v1 · p0 v1)가 모이는 3갈래 분기가 있고, Lan2(레인보우 체인저) 뒤 직선 p60(Str1 283.02,354.461,0°)의
    왼쪽 끝 (256.02,354.46)은 이웃이 0개(최근접 16.03px)인 **유일한 매달린 끝**이다 — 편집기 화면에서 그 직선이 분기점
    위에 겹쳐 놓였을 뿐 이어지지 않았다. 매달린 끝이 하나라 D-038 ② 브리지(정확히 둘)가 서지 않고, 그래프가
    "고리 + 꼬리(START 포함)"라 112피스를 한 줄로 꿰는 순서는 존재하지 않는다.
  - `validateClosure`는 이 경우를 위해 `walkConnectedPrefix`(START→p57→p58→p59→Lan2(p97)→p60, **6피스**,
    `brokenAt={afterPieceId:'p60', reason:'order-restore-failed'}`)를 이미 낸다. 그러나 `TrackViewerPage`가
    `traversal-incomplete`·`search-budget-exceeded`를 `RESTORE_ERROR_REASON`으로 `not-closed-fatal` **에러 화면**에
    태워 폐합 판정·씬 배치에 닿지 못한다. 같은 이유로 OPENLOOP 픽스처(TC-004-2의 "끝점이 어긋난 비폐곡선")도
    에러 화면에 착지한다(e2e `track-flythrough.spec` 주석의 실측). TC-004-2 "연결 가능한 구간은 정상 렌더되고 …
    렌더링은 중단되지 않는다"의 **구현 회귀**이며 e2e 인용 0건이었다.
  - 별건(사용자 가설 검증): Lan2는 카탈로그에 끝점(`[-90,-54]/[-90,54]`)이 있어 지원 피스로 파싱·복원되지만
    `buildPiecePath`에 선회 모델이 없어 **U턴이 아니라 두 끝점을 잇는 108cm 직선 현**으로 그려지고 `Lan*` 자리바꿈이
    적용된다. 순서 복원 실패의 원인은 아니다(끝점은 p59·p60과 정확히 맞물린다). 이 라운드 범위 밖 — 보고에 NEEDS_DECISION.
TARGET_BEHAVIOR: TC-004-2 — 순서 복원이 `traversal-incomplete`·`search-budget-exceeded`로 실패해도 START가 있으면
  에러 화면이 아니라 FEAT-004 부분 실패 경로를 탄다: `validateClosure`의 연결 접두부까지 3D·목록·스트립을 렌더하고
  (`truncated`), 배너 "연결이 끊긴 지점까지만 표시했습니다 — n/총피스"가 상시 노출되며, 나머지 피스는 목록·스트립에서
  회색(도달 불가)이다. `start-piece-missing`은 종전 그대로 에러 화면. R84APY → 6/112 · OPENLOOP → 131/132 렌더.
  파이프라인 요약의 `ordered-count`는 자리가 정해진 피스 수, `start-selection`은 복원 실패 사유를 함께 적는다.
ALLOWED_PATHS: src/pages/track-viewer (TrackViewerPage.tsx 라우팅) · e2e (TC-004-2 회귀 2건 + 주석 정정) ·
  fixtures/track (R84APY.js.txt 녹화 + README 행) · _workspace (change-scope · pages.md · 결정 D-048)
PUBLIC_CONTRACTS_TO_PRESERVE:
  - `restoreOrder`·`validateClosure`·`buildSceneLayout` 시그니처·판정 무변경(entities·widgets 손대지 않음)
  - `start-piece-missing` 경로(TC-003-4 e2e: 전용 문구·디버그 발췌·재시도) · 파싱 실패 경로(TC-002) 불변
  - 정상 폐곡선(WS67Y2·MULTISTART)의 `ordered-count`/`start-selection` 문구 비트 단위 동일(TC-003-1/2/5 e2e)
  - `TrackScreen` 배너 문구·셸 치수·testid · `LoadErrorReason` 타입(`not-closed-fatal` 키는 component-spec 계약이라 유지,
    생산자만 사라진다)
NON_GOALS: Lan2/Lan3 U턴 기하 모델(별도 feature) · 순서에 자리를 못 얻은 지원 피스의 3D 회색 배치(현 FEAT-004 구현은
  목록·스트립 회색 + 배너 + 배지) · START 화살표 반대 방향 탐색(D-038 ① 위반) · 편집기 원본 수정
CHANGE_BUDGET: `TrackViewerPage.tsx` 1개(outcome 분기 + 요약 2필드) · e2e 1파일(+2 케이스) + 주석 1곳 ·
  픽스처 1개 + README 1행 · 문서 2곳. 신규 소스 0 · 의존성 0.
TEST_EVIDENCE (2026-09-01 · D:\Project\track · Node v22.11.0(`engines >=22.12.0` 미만, Vite 8 경고) · pnpm 9.12.3):
  - 변경 전 재현: `pnpm dev`(localhost:5179, auto 모드) 브라우저에 R84APY 제출 → 서버 200(2948자) → 화면 "트랙 데이터가
    심각하게 손상되어 표시할 수 없습니다" + 디버그 "끝점을 이어도 모든 피스를 한 줄로 꿰지 못했습니다.(파싱된 피스 112개)".
    임시 vitest 진단(커밋 안 함): 112피스 · `traversal-incomplete` · 접점 클러스터 이상 = 3갈래 (271.85,357.10) + p60 v1 이웃 0 ·
    `validateClosure` connected=6, brokenAt p60.
  - 변경 후 같은 제출 → `track-screen` 렌더, 배너 "연결이 끊긴 지점까지만 표시했습니다 — 6/112피스", 목록 6행 도달 가능 · 106행
    "연결 실패로 접근 불가", 요약 "복원된 순서 6 · p61 · 순서 복원 실패 — … p60 뒤에서 끊김.", 캔버스 6피스 렌더(스크린샷),
    콘솔 에러 0(THREE.Clock deprecation 경고만).
  - 게이트: `tsc --noEmit` 0 · `eslint src e2e` 0 · unit `pnpm test` **348/348**(무변경 — 이 수정은 페이지 라우팅) · `pnpm build` 0
  - e2e `track-restore.spec` **9/9**(신규 TC-004-2 2건 포함, 단일 워커 10.6s) · 전체 `pnpm e2e` 병렬 82 통과·9 실패 → 해당 3스펙
    (evidence·flythrough·scene) 단일 워커 재실행은 아래 FEAT-018 라운드의 전체 단일 워커 실행으로 대체(같은 소스 상태에서 함께 기록).
  - code-reviewer **WARN**(low 2) → 배너 조건 정정 반영(위 후속 반영), 타이브레이크는 기록만. `verify-spawn-completion`은 판정 계열이라
    `FINDINGS:` 마커로 확인.
  - 미검증(정직 표기): `search-budget-exceeded`를 내는 실데이터는 없어 그 분기는 타입·코드 경로로만 확인했다.
CAPABILITY_ESCALATION: none — 서버·의존성·fetch 경로 변화 없음.
DOCS_TO_UPDATE: `02_design/component-spec/pages.md` §화면 상태 머신 전이 문장("순서복원 실패→error"을 START 부재로
  한정, traversal 실패는 partial-failure) · 결정 D-048(decision-log) · `fixtures/track/README.md` 행.

**후속 반영(2026-09-01, code-reviewer WARN 2건 low)**: ① `TrackScreen` 배너 분기를 `layout.truncated || !closure.isClosedLoop`로
정정 — 복원 실패 + 진단 걷기가 전 피스를 덮은 조합에서 "XY 폐곡선이지만…" 오표기 가능성(문구·testid 불변, 조건 1줄).
② `walkConnectedPrefix`의 동점 타이브레이크가 사전식(`'p10' < 'p9'`) — 결정성은 유지되며 entities 무변경 계약이라 기록만.
③ `not-closed-fatal` 존치 권고 채택(계약 유지, 생산자 없음은 pages.md에 기록). `features/load-track/model/types.ts` 주석은
ALLOWED_PATHS 밖이라 손대지 않았다.

---

# change-scope — FEAT-018 레인보우 체인저(Lan2) 기하 (같은 라운드, 사용자 추가 요청)

사용자 메시지(2026-09-01): "레인체인지 렌더링이 잘못되고 있어 … 이번에는 이런식으로 되어야해, 기존 레인체인지와 비교해봐"
(`Lan2.0` 스프라이트 링크) + "프로젝트에 정보가 있는지도 확인해봐". REQUEST_TYPE `feature`(소형, 데이터 계약 변경 없음 —
`SceneSegment`에 선택 필드 추가). 기획: `specs-scene.md` FEAT-018 · 결정 D-049 · 정본 `piece-geometry.md` §레인보우 체인저.

CHANGE_MODE: existing-change
REQUEST: Lan2를 편집기 도면대로 U턴형 레인체인지로 그린다.
OBSERVED_BASELINE: 프로젝트 내 Lan2 정보는 끝점(`piece-catalog.ts`·`piece-geometry.md`·`preview/store.js`)과 치수·편집기 길이
  (`00_source/track-editor-data-model.md`: 180×144, 9.81m)뿐. `buildPiecePath`에 `Lan*` 선회 모델이 없어 108cm 직선 현 +
  `laneOffsetAt` 자리바꿈으로 그려진다(R84APY 6피스 렌더에서 실측). Lan1 도면(162×36)은 기존 모델(가운데 45% 직선 이동)과
  일치 — 결함은 Lan2 전용이다.
TARGET_BEHAVIOR: TC-018-1~10 — 레인별 명시 경로(레인 0·1: [−28,8] 12cm 안쪽 이동 → 중심 (15,0) r54/42 U턴, 레인 2: 중심
  (−51.5,12) r54 U턴을 **곡면 따라 대각선으로 올라갔다 내려오는 산**(램프 시작 0 → 꼭짓점 12cm → 램프 끝 0, 선형)),
  중심선 = 105+54π+105, 레인 면·카메라가 명시 경로를 소비(표본 호 길이 3cm 간격), 바운딩박스 포함. 순환은 D-033과 동일.
  이력: 8cm 고원 → 뱅크 횡경사 20° 추가 → 사용자 지시로 횡경사 제거·산 형상 확정(D-049 ⑥).
ALLOWED_PATHS: src/entities/track/lib/elevation (piece-path.ts 분기 + 신규 local-path.ts·lane-routes.ts + 테스트) ·
  src/widgets/track-canvas (scene-layout.ts lanePaths·bounds · lane-bands.ts 명시 레인 · flythrough-camera.ts 명시 레인 + 테스트) ·
  _workspace (기획·결정·정본)
PUBLIC_CONTRACTS_TO_PRESERVE:
  - `Lan1`·직선·코너·웨이브의 경로·레인·카메라 좌표 **비트 단위 동일**(TC-008-*, TC-016-*, TC-007-*, TC-017-* 기존 단위 테스트 전부)
  - `buildPiecePath`·`buildSceneLayout`·`buildLaneBands`·`buildFlythroughPath` 시그니처 · `SceneSegment` 기존 필드 · `laneOffsetAt`/`laneShiftsCm` 무변경
  - 레인 순환(D-033) — Lan2 통과 뒤 카메라 레인 `(lane+1)%3`
  - WS67Y2 참조 트랙 e2e 전부
NON_GOALS: Lan3(burning changer) 기하 · r=66 막힌 밴드 렌더 · 편집기 길이 공식 재현 · Lan2 전용 마커/라벨 · 목록 유형명 변경
CHANGE_BUDGET: 신규 2파일(local-path.ts·lane-routes.ts) + 수정 4파일(piece-path·scene-layout·lane-bands·flythrough-camera) +
  테스트 3~4파일 · 의존성 0 · 기획 4문서.
TEST_EVIDENCE (2026-09-01 · D:\Project\track · Node v22.11.0(`engines >=22.12.0` 미만) · pnpm 9.12.3):
  - 도면 실측: `Lan2.0`(180×144)·`Lan1.0`(162×36)·`Lan3.0`(90×180) 스프라이트를 내려받아 휘도 ASCII 맵으로 좌표를 읽었다
    (scratchpad, 커밋 안 함). Lan1은 기존 모델(가운데 45% 직선 이동)과 일치 · Lan2는 위 §정본 · Lan3는 범위 밖.
  - 변경 전(브라우저, R84APY 6피스 렌더): Lan2가 두 끝점을 잇는 세로 직선 현(108cm)에 `Lan*` 자리바꿈이 얹혀 그려짐(스크린샷).
  - 변경 후 같은 화면: 레인 0·1이 큰 U턴, 레인 2가 안쪽 작은 U턴으로 진출 팔 두 레인 위를 넘는 형상(스크린샷
    `screenshot-1788190617851-4.png`) · 콘솔 에러 0.
  - 1차 실측 실패(TC-018-4: 레인 중심선 최근접 2.26cm)가 레인 2의 **교차**를 드러내 육교 프로파일을 추가했다(D-049 ④). 2차
    실측 실패(레인 0·1 최근접 11.48)는 사선 이동 구간의 평행선 수직 간격(12·cos(atan 1/3) = 11.38) — 기하의 귀결로 TC 정정.
    카메라 "54cm 점프"는 직선 피스의 표본 2개(54cm)였다 — 테스트 가정 오류, Lan2 안으로 범위 한정.
  - 게이트: `tsc --noEmit` 0 · `eslint src e2e` 0 · unit **367/367**(+19: lane-routes 10 · lane-routes-scene 9; 기존 348 무변경 통과 =
    비-Lan2 피스 좌표 보존의 증거) · `pnpm build` 0
  - 후속 3회(같은 라운드, 사용자 지시): ① "매끄러운 곡선" → 표본 호 길이 3cm 간격(TC-018-9, 원호 꺾임 <5° 실측) ② "뱅크처럼"
    → 횡경사 20° 추가 ③ "이전으로 되돌리고 곡면 따라 대각선으로 올랐다 내려오는 형태" → 횡경사 제거, 산 프로파일(꼭짓점 12cm,
    선형, TC-018-8·10). 교차 구간 최소 여유 실측 **3.46cm**(>0). code-reviewer(PASS, low 6) 중 3건 반영(미터링 프레임·t 주석·
    이음새 단언), 3건 기록.
  - e2e 대상 4스펙(restore·flythrough·lane-change·scene) 단일 워커 **29/29** · 전체 `pnpm e2e --workers=1` **90 통과 · 1 실패** —
    실패 1건 `track-evidence "캔버스 컬럼이 좁아져도…"`(범례 패널 311.6 > 304px)는 기준 소스에서도 동일 실패(기존 결함, 무관).
  - 미검증(정직 표기): Lan2가 뒤집혀(vertex2 진입) 놓인 실데이터는 없어 뒤집힘은 단위 테스트(TC-018-3·8)로만 확인했다. 육교
    램프 길이 30cm는 도면 음영에서 잡은 ASSUMPTION. e2e에는 Lan2 전용 시나리오를 만들지 않았다(수치 축이 정본, R84APY e2e가
    렌더 도달을 잰다).
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: `piece-geometry.md` §레인보우 체인저(신설) · `data-model.md` `SceneSegment.lanePaths` · `specs-scene.md` FEAT-018 ·
  `feature-list.md`·`INDEX.md` · D-049.

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-018",
  "TARGET_BEHAVIOR": "TC-018-1~7 — Lan2를 레인별 명시 경로(레인 0·1: [-28,8] 12cm 안쪽 이동 → 중심 (15,0) r54/42 U턴, 레인 2: 중심 (-51.5,12) r54 U턴)로 그리고, 중심선은 105+54π+105, 레인 면·추종 카메라·바운딩박스가 명시 경로를 소비한다. 순환은 D-033 동일.",
  "requestType": "feature",
  "testCaseIds": ["TC-018-1", "TC-018-2", "TC-018-3", "TC-018-4", "TC-018-5", "TC-018-6", "TC-018-7"],
  "ALLOWED_PATHS": ["src/entities/track/lib/elevation", "src/widgets/track-canvas", "_workspace"],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "Lan1·직선·코너·웨이브의 경로·레인·카메라 좌표 비트 단위 동일(기존 단위 테스트 전부)",
    "buildPiecePath·buildSceneLayout·buildLaneBands·buildFlythroughPath 시그니처 · SceneSegment 기존 필드",
    "레인 순환 D-033 — Lan2 뒤 (lane+1)%3",
    "WS67Y2 e2e 전부"
  ],
  "NON_GOALS": ["Lan3 기하", "r=66 막힌 밴드 렌더", "편집기 길이 공식 재현", "목록 유형명 변경"],
  "CHANGE_BUDGET": "신규 2 + 수정 4 + 테스트 3~4 · 의존성 0",
  "sourceDigest": null,
  "needsConfirmation": false
}
```

---

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-004",
  "TARGET_BEHAVIOR": "TC-004-2 — 순서 복원이 traversal-incomplete·search-budget-exceeded로 실패해도 START가 있으면 에러 화면이 아니라 validateClosure의 연결 접두부까지 렌더(truncated)하고 배너를 상시 노출한다. start-piece-missing은 종전 그대로 에러. R84APY 6/112 · OPENLOOP 131/132.",
  "requestType": "bug-fix",
  "testCaseIds": [
    "TC-004-2"
  ],
  "ALLOWED_PATHS": [
    "src/pages/track-viewer",
    "e2e",
    "fixtures/track",
    "_workspace"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "restoreOrder·validateClosure·buildSceneLayout 시그니처·판정 무변경",
    "start-piece-missing·parse 실패 경로 불변(TC-003-4·TC-002 e2e)",
    "정상 폐곡선의 ordered-count/start-selection 문구 동일(TC-003-1/2/5)",
    "TrackScreen 배너 문구·셸 치수·testid · LoadErrorReason 타입"
  ],
  "NON_GOALS": [
    "Lan2/Lan3 U턴 기하 모델",
    "자리 없는 지원 피스의 3D 회색 배치",
    "START 반대 방향 탐색",
    "편집기 원본 수정"
  ],
  "CHANGE_BUDGET": "TrackViewerPage.tsx 1개 · e2e 1파일 +2 · 픽스처 1 + README 1행 · 문서 2곳 · 의존성 0",
  "sourceDigest": null,
  "needsConfirmation": false
}
```
