# Layout Spec — 시맨틱·포커스·반응형·경로

## 랜드마크 / 시맨틱 구조

```
<a href="#main-content" class="skip-link">본문으로 건너뛰기</a>
<header role="banner">        서비스명(h1), 다른 트랙 보기, 출처 링크
<div role="status" aria-live="polite" id="alert-slot">   (조건부 콘텐츠, 슬롯은 항상 존재)
<div id="main-content">
  <nav aria-label="구간 목록"> 또는 <section aria-labelledby="section-list-h">  (h2 "구간 목록")
  <main aria-label="트랙 3D 뷰">                                                (h2 "3D 뷰", 상태별 대체 콘텐츠)
  <section aria-labelledby="strip-h">                                          (h2, 시각적으로 숨김 "고도 프로파일 탐색")
```
- heading 순서: h1(서비스명) → h2(구간 목록) → h2(3D 뷰/현재 상태) → h2(고도 프로파일 탐색, sr-only).
  Skip-link는 `#main-content`(목록 첫머리)로 이동 — 3D 캔버스가 아니라 텍스트 목록이 1차 정보원.


## 포커스 순서 / 키보드 계약

1. skip-link → 2. header 액션(다른 트랙 보기 → 출처 링크) → 3. 구간 목록(단일 Tab stop 진입,
`role="listbox"`, 내부 ↑↓ roving tabindex, Enter=점프) → 4. 캔버스 컨테이너(`tabIndex=0`,
방향키=오빗 회전, +/-=줌) → 5. 프로파일 스트립(단일 Tab stop, `role="slider"`
aria-valuemin/max/now=구간 인덱스, ←/→=인접 구간 이동, Home/End=시작/끝, Enter 불필요 — 이동 즉시
반영). 목록·스트립을 132개 개별 Tab stop으로 두지 않는 이유: WAI-ARIA APG 컴포지트 위젯 패턴을
따라 Tab 이동 비용을 줄이면서도 ux-brief TC-007-6/TC-013-4의 "Tab으로 순회"는 "진입 후 방향키
순회"로 구현한다(발산: 근거는 위 APG 패턴, 접근성 하한 유지가 목적 — I6).
구간 목록 토글은 펼침 상태의 목록 앞, 접힘 상태의 56px 측면 레일 안에 유지하며
`aria-expanded`/접근 가능한 이름을 상태와 동기화한다. 토글로 DOM을 갱신한 뒤에도 같은 버튼으로
포커스를 복원한다.


## 반응형 전략

- **320 CSS px / 400% reflow**: 640px 이하에서 3분할 셸 → 세로 스택(캔버스 상단, 목록 아코디언,
  스트립 하단 고정) 1컬럼. 데스크톱의 56px 측면 레일은 가로 아코디언 헤더로 바뀌며 목록은
  기본 접힘 + 배지 카운트("132개 구간"), 캔버스 min-height 240px 유지.
- **200% 텍스트 확대**: 헤더 액션은 줄바꿈 허용(고정폭 금지), 목록 행 텍스트 wrap, 배지는 아이콘+
  텍스트 유지(잘림 금지).
- **태블릿**: 데스크톱과 동일 3분할 및 56px 측면 축소 레일을 유지, 터치 제스처(드래그 회전·핀치 줌·스트립 스와이프) 추가.
- ~~**데스크톱/태블릿 범례**~~: PC-018로 범례가 제거되어 이 정렬 계약은 대상이 없다. 이전 규칙: 패널 크기는
  주변 3분할 열 너비나 트리거의 위치를 재계산하지 않으며 개폐 전후 중앙 위치를 유지한다.
- **모바일(ASSUMPTION, 범위 밖 가능)**: 캔버스 전체화면 + 스트립은 하단 접이식 시트로 축소, 목록은
  전체화면 오버레이 토글. 구체 브레이크포인트·수치는 확정하지 않는다.


## FSD 컴포넌트 경로 (developer가 Phase 3에서 생성)

| Path | 역할 | Owner FEAT |
|---|---|---|
| `src/app/routes/Routes.tsx` | 라우팅(위 코드 블록) | — |
| `src/pages/track-viewer/ui/TrackViewerPage.tsx` | 6개 화면 상태 분기 컨테이너 | — |
| `src/pages/track-viewer/ui/InputScreen.tsx` | 입력 대기 카드 | FEAT-001 |
| `src/pages/track-viewer/ui/ErrorScreen.tsx` | 완전 실패 카드(원인별 문구+재시도) | FEAT-001/002/003 |
| `src/pages/not-found/ui/NotFoundPage.tsx` | 404 | — |
| `src/widgets/app-header/ui/AppHeader.tsx` | 헤더(다른 트랙 보기, 출처 링크) | FEAT-001 |
| `src/widgets/track-canvas/ui/TrackCanvas.tsx` | 3D 씬·오빗·추종 시점·레인체인지·미지원 플레이스홀더 | FEAT-006/007/008/009/011 |
| `src/widgets/profile-strip/ui/ProfileStrip.tsx` | 하단 스트립(스크럽 owner) | FEAT-012 |
| `src/widgets/section-list/ui/SectionList.tsx` | 텍스트 구간 목록(WebGL 대체 겸용) | FEAT-013/014 |

목록·캔버스·스트립을 `widgets`에 둔 것은 cross-cutting 주입 슬롯이 아니라 단일 페이지 내 대형
FEAT 조합 단위이므로 environment-scaffolder에 별도 FSD 경계 요구는 없다(표준 계층 그대로).
