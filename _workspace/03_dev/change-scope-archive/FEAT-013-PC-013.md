# change-scope — FEAT-013 개정 (커서 따라가기 · PC-013 · TC-013-6)

`/feature-add` 라운드(2026-08-31). 티켓 없음 — 사용자 직접 요청("상대 스케일 포커스 시에 동일한 구간 목록으로
스크롤되고 포커스"). REQUEST_TYPE `feature`(소형, 데이터 계약 변경 없음). 기획·설계 체크포인트 사용자 승인
(스트립+자동재생 모두 따라감). 스키마 정본: minimal-change-contract.md · 아래 JSON이 기계 정본.

CHANGE_MODE: existing-change
REQUEST: 스트립(상대 스케일) 스크럽·키보드 또는 자동재생으로 공유 커서가 바뀌면 구간 목록이 그 행으로 스크롤되고
  그 행이 roving 포커스가 된다.
OBSERVED_BASELINE: `SectionList`는 `currentIndex`로 행을 강조(aria-selected)만 하고 스크롤하지 않는다. `focusedIndex`는
  페이지 로컬 상태로 방향키·행 focus에서만 바뀐다. 132행 목록에서 스트립으로 커서를 옮기면 강조 행이 화면 밖에 남는다.
TARGET_BEHAVIOR: TC-013-6 — `followCursor`가 true이고 목록이 펼쳐진 비로딩 상태에서 `currentIndex`가 바뀌면 해당 행을
  `scrollIntoView({block:'nearest', behavior: reduced-motion ? 'auto' : 'smooth'})`하고, 목록이 DOM 포커스를 갖고 있지
  않을 때만 `onFocusMove(currentIndex)`. 페이지는 `followCursor = lastSource !== 'list'`. 스트립의 DOM 포커스는 빼앗지 않는다.
ALLOWED_PATHS: src/widgets/section-list, src/pages/track-viewer, e2e
PUBLIC_CONTRACTS_TO_PRESERVE:
  - 공유 커서 계약(shared.md): 이 effect는 `setCursor`를 부르지 않는다 — 순환 금지 불변
  - `focusedIndex ≠ currentIndex` 분리: 방향키는 여전히 로컬 포커스만 옮기고 Enter/클릭에서만 커서 갱신(TC-013-4)
  - 기존 DOM 포커스 규칙: 목록이 포커스를 가질 때만 행에 focus() — 스트립 슬라이더 포커스 보존
  - SectionList 기존 props·testid·role/aria · 셸 치수(320/56px) · e2e 기존 시나리오 전부
NON_GOALS: 목록 → 스트립 방향 변경, 접힌 레일 자동 펼침, 목록 정렬/필터, 스크롤 애니메이션 커스텀
CHANGE_BUDGET: 수정 3파일(SectionList.tsx effect+prop, TrackScreen.tsx·WebglFallbackScreen.tsx prop 배선) + e2e 1파일(2케이스).
  신규 파일 0 · 의존성 0.
TEST_EVIDENCE (2026-08-31 · D:\Project\track · Node v22.11.0(`engines >=22.12.0` 미만) · pnpm 9.12.3):
  - 변경 전: 스트립으로 커서를 옮기면 목록 행이 `aria-selected`만 되고 스크롤·roving 포커스 불변(SectionList 효과 없음)
  - 게이트: typecheck 0 · eslint(section-list, track-viewer, e2e 스펙) 0 · unit **348/348**(무변경 — 이 기능은 DOM 축) · build 0
  - e2e TC-013-6 2건 **통과**(단일 워커 1.4s·1.5s): 스트립 90% 클릭 → `aria-valuenow` > 60인 행이 `aria-selected`·`tabindex=0`·
    listbox 뷰포트 안(poll) · 슬라이더가 여전히 포커스(실측: Chromium은 tabIndex=0 슬라이더를 클릭으로 포커스) · 목록 상자는
    비포커스 / End 키 → 131행 가시·tabindex=0, 보이는 129행 클릭 시 scrollTop 변화 ≤1
  - 전체 `pnpm e2e` **81 통과 · 7 실패(총 88)** → 단일 워커 재실행 **6 통과**(병렬 부하 flake: 배지·axe·휠·fps — 전부 ≤2.2s) ·
    남은 1건 `track-evidence` 범례 패널 폭(311.6 > 304px)은 기준 소스에서도 동일 실패(기존 결함). 목록 스펙 10/10.
  - code-reviewer(2026-08-31) **WARN → 수정 반영**: [medium] 스크롤이 포커스 게이트 밖이라 자동재생 중 목록에서 탐색·클릭한
    행이 매 구간 밀려남 → 스크롤·onFocusMove를 같은 게이트(`listOwnsFocus`)로 묶고 두 effect의 중복 계산을 헬퍼로 통합
    (리뷰 제안 1 채택) · [medium] 자동재생(canvas) 경로 e2e 부재 → TC-013-6 3번째 케이스 추가(재생 중 목록 추종 + 목록
    포커스 보유 시 비추종, 10.8s 통과) · [low] e2e flake 3곳(슬라이더 가시성 대기·valuenow 확정 후 읽기·scrollTop 안정
    poll) 보강 · [low] 연속 소스에서 smooth 재타게팅(PLAUSIBLE) — 미조치: nearest는 행이 보이는 동안 no-op이고 자동재생은
    행 단위 이동이라 실측(재생 중 행 가시 poll 통과)으로 반증, 프로파일 근거 없어 보류. reduced-motion 공통화 제안 2는
    리뷰어 판단대로 보류.
  - 미검증(정직 표기): `prefers-reduced-motion` 분기는 e2e로 재지 않았다(브라우저 수동 확인 대상).
CAPABILITY_ESCALATION: none
DOCS_TO_UPDATE: component-spec/widgets.md §SectionList(followCursor·커서 따라가기) · pages.md 상호작용 표 —
  **이 라운드에서 개정 완료(2026-08-31)**. 계획: specs-surfaces.md TC-013-6 · traceability.md · PC-013(plan-delta PASS —
  검사기는 명세 샤드의 TC ID를 색인하지 않아 declared는 비웠다).

```json change-scope
{
  "ticketKey": null,
  "featureId": "FEAT-013",
  "TARGET_BEHAVIOR": "TC-013-6 — followCursor(=lastSource !== 'list')가 true이고 목록이 펼쳐진 비로딩 상태에서 currentIndex가 바뀌면 해당 행을 scrollIntoView(nearest)하고, 목록이 DOM 포커스를 갖지 않을 때만 onFocusMove(currentIndex). 스트립 포커스는 빼앗지 않는다.",
  "requestType": "feature",
  "testCaseIds": [
    "TC-013-6"
  ],
  "ALLOWED_PATHS": [
    "src/widgets/section-list",
    "src/pages/track-viewer",
    "e2e"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "공유 커서 계약 — effect가 setCursor를 부르지 않는다",
    "focusedIndex ≠ currentIndex 분리(TC-013-4)",
    "목록이 포커스를 가질 때만 행 focus() — 슬라이더 포커스 보존",
    "SectionList 기존 props·testid·aria · 셸 치수 · 기존 e2e"
  ],
  "NON_GOALS": [
    "목록 → 스트립 방향 변경",
    "접힌 레일 자동 펼침",
    "목록 정렬/필터"
  ],
  "CHANGE_BUDGET": "수정 3파일 + e2e 1파일 · 신규 0 · 의존성 0",
  "sourceDigest": null,
  "needsConfirmation": false
}
```
