# change-scope — FEAT-020 / PC-017 · 레인 경계의 5cm 트랙 벽

`/wh "트랙에 5cm의 트랙벽을 추가해야한다. 각 레인마다 벽이 있다."` (2026-09-03).
레인 `change`(새 기하가 정의된다 — `feature`). 직전 라운드는 `change-scope-archive/FEAT-019-PC-016.md`.

CHANGE_MODE: existing-change
REQUEST: 각 레인 경계에 5cm 트랙 벽을 세운다.
OBSERVED_BASELINE (2026-09-03):
  - 씬에 벽 개념이 **없다** — `grep -rn "벽|wall" src/`가 플라이스루 주석 한 줄만 잡는다.
  - 레인은 두께 없는 면 3장(`buildTrackGeometries`)과 경계선 4줄(`buildBoundaryGeometry`)로만
    표현된다. 형상이 "레인이 그려진 판"이고 실물 트랙의 채널 구조가 없다.
  - `boundaryLinesOf`가 이미 맞붙은 레인 4줄 / 명시 경로 레인 6줄을 가른다 — 벽 줄 수 판정이
    이미 있다. 두 번 만들지 않는다.
  - 노면 높이 함수가 이미 있다: `surfaceHeightAt`(FEAT-017) · `laneSurfaces`(FEAT-018).
    벽 밑동은 레인 면 가장자리를 그대로 쓰면 되고 새로 계산할 것은 **방향(법선)**뿐이다.
  - 추종 카메라 눈높이 `EYE_HEIGHT = 12`cm — 5cm 벽에 시야가 막히지 않는다.
TARGET_BEHAVIOR (TC-020-1~7): 정본은 `piece-geometry.md` §레인 경계에는 5cm 벽이 선다.
  - 노면에서 5cm, 두께 0(양면). 맞붙은 레인 4줄 · 명시 경로 레인(`Lan2`) 6줄. 미지원 피스 벽 없음.
  - 벽은 **노면 법선**을 따라 서 뱅크·판(20°)에서 노면과 함께 기운다(각도 차 < 1°).
  - 색은 그 구간 노면색의 어두운 파생. 레인별 밝기 보정은 적용하지 않는다(벽은 두 레인이 공유).
  - 레인체인지에서 벽이 레인 가장자리를 그대로 따라간다(육교 레인의 벽은 함께 떠오른다).
ALLOWED_PATHS:
  - src/widgets/track-canvas
  - e2e
  - _workspace
PUBLIC_CONTRACTS_TO_PRESERVE:
  - FEAT-019 하이라이트 TC-019-1~8 — 테두리가 `depthTest=false`라 벽 뒤에서도 보여야 한다
  - FEAT-015 표식·라벨, 레인 경계선, FEAT-009 미지원 플레이스홀더가 벽에 가려 사라지지 않는다
  - 레인 면의 좌표·색(D-014 원본 편집기색) 무변경 — 벽은 **더하는** 것이지 노면을 바꾸지 않는다
  - TrackCursorApi·TrackCanvasProps·연속 진행 채널 무변경
  - 추종 카메라 경로·눈높이(FEAT-007), 오빗 카메라 계약 TC-006-*
  - 성능 예산: 초기 렌더 3초 · `orbitFps` 30 (렌더 단위가 면 396 → 396 + 벽 528로 는다)
  - 목록·스트립 ARIA 계약
NON_GOALS:
  - 벽 두께(물리적 부피) — 두께 0 면이다. 레인 면과 같은 방식
  - 벽 상단의 난간·홈 등 실물 디테일
  - 완화 수단으로 벽 끄기 — 끄면 REQ-F-025가 요구한 것 자체가 사라진다(mitigation.md에 명시)
  - 레인체인지 사이 벽 제거(사용자가 기각한 대안)
  - `specs-scene.md`(32KB) 등의 sharding 15KB 초과 분할 — 별건 제안
  - 하이라이트 밖 요소의 톤매핑(레인 경계선·표식·미지원 경고색) — 지난 라운드가 남긴 별건
CHANGE_BUDGET: 신규 2파일(lib 1 + 테스트 1) · 수정 3파일 내외 · e2e 1 신규 · 의존성 0
TEST_EVIDENCE: 변경 전 = 벽 지오메트리 부재. 변경 후 = TC-020-1~7 + 기존 e2e 101건 회귀
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: piece-geometry.md, component-spec/widgets.md, design-system/tokens.md,
  design-system/inventory.md, performance-budget/targets.md, performance-budget/mitigation.md
  (대조: api-schema 3종, component-spec features·pages·shared·widgets, design-system 3종,
   layout-spec 3종, performance-budget 3종, piece-geometry, preview/behaviors, solution-design,
   design-review — 19개 전부. layout-spec·accessibility·pages·shared는 벽이 정보 채널이 아니라
   형상이라 충돌 없음)
  → **③ 단계에서 6건 전부 개정 완료** (승인 체크포인트 이전)
ASSUMPTION:
  - G. **육교 겹침** — `sin²` 오르내림 구간에서 육교 바닥이 5cm 미만인 동안 아래 레인의 벽과
    겹칠 수 있다. 사용자가 대안(사이 벽 제거)을 기각했으므로 그대로 구현하고 **실제 화면으로
    확인해 기록한다**. 겹치면 사실을 보고하고 판단을 다시 받는다.
  - H. **어둡게 하는 정도** — 노면색을 얼마나 내릴지는 토큰이 없다. 기존 `lift()`의 반대 방향
    고정량으로 착수하고 캡처로 조정한다(PC-015 불투명도·PC-016 폭과 같은 절차).

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-020",
  "TARGET_BEHAVIOR": "TC-020-1~7 — 각 레인 경계에 노면 5cm 벽. 맞붙은 레인 4줄·명시 경로 레인 6줄, 노면 법선 방향(뱅크에서 함께 기움), 노면색의 어두운 파생, 미지원 피스 제외. 레인체인지에서 레인 가장자리를 그대로 따라간다. 기존 시각 채널과 성능 예산을 보존한다.",
  "requestType": "feature",
  "testCaseIds": ["TC-020-1", "TC-020-2", "TC-020-3", "TC-020-4", "TC-020-5", "TC-020-6", "TC-020-7"],
  "ALLOWED_PATHS": ["src/widgets/track-canvas", "e2e"],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "FEAT-019 하이라이트 TC-019-1~8",
    "FEAT-015 표식·라벨 · 레인 경계선 · FEAT-009 미지원 플레이스홀더",
    "레인 면 좌표·색 D-014 무변경 — 벽은 더하는 것이지 노면을 바꾸지 않는다",
    "TrackCursorApi·TrackCanvasProps·연속 진행 채널",
    "추종 카메라 경로·눈높이, 오빗 카메라 계약 TC-006-*",
    "초기 렌더 3초 · orbitFps 30"
  ],
  "NON_GOALS": [
    "벽 두께(물리적 부피)",
    "완화 수단으로 벽 끄기",
    "레인체인지 사이 벽 제거(사용자 기각)",
    "sharding 15KB 초과 분할",
    "하이라이트 밖 요소의 톤매핑"
  ],
  "CHANGE_BUDGET": "신규 2파일 · 수정 3파일 내외 · e2e 1 신규 · 의존성 0",
  "CAPABILITY_ESCALATION": "none",
  "sourceDigest": null,
  "needsConfirmation": false
}
```

## 라운드 결과 (2026-09-03)

### 변경한 파일

| 파일 | 성격 |
|---|---|
| `src/widgets/track-canvas/lib/wall-geometry.ts` | 신규 — 벽 줄 자리·노면 법선·천장 클램프·색 단위 버퍼 |
| `src/widgets/track-canvas/lib/wall-geometry.test.ts` | 신규 — 23건 |
| `src/widgets/track-canvas/lib/segment-appearance.ts` | 수정 — `lift()`가 음수 방향도 자르게 하고 `wallColorOf` 추가 |
| `src/widgets/track-canvas/ui/TrackCanvas.tsx` | 수정 — 벽 메시 렌더, `data-wall-lines` 발행 |
| `e2e/track-wall.spec.ts` | 신규 — TC-020-1·4·6·7 |
| `e2e/track-section-list.spec.ts` | 수정 — TC-013-6의 경합 2건 제거(아래 참조) |

`ALLOWED_PATHS` 밖 변경 **0건**. 신규 dependency **0건**.

### ASSUMPTION G 해소 — 육교 겹침은 실재했고, 고쳤다

착수 시 "겹칠 수 있다"로 남긴 항목이다. **실측으로 확인됐다**(`Lan1` 기하 20001 표본):

- 육교 바닥이 벽 상단(5cm)을 넘는 구간은 자리바꿈의 **가운데 42%**(u 0.29~0.71)뿐이다.
- 그 밖에서 아래 레인의 벽이 육교 노면을 뚫는다 — **최대 돌출 4.94cm**(벽의 99%),
  가장 넓을 때 벽이 육교 면 **6cm 안쪽**에 서서 **3cm** 솟는다.
- 확대하면 도로 한복판에 벽 토막이 서 있는 것으로 보인다. 육안 캡처로는 판정이 애매해
  **수치로 쟀다** — 그래야 "고쳤다"를 증명할 수 있다.

사용자 선택(2026-09-03)으로 **"밑동 위에 다른 레인 면이 있으면 그 바닥까지만 세운다"**를 넣었다.
끊는 것이 아니라 낮아지는 것이라 통과 구간에서 벽이 생겼다 말았다 하지 않는다. 레인체인지
여부를 묻지 않는 규칙 하나이며 겹치지 않는 피스에는 영향이 없다. 같은 방식으로 재검산한 결과
**관통 0.000000cm**.

### ASSUMPTION H 해소 — 어둡게 하는 정도

`WALL_SHADE = -38`(채널별 감산). 상승 `#AD0A09`→`#870000` · 하강 `#004E8F`→`#002869` ·
평지 `#A8AEB8`→`#828892`. 캡처에서 슬로프 구간의 벽이 그 구간 색으로 읽히는 것을 확인했다.

### TEST_EVIDENCE (전부 LOCAL_VERIFIABLE)

- **변경 전**: 씬에 벽 지오메트리 부재(`data-wall-lines` 속성 없음).
- **TC-020-1**: WS67Y2 구간 132 · 벽 **528줄**(정확히 4배 — Lan2 없음).
  R84APY 구간 112 · 벽 **450줄** = 112×4 + 2 → 명시 경로 구간 1개가 6줄로 늘었다.
- **TC-020-2**: 뱅크 20°에서 벽 방향과 노면 법선의 각도 차 **1° 미만**, 기울기 자체도
  `sin(20°)`와 일치(연직으로 물러선 경우와 구분된다).
- **TC-020-3**: 벽 색이 노면색보다 어둡고 상승·하강·평지가 서로 다르다(순수 축 + 캡처).
- **TC-020-4**: UNSUPP에서 벽 528 = 구간 132 × 4 **정확히 일치** — 미지원 플레이스홀더 2개가
  벽을 얻었다면 536이었을 것이다. OPENLOOP은 구간 131 · 벽 524로 복원 구간까지만.
- **TC-020-5**: 육교 아래 클램프 순수 축 6건 + 실기하 재검산 관통 0cm.
- **TC-020-6**: 초기 렌더 **154ms**(예산 3초) · `orbitFps` **42.9~47.0**(하한 30).
  **벽 도입 전 68.8 → 후 46 안팎으로 약 32% 감소**했다. 예산 안이지만 감소는 사실대로 적는다.
- **TC-020-7**: 유형 라벨·미지원 라벨 그대로, 하이라이트 테두리 픽셀 >0(`depthTest=false`라
  벽 뒤에서도 보인다).
- **게이트**: `tsc --noEmit` 0 · `eslint src e2e` 0 · `vitest run` **440/440**(신규 23) ·
  `vite build` 0 · `playwright test` **108/108 · 2회 연속**.
- **실제 구동 확인**(2026-09-03, `vite preview`, fixtures, 1440×900): 트랙이 판이 아니라
  채널 구조로 보인다. 뱅크에서 벽이 노면과 함께 기울고, 슬로프 구간의 벽이 그 구간 색으로
  읽히며, 레인체인지에서 벽 토막이 솟는 자리가 없다. 검증용 서버는 확인 뒤 내렸다.

### e2e 경합 2건 — 내 변경이 창을 넓혀 드러났다

벽이 렌더 비용을 올리자(fps 68.8 → 46) `TC-013-6`이 전체 실행에서 **두 번** 실패했다
(격리 실행은 통과). 재실행으로 넘기지 않고 원인을 봤고, **둘 다 테스트 쪽 결함**이었다.

1. **read-then-assert 경합**: `data-follow-order`를 읽어 두고 나중에 그 행의 `tabindex`를
   단언했다. `data-follow-order`는 `useFrame`에서 DOM에 동기로 쓰이고 132행 목록은 React
   재렌더를 거치므로 원래 몇 프레임 지연이 있다(FEAT-012 라운드에 기록된 성질). 커서가 지나간
   행을 검사하게 되어 영영 맞지 않는다. → 한 번의 `evaluate` 안에서 둘을 함께 읽도록 고쳤다.
2. **앱이 만들 수 없는 상태를 만들었다**: 임의 행에 `.focus()`만 걸어 DOM 포커스와 앱의 roving
   상태(`focusedIndex`)를 어긋나게 했다. 사용자는 그 상태를 만들 수 없다 — Tab은 roving 행으로
   들어가고 클릭은 `onSelect`를 거친다. 어긋난 상태에서는 목록이 포커스를 얻는 순간 roving
   effect가 DOM 포커스를 자기 행으로 되가져간다. → **실제 사용자 경로**(roving 행 포커스 →
   방향키 8회)로 바꾸고 도달한 행을 읽어 기준으로 삼았다.

**계약은 약화되지 않았다** — 고친 테스트도 "목록이 포커스를 가지면 재생이 그 행을 밀어내지
않는다"를 그대로 재고, 게이트가 풀리면 여전히 실패한다.

### 라운드 종료 게이트 (execution-contract §Iterate mode 5)

- ① 승격 QA: **해당 없음** — `CAPABILITY_ESCALATION: none`.
- ② Evidence 재발급: **해당 없음** — `_workspace/04_qa/evidence/` 없음.
- ③ 문서 동기화: **완료** — `DOCS_TO_UPDATE` 6건 + 클램프 확정을 piece-geometry.md·
  specs-scene.md·PC-017에 반영.

### 범위 밖 사실 (고치지 않았다)

1. **오빗 fps가 68.8 → 46 안팎으로 32% 줄었다.** 예산(30) 안이지만 여유가 절반으로 줄었다.
   대형 트랙(300+)에서 벽이 완화 판정에 미치는 영향은 이 라운드에서 재지 않았다 —
   `LARGE1` fixture로 별도 확인이 필요하다.
2. **DOM 포커스와 roving 상태가 어긋나면 포커스가 되돌아간다**(위 ②의 제품 쪽 성질).
   사용자 경로로는 도달할 수 없다고 판단해 고치지 않았다. `src/widgets/section-list`는
   이번 `ALLOWED_PATHS` 밖이기도 하다.
3. **`specs-scene.md`가 34KB**(sharding 상한 15KB의 2.3배). 네 라운드 연속 커졌다.
4. 지난 라운드의 범위 밖 사실은 그대로다 — 하이라이트 밖 요소의 톤매핑, `TC-013-6` refs 누락,
   `--color-accent` 미정의, 스트립 x축, `flythroughFps` 훅, `orderAtDistance` 직선 피스 지연.
