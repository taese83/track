# Layout Spec — 글로벌 셸·라우팅

## 라우팅 맵

| Path | Component | Description | status |
|---|---|---|---|
| `/` | `TrackViewerPage` | 6개 화면 상태를 내부 state machine으로 분기(라우트 분리 안 함) | 200 |
| `*` (catch-all) | `NotFoundPage` | 정의 밖 경로 | 404, `<meta name="robots" content="noindex">` |

계정이 없으므로 403은 발생하지 않는다(N/A). 라우팅 코드는 90줄 미만이라 본문에 직접 둔다:

```tsx
// src/app/routes/Routes.tsx
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { TrackViewerPage } from "@/pages/track-viewer";
import { NotFoundPage } from "@/pages/not-found";

const router = createBrowserRouter([
  { path: "/", element: <TrackViewerPage /> },
  { path: "*", element: <NotFoundPage /> }, // 404 — 목록에 없는 표현이라도 안전망 필수(I6)
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

화면 상태 전이: `입력` →(제출)→ `로딩` →(성공)→ `3D 표시` │→(비폐곡선)→ `부분 실패`
│→(fetch/파싱/순서복원 실패)→ `완전 실패`(→재시도→`로딩`). `WebGL 미지원`은 마운트 시 즉시 감지되는
게이트로, 위 전이와 독립적으로 `로딩` 진입 이전에 분기해 `3D 표시`/`부분 실패`를 대체한다(FEAT-014).


## Global shell (모든 상태 공통 뼈대)

```
┌─ header (56px, landmark: banner) ──────────────────────────────────┐
│ [서비스명 h1]                    [다른 트랙 보기]  [원본 편집기 ↗]   │
├─ alert slot (40px, 항상 예약·항상 렌더, role="status") ─────────────┤
├─ 텍스트 구간 목록 (320px, region) ─┬─ 캔버스/상태 콘텐츠 (flex-1) ───┤
│ h2 "구간 목록"                    │  (3D 캔버스 | 스피너 | 폼 | 에러) │
│ listbox, 1 tab stop + ↑↓ roving   │                                 │
├───────────────────────────────────┴─────────────────────────────────┤
│ 하단 프로파일 스트립 (140px, 항상 예약, region "고도 프로파일 탐색") │
└──────────────────────────────────────────────────────────────────────┘
```

- 컨테이너 max-width 없음(fluid, 데이터형 화면 — spacing-layout 원칙 §레이아웃 그리드).
  12컬럼 기준 목록:캔버스 ≈ 3:9, gutter 24px(데스크톱).
- header는 화면 최상단 가장자리 = Fitts's Law "무한 크기" 타깃 위치이므로 "다른 트랙 보기"를
  여기 고정(hierarchy-actions 원칙 §Fitts's Law).
- **cross-cutting 슬롯 불필요**: header 액션(다른 트랙 보기·출처 링크)은 로그인/알림처럼 feature
  계층 상태에 의존하지 않는 정적 액션이라 app/pages 계층이 직접 소유한다. widgets 레이어 추가
  요구 없음.


## Layout stability 규칙 (핵심 제약)

1. **alert(경고) 슬롯은 상태와 무관하게 항상 40px를 점유한다.** 부분 실패 배너가 뜨거나 사라져도
   높이는 고정 — 내용만 비거나 채워진다. `role="status" aria-live="polite"`(완전 실패는
   `role="alert" aria-live="assertive"`로 별도 처리, 아래 §상태별 참고).
2. **로딩→3D 표시 전환 시 셸 치수를 바꾸지 않는다.** 로딩 상태도 동일한 3분할 셸을 쓰고 목록·스트립
   자리에 스켈레톤(shimmer)을 같은 320px/140px로 채운다. 데이터 도착 시 스켈레톤이 실콘텐츠로
   교체될 뿐 재배치가 없다.
3. **근거 등급 배지는 조건부로 나타나지 않는다.** 표시되는 모든 수치 옆에 배지가 상시 렌더되며
   등급 4종(measured/confirmed/inferred/unknown) 모두 동일 min-width(예: 56px) 토큰을 쓴다 —
   등급이 바뀌어도 값 주변 레이아웃이 흔들리지 않는다(FEAT-010).
4. **입력/완전 실패 화면은 3분할 셸을 쓰지 않는다.** 트랙 데이터 자체가 없어 목록·스트립이
   의미가 없으므로 캔버스 영역 자리에 중앙 정렬 카드로 대체한다 — 이 전환은 상태 자체가 바뀌는
   내비게이션이라 §1의 "흔들림 금지" 대상이 아니다(로딩↔3D 표시 내부 전환만 대상).

