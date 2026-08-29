# Component Spec — mini4wd-track-3d

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| shared 레이어 + 공유 커서 계약 | `shared.md` | EvidenceBadge/AlertSlot·StatusBanner/Legend/TopBar, **`useTrackCursor()` 소유권·통지·순환방지 계약(문서 핵심)** | developer, design-preview-builder |
| features 레이어 | `features.md` | `features/load-track`의 `UrlInputForm`, `useTrackFetch` 상태 계약 | developer, design-preview-builder |
| widgets 레이어 | `widgets.md` | AppHeader, SectionList, ProfileStrip, TrackCanvas, ControlCluster — 각 props·상태·a11y | developer, design-preview-builder, browser-verifier |
| pages + 상태 머신 + Interaction Matrix | `pages.md` | TrackViewerPage/InputScreen/ErrorScreen/NotFoundPage, 6상태 전이, 표면 간 상호작용 표, browser scenario | developer, design-preview-builder, browser-verifier |

## 전역 결정

- **공유 커서는 단일 owner**다: `TrackViewerPage`가 마운트하는 `TrackCursorProvider` 하나가 `currentIndex`를 소유하고, SectionList·ProfileStrip·TrackCanvas 셋은 전부 **구독자 겸 발행자**다. 발행은 항상 사용자 이벤트 핸들러(클릭·Enter·드래그·오빗 종료)에서만 일어나고, `currentIndex`를 구독하는 `useEffect` 안에서 재발행하지 않는다 — 이 한 줄 규칙이 순환 갱신을 구조적으로 차단한다. 상세는 `shared.md`.
- 절대 단위(m·cm) 표기 금지, 상승/하강 3중 인코딩(색+형태+텍스트), 근거 등급 배지 4단계 상시 렌더 — 세 계약 모두 모든 절에서 반복 확인한다(design-system 결정 승계).
- 이 제품은 읽기 전용 뷰어다 — 삭제/재정렬/다중 선택/저장 같은 mutation UI가 없다. 파괴적 액션·filter×reorder 조합 계약(component-designer 원칙 10~11)은 **N/A**로 각 절에 명시한다.
- `UI_LANE = tailwind-shadcn` — 스타일 확장은 cva variant + className 병합. substring/generated class selector 금지.
- `LOCAL_DOMAIN_STATE_MODE` 비활성(이 프로젝트에 state-contract 산출물 없음) — 그럼에도 SectionList 행은 index가 아니라 안정적 `id`를 canonical key로 쓴다(재구성 시 인덱스 밀림 방지, 저비용 방어).

## Assumptions and Blockers

- ASSUMPTION: "탐색 속도" 프리셋은 3단(slow/normal/fast)으로 가정 — feature-plan에 정확한 프리셋 개수가 명시되지 않아 segmented control 선택의 전제로 둔다. 개수가 6개 이상으로 바뀌면 select로 재검토.
- BLOCKER 없음 — layout-spec/design-system 모두 확정 상태로 존재.
