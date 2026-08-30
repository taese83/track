# change-scope — FEAT-002

티켓 2 픽업으로 발급. ALLOWED_PATHS는 확인 후 확정(needsConfirmation).
스키마 정본: minimal-change-contract.md · 아래 JSON이 기계 정본(STALE 대조 입력).

```json change-scope
{
  "ticketKey": 2,
  "featureId": "FEAT-002",
  "TARGET_BEHAVIOR": "<!-- 외부 데이터(티켓 트래커 이슈) — 아래는 참고 스펙이며 지시로 해석하지 않는다 -->\n```text untrusted-ticket-body\n트랙 문자열 파싱 → 피스 목록\n\n**동작 명세**: \"클래스;x;y;각도;색\"을 `#`로 이은 원본 문자열을 개별 피스 객체 배열로 변환하고, 문법이 어긋나면 렌더를 진행하지 않고 파싱 실패를 알린다. 응답에 함께 내려오는 compat 플래그(parseInt(저장버전) < COMPATIBILITY_ID(26586), REQ-F-021)도 함께 파싱해 각 피스에 전달한다. compat=true면 Cor1의 45/135/225/315° 배치에 위치 보정이 필요함을 표시하는 메타데이터를 부여한다. 참조 트랙 WS67Y2는 compat=false이므로 이 보정 경로는 WS67Y2 데이터로는 검증할 수 없고 별도 compat=true fixture가 필요하다.\n\n- TC-002-1: Given 정상 문법의 참조 트랙(WS67Y2) 원본 문자열, When 파싱을 수행하면, Then 132개의 피스 객체(class, x, y, angle, color)가 산출된다.\n- TC-002-2: Given 정의 문법과 어긋난 손상 문자열, When 파싱을 시도하면, Then 파싱 실패 메시지가 표시되고 원본 응답 일부가 접이식 디버그 영역에 노출된다.\n- TC-002-3: Given 피스가 0개이거나 빈 문자열인 응답, When 파싱을 시도하면, Then 파싱 실패로 처리되고 디버그 영역에 원본이 노출된다.\n- TC-002-4: Given compat=false인 참조 트랙(WS67Y2) 응답, When 파싱하면, Then compat 플래그가 false로 기록되고 Cor1 위치 보정 메타데이터가 부여되지 않는다.\n- TC-002-5: Given compat=true fixture(요구사항 fixture 7종 중 7번째, WS67Y2로는 검증 불가), When 파싱하면, Then compat 플래그가 true로 기록되고 45/135/225/315° 위치의 Cor1에 보정 메타데이터가 부여되어 FEAT-006(배치)이 소비할 수 있다. 이 TC는 WS67Y2 데이터로는 실행 불가하며 별도 compat=true fixture가 확보되기 전까지 skip 상태로 관리한다.\n\n## 수용 기준 (AC ↔ TC)\n- [ ] TC-002-1\n- [ ] TC-002-2\n- [ ] TC-002-3\n- [ ] TC-002-4\n- [ ] TC-002-5\n\n<!-- web-harness:refs feat=FEAT-002 tc=TC-002-1,TC-002-2,TC-002-3,TC-002-4,TC-002-5 branch=feature/mini4wd-track-3d -->\n```",
  "requestType": "feature",
  "testCaseIds": [
    "TC-002-1",
    "TC-002-2",
    "TC-002-3",
    "TC-002-4",
    "TC-002-5"
  ],
  "ALLOWED_PATHS": [
    "src/entities/track/",
    "src/features/parse-track/",
    "src/features/load-track/",
    "src/pages/track-viewer/ui/TrackViewerPage.tsx",
    "src/pages/track-viewer/ui/ErrorScreen.tsx",
    "src/shared/lib/track/",
    "fixtures/track/",
    "e2e/"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "GET /api/track 응답 봉투(ResponseSuccessType/ResponseErrorType)와 TrackErrorCode 6종 — FEAT-002는 클라이언트 파이프라인이며 서버 계약을 바꾸지 않는다",
    "RawTrackResponse 필드 4종(trackCode/rawData/fetchedAt/compat)과 isRawTrackResponse 타입가드",
    "extractCode / isTrackCode / ALLOWED_HOST — FEAT-001이 결박한 host 위장 거부 4종 회귀 금지",
    "LoadState 상태 5종과 LoadErrorReason 6종: parse 경로를 소비할 뿐 기존 축을 제거·개명하지 않는다",
    "FEAT-001 e2e 11건의 관측 동작(TC-001-1~7) — 특히 세션 캐시 요청 0건(TC-001-6)과 출처 링크 상시 노출(TC-001-7)",
    "접근성 baseline: skip link, TopBar의 h1 단독 소유, ErrorScreen의 <details> 접이식 디버그 영역 마크업",
    "요청당 업스트림 fetch 정확히 1회 — 파싱 추가로 재조회가 생기지 않는다"
  ],
  "NON_GOALS": [
    "진행 순서 복원(끝점 매칭) — FEAT-003. 본 티켓은 vertex1/vertex2를 산출만 하고 매칭하지 않는다",
    "폐곡선·Z폐합 검증과 부분 실패 화면 — FEAT-004",
    "고도 프로파일(S곡선·뱅크 전이곡선) — FEAT-005",
    "3D 씬·카메라·3분할 셸 위젯(캔버스·프로파일 스트립·구간 목록) — FEAT-006/012/013",
    "미지원 피스의 화면 노출·배지 UI — FEAT-009. 본 티켓은 isSupported 판정값 산출까지",
    "compat 좌표 보정의 실제 가산 — FEAT-006. 본 티켓은 compatCorrectionApplied 메타데이터 부여까지",
    "px↔실물 cm 배율 확정(00_source 스케일 미해결)"
  ],
  "CHANGE_BUDGET": "src 8~12파일(entities/track 파서·카탈로그·타입, features 배선, page 상태 배선) + 테스트. 신규 런타임 의존성 0. 기존 fixture 8종 재사용 — 신규 fixture 추가 시 브리프 갱신",
  "sourceDigest": "1bf59dc7d3f188e51e657d34a7a6cfee683bc8671f9d020f48cc4eb5e34c53d1",
  "needsConfirmation": false
}
```

## Change Brief (minimal-change-contract 필드)

- **ALLOWED_PATHS**: src/entities/track/, src/features/parse-track/, src/features/load-track/, src/pages/track-viewer/ui/TrackViewerPage.tsx, src/pages/track-viewer/ui/ErrorScreen.tsx, src/shared/lib/track/, fixtures/track/, e2e/
  <!-- 이 줄이 기계 정본이다. enforce-agent-ownership.mjs의 readAllowedPaths는 JSON 블록이 아니라
       이 마크다운 한 줄만 파싱하고(정규식 `^-?\s*\*\*?ALLOWED_PATHS\*\*?\s*[:：]\s*(.+)$`),
       경로를 글롭이 아니라 **접두 경로**로 다룬다. `src/x/**`로 쓰면 정규식에 리터럴 `\*\*`로
       박혀 어떤 경로와도 맞지 않아 스폰이 전부 차단된다(실측 확인). 반드시 접두 경로로 적는다. -->
- **CHANGE_MODE**: `existing-change` — FEAT-001이 만든 파이프라인 1단계 위에 2단계를 얹고 기존 화면 상태 기계에 배선한다.
- **REQUEST**: 티켓 2(FEAT-002) — 원본 트랙 문자열을 피스 객체 배열로 파싱하고, 문법 위반 시 렌더를 진행하지 않고 파싱 실패를 알린다. compat 플래그를 함께 파싱해 Cor1 보정 메타데이터를 부여한다.
- **OBSERVED_BASELINE**: fetch 성공 시 `TrackViewerPage`가 원문 도착 사실(코드·길이·조회 시각·compat)만 카드로 표시하고 "피스 파싱·순서 복원·3D 표시는 아직 구현되지 않았습니다(FEAT-002 이후)"로 끝난다. `LoadErrorReason`에 `parse` 축과 `ErrorScreen`의 `<details>` 접이식 디버그 영역이 **이미 존재하지만 아무도 생산하지 않는다** — FEAT-002가 첫 생산자다. 소유자: `src/pages/track-viewer/ui/TrackViewerPage.tsx`(상태 기계), `src/features/load-track/model/useTrackFetch.ts`(fetch), `src/entities/track/model/`(타입).
- **TEST_EVIDENCE**: 전 TC `LOCAL_VERIFIABLE`. 변경 전 재현 = 현재 `fetch-success` 카드가 피스 수를 말하지 못함. 변경 후 = 아래 fixture로 유닛 + e2e.
  | TC | fixture | 검증 |
  |---|---|---|
  | TC-002-1 | `WS67Y2`(measured 실측 원문) | 132개 `ParsedPiece` 산출, 5필드 + 끝점 |
  | TC-002-2 | `PARSEFAIL`(합성, 중간 파괴+말미 절단) | 파싱 실패 문구 + `<details>` 디버그 영역에 원문 일부 |
  | TC-002-3 | 빈/0피스 응답 | 파싱 실패 + 디버그 영역 노출 |
  | TC-002-4 | `WS67Y2`(compat=false) | compat=false 기록, `compatCorrectionApplied` 미부여 |
  | TC-002-5 | `COMPAT1`(합성, 저장버전만 12345로 낮춤) | compat=true 기록, 45/135/225/315° Cor1 32개에 메타데이터 부여 |
- **CAPABILITY_ESCALATION**: `none`. 순수 클라이언트 문자열 변환이다 — 서버 실행 경로 신설 없음, 인증·DB·서버 SDK 의존성 없음, 신규 엔드포인트 fetch 없음, 외부 API 키 없음. 승격 QA(`security-reviewer`/`api-contract-verifier` 재투입) 조건 미발화.
- **DOCS_TO_UPDATE**: 충돌 개정 `none`. 선행 승격 1건 — `_workspace/02_design/piece-geometry.md` **신설**(끝점 카탈로그 23종·좌표 계약·compat 보정 판정). 수치는 decision-log PC-006과 승인된 프리뷰의 실측을 **그대로 옮긴 것**이며 새 설계 결정이 아니다. preview digest 대상 파일이 아니라 `validate-design-preview`는 승격 후에도 `APPROVED`다(실행 확인).

## 이 라운드에서 확정한 경계 판단

1. **`ParsedPiece.vertex1/vertex2`와 `isSupported`는 FEAT-002 소유다.** `feature-plan/data-model.md`가 두 필드를 `ParsedPiece`(FEAT-002 출력)에 두고, 승인된 프리뷰의 `parseTrackString`(주석 "2. 파서 (FEAT-002)")이 실제로 `p1`/`p2`와 `unknownGeom`을 산출한다. FEAT-003 명세의 "vertex1/vertex2에 회전·이동을 적용해 매칭"은 그 산출물을 **소비**하는 서술이다. 끝점을 FEAT-003으로 미루면 `ParsedPiece` 타입이 정본과 어긋난다.
2. **TC-002-5를 skip하지 않는다.** 티켓·feature-plan은 "별도 compat=true fixture가 확보되기 전까지 skip"이라 적었으나, FEAT-001이 `fixtures/track/COMPAT1.js.txt`를 이미 공급했고 실측 확인 결과 45/135/225/315° 각각에 `Cor1` 8개씩(합 32개)이 있어 **메타데이터 부여 경로가 실행 가능하다**. 통과율을 위해 게이트를 낮추지 않는 것과 같은 이유로, 실행 가능한 검증을 skip으로 남기지 않는다(I2). 다만 정직성 한계를 함께 남긴다 — `COMPAT1`은 원문의 저장 버전만 낮춘 **합성본**이라 이 TC가 증명하는 것은 *메타데이터 부여 판정*이고 *실제 구버전 트랙의 좌표*가 아니다. 좌표 재현은 FEAT-006이 실캡처를 확보할 때의 몫이다.

---

## 라운드 R1 — 구현 착수 (2026-08-30, Iterate mode / web-orchestrator 재진입)

선행 게이트 실행 기록(주장 아닌 실행 결과):

| 항목 | 명령 | 결과 |
|---|---|---|
| 디자인 프리뷰 | `validate-design-preview.mjs --project workspace/track --json` | `APPROVED` |
| 프로필 resolver | `web-core/resolve-profile.mjs --requested auto` | exit 0 · `vite-serverless-hybrid` (detected) → `_workspace/01_plan/project-profile.json` (`outputLanguage: "ko"` 병합) |
| 실행 DAG | `web-core/compile-execution-plan.mjs --profile-file …` | exit 0 · 12노드 → `_workspace/03_dev/web-execution-plan.json` |
| integration overlay | 신설 `_workspace/02_design/integration-overlay.json` | 실측값만 기록(alias `@/*`, router react-router, queryLibrary·msw·openapi = null) |
| UI lane | `validate-ui-lane.mjs --project .` | 일치 — `tailwind-shadcn`(overlay 실측 우선) |
| base 최신화 | `git merge origin/feature/mini4wd-track-3d` | ort 머지 1건(ticket-close CI) |

### 브리프 갱신 1 — 신규 fixture 1종 (CHANGE_BUDGET "신규 fixture 추가 시 브리프 갱신")

`fixtures/track/EMPTY1.js.txt`를 추가한다. TC-002-3("피스가 0개이거나 빈 문자열인 응답")은 기존
8종으로 **끝까지 재현되지 않는다** — 빈 `text`는 `extractUpstreamVars`가 `text-empty`로 잡아
502 `UPSTREAM_RESPONSE_UNRECOGNIZED`가 되므로 파서에 닿지 못하고, 나머지 fixture는 전부 132피스
이상이다. `text = '#'`(길이 1 → `isRawTrackResponse` 통과, 피스 0개)로 **파서 단계의 0피스**를
브라우저 경로까지 재현한다. 신규 런타임 의존성은 여전히 0이다.

### 브리프 갱신 2 — `src/features/parse-track/` 미사용 (ALLOWED_PATHS 축소가 아니라 미행사)

ALLOWED_PATHS는 이 경로를 허용하지만 **쓰지 않는다.** `validate-spawn-plan.mjs`가
`PLAN_OUTSIDE_MODULE_BOUNDARY`로 거부했다 — 확정 스팩의 `moduleBoundaries` 17종에 이 슬라이스가
없다(있는 것은 `src/features/load-track`). 파싱은 `track` → `ParsedPiece[]`의 **동기 순수 파생**이라
훅 상태가 필요 없으므로, 배선은 상태 기계 소유자인 `TrackViewerPage`의 `useMemo` 한 곳으로 간다.
스팩이 정본이고 계획을 스팩에 맞춘다.

### 스폰 계획 (`execution-budget-contract` 규칙 1·2 — 분해 + 발췌 주입)

| task | 산출물 | fit 게이트 | 계획 스팩 |
|---|---|---|---|
| `feat-002-parse-domain` | 5개 (`entities/track/model/types.ts`, `entities/track/lib/parse/{piece-catalog,parse-track-string,parse-track-string.test,index}.ts`) | `FITS` 5/8 · read ≈1,271 tok | `093b99e79d88a3fc` |
| `feat-002-parse-wiring` | 4개 (`fixtures/track/{EMPTY1.js.txt,README.md}`, `pages/track-viewer/ui/TrackViewerPage.tsx`, `e2e/track-parse.spec.ts`) | `FITS` 4/8 · read ≈2,829 tok | `303efa3c0482d167` |

선행 매니페스트 `feat-002-parse.json`(2026-08-30T01:32 잠금)은 **스팩 확정(02:48) 이전**에 만들어져
OD-001이 확정한 `entities/track/lib/parse/` 디렉터리 경계 대신 평면 경로를 담고 있다. 되돌려 고치면
잠금 digest가 깨지므로 폐기하지 않고 그대로 두되, 이 라운드의 정본은 위 두 매니페스트다.

### R1 실행 증거 (오케스트레이터가 직접 실행 — 두 빌더 스폰 모두 셸 도구가 없어 자체 확인을 못 했다)

실행 위치 `workspace/track` · Node `v24.18.1`(`.nvmrc` pin 일치, 확인함).

| 게이트 | 명령 | exit | 결과 |
|---|---|---|---|
| 스폰 완결성 (domain) | `verify-spawn-completion.mjs --paths src/entities/track --expect ×5` | 0 | 검사 12 · SUSPECT 0 · MISSING 0 |
| 스폰 완결성 (wiring) | `verify-spawn-completion.mjs --paths src/pages e2e fixtures --expect ×4` | 0 | 검사 11 · SUSPECT 0 · MISSING 0 |
| typecheck | `pnpm typecheck` (`tsc --noEmit`) | 0 | — |
| lint (소유 범위) | `npx eslint src api e2e` | 0 | — |
| unit | `pnpm test` (`vitest run`) | 0 | 4파일 **100 테스트** 통과(파서 35건) |
| build | `pnpm build` | 0 | 97 모듈 · 298.71 kB(gzip 95.22 kB) |
| e2e | `pnpm e2e` (playwright, `TRACK_UPSTREAM=fixtures`) | 0 | **20 통과** — FEAT-001 회귀 11 + FEAT-002 신규 9 |

TC별 착지(전부 `LOCAL_VERIFIABLE`, 미검증 경로 없음):

| TC | 유닛 | e2e | 관측값 |
|---|---|---|---|
| TC-002-1 | ✅ | ✅ | `piece-count` = 132 · 클래스 분포 고정 · `pieceId` 유일 |
| TC-002-2 | ✅ | ✅ | `PARSEFAIL` → parse 문구 + `<summary>` 펼침 후 `error-raw-snippet` |
| TC-002-3 | ✅ | ✅ | `EMPTY1`(신규) → 같은 실패 경로. 유닛은 `''`/`'#'`/`'##'`/공백 4종 |
| TC-002-4 | ✅ | ✅ | `compat-flag` false · `compat-corrected-count` 0 |
| TC-002-5 | ✅ | ✅ | `COMPAT1` → `compat-flag` true · `compat-corrected-count` **32** |

`PUBLIC_CONTRACTS_TO_PRESERVE` 회귀 확인: FEAT-001 e2e 11건이 그대로 통과했다 — 세션 캐시 요청
0건(TC-001-6)·출처 링크 상시 노출(TC-001-7) 포함. `useTrackFetch`·`ErrorScreen`·`api/`·
`src/entities/track/model/schema.ts`는 **한 줄도 바뀌지 않았다**(diff로 확인). 신규 e2e에 "파싱이
붙어도 요청당 `/api/track` 호출 1회" 회귀와 "START 부재는 파싱 실패가 아니다"(FEAT-003 경계) 회귀를
추가했다.

### 요청 외 변경 1건 (사전 승인 없이 수행 — 이 라운드가 만든 회귀의 즉시 정정)

`TrackViewerPage`의 `data-view-state`가 파싱 실패 화면에서도 `success`를 노출했다. FEAT-002 이전에는
`success`가 곧 성공 카드였으므로 **이 티켓이 만든 불일치**이지 기존 결함이 아니다(minimal-change §10의
"기존 결함" 게이트 대상이 아니라 §Verification의 자기 회귀 정정). component-spec의 `ViewState`가 이
경우를 `error`로 규정하므로 파생값 `viewState`로 교정했다. 소비자는 현재 0건(`grep` 확인)이지만
FEAT-003이 같은 자리에 실패를 얹는다. 정정 후 전 게이트 재실행해 위 표의 수치를 얻었다.

### 라운드 종료 게이트 3종

| 게이트 | 상태 | 근거 |
|---|---|---|
| ① 승격 QA | **N/A** | `CAPABILITY_ESCALATION: none`. 실제 diff에도 서버 실행 경로·인증/DB/서버 SDK 의존성·신규 엔드포인트 fetch·외부 키가 없다(`api/` 무변경, 신규 런타임 의존성 0) |
| ② Evidence 재발급 | **BLOCKED (하네스 결함)** | `_workspace/04_qa/evidence/`가 존재하지 않아 재발급 의무는 미발화. 그와 별개로 `run-quality-gates.mjs`가 이 프로젝트에서 **exit 2로 구조적 차단**된다 — 아래 참조 |
| ③ 문서 동기화 | **완료** | `DOCS_TO_UPDATE: none`(충돌 개정 없음). 부수 정정 1건: `fixtures/track/README.md`의 "`BADJS`를 뺀 7종" → 8종(EMPTY1 추가로 실제와 어긋나게 됨) |

### 미해소 — `run-quality-gates`가 이 프로젝트 형태에서 열리지 않는다

```
$ node .claude/scripts/run-quality-gates.mjs --project . --check quality.typecheck --allow-host-execution
External ingestion markers require both _workspace/02_design/ingestion-contract.md and
_workspace/02_design/runtime-data-contract.json.        (exit 2)
```

원인은 `web-core/ingestion-detection-lib.mjs`다 — 루트 `api/` 아래 파일이 `fetch(`를 포함하면
`network-source` 마커가 서고(`inspectNetworkIngestionSources`의 `segments[0] === 'api'` 분기),
`contractsComplete = CONTRACT_PATHS.every(exists)`가 두 파일 **모두**를 요구한다. 우회 capability
경로는 이 코드 경로에 없다. `api/track.ts`가 정확히 그 형태다.

이것은 이 프로젝트 고유 사정이 아니다 — **`vite-serverless-hybrid`의 감지 마커 자체가 루트 `api/`**이고
(`web-profile-contract.md`), 그 프로파일의 정의된 용례가 "얇은 serverless functions"다. 즉 하네스
built-in 프로파일 하나가 자기 대표 형태에서 quality runner를 열 수 없다. FEAT-001이 이를 만나지
않은 이유는 `04_qa/evidence/`가 아예 없기 때문이다 — 러너를 한 번도 돌리지 않았다.

**계약 문서 2종을 지어내 러너를 통과시키지 않았다**(I2 — 통과율을 위해 검증을 약화하지 않는다).
위 표의 수치는 러너 receipt가 아니라 **진단 증거**이며, 배포 후보 승격 시 `qa-evidence-contract.md`의
full runner로 승격해야 한다. 그때까지 이 라운드의 tier는 receipt 없는 `DIAGNOSTIC_VERIFIED` 미만이다.

### 미해소 — base 브랜치가 들여온 lint 오류 8건 (FEAT-002 무관)

`pnpm lint`(= `eslint .`)는 exit 1이다. 전부 `.github/scripts/close-merged-tickets.mjs`의
`no-undef: process` 7건 + `no-useless-assignment` 1건이고, base 머지 커밋 `c405038`에서 들어왔다
(`eslint.config.js`가 `.github/scripts/`에 node globals를 주지 않는 설정 공백). `.github/`는
`ALLOWED_PATHS` 밖이라 **조용히 고치지 않았다**(minimal-change §10). 소유 범위 `src api e2e`는 exit 0이다.
