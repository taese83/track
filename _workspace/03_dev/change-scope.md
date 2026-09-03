# change-scope — FEAT-010 cut / PC-018 · 3D 뷰 하단 근거 등급 바와 범례 제거

`/wh "3d 뷰어 내부 하단 정보와 범례 제거"` (2026-09-03). 레인 `change`(`ui-change` — 화면에서
요소를 없앤다). 직전 라운드는 `change-scope-archive/FEAT-020-PC-017.md`.

CHANGE_MODE: existing-change
REQUEST: 3D 뷰어 내부 하단의 근거 등급 바와 범례를 제거한다.
OBSERVED_BASELINE (2026-09-03):
  - 캔버스 하단 중앙에 `EvidenceOverlay`가 상시 렌더된다 — 뱅크 최급경사 20.0°(실측) ·
    상승/하강 색 규칙(실측) · 슬로프 최급경사 28.2°(확인) · 총 피스 수 132피스(확인) ·
    총 길이 편집기 l 단위 미수집(미확인) 다섯 항목과, 그 아래 접이식 `Legend`.
  - `TrackScreen.tsx:194`가 **유일한** 마운트 지점이다. 지우면 `EvidenceOverlay`·`Legend`·
    `EvidenceBadge`·`evidence-summary`와 `--color-badge-*` 토큰이 전부 직접 고아가 된다.
  - **이것이 `REQ-F-013`(Must, 정직성)의 유일한 구현이다.** 명세가 "상시 노출"을 못박고
    TC-010-1·2·3·5가 전부 여기 걸려 있다. `REQ-F-016`(총 길이 표시)의 표시 표면이기도 하다.
  - 오케스트레이터가 이 사실과 대안 둘(좌측 패널 이동 / 기본 접힘)을 대가와 함께 제시했고
    **사용자가 "완전히 지운다"를 재확인했다**.
TARGET_BEHAVIOR:
  - 캔버스 하단에 아무 패널도 뜨지 않는다. 3D 씬과 좌상단 조작 오버레이만 남는다.
  - 고아가 된 컴포넌트·토큰을 함께 삭제한다(`minimal-change-contract` §7 — 증거를 남긴다).
  - **남는 정직성 표기 하나를 보존한다**: 프로파일 스트립 y축 "상대 스케일(실측 아님)"
    (FEAT-012 / TC-012-4). 이것까지 지우면 요청 범위를 넘는다.
ALLOWED_PATHS:
  - src/pages/track-viewer
  - src/shared/ui
  - src/index.css
  - e2e
  - _workspace
PUBLIC_CONTRACTS_TO_PRESERVE:
  - 프로파일 스트립의 "상대 스케일(실측 아님)" 표기(TC-012-4) — 조건부 숨김 없이 상시
  - 좌측 파이프라인 요약 패널의 `피스 수 132`(REQ-NFR-001) — 배지만 빠지고 값은 남는다
  - FEAT-009 미지원 라벨 · FEAT-004 부분 실패 배너 — 다른 정직성 계약이며 이번 대상이 아니다
  - FEAT-015 씬의 3중 인코딩(색·형태·텍스트) — REQ-NFR-003의 남은 담당
  - 셸 치수·레이아웃 안정성(오버레이는 absolute라 제거해도 치수 불변이어야 한다)
  - FEAT-019 하이라이트 · FEAT-020 벽 · 추종/오빗 카메라 · 목록·스트립 ARIA
NON_GOALS:
  - 스트립 y축 표기 제거 — 3D 뷰어 밖이고 요청 범위 밖이다
  - 좌측 요약 패널 손대기
  - `02_design/preview/`의 범례·배지 — 구현 이전 프로토타입(역사 기록)이다
  - REQ-F-013을 되살릴 대체 표면 신설
CHANGE_BUDGET: 삭제 6파일(컴포넌트 4 + 테스트 1 + e2e 1) · 수정 3파일 · 의존성 0
TEST_EVIDENCE: 변경 전 = `evidence-overlay`·`legend-root` 존재. 변경 후 = 부재 + 나머지 화면 회귀
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: requirements/functional.md, feature-plan/feature-list.md, specs-surfaces.md,
  traceability.md, component-spec/shared.md, component-spec/INDEX.md, design-system/tokens.md,
  design-system/inventory.md, design-system/accessibility.md, layout-spec/states.md,
  layout-spec/global-shell.md, layout-spec/a11y-responsive.md, solution-design.md
  (대조: api-schema 3종, component-spec 5종, design-system 4종, layout-spec 4종,
   performance-budget 4종, piece-geometry, preview/behaviors, solution-design, design-review —
   전부. performance-budget·piece-geometry·api-schema는 무관, preview는 역사 기록이라 제외)
  → **③ 단계에서 13건 전부 개정 완료** (승인 체크포인트 이전)
ASSUMPTION: 없음 — 제거는 관측된 baseline 위에서 결정된다

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-010",
  "TARGET_BEHAVIOR": "3D 캔버스 하단의 근거 등급 바와 범례를 제거하고 고아가 된 EvidenceOverlay·Legend·EvidenceBadge·evidence-summary·badge 토큰을 함께 삭제한다. 프로파일 스트립 y축의 '상대 스케일(실측 아님)'과 좌측 요약 패널의 피스 수는 보존한다.",
  "requestType": "ui-change",
  "testCaseIds": [],
  "ALLOWED_PATHS": ["src/pages/track-viewer", "src/shared/ui", "src/index.css", "e2e"],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "프로파일 스트립 '상대 스케일(실측 아님)' 표기(TC-012-4)",
    "좌측 요약 패널의 피스 수(REQ-NFR-001)",
    "FEAT-009 미지원 라벨 · FEAT-004 부분 실패 배너",
    "FEAT-015 씬의 3중 인코딩",
    "셸 치수·레이아웃 안정성",
    "FEAT-019 하이라이트 · FEAT-020 벽 · 카메라 · 목록/스트립 ARIA"
  ],
  "NON_GOALS": [
    "스트립 y축 표기 제거",
    "좌측 요약 패널 손대기",
    "02_design/preview/의 범례·배지",
    "REQ-F-013 대체 표면 신설"
  ],
  "CHANGE_BUDGET": "삭제 6파일 · 수정 3파일 · 의존성 0",
  "CAPABILITY_ESCALATION": "none",
  "sourceDigest": null,
  "needsConfirmation": false
}
```

## 라운드 결과 (2026-09-03)

### 삭제한 파일 (전부 이 변경이 직접 고아로 만든 것 — `minimal-change-contract` §7)

| 파일 | 고아가 된 근거 |
|---|---|
| `src/pages/track-viewer/ui/EvidenceOverlay.tsx` | `TrackScreen.tsx:194`가 유일한 마운트였다 |
| `src/pages/track-viewer/lib/evidence-summary.ts` (+ `.test.ts`) | 위 오버레이가 유일한 소비자 |
| `src/shared/ui/EvidenceBadge/EvidenceBadge.tsx` | 동상. 디렉터리째 사라졌다 |
| `src/shared/ui/legend/Legend.tsx` | 동상. 디렉터리째 사라졌다 |
| `e2e/track-evidence.spec.ts` | 6건 전부 이 오버레이 테스트 |

`src/index.css`에서 `--color-badge-*` 4토큰(다크·라이트) · `--radius-badge` ·
`[data-evidence-badge]` forced-colors 규칙 제거. **`badge` 문자열 잔존 0.**

### 수정한 파일

| 파일 | 내용 |
|---|---|
| `src/pages/track-viewer/ui/TrackScreen.tsx` | import 1줄 + 렌더 1줄 제거. `totalPieceCount` prop은 **남긴다** — 부분 실패 배너가 계속 쓴다(고아 아님) |
| `e2e/track-profile-strip.spec.ts` | TC-010-4(범례 개폐 + 축 표기)를 **TC-012-4**(축 표기 상시 노출)로 대체 |

`ALLOWED_PATHS` 밖 변경 **0건**. 신규 dependency **0건**.

### 테스트를 약화하지 않았다

지운 `TC-010-4` 자리에 `TC-012-4`를 세웠고 **더 조인다**: 축 표기의 텍스트를 정확히 대조하고,
스트립을 접었다 펴도 사라지지 않는지 보고, **제거된 표면이 되살아나지 않았는지**
(`evidence-overlay`·`legend-root` count 0) 회귀 가드를 함께 건다. 이 표기가 이제 화면에 남은
유일한 정직성 표면이라 검사가 약해지는 것이 아니라 더 중요해진다.

### TEST_EVIDENCE

- **변경 전**: `evidence-overlay` 1개 · `legend-root` 1개 · 하단 바에 5항목 렌더.
- **변경 후**(실제 구동, `vite preview`, fixtures, 1440×900):
  `evidence-overlay` **0** · `legend-root` **0** · `profile-strip-scale-note`
  **"상대 스케일(실측 아님)"** 유지. 캔버스 하단에 아무 패널도 뜨지 않는다.
- **보존 확인**: 좌측 요약 패널 `피스 수 132` · 미지원 라벨 · 부분 실패 배너 · 유형 라벨 ·
  하이라이트 · 벽 · 셸 치수 전부 회귀 없음(e2e 102건).
- **게이트**: `tsc --noEmit` 0 · `eslint src e2e` 0 · `vitest run` **432/432**(evidence-summary
  8건 삭제분 반영) · `vite build` 0 · `playwright test` **102/102**.
- 번들 CSS 17.47 → **16.71 kB**, JS 1266.66 → **1264.99 kB**.

### 라운드 종료 게이트 (execution-contract §Iterate mode 5)

- ① 승격 QA: **해당 없음** — `CAPABILITY_ESCALATION: none`(제거만 했다).
- ② Evidence 재발급: **해당 없음** — `_workspace/04_qa/evidence/` 없음.
- ③ 문서 동기화: **완료** — `DOCS_TO_UPDATE` 13건 전부 개정(승인 체크포인트 이전).

### 이 제거가 남긴 것 — 기록해 둔다

`REQ-F-013`을 Won't로 내렸지만 **`B-001`(단위 스케일 미확정)은 여전히 열려 있다.** 화면이
그것을 말하던 표면만 사라졌다. 뱅크 20°가 실측인지, 슬로프 낙차가 추정인지, 총 길이가
미확인인지 이제 화면으로는 알 수 없다. 되살리려면 표면을 다시 만들어야 하므로 사라진 다섯
항목과 4등급의 채널 순서(1차 텍스트 → 2차 보더 형태 → 3차 색)를 `specs-surfaces.md` FEAT-010
절과 `tokens.md`에 적어 뒀다 — 계약만 되돌려서는 화면이 따라오지 않는다.

### 범위 밖 사실 (고치지 않았다)

1. **`02_design/preview/`에 범례·배지 코드가 남아 있다**(`app.js` `renderLegend`,
   `app.css` §Legend). 구현 이전 프로토타입이자 역사 기록이라 손대지 않았다 — 다만 이제
   프리뷰와 구현이 이 지점에서 갈린다는 사실은 남는다.
2. 지난 라운드들의 범위 밖 사실은 그대로다 — 대형 트랙에서 벽의 완화 영향 미측정,
   `specs-scene.md` 34KB sharding 초과, 하이라이트 밖 요소의 톤매핑, `TC-013-6` refs 누락,
   `--color-accent` 미정의, 스트립 x축, `flythroughFps` 훅, `orderAtDistance` 직선 피스 지연.
