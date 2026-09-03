# change-scope — FEAT-019 / PC-016 · 하이라이트 테두리를 이중 톤·실제 두께로

`/wh "하일라이트 색상을 좀더 가시성있도록 변경"` (2026-09-03). 레인 `change`(`ui-change` — 동작이
새로 정의된다). `fix` 자기검사 ⑤ 해당(design-system 토큰·접근성 대비는 기존 공개 계약)이라 `change`.
직전 라운드는 `change-scope-archive/FEAT-019-PC-015.md`.

CHANGE_MODE: existing-change
REQUEST: 하이라이트가 실제 트랙 위에서 더 잘 보이게 한다.
OBSERVED_BASELINE (2026-09-03 대비 실측, WCAG 2.2 상대 휘도):
  - PC-015가 넣은 `primary #A78BFA` 1px 윤곽선의 **평지 노면(#A8AEB8) 대비 1.10:1**.
    비텍스트 3:1의 3분의 1이다. 면 오버레이(@0.45)도 같은 배경에서 1.10.
  - 원인은 색조가 아니라 **명도**다 — `#A78BFA`와 `#A8AEB8`의 상대 휘도가 거의 같다.
  - **어떤 단일 색도 세 노면 모두에 3:1을 낼 수 없다**: 밝은 평지에는 어두워야 하고 어두운
    상승 `#AD0A09`·하강 `#004E8F`에는 밝아야 한다. 진한 보라 `#6D28D9`는 평지 1.99를 얻는 대신
    상승 1.12·하강 1.01로 사라진다.
  - 전체 보기에서 한 구간 윤곽선은 **17px**뿐이다(2026-09-02 실측). WebGL `linewidth`는 대부분
    플랫폼에서 1px 고정이라 선으로는 굵게 만들 수 없다.
TARGET_BEHAVIOR (TC-019-8 신설 · TC-019-3 문구 개정):
  - 테두리가 **두 톤**(밝은 `#C4B5FD` · 어두운 `#2E1065`)이고 **씬 단위의 실제 폭**을 가진 띠(면)다.
  - 평지·상승·하강·미지원 네 노면 **모두**에서 두 톤 중 적어도 하나가 3:1 이상.
  - 두 띠 모두 구간 **안쪽**으로 깔려 이웃 구간을 덮지 않는다.
  - `depthTest=false`·`renderOrder` 유지 — 가려진 구간도 위치가 보인다(TC-019-3 보존).
ALLOWED_PATHS:
  - src/widgets/track-canvas
  - e2e
  - _workspace
PUBLIC_CONTRACTS_TO_PRESERVE:
  - TC-019-1~7 전부 — 특히 TC-019-3(가려짐)·TC-019-4(카메라 4값)·TC-019-5(추종 중 미렌더)
  - 표면색 D-014(rise/fall 원본 편집기색) — 테두리는 구간 안쪽 4cm만 덮고 나머지는 그대로
  - TrackCursorApi·TrackCanvasProps·연속 진행 채널(PC-014) 무변경
  - `data-highlight-order`·`data-camera-target`·`data-follow-*` 관측 표면
  - 성능 예산 orbitFps 30fps — draw call 2 → 3
  - 오빗 카메라 계약 TC-006-*, 목록·스트립 ARIA 계약
NON_GOALS:
  - 면 오버레이 불투명도 재조정 — 판독 책임은 테두리가 진다(면은 원본색을 비추는 채널)
  - CSS 변수(`src/index.css`) 신설 — 소비자가 three 재질뿐이라 `var()`를 못 읽는다.
    `src/index.css`는 ALLOWED_PATHS 밖이기도 하다
  - 라이트 모드 3D 대응
  - 지난 라운드가 남긴 범위 밖 사실(sharding 15KB 초과 · TC-013-6 refs 누락 등)
CHANGE_BUDGET: 수정 3파일(highlight-geometry.ts + 그 테스트 + TrackCanvas.tsx) · e2e 1 수정 · 의존성 0
TEST_EVIDENCE: 변경 전 = 평지 위 대비 1.10(계산). 변경 후 = TC-019-8 순수 축 + 기존 TC-019-1~7 회귀
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: feature-plan/specs-scene.md, traceability.md, component-spec/widgets.md,
  design-system/tokens.md, design-system/inventory.md, design-system/accessibility.md,
  layout-spec/states.md, performance-budget/targets.md
  (대조: api-schema 3종, component-spec features·pages·shared·widgets, design-system 3종,
   layout-spec 3종, performance-budget 3종, piece-geometry, preview/behaviors, solution-design,
   design-review — 19개 전부. pages.md·shared.md는 결과만 적어 충돌 없음)
  → **③ 단계에서 8건 전부 개정 완료** (승인 체크포인트 이전)

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-019",
  "TARGET_BEHAVIOR": "TC-019-8 — 하이라이트 테두리를 밝은 #C4B5FD·어두운 #2E1065 두 톤의 실제 폭 띠로 그려 평지·상승·하강·미지원 네 노면 모두에서 한 톤이 3:1 이상을 낸다. 두 띠는 구간 안쪽에만 깔린다. depthTest=false와 TC-019-1~7은 보존한다.",
  "requestType": "ui-change",
  "testCaseIds": ["TC-019-8", "TC-019-3"],
  "ALLOWED_PATHS": ["src/widgets/track-canvas", "e2e"],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "TC-019-1~7 전부(가려짐·카메라 4값·추종 중 미렌더 포함)",
    "표면색 D-014 rise/fall 원본 편집기색",
    "TrackCursorApi·TrackCanvasProps·연속 진행 채널 무변경",
    "data-highlight-order·data-camera-target 관측 표면",
    "orbitFps 30fps"
  ],
  "NON_GOALS": [
    "면 오버레이 불투명도 재조정",
    "CSS 변수 신설(src/index.css는 ALLOWED_PATHS 밖)",
    "라이트 모드 3D 대응"
  ],
  "CHANGE_BUDGET": "수정 4파일 · 신규 0 · 의존성 0",
  "CAPABILITY_ESCALATION": "none",
  "sourceDigest": null,
  "needsConfirmation": false
}
```

## 라운드 결과 (2026-09-03)

### 변경한 파일

| 파일 | 성격 |
|---|---|
| `src/widgets/track-canvas/lib/highlight-geometry.ts` | 수정 — `buildHighlightOutline`(선) → `buildHighlightBorders`(두 톤 띠). 빈 버퍼도 `position`을 갖게 |
| `src/widgets/track-canvas/lib/highlight-geometry.test.ts` | 수정 — 띠 기하 7건으로 교체(겹침·안쪽 배치·마구리·분리 레인·좁은 구간 절단) |
| `src/widgets/track-canvas/lib/highlight-visibility.ts` | 수정 — 색 3종·불투명도 상수와 `contrastRatio`/`edgeContrastOn` 추가 |
| `src/widgets/track-canvas/lib/highlight-visibility.test.ts` | 수정 — TC-019-8 대비 4건 추가 |
| `src/widgets/track-canvas/lib/segment-appearance.ts` | 수정 — 표면색 4개 `export`(대비 검사가 **실제 값**을 읽게. 노면색이 바뀌면 검사가 함께 깨진다) |
| `src/widgets/track-canvas/ui/TrackCanvas.tsx` | 수정 — 선 1개 → 띠 2개, 색 상수를 lib로 이관, 렌더 규칙 2종 |
| `e2e/track-highlight.spec.ts` | 수정 — 픽셀 검출을 테두리 색으로, 여유 36/36/26 → 18/18/14 |

`ALLOWED_PATHS` 밖 변경 **0건**. 신규 dependency **0건**. `src/index.css` 미변경.

### 구현 중 드러난 두 결함 (둘 다 이번에 고쳤다)

계약을 문서에 적어도 **화면 픽셀이 그 값이 아니면 대비 계약은 종이 위에서만 성립한다.**
브라우저에서 실제 픽셀을 세어 보고 나서야 둘 다 드러났다.

1. **ACES 톤매핑이 하이라이트에도 걸려 있었다.** R3F 기본값이다. `#C4B5FD`가 화면에서
   (195,177,225)로, `#2E1065`가 (94,72,154)로 나왔다 — 평지 대비 6.83이 실제로는 **3.18**.
   톤매핑은 조명을 받는 표면을 위한 것이고 하이라이트는 UI 신호다. `toneMapped={false}`.
2. **반투명 면이 테두리를 덮고 있었다.** three는 투명 객체를 불투명 객체보다 **뒤에** 그리고
   `renderOrder`는 각 목록 안에서만 작동한다. 테두리(불투명)가 먼저, 면(반투명, renderOrder 1)이
   나중에 그려져 밝은 톤이 (183,162,252)로 희석됐다 — 정확히 0.45 블렌드 값이다.
   테두리 재질을 `transparent`+`opacity=1`로 같은 목록에 넣어 renderOrder를 되살렸다.
   **PC-015의 윤곽선도 같은 이유로 희석되고 있었다** — 이번에 함께 해소됐다.
   두 규칙 적용 후 화면 픽셀이 토큰과 정확히 일치한다: **(196,181,253)** · **(46,16,101)**.

### TEST_EVIDENCE (전부 LOCAL_VERIFIABLE)

- **변경 전**: 평지 노면 위 테두리 대비 **1.10:1**(단색 `primary`). TC-019-3의 테두리 픽셀
  위 113px · 밑면 96px.
- **TC-019-8**(순수 축, 신규 4건): 네 노면 전부 3:1 이상 — 평지 6.83 · 상승 4.03 · 하강 4.57 ·
  미지원 3.29. 두 톤의 역할 분담(평지는 어두운 쪽, 어두운 노면은 밝은 쪽)도 단언한다.
  "단색으로는 불가능했다"는 사실 자체를 검사로 고정해 회귀 시 근거가 되돌아오게 했다.
- **브라우저 실측 대비**(톤매핑 해제 후, 렌더된 노면 (167,171,179) 기준): 평지 **6.62**.
  토큰 계산값 6.83과 0.2 차이 — 노면 쪽은 여전히 조명·톤매핑을 받으므로 완전히 같지는 않다.
  **테두리 색만** 토큰과 픽셀이 일치한다(정직 표기).
- **TC-019-3 픽셀**: 위에서 113 → **1737px**, 밑면에서 96 → **752px**. 가시성 개선의 수치.
- **보존 확인**: TC-019-1·2·4·5·6·7 전부 통과. 카메라 4값 불변/타깃만 이동, 추종 중 0px,
  도달 불가 구간 불변, `orbitFps` **68.84**.
- **게이트**: `tsc --noEmit` 0 · `eslint src e2e` 0 · `vitest run` **417/417**(신규 7) ·
  `vite build` 0 · `playwright test` **101/101**.
- **실제 구동 확인**(2026-09-03, `vite preview --port 5182`, fixtures, 1440×900): 확대 화면에서
  밝은 바깥 띠·어두운 안쪽 띠가 또렷하고, 전체 보기(132피스)에서도 해당 구간이 한눈에 찾아진다.
  위쪽 하강 슬로프의 원본 파랑은 그대로다. 검증용 서버는 확인 뒤 내렸다.

### 라운드 종료 게이트 (execution-contract §Iterate mode 5)

- ① 승격 QA: **해당 없음** — `CAPABILITY_ESCALATION: none`.
- ② Evidence 재발급: **해당 없음** — `_workspace/04_qa/evidence/` 없음.
- ③ 문서 동기화: **완료** — `DOCS_TO_UPDATE` 8건 개정 + 구현 실측 2건을 widgets.md·tokens.md에 반영.

### 범위 밖 사실 (고치지 않았다)

1. **톤매핑은 하이라이트 밖 요소에도 걸려 있다** — 레인 경계선 `#E6E8EC`, 표식 `#F2F4F8`,
   미지원 플레이스홀더 `#E8B339`, 라벨 배경. 이들도 화면에서는 지정 hex가 아니다. 이번에는
   하이라이트 세 재질만 해제했다. 나머지는 별건이며, 특히 미지원 경고색은 확인해 볼 값이다.
2. 지난 라운드의 범위 밖 사실은 그대로다 — `specs-scene.md`/`widgets.md`의 sharding 15KB 초과,
   `validate-artifact-sharding.mjs` 실행 불가, `TC-013-6` refs 누락,
   `--color-accent` 미정의 · 스트립 x축 · `flythroughFps` 훅 · `orderAtDistance` 직선 피스 지연.
