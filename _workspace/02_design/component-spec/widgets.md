# Component Spec — widgets 레이어

목록·캔버스·스트립·컨트롤은 cross-cutting 주입 슬롯이 아니라 단일 페이지 내 대형 FEAT 조합 단위라 표준 `widgets/` 계층 그대로 둔다(layout-spec 결정 승계). 셋 모두 `shared/lib/track-cursor`의 `useTrackCursor()`를 구독·발행한다 — 소유권·순환방지 계약은 `shared.md` §공유 커서 계약을 따른다(재정의 금지).

## widgets Components

| Component | Slice | Props | State |
|---|---|---|---|
| AppHeader | `widgets/app-header` | `AppHeaderProps` | 상태 없음(정적 액션) |
| SectionList | `widgets/section-list` | `SectionListProps` | loading(skeleton) / populated / part-failure / webgl-fallback |
| ProfileStrip | `widgets/profile-strip` | `ProfileStripProps` | loading(skeleton) / populated / part-failure / collapsed |
| TrackCanvas | `widgets/track-canvas` | `TrackCanvasProps` | populated / part-failure / unsupported-piece(개별 세그먼트 단위) |
| ControlCluster | `widgets/view-controls` | `ControlClusterProps` | default / disabled(WebGL 미지원 시 전체 미마운트) |

## Component Detail Specs

### AppHeader — FEAT-001, layout-spec §Global shell

```ts
interface AppHeaderProps {
  onSwitchTrack: () => void   // "다른 트랙 보기" — 입력 대기 화면으로 되돌아감
  sourceUrl: string           // "원본 편집기 ↗" — TC-014-4: WebGL 미지원에서도 동일 노출
}
```

- `shared/ui/top-bar`의 `TopBar`를 `actions={<>...</>}`로 조립: `<button>다른 트랙 보기</button>` + `<a href={sourceUrl} target="_blank" rel="noopener">원본 편집기 ↗</a>`.
- 정적 액션(로그인/알림처럼 feature 상태에 의존 안 함) — cross-cutting 슬롯 불필요(layout-spec 결정).

### SectionList — FEAT-013/014, 1차 정보원

```ts
type SegmentKind =
  | 'straight' | 'corner' | 'slope' | 'bank' | 'lane-change'
  | 'wave'          // 2026-08-30 추가 — 아래 §웨이브 참조
  | 'marker' | 'unsupported'

interface SectionListItem {
  id: string                    // 원본 피스 안정 ID — canonical key, index 아님
  index: number                 // RestoredPath 순서 표시용 (1-based 라벨: "12/132")
  pieceType: string
  segmentKind: SegmentKind
  evidenceGrade?: EvidenceGrade  // 해당 값이 있는 행만
  unsupportedLabel?: string      // "미지원: {타입명}" (FEAT-009)
  failed?: boolean                // 커서가 갈 수 없는 행 — 회색 배경 + 비활성
  unplacedReason?: 'disconnected' | 'unsupported'  // 2026-08-30 추가 — 아래 §자리 없는 행
}

interface SectionListProps {
  items: SectionListItem[]
  currentIndex: number            // useTrackCursor 구독
  focusedIndex: number             // 키보드 roving 포커스 — currentIndex와 분리(아래 참고)
  onFocusMove: (index: number) => void   // ↑↓ 이동, setCursor 호출 안 함
  onSelect: (index: number) => void      // Enter/클릭 — 내부에서 setCursor(index,'list') 호출
  expanded: boolean                // WebGL 미지원 시 true 강제(토글 불가)
  onToggleExpanded?: () => void     // 그 외 상태에서만 제공(접이식)
  variant: 'sidebar' | 'full-width'
  loading?: boolean
  followCursor?: boolean           // 2026-08-31 PC-013 — 다른 표면이 옮긴 커서를 목록이 따라간다(아래 §커서 따라가기)
}
```

- **커서 따라가기**(2026-08-31 PC-013, TC-013-6): `followCursor`가 true이고 목록이 펼쳐진 비로딩
  상태에서 `currentIndex`가 바뀌면 — **목록이 DOM 포커스를 갖고 있지 않을 때만** — 그 행을
  `scrollIntoView({block: 'nearest'})`로 보이게 하고(이미 보이면 움직이지 않는다 ·
  `prefers-reduced-motion`이면 즉시, 아니면 smooth) `onFocusMove(currentIndex)`로 roving 포커스를
  맞춘다. 스크롤과 포커스는 **같은 게이트**를 쓴다(2026-08-31 code-reviewer 정정 — 스크롤만 무조건이면
  자동 재생이 구간마다 커서를 밀 때 사용자가 방금 고른 행이 매 구간 밀려나고 방향키 탐색이 브라우저
  포커스 스크롤과 서로를 되돌린다). 사용자가 목록 안에서 탐색 중이면 방해하지 않는다. 페이지는 `followCursor = lastSource !== 'list'`로
  준다(스트립·캔버스가 옮긴 커서만 따라가고, 목록에서 고른 경우는 사용자의 스크롤을 건드리지 않는다).
  이 effect는 커서를 **쓰지 않으므로** §공유 커서 계약의 순환 금지와 충돌하지 않는다. DOM 포커스를
  스트립에서 빼앗지 않는다(기존 규칙 — 포커스 이동은 목록이 이미 포커스를 가질 때만).
- **웨이브**(2026-08-30 FEAT-013 구현 중 추가): 종전 `SegmentKind`에 웨이브가 없었는데
  카탈로그의 `Chi1`/`Chi2`는 23종 **안**이라 `unsupported`가 아니고, `straight`로 적으면 화면이
  틀린 유형을 말한다. TC-013-1의 유형 열거가 "…등"으로 열려 있어 확장이 계약을 깨지 않는다.
  유형 판정의 정본은 **피스 클래스**이며 고도 산출에서 유추하지 않는다 — `Bri2`(jump)는 색이
  없으면 고도가 평평하지만 여전히 슬로프 계열이고, 사용자가 목록에서 찾는 것은 "무슨 피스인가"다.
  참조 트랙 실측 분포: `bank` `corner` `lane-change` `marker` `slope` `straight` `wave` 7종.
- **자리 없는 행**(2026-08-30 추가): 복원 순서에 들어가지 못한 피스가 **두 종류** 있고 둘 다
  목록에서 사라지면 안 된다(제품 계약 §5). 실측으로 확인한 형태다 —
  `UNSUPP` fixture는 134피스 중 미지원 2개가 복원 순서에 **없고**(끝점을 몰라 사슬에 못 낀다),
  `OPENLOOP`은 복원이 실패해 FEAT-004의 131개 진단 접두부만 나온다(전체 132).
  종전 스펙의 `failed`("부분 실패 지점 이후")는 앞의 경우를 담지 못했다 — 그대로 두면
  TC-013-3("미지원 행에 라벨이 표기된다")이 애초에 성립할 수 없다.
  `unplacedReason`으로 자리가 없는 **이유**를 남기고 `failed`는 "커서가 갈 수 없다"만 뜻한다.
  **번호를 지어내지 않는다** — 이어지는 행 번호를 주되 순서상 자리가 아님을 이 필드가 말한다.
- **폭의 소유자는 이 컴포넌트다**(2026-08-30): 패널 320px / 레일 56px을 상수로 내보내고
  셸이 그 값을 쓴다. 두 곳에 적으면 접기 상태에서 어긋난다 — 실측으로 셸이 따로 폭을 정했을 때
  접기 후 캔버스가 384.7px 늘고 목록은 264px만 줄어 320px 예약이 깨졌다.
- **focusedIndex ≠ currentIndex**: a11y-responsive §포커스 순서에 따라 화살표는 목록 내부 roving tabindex만 이동시키고(TC-013-4 "순회"), Enter/클릭에서만 `onSelect`가 호출되어 공유 커서(`currentIndex`)가 갱신된다. 이 분리가 없으면 화살표 연타만으로 캔버스·스트립이 매 프레임 따라 움직여 §공유 커서 계약의 "쓰기는 명시적 사용자 확정 이벤트에서만" 원칙이 깨진다.
- **시맨틱**: 목록 컨테이너 `role="listbox"`, 각 행 `role="option" aria-selected={index===currentIndex}`. 진입 시 단일 Tab stop, 내부는 방향키 roving(WAI-ARIA APG 컴포지트 패턴, a11y-responsive §포커스 순서 근거).
- **실패 행**: `aria-disabled="true"`, `onSelect` 호출 자체를 막는다(1차 방어) + `useTrackCursor().isReachable()`이 2차 방어(shared.md). 시각: `--color-fail-segment` 배경 + 아이콘, 텍스트로도 "연결 실패로 접근 불가" sr-only 부기(색 단독 금지).
- **미지원 행**: `unsupportedLabel`을 라벨 옆에 그대로 노출, 뭉뚱그리지 않음(TC-009-3).
- **로딩**: 320px/100% 폭 그대로 shimmer 스켈레톤 행(개수는 이전 로드 시 알려진 총량 없으면 12행 고정 placeholder) — 셸 치수 불변(layout-spec §1 규칙 #2).
- **WebGL 미지원**: `variant='full-width'`, `expanded=true` 고정, 토글 컨트롤 자체를 렌더하지 않는다 — **이것은 토글이 아니라 대체 화면**이므로 "접었다 펼 수 있는 옵션"으로 보이면 안 된다(제품 계약 §4, 협상 불가).
- **측면 접기 계약**: `variant='sidebar'`에서 `expanded=false`이면 패널을 제거하거나 위로 접지 않고 좌측 56px 레일을 유지한다. 레일에는 세로 제목과 "펼치기" 버튼만 남기고, 캔버스가 나머지 폭을 사용한다. 토글은 `aria-controls`와 `aria-expanded`를 동기화하고 재렌더 뒤에도 포커스를 유지한다. 다시 펼치면 기존 280~340px 폭과 전체 행을 복원한다.
- **모바일 reflow**: 640px 이하에서 `variant='sidebar'`는 측면 레일 대신 캔버스 아래의 가로 아코디언(기본 접힘 + "132개 구간" 배지 카운트)으로 전환한다(a11y-responsive §반응형).

### ProfileStrip — FEAT-007/012 owner

```ts
interface ProfileStripPoint {
  index: number
  elevationRelative: number      // 상대 스케일, 절대 단위 금지
  segmentKind: SegmentKind
  failed?: boolean
}

interface ProfileStripProps {
  points: ProfileStripPoint[]
  currentIndex: number
  onScrub: (index: number) => void       // 드래그/클릭/화살표 확정 — setCursor(index,'strip')
  collapsed: boolean
  onToggleCollapsed: () => void
  zClosureGap?: { startElevationRelative: number; endElevationRelative: number }  // TC-012-5
  loading?: boolean
}
```

- **연속 진행축**(PC-014, TC-012-6): 인디케이터 위치는 두 축의 합성이다. 평소에는 `currentIndex`가
  정하고, `subscribeProgress`(shared.md §연속 진행 채널)가 `null`이 아닌 값을 통지하는 동안에는 그
  소수 인덱스가 정한다. 스트립은 이 통지를 **state에 넣지 않고** 인디케이터 노드의 transform만
  직접 갱신한다 — 프레임당 DOM 쓰기 1건이고 React 재렌더는 0건이다. `points` 132개의 경계선·곡선은
  다시 그리지 않는다. 통지가 `null`로 돌아오면 즉시 `currentIndex` 위치로 복귀한다.
- **접근성 값은 구간 단위를 유지한다**: `aria-valuenow`/`aria-valuetext`/40px 헤더 요약은 계속
  `currentIndex`만 반영한다(a11y-responsive §포커스 순서의 "aria-valuemin/max/now=구간 인덱스"가
  정본). 연속축은 시각 표현 전용이다.

- **시맨틱**: 단일 Tab stop, `role="slider" aria-valuemin={0} aria-valuemax={total-1} aria-valuenow={currentIndex} aria-valuetext="{segmentKind 라벨}, {index+1}/{total}"`. `←/→`=인접 **도달 가능한** 인덱스로 이동(실패 구간은 건너뛰지 않고 그 경계에서 멈춤 — 실패 지점 너머로 화살키가 넘어가지 않는다), `Home/End`=처음/마지막 도달 가능 인덱스, Enter 불필요(이동 즉시 반영, a11y-responsive 명시).
- **드래그 스크럽**: pointermove로 최근접 인덱스 계산 → 실패 구간(회색 점선) 위에서는 `onScrub` 호출 자체를 하지 않는다(TC-012-3, 1차 방어). 2차 방어는 `isReachable()`(shared.md).
- **y축**: "상대 스케일(실측 아님)" 텍스트를 항상 렌더(FEAT-010, 조건부 숨김 금지). 축 눈금은 nice number 4~6개(data-viz 원칙).
- **Z-closure gap**(TC-012-5): `zClosureGap`이 있으면 그래프 양 끝단 수직 불연속을 그대로 그린다 — 보정해서 이어붙이지 않는다("조용히 숨기지 않는다", 제품 계약 §5).
- **collapse 계약**: `collapsed=true`여도 40px 헤더 바는 항상 마운트되어 텍스트 요약(예: "슬로프 상승 중, 12/132")을 `currentIndex` 변화에 반응해 갱신한다 — 완전 숨김 금지(layout-spec §Chart 리사이즈 계약, FEAT-007의 유일한 조작 표면이 사라지면 안 됨). 개폐 애니메이션은 `--duration-base`, transform만(height는 layout-spec 최소값 96px/40px 사이).
- **비텍스트 대체(WCAG 1.1.1)**: 이 스트립은 정확 수치를 담지 않아(상대 스케일) 별도 data-table 대체를 두지 않는다 — 근거: 제품 계약 §3에 따라 `SectionList`가 이미 같은 구간별 종류·등급 정보를 텍스트로 1차 제공하므로 중복 표는 불필요. `aria-describedby`로 "상세 목록은 구간 목록 참고" sr-only 텍스트만 연결한다.
- **최소 크기 폴백**: 320px/96px 미만이면 스트립 자체를 숨기고 "구간 목록에서 확인" 링크로 대체(완전 hidden 아님, layout-spec §Chart 리사이즈 계약).

### TrackCanvas — FEAT-006/007/008/009/011

```ts
interface RenderableSegment {
  id: string
  index: number
  geometryKind: SegmentKind | 'unsupported'
  unsupportedLabel?: string
}

interface TrackCanvasProps {
  segments: RenderableSegment[]        // 부분 실패 시 복원 구간까지만
  currentIndex: number
  onOrbitDepart: (index: number) => void   // pointerup/관성 종료 후 1회, ≥250ms debounce
  followMode: boolean
  legendOpen: boolean
  truncated?: boolean                       // 부분 실패 — 렌더 끝단에 절단 마커
}
```

- WebGL 지원 게이트는 이 컴포넌트 상위(`TrackViewerPage`, FEAT-014)에서 처리한다 — `TrackCanvas`는 지원 확인 이후에만 마운트되므로 자체 미지원 상태를 갖지 않는다.
- **미지원 피스**(FEAT-009): 와이어프레임 박스 + `@react-three/drei` `Html` 오버레이로 "미지원: {타입명}" 라벨, 각 개별 세그먼트마다 독립 라벨(하나로 뭉뚱그리지 않음, TC-009-3).
- **부분 실패**: `truncated`가 true면 복원 구간 끝에 시각적 절단 마커(예: 열린 프레임/점선 페이드)를 렌더 — 조용히 잘리지 않고 "여기서 끊겼다"를 드러낸다(제품 계약 §5).
- **오빗 힌트 오버레이**: 좌상단 1회성 회전/줌 힌트, 이후 접힘. absolute 배치라 셸 치수 불변.
- **오빗 발행 규칙**: `onOrbitDepart`는 `useFrame`/렌더 루프 안에서 매 프레임 호출 금지(shared.md §순환 갱신 방지책 1차 게이트 적용 대상).
- **연속 진행 발행 규칙**(PC-014): 추종 재생 중 `useFrame`에서 `publishProgress(order + t)`를 **매 프레임** 호출한다. 이것은 위 금지의 예외가 아니라 **대상 밖**이다 — 커서가 아니라 재렌더를 만들지 않는 별도 채널이기 때문이다(shared.md §연속 진행 채널). 추종 해제·재생 정지·`seeking` 진입 시 `publishProgress(null)`을 1회 보낸다. 공유 커서 발행(`setCursor(order,'canvas')`)은 종전대로 구간이 바뀔 때만이다. 카메라 이동 애니메이션 자체는 `--duration-*` 모션 토큰을 쓰지 않는다(design-system §4 — 카메라·자동재생은 3D 코드 소관, 인터랙션 전환 토큰의 목적 밖 소비 금지).
- **현재 구간 하이라이트**(FEAT-019, PC-015): 공유 커서(`currentIndex`)가 가리키는 구간을 씬에 표시한다. 이 위젯은 여기서 커서의 **순수 구독자**이며 `setCursor`를 부르지 않는다(shared.md §순환 갱신 방지책 1차 게이트). 채널 둘: ① 면 — 그 구간 레인 면 위 `primary` 반투명 오버레이(표면색 **치환 아님**, 덧칠. rise/fall 원본색 대조가 하이라이트로 사라지면 안 된다) ② 형태 — 같은 구간 바깥 둘레의 **이중 테두리**(PC-016): 밝은 `#C4B5FD`·어두운 `#2E1065` 두 톤을 나란히, 씬 단위의 **실제 폭**을 가진 띠(면)로 그린다. 선이 아니라 띠인 이유는 WebGL의 `linewidth`가 대부분 1px로 무시되기 때문이고, 두 톤인 이유는 단일 색이 밝은 평지와 어두운 상승·하강 모두에 3:1을 낼 수 없기 때문이다(TC-019-8). 두 띠 모두 구간 **안쪽**으로 깔아 이웃 구간을 덮지 않는다. `depthTest=false`라 가려진 구간도 위치가 보인다(면은 깊이 검사를 유지해 "가려져 있다"가 남는다).
- **하이라이트 세 재질의 렌더 규칙**(PC-016 구현 실측, 2026-09-03). 둘 다 지키지 않으면 **문서에 적은 색이 화면의 색이 아니게 된다** — 그러면 위 대비 계약이 종이 위에서만 성립한다.
  ① `toneMapped={false}`: R3F 기본 ACES 톤매핑은 조명을 받는 표면을 위한 것이고 하이라이트는 UI 신호다. 켜 두면 `#C4B5FD`가 화면에서 (195,177,225)로, `#2E1065`가 (94,72,154)로 나와 평지 대비가 6.83 → **3.18**로 떨어진다.
  ② 테두리 재질에 `transparent` + `opacity=1`: three는 **투명 객체를 불투명 객체보다 뒤에** 그리고 `renderOrder`는 각 목록 **안에서만** 작동한다. 테두리를 불투명으로 두면 반투명 면(renderOrder 1)이 나중에 그려져 테두리를 덮는다 — 실측에서 밝은 톤이 면에 0.45로 희석된 (183,162,252)로 나왔다. 같은 목록에 넣어야 renderOrder가 유효하다.
  두 규칙 적용 후 화면 픽셀이 토큰과 **정확히 일치**한다(실측: (196,181,253)·(46,16,101)). 지오메트리는 `currentIndex`·`layout`이 바뀔 때만 재생성하고 렌더 루프에서는 0건이다(performance-budget §1). **추종 중에는 그리지 않는다** — 카메라 자체가 현재 위치이고 1인칭 시야 앞을 덮으면 FEAT-007의 목적을 해친다. 연속 진행축(PC-014)은 구독하지 않는다(하이라이트는 구간 단위).
- **커서 추종 카메라 규칙**(FEAT-019): 커서가 바뀌면 하이라이트 기준점을 카메라에 투영해 **뷰 절두체 안이면 카메라를 전혀 건드리지 않는다.** 밖이면 오빗 **타깃만** 그 지점으로 옮기고 방위각·극각·거리는 보존한다. `prefers-reduced-motion`이면 즉시 컷. 이 이동도 `--duration-*` 토큰을 쓰지 않는다(design-system §4). 추종 ON에서의 목표 이동(FEAT-007)은 종전 규칙 그대로다.
- **관측 표면**: 하이라이트 대상 구간을 호스트 `data-highlight-order`로 드러낸다(없으면 속성 부재). 3D 캔버스는 픽셀만 남기므로 `data-follow-order`와 같은 이유·같은 방식이다.
- **키보드**: 컨테이너 `tabIndex=0`, 방향키=오빗 회전, `+`/`-`=줌(a11y-responsive §포커스 순서).
- **reduced-motion**: 자동재생 자동 진입 금지 + 카메라 전환 즉시 컷(design-system §4 그대로 승계).

### ControlCluster — 시점/재생/탐색 속도

```ts
interface ControlClusterProps {
  followMode: boolean
  onToggleFollow: () => void                              // switch, 즉시 적용
  playbackSpeed: 'slow' | 'normal' | 'fast'
  onSpeedChange: (v: 'slow' | 'normal' | 'fast') => void   // segmented, 최대 5개 규칙 이내
  isPlaying: boolean
  onPlayToggle: () => void
}
```

- **컨트롤 선택 근거**(interaction-controls 매트릭스): "탐색 속도"는 3개 고정 프리셋 — 정확한 값 입력이 목적이 아니고 옵션이 2~5개이므로 slider 대신 **segmented control**(native `role="radiogroup"` + 각 옵션 native `<button role="radio">`, 원칙 12). slider였다면 대략값 목적에만 써야 한다는 규칙과 충돌했을 것.
- **followMode 토글**: 즉시 효과이므로 `switch`(checkbox 아님) — interaction-controls "즉시 적용=switch" 규칙.
- 캔버스 위 오버레이라 배경 불투명도 ≥0.88(design-system §4), hover 전환만 `--duration-fast`.
- WebGL 미지원 상태에서는 이 위젯 자체가 마운트되지 않는다(3D 캔버스가 없으므로 조작 대상 없음) — disabled 렌더가 아니라 부재.
