# change-scope — FEAT-001 개정 (로컬 서버 실호출 · D-046)

`/web-orchestrator` Iterate 라운드(2026-08-31). 티켓 없음 — 사용자 직접 요청
("기능 추가 - 로컬서버에서도 URL 입력시 동작하도록 해줘"). REQUEST_TYPE `feature`(소형).
스키마 정본: minimal-change-contract.md · 아래 JSON이 기계 정본(STALE 대조 입력).

CHANGE_MODE: existing-change
REQUEST: 로컬 서버(`pnpm dev`·`pnpm preview`)에서도 공유 링크를 넣으면 실제 트랙이 열린다.
OBSERVED_BASELINE: `api/track.ts` `useFixtures()`가 `TRACK_UPSTREAM` 미지정 + 비production을 **녹화본 전용**으로
  판정한다. 녹화되지 않은 실재 코드(예: FTSBH1)는 501 `FIXTURE_NOT_RECORDED` → 화면 "이 트랙은 로컬 녹화본에
  없어 조회하지 못했습니다. 개발 환경은 편집기를 호출하지 않습니다 — 실제 조회는 배포본에서 됩니다."
  Vite dev/preview 미들웨어(`vite.config.ts`)는 이미 같은 핸들러 코어를 마운트하고 있어 **배선은 있다** — 막는 것은
  모드 판정 하나다. owner: `api`(FEAT-001), 문구는 `src/pages/track-viewer/ui/ErrorScreen.tsx`.
TARGET_BEHAVIOR: TC-001-9 — `TRACK_UPSTREAM` 미지정 + 비production은 **auto**: 녹화본 파일·예약 코드면 녹화본,
  아니면 업스트림을 정확히 1회 fetch해 200. `fixtures` 명시는 종전 그대로(무접촉·미녹화 501). `live`·production은
  종전 그대로. `auto`를 명시값으로도 받는다. `fixture-not-recorded` 문구는 "녹화본 전용 모드(TRACK_UPSTREAM=fixtures)"
  사실에 맞춰 고치되 e2e가 잡는 "로컬 녹화본에 없어"는 유지한다.
ALLOWED_PATHS: api, src/pages/track-viewer (ErrorScreen.tsx 문구 1건만)
  + `playwright.config.ts` — **요청 외 변경, 사용자 승인(2026-08-31 "playwright localhost 정정도 포함해서")**:
    `BASE_URL` `127.0.0.1` → `localhost`. Vite 8 preview가 `::1`에만 바인딩되는 호스트에서 `pnpm e2e`의
    webServer 대기가 시간 초과되던 환경 결함(TEST_EVIDENCE 참조)의 정정. 테스트 시나리오·타임아웃·리포터는 불변.
PUBLIC_CONTRACTS_TO_PRESERVE:
  - `GET /api/track` 응답 봉투·에러 코드 7종·상태 코드·cache-control 계약(api-schema §5~7) 불변
  - 업스트림 호출 계약(§2): 요청당 fetch 정확히 1회 · 재시도 없음 · 고정 URL 조립(SSRF 차단) · `X-Requested-With` · 식별 UA · `redirect: 'error'`
  - `TRACK_UPSTREAM=fixtures`(vitest·playwright)의 결정성 — 기존 unit 24건·e2e 전부 무변경 통과
  - `handleTrackRequest(urlParam)` 시그니처와 `vite.config.ts` 미들웨어 배선
  - e2e 어서션 구절 "로컬 녹화본에 없어" · "코드가 맞는지 확인해 주세요" 부재
NON_GOALS:
  - `.env` 파일 로딩·`cross-env` 스크립트 추가(Vite는 `.env`를 `process.env`에 싣지 않는다 — 셸 변수로 충분)
  - 녹화본 추가·갱신, 클라이언트 캐시·UI 흐름 변경, 루트 README 전면 갱신(전체가 낡았으나 이번 범위 밖)
  - `.github/scripts` lint 오류 8건(기존, FEAT-011 라운드에서 이미 관측)
CHANGE_BUDGET: `api/track.ts` 모드 판정 함수 1개 + `api/track.test.ts` auto 모드 describe 1개(≈5 케이스) +
  `ErrorScreen.tsx` 문자열 1건. 의존성 0. 파일 3개.
TEST_EVIDENCE: (2026-08-31 확정 · 실행 위치 D:\Project\track · Node v22.11.0 — `engines >=22.12.0` 미만, Vite 8 경고 · pnpm 9.12.3)
  - 변경 전 재현: `pnpm dev`(localhost:5177, `TRACK_UPSTREAM` 미지정) GET /api/track?url=…/view/FTSBH1 → **501**
  - 변경 후 같은 요청 → **200**, 실데이터(`Str2;839.000;676.000;…`), cache-control `public, s-maxage=3600…` ·
    WS67Y2(녹화본) → 200 · ZZZZZZ(예약) → 404 — LOCAL_VERIFIABLE, 업스트림 실호출 1회
  - unit `pnpm test`: 28 files · **335/335**(+7, `auto 모드` describe, TC-001-9 인용) · typecheck 0 · build 0
  - lint: `eslint api src/pages/track-viewer` 0 · 전체 `pnpm lint`는 `.github/scripts/close-merged-tickets.mjs` 기존 오류 8건으로 실패(범위 밖, FEAT-011 라운드와 동일)
  - e2e: `pnpm e2e`는 **이 머신에서 웹서버 대기 시간 초과** — Vite 8 preview가 `::1`에만 바인딩되고
    `playwright.config.ts`는 `127.0.0.1:4173`을 폴링한다(실측: 127.0.0.1 연결 불가·localhost/[::1] 200).
    → `playwright.config.ts`를 `localhost`로 정정한 뒤(사용자 승인) 실제 `pnpm e2e`: **81 통과 · 5 실패** → 실패 5건 단일 워커 재실행 **4 통과**
    (병렬 부하 flake: axe/fps/자동재생) · 남은 1건 `track-evidence "캔버스 컬럼이 좁아져도…"`(범례 패널 311.6px > 304px)은
    **기준 소스 52314a3에서도 동일 실패** — 기존 결함, 이번 변경과 무관. FEAT-001 `track-load.spec` **12/12 통과**
    (501 문구 회귀 테스트 포함).
  - `verify-spawn-completion` 18/18 OK · `validate-spec-conformance`: **FAIL[acceptanceCoverage] TC-001-9, TC-008-2** —
    TC-001-9는 `api/track.test.ts` 3개 케이스 이름에 인용돼 있으나 검사기는 `testLayers`(`src`·`e2e`)만 훑고 `api/`는
    보지 않는다(vitest include에는 `api/**/*.test.ts`가 있다). auto 모드는 실업스트림 호출이라 fixtures 웹서버의 e2e로는
    재현할 수 없어 e2e 인용을 만들지 않았다(표면 인용 금지). TC-008-2는 선행 라운드부터의 공백.
  - 미검증(정직 표기): 브라우저 UI에서 실재 URL → 3D 뷰까지의 화면 스냅샷은 찍지 않았다 — 서버 응답 200과
    기존 e2e의 fetch-success→3D 경로가 각각 검증돼 있고 클라이언트 코드는 무변경이다.
CAPABILITY_ESCALATION: none — 서버 실행 경로·의존성·클라이언트 fetch 신설 없음. 이미 배포본이 타는 업스트림
  fetch 경로가 로컬에서도 켜질 뿐이며 SSRF 차단·호출 계약은 그대로다.
DOCS_TO_UPDATE: `02_design/api-schema/fixtures.md` §9 · `02_design/api-schema/common-envelope.md` §6 —
  **이 라운드에서 개정 완료(2026-08-31)**. 계획: `specs-pipeline.md` TC-001-9 신설 · `traceability.md` ·
  `decision-log/D-037~D-050.md` D-046 · `fixtures/track/README.md`.

**결정 1 — live 기본이 아니라 auto.** 예약 코드·합성 fixture를 `pnpm dev` 브라우저에서 재현할 수 있어야
하고 오프라인에서 참조 트랙이 열려야 한다. BLOCKER-001 완화는 §2 호출 계약이 담당한다(D-046).

**결정 2 — 판정은 서버 코어 한 곳.** `vite.config.ts`·클라이언트는 손대지 않는다. 계약이 두 벌이 되는 것을
막는다는 미들웨어 헤더 주석의 취지 그대로다.

**사전 관측(고치지 않음)**: 디자인 프리뷰 `validate-design-preview`가 `STALE(SOURCE_CHANGED)` — 이전 라운드부터의
상태이며 이번 변경은 화면 계약을 바꾸지 않아 재생성하지 않는다. 세션 Node v22.11.0은 `engines`
(`>=22.12.0`) 미만 — 게이트 결과에 버전을 병기한다. Gate 0 `validate-development-readiness`의 소유권 예행은
Windows에서 하네스 결함으로 실행 불가(`new URL(...).pathname`이 `/C:/…`를 내 `D:\C:\…`로 해석, MODULE_NOT_FOUND) —
실제 소유권 훅은 스폰 시점에 작동했다(스폰 산출물 3개 정상). `playwright.config.ts`의 `127.0.0.1` 폴링 vs
Vite 8 `::1` 바인딩 불일치는 개선 제안으로 남긴다(범위 밖·사용자 판단).

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-001",
  "TARGET_BEHAVIOR": "TC-001-9 — TRACK_UPSTREAM 미지정 + 비production은 auto(녹화본·예약 코드면 녹화본, 아니면 업스트림 정확히 1회 fetch → 200). fixtures 명시는 종전 그대로(무접촉·미녹화 501). live·production 종전 그대로. auto를 명시값으로도 받는다. ErrorScreen의 fixture-not-recorded 문구를 'fixtures 명시 모드' 사실에 맞춰 고치되 '로컬 녹화본에 없어'는 유지.",
  "requestType": "feature",
  "testCaseIds": [
    "TC-001-9"
  ],
  "ALLOWED_PATHS": [
    "api",
    "src/pages/track-viewer"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "GET /api/track 응답 봉투·에러 코드 7종·상태 코드·cache-control (api-schema §5~7)",
    "업스트림 호출 계약 §2 — 요청당 fetch 1회·재시도 없음·고정 URL 조립·X-Requested-With·식별 UA·redirect error",
    "TRACK_UPSTREAM=fixtures 결정성 — 기존 unit·e2e 무변경 통과",
    "handleTrackRequest 시그니처와 vite.config.ts 미들웨어 배선",
    "e2e 구절 '로컬 녹화본에 없어' 유지 · '코드가 맞는지 확인해 주세요' 부재"
  ],
  "NON_GOALS": [
    ".env 로딩·cross-env 스크립트 추가",
    "녹화본 추가·갱신, 클라이언트 캐시·UI 흐름 변경, 루트 README 전면 갱신",
    ".github/scripts lint 기존 오류 8건"
  ],
  "CHANGE_BUDGET": "api/track.ts 판정 함수 1개 · api/track.test.ts describe 1개 · ErrorScreen.tsx 문자열 1건 · 의존성 0",
  "sourceDigest": null,
  "needsConfirmation": false
}
```
