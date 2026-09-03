# change-scope — FEAT-019 / PC-015 · 3D 씬의 현재 구간 하이라이트

`/wh "프로파일이나 구간 목록을 클릭하면 실제 트랙에서 어느 위치인지 하일라이트 하는 기능 추가"`
(2026-09-02). 레인 `change`(동작을 새로 정의한다 — `request-type-contract.md`).
1-A 승인 체크포인트 통과 후 착수(사용자 "승인", 2026-09-02).
스키마 정본: `minimal-change-contract.md`. 직전 라운드는 `change-scope-archive/FEAT-012-PC-014.md`.

CHANGE_MODE: existing-change
REQUEST: 프로파일 스트립이나 구간 목록을 클릭하면 그 구간이 실제 3D 트랙의 어디인지 하이라이트한다.
OBSERVED_BASELINE (2026-09-02 코드 실측):
  - **커서 이동까지는 이미 성립해 있다.** `SectionList.onSelect`·`ProfileStrip.onScrub`이
    `setCursor(i,'list'|'strip')`을 부르고(`TrackScreen.tsx:73`·`:124`), 목록 행 강조·행 스크롤·
    roving 포커스(TC-013-6)·스트립 인디케이터가 따라간다.
  - **캔버스만 반응하지 않는다.** `TrackCanvas.tsx`가 `currentIndex`를 읽는 곳은 추종 카메라
    목표를 정하는 `useEffect` 하나뿐이고(`:489`) 그 첫 줄이 `if (!following || lastSource === 'canvas') return`
    이다. 추종을 끈 기본 오빗 시점에서 목록·스트립을 눌러도 3D 씬은 픽셀 하나 바뀌지 않는다.
  - `buildTrackGeometries`는 **색 단위로 면을 합치므로**(`track-geometry.ts:61`) 세그먼트 하나를
    골라 다르게 칠할 수 있는 렌더 단위가 씬에 존재하지 않는다 — 오버레이를 따로 세워야 한다.
  - REQ-F-023·REQ-F-024 원문의 "3D 뷰가 그 지점으로 이동한다"가 추종 ON에서만 참이었다.
TARGET_BEHAVIOR (TC-019-1~7, PC-015):
  - 추종이 꺼진 상태에서 공유 커서가 가리키는 구간에 `primary` 반투명 면 오버레이 + 윤곽선이 뜬다.
    동시에 하나뿐이며 목록 행 강조·스트립 인디케이터와 같은 `order`다.
  - 윤곽선은 `depthTest=false`라 가려진 구간도 위치가 보이고, 면은 깊이 검사를 유지한다.
  - 대상이 뷰 절두체 안이면 카메라를 전혀 건드리지 않는다. 밖이면 오빗 **타깃만** 옮기고
    방위각·극각·거리를 보존한다. `prefers-reduced-motion`이면 즉시 컷.
  - 추종 중에는 렌더하지 않는다. 추종을 끄면 현재 커서 구간에 다시 나타난다.
  - 도달 불가 구간에는 생기지 않는다(`isReachable` 거부가 이미 커서를 막는다).
  - 관측 표면: 캔버스 호스트의 `data-highlight-order`(미표시면 속성 부재).
ALLOWED_PATHS:
  - `src/widgets/track-canvas/lib/highlight-geometry.ts` (신규 + `.test.ts`) — 구간 하나의 면·윤곽선 버퍼
  - `src/widgets/track-canvas/lib/highlight-visibility.ts` (신규 + `.test.ts`) — 절두체 판정·타깃 이동 순수 함수
  - `src/widgets/track-canvas/ui/TrackCanvas.tsx` — 유일하게 수정하는 기존 소스 파일
  - `e2e/track-highlight.spec.ts` (신규) — TC-019 회귀
  - `_workspace` — 기획·설계·스팩·브리프 문서
PUBLIC_CONTRACTS_TO_PRESERVE:
  - 공유 커서 공개 API(`TrackCursorApi` 전 필드)와 발행 빈도 — 하이라이트는 **순수 구독자**이며
    `setCursor`를 부르지 않는다(shared.md §순환 갱신 방지책 1차 게이트)
  - `TrackCanvasProps`(`layout`·`elevated`) 무변경
  - 연속 진행 채널(PC-014) — 발행자 1·구독자 1 유지. 하이라이트는 구독하지 않는다(구간 단위)
  - `data-follow-order` / `data-follow-distance` 관측 표면
  - 오빗 카메라 계약 — TC-006-2·3·5·6(360° 순환 포함). 타깃 이동은 `onOrbitDepart`를 발행하지 않는다
  - 표면색 D-014(rise/fall 원본 편집기색) — 덧칠이지 치환이 아니므로 색 판정 불변
  - 목록·스트립 ARIA 계약(TC-012-*·TC-013-*) — 하이라이트에 대응하는 새 ARIA 표면을 만들지 않는다
  - 성능 예산 30fps(`orbitFps`), CLS 0.1 — 하이라이트는 씬 안 3D 요소라 DOM 레이아웃 무영향
NON_GOALS:
  - 캔버스에서 피스를 직접 클릭해 커서를 옮기는 것(REQ-F-018 툴팁) — 별건
  - 수직 비컨·"12/132" 라벨(사용자 기각) · 항상 카메라 이동(사용자 기각)
  - 라이트 모드 3D 대응 — `clearColor`가 이미 다크 하드코딩이며 이번에 바꾸지 않는다
  - 직전 라운드가 남긴 범위 밖 사실 4건(`--color-accent` 미정의 · 스트립 x축 인덱스 균등 ·
    `flythroughFps` 훅 미구현 · `orderAtDistance` 직선 피스 1칸 지연)
  - `specs-scene.md`(26KB)·`widgets.md`(18KB)의 sharding 15KB 상한 초과 분할 — 별건 제안
CHANGE_BUDGET: 신규 5파일(lib 2 + 단위 테스트 2 + e2e 1) · 기존 1파일 수정 · dependency 0
TEST_EVIDENCE:
  - 변경 전 재현: 추종 OFF에서 목록 행 클릭 시 캔버스 호스트에 `data-highlight-order` 부재,
    씬 스냅샷 무변화
  - 변경 후: TC-019-1~7 (아래 라운드 결과 절에 실측 기록)
CAPABILITY_ESCALATION: none — 서버 실행 경로 신규 0 · 인증/DB/서버 SDK 의존성 0 ·
  자체 엔드포인트 fetch/mutation 도입 0 · 외부 API 키 소비 0
DOCS_TO_UPDATE: component-spec/widgets.md, component-spec/pages.md, component-spec/shared.md,
  layout-spec/states.md, design-system/tokens.md, design-system/inventory.md,
  design-system/accessibility.md, performance-budget/targets.md
  (대조: api-schema/common-envelope·fixtures·track-endpoint, component-spec/features·pages·shared·widgets,
   design-system/accessibility·inventory·tokens, layout-spec/a11y-responsive·global-shell·states,
   performance-budget/measurement·mitigation·targets, piece-geometry, preview/behaviors,
   solution-design, design-review — 19개 전부 대조, 8건 충돌)
  → **③ 단계에서 8건 전부 개정 완료** (승인 체크포인트 이전)
ASSUMPTION:
  - A. 오버레이 불투명도 — 3D 표면 오버레이 토큰이 design-system에 없다(§4의 ≥0.88은 DOM 패널
    대상). rise/fall 원본색이 비쳐야 하므로 낮게 둔다. 0.35로 착수해 캡처 실측(2026-09-02,
    WS67Y2 확대)에서 평지 무채색 위가 너무 옅어 **0.45로 확정**했다 — 하강색 `#004E8F` 위
    합성색이 여전히 푸른 보라라 원본 hue가 읽힌다. **해소됨.**
  - B. 라이트 모드 미대응 유지 — 캔버스 `clearColor`가 `#101214` 하드코딩이라 이미 항상 다크다.
  - C. 절두체 판정 여유 NDC 0.85 — 경계에 걸친 대상이 클릭마다 깜빡이지 않게 안쪽 여유를 둔다.
  - D. 타깃 이징 300ms — `--duration-*` 토큰 대상 밖(design-system §4, 3D 코드 소관).

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-019",
  "TARGET_BEHAVIOR": "TC-019-1~7 — 추종이 꺼진 상태에서 공유 커서가 가리키는 구간에 primary 반투명 면 오버레이 + depthTest=false 윤곽선을 그린다. 대상이 뷰 절두체 안이면 카메라 불변, 밖이면 오빗 타깃만 이동하고 방위각·극각·거리는 보존한다. 추종 중에는 렌더하지 않는다. 하이라이트는 공유 커서의 순수 구독자이며 setCursor를 부르지 않는다.",
  "requestType": "feature",
  "testCaseIds": [
    "TC-019-1", "TC-019-2", "TC-019-3", "TC-019-4", "TC-019-5", "TC-019-6", "TC-019-7"
  ],
  "ALLOWED_PATHS": [
    "src/widgets/track-canvas",
    "e2e"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "TrackCursorApi 전 필드 무변경 — 하이라이트는 순수 구독자, setCursor 미호출(1차 게이트)",
    "TrackCanvasProps(layout·elevated) 무변경",
    "연속 진행 채널(PC-014) 발행자 1·구독자 1 유지 — 하이라이트는 구독하지 않는다",
    "data-follow-order · data-follow-distance 관측 표면",
    "오빗 카메라 계약 TC-006-2·3·5·6(360° 순환) · 타깃 이동은 onOrbitDepart를 발행하지 않는다",
    "표면색 D-014(rise/fall 원본 편집기색) — 덧칠이지 치환 아님",
    "목록·스트립 ARIA 계약(TC-012-* · TC-013-*) — 새 ARIA 표면 없음",
    "성능 예산 orbitFps 30fps · CLS 0.1"
  ],
  "NON_GOALS": [
    "캔버스에서 피스를 직접 클릭해 커서 이동(REQ-F-018 툴팁)",
    "수직 비컨·라벨(사용자 기각) · 항상 카메라 이동(사용자 기각)",
    "라이트 모드 3D 대응",
    "직전 라운드가 남긴 범위 밖 사실 4건(--color-accent · 스트립 x축 · flythroughFps 훅 · orderAtDistance 직선 피스 지연)",
    "specs-scene.md·widgets.md의 sharding 15KB 상한 초과 분할"
  ],
  "CHANGE_BUDGET": "신규 5파일(lib 2 + 단위 테스트 2 + e2e 1) · 기존 1파일 수정 · 의존성 0",
  "CAPABILITY_ESCALATION": "none",
  "sourceDigest": null,
  "needsConfirmation": false
}
```

## 라운드 결과 (2026-09-02)

### 변경한 파일

| 파일 | 성격 |
|---|---|
| `src/widgets/track-canvas/lib/highlight-geometry.ts` | 신규 — 구간 하나의 면·윤곽선 버퍼. 면은 `buildTrackGeometries` 재사용 |
| `src/widgets/track-canvas/lib/highlight-geometry.test.ts` | 신규 — 15건 |
| `src/widgets/track-canvas/lib/highlight-visibility.ts` | 신규 — 절두체 판정·이징·보간 순수 함수 |
| `src/widgets/track-canvas/lib/highlight-visibility.test.ts` | 신규 — 12건 |
| `src/widgets/track-canvas/ui/TrackCanvas.tsx` | 수정 — `CursorHighlight` 신설, 밴드를 위젯 수준으로 끌어올림, `data-highlight-order`·`data-camera-target` 발행 |
| `e2e/track-highlight.spec.ts` | 신규 — TC-019-1~7 |

`ALLOWED_PATHS` 밖 변경 **0건**. 신규 dependency **0건**.

### 설계상 결정 두 가지 (구현 중 확정)

1. **밴드를 `TrackMesh` 안에서 위젯 수준으로 끌어올렸다.** `buildLaneBands`의 이음새 미터링
   (`framesFor`)이 **이웃 세그먼트를 본다** — 하이라이트가 자기 구간만 따로 만들면 그 구간의
   진입·진출 가장자리가 트랙 면과 어긋난 자리에 그려진다. 같은 밴드 배열을 둘이 나눠 쓴다.
2. **면 오버레이는 깊이 검사를 유지하고 윤곽선만 끈다.** 둘 다 끄면 언덕 뒤 구간이 통째로
   뚫려 보여 "가려져 있다"는 사실이 화면에서 지워진다. 윤곽선은 `renderOrder=2`를 함께 준다 —
   `depthTest`만 끄고 순서를 두지 않으면 뒤에 그려지는 불투명 면이 덮는다.

### TEST_EVIDENCE (전부 LOCAL_VERIFIABLE — `DEPLOY_ONLY` 항목 없음)

- **변경 전 재현**: 추종 OFF에서 목록·스트립 조작 시 캔버스 호스트에 `data-highlight-order`가
  없고 씬이 바뀌지 않는다. 코드상 원인은 `TrackCanvas.tsx`의 `if (!following …) return`이며
  이것이 `currentIndex`를 읽는 **유일한** 지점이었다.
- **TC-019-1**: 목록 60행 클릭 → `data-highlight-order=0 → 40 → 90`, `aria-selected` 동기,
  캔버스 primary 픽셀 >0. 앞 행의 선택이 남지 않는다.
- **TC-019-2**: 스트립 `←/→` 5회 → `aria-valuenow` ≡ `data-highlight-order` ≡ 목록 선택 행.
- **TC-019-3**: 확대해 구간을 화면에 크게 세운 뒤 위에서 **113px**, 극각 **1.833rad**(π/2 초과,
  트랙 밑면)에서 **96px**. 노면이 하이라이트 면을 가려도 윤곽선이 남는다.
  전체 프레이밍(구간 하나 17px)에서는 사각의 안티에일리어싱에 묻혀 0으로 나온다 — 그래서
  이 TC는 **확대 상태로 잰다**(첫 시도의 실패가 이 사실을 드러냈다).
- **TC-019-4**: ① 전체 프레이밍에서 70행 클릭 → 방위각·극각·거리·타깃 **네 값 모두 불변**.
  ② 22회 확대 후 10행 클릭 → 타깃 `469.00,12.38,437.93 → 264.17,0.00,534.72`,
  방위각·극각 소수 3자리 일치, 거리비 1.000. 이동 뒤 primary 픽셀 >0.
- **TC-019-5**: 추종 ON → 속성 부재 + primary 픽셀 **0**(조작 오버레이는 마스크로 제외).
  추종 OFF → `data-highlight-order=25` 복귀.
- **TC-019-6**: UNSUPP에서 5행 선택 후 `aria-disabled` 행 강제 클릭 → 커서·하이라이트 불변.
- **TC-019-7**: 커서 20회 이동 + 오빗 조작 중 `__perfStats.orbitFps` **67.86**(하한 30의 2.3배).
- **보존 확인**: 기존 e2e 94건 전부 통과 — TC-006-*(오빗 360°)·TC-007-*(추종)·TC-012-*(스트립
  연속축)·TC-013-*(목록 스크롤·roving) 회귀 없음.
- **게이트**: `tsc --noEmit` 0 · `eslint src e2e` 0 · `vitest run` **410/410**(신규 27) ·
  `vite build` 0 · `playwright test` **101/101**(신규 7).
- **실제 구동 확인**(2026-09-02, `vite preview --port 5181`, fixtures 업스트림, 1440×900):
  WS67Y2에서 60행 클릭 → 씬의 그 구간에 보라 면·윤곽선, 목록 61행 강조·스트립 인디케이터와
  같은 자리. 22회 확대 후 100행 클릭 → 카메라 타깃 `469,12,438 → 820,0,519`, 구간이 화면
  한가운데에 크게 서고 **바로 위 하강 슬로프의 원본 파랑은 그대로**다(덧칠이지 치환이 아님을
  스크린샷으로 확인). 검증용 서버는 확인 뒤 내렸다.

### 라운드 종료 게이트 (execution-contract §Iterate mode 5)

- ① 승격 QA: **해당 없음** — `CAPABILITY_ESCALATION: none`(서버 경로·의존성·인증·외부 키 변화 0).
- ② Evidence 재발급: **해당 없음** — `_workspace/04_qa/evidence/`가 없다(이 프로젝트는 아직
  full runner receipt를 발급한 적이 없다). stale로 남는 receipt가 없다.
- ③ 문서 동기화: **완료** — `DOCS_TO_UPDATE` 8건 전부 개정됨(승인 체크포인트 이전에 수행).

### 이 라운드에서 드러난 범위 밖 사실 (고치지 않았다)

1. **`specs-scene.md` 26KB · `component-spec/widgets.md` 18KB** — artifact-sharding 계약의 절
   파일 상한 15KB 초과. **둘 다 이번 추가 전에 이미 초과**(각각 ≈20.5KB·16KB)였고 FEAT-019
   추가가 더 키웠다. 분할은 별건이다.
2. **`validate-artifact-sharding.mjs`를 실행하지 못했다** — 스크립트가 이 프로젝트 경로를
   "harness repository 또는 현재 세션 프로젝트" 밖으로 판정해 거부한다(`--project .`,
   절대경로 모두 동일). 위 KB 수치는 `wc -c` 직접 측정값이다.
3. **`TC-013-6`이 `acceptanceRefs`에 여전히 없다** — PC-013 라운드의 누락. 이번에는
   `TC-019-*`만 더했다(사용자 확인 후 별건 처리).
4. **`spec.json`은 손으로 고칠 파일이 아니다** — 이번 라운드에서 실측으로 확인했다.
   `acceptanceRefs`의 정본은 `solution-design.md`의 기계 결정 블록이고 `spec.json`은
   `spec.mjs` 출력의 저장본이다. 직접 편집하면 Gate 0의 `spec` 축이 "확정 뒤 입력이 바뀌었다"로
   막는다(실제로 막혔고, 그 차단이 옳았다).
5. **직전 라운드의 범위 밖 사실 4건은 그대로다** — `--color-accent` 미정의 · 스트립 x축 인덱스
   균등 · `flythroughFps` 훅 미구현 · `orderAtDistance` 직선 피스 1칸 지연.
