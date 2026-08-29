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

### TrackCanvas의 오빗 이탈 특이사항

자유 오빗은 프레임마다 카메라 위치가 바뀌므로 "이벤트"가 연속적이다. `onOrbitDepart`는 **드래그 종료(pointerup) 또는 관성 감쇠 완료 시 1회, debounce ≥250ms**로만 발행한다 — 매 프레임 발행 금지(1차 게이트 위반이자 렌더 스톰 유발).

## shared/ui Components

| Component | File Path | Props Interface | Description |
|---|---|---|---|
| EvidenceBadge | `src/shared/ui/EvidenceBadge/EvidenceBadge.tsx` | `EvidenceBadgeProps` | 4등급 배지, 고정폭, 상시 렌더(FEAT-010) |
| AlertSlot | `src/shared/ui/AlertSlot/AlertSlot.tsx` | `AlertSlotProps` | 40px 상시 예약 슬롯, 레벨별 role/aria-live 전환 |
| Legend | `src/shared/ui/legend/Legend.tsx` | `LegendProps` | rise/fall + 등급 4종 범례, 기본 접힘 |
| TopBar | `src/shared/ui/top-bar/TopBar.tsx` | `TopBarProps` | 헤더 레이아웃 프리미티브(banner 컨테이너 + 우측 액션 슬롯), `widgets/app-header/AppHeader`가 조립해 소비(§widgets.md) |

## Component Detail Specs

### EvidenceBadge — FEAT-010, REQ-F-013

```ts
type EvidenceGrade = 'measured' | 'confirmed' | 'inferred' | 'unknown'

interface EvidenceBadgeProps {
  grade: EvidenceGrade   // 라벨은 내부 고정 매핑(실측/확인/추정/미확인) — override 불가, 오처방 방지
}
```

- 채널 순서(design-system §근거 등급 배지, 협상 불가): **1차 텍스트 라벨 → 2차 보더 형태(measured/confirmed/inferred=실선, unknown=점선) → 3차 색**(`--color-badge-*`).
- `min-width: 56px` 고정 토큰, 4등급 모두 동일 — 등급이 바뀌어도 주변 레이아웃이 흔들리지 않는다(layout-spec §Layout stability #3).
- 상태: 상시 렌더 단일 상태뿐이다. 조건부 숨김·loading variant 없음 — 부모(SectionList 등)가 데이터 미도착 구간은 스켈레톤 행으로 대체하므로 배지 자체는 "데이터 있음"을 전제로 한다.
- `forced-colors: active`: 보더 스타일이 `CanvasText` 계열로 승계되어 점선/실선 구분이 색 없이도 유지된다(design-system §5).

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

### Legend — FEAT-010 보조

```ts
interface LegendItem {
  key: 'rise' | 'fall' | EvidenceGrade
  label: string
  icon: 'arrow-up' | 'arrow-down' | 'badge-outline'
}

interface LegendProps {
  items: LegendItem[]
  defaultOpen?: boolean   // 기본 false(접힘) — states.md "근거등급 범례(접이식, 기본 접힘)"
}
```

- 트리거는 native `<button aria-expanded>` (원칙 12: 클릭 가능 요소는 native button). 패널 개폐 `--duration-base`.
- 캔버스 오버레이 계약(design-system §4): 배경 불투명도 ≥0.88.

### TopBar — 프리미티브

```ts
interface TopBarProps {
  title: string          // 서비스명(h1)
  actions: React.ReactNode  // 우측 정렬 액션 슬롯 — AppHeader가 버튼 2개를 주입
}
```

- `<header role="banner">` 자체를 렌더. h1은 `title`을 그대로 감싼다.
- 화면 최상단 가장자리 = Fitts's Law "무한 크기" 타깃(hierarchy-actions §Fitts's Law) — actions 슬롯은 항상 헤더 우측에 고정, 스크롤에 따라 사라지지 않음(sticky 불필요, 헤더 자체가 페이지 최상단 유일 고정 열).
