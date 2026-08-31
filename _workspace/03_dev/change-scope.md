# change-scope — fix #39 (FEAT-008 · TC-008-2)

이슈 #39 착수(2026-08-31, 사용자 지시 "1"). 계획 단위 밖 fix 티켓이라 `pickup` CLI 대상이 아니며
`web-orchestrator` bug-fix 라운드로 진행한다. ALLOWED_PATHS는 FEAT-007/008이 공유하는 3D 표면
`src/widgets/track-canvas`(카메라 코어 `flythrough-camera.ts`가 여기 산다).

CHANGE_MODE: existing-change
REQUEST: TC-008-2 — 추종 시점이 레인체인지 구간을 지날 때 카메라 위치가 레인 오프셋을 반영한다.
OBSERVED_BASELINE: `flythrough-camera.ts` `buildFlythroughPath`가 중심선 표본(`SceneSegment.points`)만 잇는다.
  `Lan*` 구간에서 레인 3개가 자리바꿈하는 동안 카메라는 직선 중심선을 통과한다. TC-008-2 인용 0건(#39 생성 근거).
TARGET_BEHAVIOR: D-047 — 카메라는 가운데 레인(1)에서 출발해 `Lan*`마다 한 칸 순환(0→1→2→0)하며,
  가로 위치 `laneOffsetAt(pieceClass, lane, t).lateralCm`을 좌측 법선(`−sin θ, cos θ`, lane-bands와 동일)으로,
  육교 레인이면 `riseCm`을 y에 더한다. 높이는 `surfaceHeightAt`(FEAT-017)로 그 자리의 노면. 레인체인지 이전
  구간은 종전 중심선과 동일(TC-007 보존). 웨이포인트에 `lane`을 실어 관측 가능하게 한다.
ALLOWED_PATHS: src/widgets/track-canvas
PUBLIC_CONTRACTS_TO_PRESERVE:
  - `buildFlythroughPath`/`poseAt`/`distanceOfOrder`/`orderAtDistance`/이징·재생 API 시그니처
  - TC-007-1~6 검증(시작점·순서·연속성·이징·일시정지·부분 실패) — 첫 레인체인지 이전 좌표는 비트 단위 동일
  - `SceneSegment`·`buildLaneBands`·레인 모델(`lane-model.ts`) 무변경
NON_GOALS: 레인 선택 UI · 레인 면 위 정확한 눈높이 · e2e 신규(수치 축으로 검증)
CHANGE_BUDGET: `flythrough-camera.ts` 1개(웨이포인트 생성부) + `flythrough-camera.test.ts` describe 1개. 의존성 0.
TEST_EVIDENCE: (라운드 종료 시 갱신)
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: none — 계획 TC 문구 불변, 결정은 D-047로 기록. component-spec §TrackCanvas 카메라 절은 레인을 언급하지
  않아 충돌 없음.

```json change-scope
{
  "ticketKey": 39,
  "featureId": "FEAT-008",
  "TARGET_BEHAVIOR": "TC-008-2 — 추종 시점 카메라가 가운데 레인에서 출발해 Lan*마다 한 칸 순환하며 laneOffsetAt의 가로 위치(좌측 법선)·육교 riseCm을 따른다(D-047). 높이는 surfaceHeightAt. 레인체인지 이전 구간은 종전 중심선과 동일.",
  "requestType": "bug-fix",
  "testCaseIds": [
    "TC-008-2"
  ],
  "ALLOWED_PATHS": [
    "src/widgets/track-canvas"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "buildFlythroughPath/poseAt/distanceOfOrder/orderAtDistance 시그니처",
    "TC-007-1~6 — 첫 레인체인지 이전 좌표 동일",
    "SceneSegment·buildLaneBands·lane-model 무변경"
  ],
  "NON_GOALS": [
    "레인 선택 UI",
    "레인 면 위 정확한 눈높이",
    "e2e 신규"
  ],
  "CHANGE_BUDGET": "flythrough-camera.ts 1개 + 테스트 describe 1개 · 의존성 0",
  "sourceDigest": null,
  "needsConfirmation": false
}
```
