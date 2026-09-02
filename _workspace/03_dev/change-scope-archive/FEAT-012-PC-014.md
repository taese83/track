# change-scope — FEAT-012 / PC-014 · 프로파일 스트립 인디케이터의 연속 진행축

`/wh "프로파일 스트립에 현재 위치 마커 — 플라이스루와 연동"` (2026-09-02). 레인 `change`
(동작을 새로 정의한다 — `request-type-contract.md`). 1-A 승인 체크포인트 통과 후 착수.
스키마 정본: `minimal-change-contract.md`.

CHANGE_MODE: existing-change
REQUEST: 프로파일 스트립의 현재 위치 마커가 플라이스루(추종 시점 자동 재생)를 따라 매끄럽게
  움직이게 한다.
OBSERVED_BASELINE (2026-09-02 실측 · Playwright + `pnpm build && pnpm preview` · fixtures 업스트림):
  - **마커와 연동은 이미 있다.** `ProfileStrip`이 `data-testid="profile-indicator"` 세로선을
    `currentIndex` 위치에 그리고(`ProfileStrip.tsx` xOf), `FlythroughRig`가 재생 중 구간이 바뀔 때마다
    `setCursor(order,'canvas')`로 공유 커서를 민다(`TrackCanvas.tsx:347` 주변).
  - **빠진 것은 연속성이다.** 참조 트랙 WS67Y2(132피스) 240cm/s 자동 재생에서 인디케이터 중심 X를
    125ms 간격 24회 표집: t=127ms x=12px(dist 15.9) · t=345ms x=12px(dist 52.7) · **t=550ms x=12px
    (dist 110.0)** · t=756ms x=31.2px(order 0→3) · t=967ms x=40.8px. 첫 550ms 동안 카메라는 110cm를
    갔는데 마커는 한 픽셀도 움직이지 않고 그다음 한 번에 두 칸(19px)을 건너뛴다. 계단폭은 9.59px
    (구간 1칸)이다.
  - **검증 공백**: TC-012-2의 본절("추종 시점이 활성화된 상태에서 카메라가 이동하면 인디케이터가
    실시간으로 함께 이동한다")은 e2e에 없다. `e2e/track-profile-strip.spec.ts`의 두 건은 모두
    `TC-012-2(부분)`으로 클릭·목록 방향만 잰다. 반대 방향(재생→목록)은 TC-013-6이 덮는다.
TARGET_BEHAVIOR (TC-012-6, PC-014):
  - 자동 재생 중 카메라가 **한 구간 안을** 달리는 동안에도 인디케이터가 그 구간의 시작·끝 위치
    사이를 보간해 이동한다. 판정: `data-follow-order`가 고정된 상태에서 인디케이터 중심 X가 단조
    증가한다.
  - 재생 정지·추종 해제 시 인디케이터가 `currentIndex` 위치로 즉시 복귀한다.
  - seek(사용자가 찍은 지점으로 카메라가 이동하는 중)에는 연속축을 발행하지 않는다 — 인디케이터가
    사용자가 찍은 자리에 머문다.
  - `aria-valuenow`/`aria-valuetext`/40px 헤더 요약은 구간 단위 값을 유지한다.
ALLOWED_PATHS:
  - `src/shared/lib/track-cursor` — 연속 진행 채널(`publishProgress`/`subscribeProgress`) owner
  - `src/widgets/track-canvas` — 발행자. `flythrough-camera.ts`에 소수 인덱스 파생 순수 함수 +
    `TrackCanvas.tsx` 렌더 루프 발행
  - `src/widgets/profile-strip` — 구독자. 인디케이터 노드 transform 갱신
  - `src/pages/track-viewer` — `ProfileColumn`이 채널을 스트립에 배선(1~2줄)
  - `e2e` — TC-012-6 회귀
  - `_workspace` — 기획·설계·스팩·브리프 문서
PUBLIC_CONTRACTS_TO_PRESERVE:
  - 공유 커서 공개 API(`currentIndex`·`setCursor`·`stepBy`·`isReachable`·`lastSource`)와 **발행
    빈도(구간 단위)** 불변 — TC-007-1·TC-013-6·TC-012-2(부분) 회귀 금지
  - `ProfileStrip`의 `role="slider"` · `aria-valuemin/max/now` · `aria-valuetext`는 구간 인덱스 단위
    유지(layout-spec §포커스 순서가 정본)
  - 관측 표면 testid 전부: `profile-indicator`·`profile-strip`·`profile-strip-slider`·
    `profile-strip-summary`·`profile-strip-toggle`·`profile-strip-scale-note`·`profile-curve`·
    `profile-curve-failed`·`profile-boundary`·`profile-axis-tick`·`profile-closure-gap`,
    `track-canvas`의 `data-follow-*`·`data-camera-*`·`data-render-state`
  - 3분할 셸 예약 치수(목록 320px · 스트립 140px · alert 40px)
  - TC-012-3(실패 구간 클릭 무시) · TC-012-4(상대 스케일 표기 상시) · TC-012-5(폐합 불연속)
  - 플라이스루 fps ≥30 (`window.__perfStats.flythroughFps`, performance-budget §1)
NON_GOALS:
  - 공유 커서를 소수 인덱스로 승격하는 것(PC-014에서 기각 — 세 표면 60fps 재렌더)
  - `SectionList`가 연속축을 구독하는 것(132행 스크롤 계산이 매 프레임 붙는다)
  - 스트립 x축을 **거리 균등**으로 바꾸는 것 — 현재는 인덱스 균등이라 등속 주행에서도 마커 속도가
    구간 길이에 따라 달라진다. 별건으로 보고한다(REQ-F-023 원문은 "거리축"이다)
  - `--color-accent` 미정의 정정(인디케이터가 하드코딩 `#7AA2F7` 폴백으로 그려진다) — 별건 보고
  - 접힘 상태에서의 마커 노출(현재 40px 헤더는 텍스트 요약만) — 사용자가 선택하지 않은 범위
  - 마커 형태 재설계(세로선 유지)
CHANGE_BUDGET: 소스 5파일(track-cursor 2 · flythrough-camera 1 · TrackCanvas 1 · ProfileStrip 1) +
  페이지 배선 1 · 유닛 테스트 2파일 · e2e 1파일(+2 케이스) · 문서 6곳. 신규 의존성 0.
CAPABILITY_ESCALATION: none — 서버 실행 경로·인증·DB·외부 API 키·자체 엔드포인트 fetch 변화 없음.
DOCS_TO_UPDATE:
  - `01_plan/feature-plan/specs-surfaces.md` — FEAT-012 동작 명세에 두 위치축 명시 + TC-012-6 신설 ✅
  - `01_plan/feature-plan/traceability.md` — REQ-F-023 행 TC-012-1~5 → 1~6 ✅
  - `02_design/component-spec/shared.md` — §연속 진행 채널 신설(발행/구독 각 1개, null 복귀, seek 금지) ✅
  - `02_design/component-spec/widgets.md` — §ProfileStrip 연속축·접근성 값 분리, §TrackCanvas 발행 규칙 ✅
  - `02_design/component-spec/pages.md` — Interaction Matrix에 자동 재생 4행 추가 ✅
  - `02_design/performance-budget/targets.md` — 추종 재생 중 프레임 예산(프레임당 DOM 쓰기 1건) ✅
  - 대조했으나 무변경: `layout-spec/a11y-responsive.md`(구간 단위 aria가 이미 정본) ·
    `layout-spec/global-shell.md` · `layout-spec/states.md`(치수 불변) · `design-system/tokens.md`
    (모션 토큰 미사용 규칙 그대로 — 카메라 축은 3D 소관) · `design-system/accessibility.md` ·
    `design-system/inventory.md` · `api-schema/*`(데이터 계약 무변경) · `solution-design.md`
    (아키텍처·layerMap 무변경, acceptanceRefs만 TC-012-6 추가) · `piece-geometry.md`
TEST_EVIDENCE (2026-09-02 · /Users/ted.chung/Project/track · Node v24.18.1 · pnpm 11.18.0 ·
`.nvmrc` 없음 — `engines: ^20.19.0 || >=22.12.0` 충족):
  - **변경 전 재현**(Playwright + `vite build && vite preview`, fixtures 업스트림, WS67Y2 240cm/s,
    인디케이터 중심 X 125ms×24 표집): `t=127 x=12.0(dist 15.9)` · `t=345 x=12.0(52.7)` ·
    `t=550 x=12.0(110.0)` · `t=756 x=31.2(154.0, order 0→3)`. **550ms 정지 후 19px 점프.**
  - **변경 후 같은 표집**: `t=128 x=13.7(11.6)` · `t=343 x=17.2(45.8)` · `t=552 x=21.3(109.6)` ·
    `t=766 x=40.9(154.1)`. 정지 구간 0건 — 모든 표본에서 x가 자란다. order가 고정된 표본 쌍에서도
    이동이 관측된다(order 3: 40.9→46.1 · order 15: 156.8→162.5 · order 17: 177.0→181.3).
  - **fps 회귀**: 재생 중 브라우저 `requestAnimationFrame` 간격 3초 표집. 변경 전(HEAD bbde371
    worktree 빌드) **82.13fps** → 변경 후 **81.24fps**. 30fps 하한 대비 여유 2.7배, 차이는 −1.1%로
    표집 잡음 범위다. (§1이 적은 `__perfStats.flythroughFps`는 미구현이라 이 경로로 쟀다 —
    targets.md에 그 사실을 적어 뒀다.)
  - 유닛: `vitest run` **383/383**. 신규 — `progress-channel.test.ts` 5건(발행·같은 값 끊기·늦은
    구독자·`null` 복귀·해제), `flythrough-camera.test.ts` TC-012-6 5건(정수부가 `orderAtDistance`와
    400개 표본에서 일치 · 800개 표본 단조 증가 · 정수 축이 멈춘 동안 값이 자람 · 경로 밖 절단 ·
    빈 경로 0).
  - e2e: `playwright test --workers=1` **94/94**. 신규 3건 — TC-012-2(자동 재생 중 인디케이터가
    카메라를 따라 이동, x 18.4→121.2 단조) · TC-012-6(같은 `data-follow-order` 안에서 이동 6건/39쌍
    관측) · TC-012-6(정지 후 인디케이터 40.8 ≡ 커서 구간 경계 40.8, 오차 <1.5px).
  - 보존 확인: TC-007-1·2·3·5·6, TC-013-1~6, TC-012-1~5, TC-006-*, TC-014-* 전부 통과 —
    공유 커서의 구간 단위 발행과 목록 동기화가 회귀하지 않았다.
  - 게이트: `tsc --noEmit` 0 · `eslint src e2e` 0 · `vitest run` 0 · `vite build` 0
  - Runtime verifiability: **LOCAL_VERIFIABLE** — 전 항목이 정적 preview + 녹화 fixture로 재현됐다.
    `DEPLOY_ONLY` 항목 없음.
  - **dev 서버 구동 확인**(2026-09-02, `vite --port 5180`, auto 업스트림, 1440×900): WS67Y2 재생
    중 320ms 간격 6표본에서 마커 x `18.5 → 57.3 → 110.6 → 168.5 → 206.4 → 263.2`(order
    `0→4→9→14→18→23`), 정지 직후 커서 27 · 인디케이터 x=303.8 · 27번 구간 경계 x=303.8로 **정확히
    일치**. 스트립 스크린샷과 정지 상태 전체 화면으로 실제 콘텐츠를 확인했다(콘솔 로그가 아니라).
  - **미검증(정직 표기)**: 부분 실패 트랙(OPENLOOP·R84APY)에서의 연속축은 별도 e2e로 재지 않았다.
    도달 불가 구간은 경로 자체가 짧게 끝나 발행이 멈추는 구조이며, 기존 TC-007-5(부분 실패에서
    추종이 오류 없이 멈춘다)가 통과한다는 사실까지가 이 라운드의 근거다.

## 라운드 종료 게이트 (execution-contract §Iterate mode 5)

- ① 승격 QA: **해당 없음** — `CAPABILITY_ESCALATION: none`(서버 경로·의존성·인증 변화 0).
- ② Evidence 재발급: **해당 없음** — `_workspace/04_qa/evidence/`가 없다(이 프로젝트는 아직
  full runner receipt를 발급한 적이 없다). stale로 남는 receipt가 없다.
- ③ 문서 동기화: **완료** — `DOCS_TO_UPDATE` 6건 전부 개정됨(위 목록의 ✅).

## 이 라운드에서 드러난 범위 밖 사실 (고치지 않았다)

1. **`orderAtDistance`가 2표본 직선 피스에서 한 구간 늦게 센다.** 직선은 표본이 둘뿐이고 이음새의
   중복 점이 버려져 `t=1` 하나만 남는다. 그래서 그 피스를 지나는 동안 정수 축은 **앞 피스**를
   말하고, 그 피스는 이음새 직후의 짧은 거리 창에서만 보고된다(WS67Y2 order 1: 실제 54~108cm를
   달리는데 보고 창은 108~109.84cm). 재생 중 목록 강조와 스트립이 함께 한 칸 늦는다.
   **이번 라운드는 이 속성을 바꾸지 않았다** — 연속축의 정수부를 `order + t`가 아니라
   `orderAtDistance`의 판정에 맞춰 정의해 **두 표면이 어긋나지 않게** 했을 뿐이다. 고치려면
   FEAT-007의 커서 발행 의미가 바뀌므로 TC-007-1·TC-013-6 재판정이 따라온다.
2. **`--color-accent`가 정의돼 있지 않다.** 인디케이터는 `var(--color-accent, #7AA2F7)`의 폴백으로
   그려진다 — 토큰 밖 하드코딩 색이며 라이트 모드에서도 바뀌지 않는다.
3. **스트립 x축이 인덱스 균등이다.** REQ-F-023 원문은 "거리축"인데 구현은 `index/(total-1)`이다.
   연속축을 넣어도 등속 주행에서 마커 속도는 구간 길이에 따라 달라진다.
4. **`__perfStats.flythroughFps`가 미구현이다.** performance-budget §1이 측정 방법으로 명시했으나
   `perf-stats.ts`에는 `orbitFps`만 있다. 플라이스루 fps는 그때까지 NOT_MEASURED다.
5. **`TC-013-6`이 `acceptanceRefs`에 없다.** PC-013 라운드의 누락. 이번에는 `TC-012-6`만 더했다.
6. **빠른 재생에서 목록 강조가 몇 프레임 뒤처진다.** dev 구동 실측(2026-09-02): 같은 순간
   `data-follow-order`가 23인데 슬라이더 `aria-valuenow`는 20이었다. 둘 다 렌더 루프의 **같은
   `order` 값**에서 나가지만 DOM dataset은 그 프레임에 동기로 쓰이고 공유 커서는 132행 목록을
   포함한 React 재렌더를 거친다. **이번 변경이 만든 것이 아니라 커서 경로의 기존 성질**이며,
   연속축이 React를 우회하도록 설계한 이유가 정확히 이것이다. 재생 중에는 마커가 목록 강조보다
   살짝 앞설 수 있고 정지하면 정확히 수렴한다(위 303.8 ≡ 303.8). 3번 항목(`orderAtDistance`의
   직선 피스 지연)과는 별개 원인이다.
