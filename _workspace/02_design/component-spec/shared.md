# Component Spec — shared 레이어

## 공유 커서 계약 (이 문서의 핵심)

세 표면(텍스트 구간 목록·프로파일 스트립·3D 캔버스)이 "현재 구간 인덱스" 하나를 공유한다. 소유·통지·순환방지를 아래처럼 못박는다.

### 소유권

- 단일 owner: `src/shared/lib/track-cursor/TrackCursorProvider.tsx`. `TrackViewerPage`가 화면 상태 `3D 표시`/`부분 실패`/`WebGL 미지원`에 진입할 때만 `<TrackCursorProvider path={restoredPath}>`로 마운트한다(`입력 대기`/`로딩`/`완전 실패`는 path 자체가 없어 Provider 불필요 — FEAT/REQ: 없음, 순수 구조 결정).
- SectionList·ProfileStrip·TrackCanvas는 전부 **읽기(구독)와 쓰기(발행)를 동시에 하는 대칭 소비자**다. 어느 하나가 "진짜 소유자"가 아니다 — Provider가 유일한 소유자다.

### 공개 API

```ts
// src/shared/lib/track-cursor/useTrackCursor.ts
type CursorSource = 'list' | 'strip' | 'canvas' | 'initial'

interface TrackCursorState {
  currentIndex: number       // RestoredPath 순서 기준 0-based canonical index
  totalCount: number
  lastSource: CursorSource   // 디버그·비순환 검증 전용. UI 렌더 분기에 쓰지 않는다
}

interface TrackCursorApi extends TrackCursorState {
  setCursor: (index: number, source: CursorSource) => void
  stepBy: (delta: number, source: CursorSource) => void   // ←/→, Home/End용 상대 이동
  isReachable: (index: number) => boolean                  // 부분 실패 시 실패 구간 이후 false
}

function useTrackCursor(): TrackCursorApi   // Provider 밖 호출 시 throw — 개발 단계 조기 발견
```

### 순환 갱신 방지책 (2중 게이트)

1. **구조 규칙(1차 게이트)**: 세 위젯 모두 `currentIndex`는 **props/구독으로만 읽고**, 쓰기는 **직접 사용자 이벤트 핸들러**(`onClick`/`onKeyDown`/`onPointerMove` 드래그/오빗 종료 콜백)에서만 호출한다. `currentIndex`를 관찰하는 `useEffect`/`useFrame` 안에서 `setCursor`/`stepBy`를 호출하지 않는다 — 이 규칙 하나로 A→B→A 재발행 경로 자체가 코드에 존재하지 않게 된다.
2. **리듀서 등가 검사(2차 게이트, 방어 심층화)**: `setCursor`/`stepBy`는 대상 인덱스를 clamp한 뒤 `targetIndex === state.currentIndex`면 **동일 state 참조를 반환**(재렌더 없음). 1차 규칙이 어떤 이유로든 뚫리더라도(예: 리팩터 실수) 같은 값 재발행은 여기서 물리적으로 끊긴다.
3. **실패 구간 격리**: `isReachable(index)`가 false인 인덱스로의 `setCursor`는 no-op(등가 검사와 같은 경로로 거부). 각 위젯은 UI 레벨에서도 실패 구간을 비활성화(행 `aria-disabled`, 스트립 회색 구간 클릭 무시, 캔버스는 애초에 그 구간을 렌더하지 않으므로 오빗 근접 이벤트가 발생하지 않음)해 1차 방어를 먼저 걸고, 리듀서 거부는 2차 방어다(안전 하한 I6 — 한 경로 누락도 허용하지 않는다).

### 연속 진행 채널 (추종 시점 전용, PC-014)

공유 커서는 **구간 단위**다. 자동 재생 중 인디케이터가 구간 경계에서만 튀는 것을 없애려고 커서를
소수 인덱스로 승격하면 세 표면이 60fps로 재렌더된다 — 위 순환방지 계약이 막으려는 것과 같은
비용이다. 그래서 축을 늘리지 않고 **두 번째 채널**을 둔다.

```ts
// src/shared/lib/track-cursor — 같은 Provider가 소유하되 React state가 아니다
interface TrackCursorApi {
  // ...기존 커서 API 그대로

  /** 연속 진행 발행. `null`이면 "연속 진행 없음"(재생 정지·추종 해제·seek 중) */
  publishProgress: (fractionalIndex: number | null) => void
  /** 구독. 해제 함수를 돌려준다 */
  subscribeProgress: (listener: (fractionalIndex: number | null) => void) => () => void
}
```

- **React state가 아니다.** 값은 ref에 담기고 구독자에게 직접 통지한다. `publishProgress`는 어떤
  재렌더도 만들지 않는다 — 그래서 `useFrame` 안에서 부를 수 있고, 위 §순환 갱신 방지책의 1차
  게이트("`useFrame` 안에서 `setCursor`/`stepBy` 금지")와 충돌하지 않는다. **그 금지는 커서에
  대한 것이고 이 채널은 커서가 아니다.** 커서 발행 규칙(구간이 바뀔 때 1회)은 그대로 남는다.
- **발행자는 하나뿐이다** — `TrackCanvas`의 추종 렌더 루프. 목록·스트립은 발행하지 않는다.
- **구독자는 하나뿐이다** — `ProfileStrip`. 목록이 구독하면 132행 스크롤 계산이 매 프레임 붙는다.
- **파생값이지 정본이 아니다.** `fractionalIndex`는 `currentIndex`를 대체하지 않는다. 접근성 값
  (`aria-valuenow`/`aria-valuetext`)·목록 스크롤·roving 포커스(TC-013-6)·카메라 목표는 계속
  공유 커서만 본다. 보조기술에 프레임 단위 통지를 흘리지 않는 것이 이 분리의 목적이다.
- **`null` 복귀 의무**: 재생 정지·추종 해제·경로 교체 시 발행자가 `null`을 보낸다. 구독자는
  즉시 `currentIndex` 위치로 되돌아간다. 마지막 값이 남으면 인디케이터가 커서와 어긋난 자리에
  멈춘 채 굳는다.
- **seek 중에는 발행하지 않는다.** 사용자가 찍은 지점이 커서의 정본이고, 카메라가 그리로
  이동하는 중간 위치를 발행하면 인디케이터가 사용자가 찍은 자리에서 카메라 뒤로 끌려간다
  (`FlythroughState.seeking`이 이미 커서에 대해 같은 이유로 존재한다).

### 캔버스의 커서 소비 (FEAT-019, PC-015)

`TrackCanvas`는 종전에 커서를 **추종 카메라의 목표**로만 읽었다 — 추종이 꺼져 있으면 커서 변화가 씬에
아무 영향도 주지 않았다. FEAT-019부터 커서는 캔버스의 **렌더 입력**이기도 하다: 그 구간에 하이라이트를
그린다. 두 소비는 겹치지 않는다(추종 ON=카메라 목표, OFF=하이라이트).

이것은 §순환 갱신 방지책을 **넓히지 않는다.** 하이라이트는 커서의 순수 구독자이며 `setCursor`를 부르지
않으므로 A→B→A 경로가 생기지 않는다. 커서 변화에 반응해 카메라 **타깃**을 옮기는 경우(대상이 화면
밖일 때)에도 그 이동은 `onOrbitDepart`를 발행하지 않는다 — 사용자 조작이 아니라 커서에 대한 반응이고,
발행하면 자기 출력을 입력으로 먹는다.

### TrackCanvas의 오빗 이탈 특이사항

자유 오빗은 프레임마다 카메라 위치가 바뀌므로 "이벤트"가 연속적이다. `onOrbitDepart`는 **드래그 종료(pointerup) 또는 관성 감쇠 완료 시 1회, debounce ≥250ms**로만 발행한다 — 매 프레임 발행 금지(1차 게이트 위반이자 렌더 스톰 유발).

## shared/ui Components

| Component | File Path | Props Interface | Description |
|---|---|---|---|
| AlertSlot | `src/shared/ui/AlertSlot/AlertSlot.tsx` | `AlertSlotProps` | 40px 상시 예약 슬롯, 레벨별 role/aria-live 전환 |
| TopBar | `src/shared/ui/top-bar/TopBar.tsx` | `TopBarProps` | 헤더 레이아웃 프리미티브(banner 컨테이너 + 우측 액션 슬롯), `widgets/app-header/AppHeader`가 조립해 소비(§widgets.md) |

## Component Detail Specs

### ~~EvidenceBadge~~ · ~~Legend~~ — FEAT-010, REQ-F-013

**PC-018(2026-09-03)로 제거됨** — 3D 뷰 하단 근거 등급 바와 범례를 사용자 결정으로 지웠다. `REQ-F-013`은 Won't로 내렸다. 두 컴포넌트는 이 오버레이가 유일한 소비자였으므로 함께 삭제했다(직접 고아, `minimal-change-contract` §7).

되살릴 때 필요한 것: 4등급(measured/confirmed/inferred/unknown)의 **채널 순서**가 협상 불가였다 —
1차 텍스트 라벨 → 2차 보더 형태(unknown만 점선) → 3차 색. 그리고 4등급 모두 같은 `min-width`를
써서 등급이 바뀌어도 주변 레이아웃이 흔들리지 않아야 했다.

### AlertSlot — layout-spec §Layout stability #1

```ts
type BannerLevel = 'info' | 'warning' | 'error'

interface AlertSlotProps {
  content: null | {
    level: BannerLevel
    message: string
    actionLabel?: string
    onAction?: () => void
  }
}
```

- `content === null`이어도 래퍼 `<div id="alert-slot">`는 `min-height: 40px`로 항상 렌더된다(높이 흔들림 금지).
- role/aria-live는 레벨에 따라 래퍼가 스스로 전환한다: `level==='error'` → `role="alert" aria-live="assertive"`, 그 외(`info`/`warning`) → `role="status" aria-live="polite"`.
- `actionLabel`/`onAction`은 완전 실패의 "재시도" 1개 버튼(primary, hierarchy-actions §버튼 위계)에 쓰인다. 버튼이 없는 배너(부분 실패 상시 배너 등)는 두 prop을 생략.
- 애니메이션: 등장/퇴장 `--duration-base`(200ms) 페이드만, transform 이동 없음(높이 불변 계약과 충돌 방지). `prefers-reduced-motion`에서 0ms.

### TopBar — 프리미티브

```ts
interface TopBarProps {
  title: string          // 서비스명(h1)
  actions: React.ReactNode  // 우측 정렬 액션 슬롯 — AppHeader가 버튼 2개를 주입
}
```

- `<header role="banner">` 자체를 렌더. h1은 `title`을 그대로 감싼다.
- 화면 최상단 가장자리 = Fitts's Law "무한 크기" 타깃(hierarchy-actions §Fitts's Law) — actions 슬롯은 항상 헤더 우측에 고정, 스크롤에 따라 사라지지 않음(sticky 불필요, 헤더 자체가 페이지 최상단 유일 고정 열).
