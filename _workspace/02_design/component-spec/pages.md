# Component Spec — pages + 상태 머신 + Interaction Matrix

## pages Components

| Component | Slice | Props | State |
|---|---|---|---|
| TrackViewerPage | `pages/track-viewer` | 없음(라우트 루트, 내부 상태 머신 소유) | 6종 화면 상태(아래) |
| InputScreen | `pages/track-viewer` | `InputScreenProps` | idle/loading/slow/error(필드) — `UrlInputForm` 위임 |
| ErrorScreen | `pages/track-viewer` | `ErrorScreenProps` | reason별 문구 분기 |
| NotFoundPage | `pages/not-found` | 없음 | 정적 404 |

## 화면 상태 머신 (owner: TrackViewerPage)

```ts
type ViewState =
  | { kind: 'input' }
  | { kind: 'loading' }
  | { kind: 'loading-slow' }
  | { kind: 'webgl-unsupported' }        // 3D 진입 이전 게이트, loading 이후 확정 시 대체
  | { kind: '3d' }
  | { kind: 'partial-failure' }
  | { kind: 'error'; reason: 'network' | 'parse' | 'not-closed-fatal' | 'timeout' }
```

전이: `input` →(제출)→ `loading` →(ASSUMPTION-007 임계 초과)→ `loading-slow` →(성공, WebGL 미지원 감지)→ `webgl-unsupported` │→(성공, WebGL 지원 + 폐곡선)→ `3d` │→(성공, 비폐곡선)→ `partial-failure` │→(fetch/파싱/순서복원 실패)→ `error` →(재시도)→ `loading`.

- `webgl-unsupported` 감지는 `loading` 진입 이전에도 가능(마운트 즉시 게이트, FEAT-014) — 이 경우 `loading`을 건너뛰고 바로 `webgl-unsupported`로 갈 수 있다(데이터 fetch와 독립).
- `TrackCursorProvider`(shared.md)는 `kind`가 `3d`/`partial-failure`/`webgl-unsupported`일 때만 마운트.
- `input`/`error`는 3분할 셸을 쓰지 않고 중앙 카드 레이아웃(layout-spec §Layout stability #4) — `InputScreen`/`ErrorScreen`이 각각 담당.

### InputScreen

```ts
interface InputScreenProps {
  formProps: UrlInputFormProps   // features.md 그대로 위임
}
```

### ErrorScreen — FEAT-001/002/003

```ts
interface ErrorScreenProps {
  reason: 'network' | 'parse' | 'not-closed-fatal' | 'timeout'
  rawSnippet?: string        // parse일 때만, 접이식 디버그 영역
  onRetry: () => void        // primary 버튼 1개, kind='loading'으로 복귀
}
```

- `AlertSlot`을 `role="alert" aria-live="assertive"`로 즉시 통지(입력 대기에 없던 슬롯 재사용, layout-spec §완전 실패).
- 재시도 버튼은 화면당 유일한 primary(hierarchy-actions §불변식).

## Interaction Matrix — 공유 커서 상호작용

| View State | Action | Canonical Target | UI 결과 | Browser Scenario |
|---|---|---|---|---|
| 3D 표시 | 목록 정상 행 클릭 | `SectionList.onSelect` | `setCursor(i,'list')` → 캔버스 카메라 이동, 스트립 인디케이터 동기 이동 | TC-013-2 |
| 3D 표시 | 목록에서 ↑↓ 이동 후 Enter | `SectionList.onFocusMove`→`onSelect` | 화살표 중엔 로컬 포커스만 이동, Enter에서만 커서 갱신 | TC-013-4 |
| 부분 실패 | 실패 구간 행 클릭 | `SectionList` (aria-disabled) | `onSelect` 미호출(1차 방어) + `isReachable=false`(2차 방어) → 커서 불변 | TC-012-3 상응(목록 측) |
| 3D 표시 | 스트립 드래그 스크럽 | `ProfileStrip.onScrub` | `setCursor(i,'strip')` → 목록 해당 행 강조 + **그 행으로 스크롤(nearest)·roving 포커스 동기**(PC-013, 목록이 DOM 포커스를 갖지 않을 때만), 캔버스 이동 | TC-012-2 · TC-013-6 |
| 부분 실패 | 스트립 회색 구간 드래그 | `ProfileStrip` | `onScrub` 미호출 → 카메라 불변 | TC-012-3 |
| 3D 표시 | 스트립 화살표 경계에서 추가 이동 | `ProfileStrip.onScrub` | 도달 가능 최대/최소 인덱스에서 멈춤(실패 구간 진입 없음) | — |
| 3D 표시 | 캔버스 자유 오빗 후 정지 | `TrackCanvas.onOrbitDepart` (debounce ≥250ms) | `setCursor(i,'canvas')` → 목록·스트립 동기화 | — |
| 3D 표시 | 동일 인덱스로 재발행(예: 스트립이 캔버스가 이미 반영한 값을 재확인) | 리듀서 등가 검사 | 동일 state 참조 반환, 재렌더/재통지 없음 → 순환 종료 | 순환방지 회귀 시나리오(§shared.md) |
| WebGL 미지원 | 목록 전체폭 확장 | `SectionList(variant='full-width')` | 캔버스 컬럼 미렌더, 스트립은 유지(고도 그래프 2D) | TC-013-5, TC-014-2 |
| 모든 3D 계열 상태 | Tab 키 skip-link 사용 | `#main-content` | 텍스트 목록 첫머리로 포커스 이동(3D 캔버스 아님) | a11y-responsive §skip-link |
| 3D 표시 | 스트립 collapse 토글 | `ProfileStrip.onToggleCollapsed` | 높이만 140↔40px, `currentIndex`는 불변·40px 요약 텍스트는 계속 반영 | layout-spec §Chart 리사이즈 계약 |
| loading | ASSUMPTION-007 임계 초과 | `TrackViewerPage` 내부 타이머 | 동일 셸에 "시간이 걸리고 있어요" 텍스트만 추가(재배치 없음) | — |
| error | 재시도 클릭 | `ErrorScreen.onRetry` | `kind='loading'` 복귀, 입력값 보존 | TC-001 계열 |

## 범위 밖 확인 (component-designer 원칙 10~11 대조)

- **파괴적 액션 UI 없음**: 이 제품에 삭제/영구 변경 mutation이 없다(읽기 전용 뷰어) — undo/confirm 계약 N/A.
- **다중 선택·재정렬 없음**: `SectionList`는 단일 커서 선택만 지원, drag-reorder·multi-select 상호작용 조합 설계 대상이 아니다.
- **filter × move 조합 없음**: 목록에 필터/검색 입력이 없다(132개 전량 표시가 계약). 있는 유일한 "필터형" 상태는 collapse(펼침/접힘)이며 위 Interaction Matrix에 별도 행으로 다뤘다.
