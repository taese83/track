# Design System — Theme setup·컴포넌트 인벤토리

## 7. Theme setup (developer가 Phase 3에 `src/app/style.css`로 생성 — 이 문서가 정본)

```css
/* UI_LANE: tailwind-shadcn → src/app/style.css */
@import "tailwindcss";

@theme {
  --font-sans: system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --spacing: 0.25rem;                 /* 4px 격자 */
  --radius-sm: 4px; --radius-md: 6px; --radius-full: 9999px;

  /* neutral (다크 기본) */
  --color-bg-canvas: #101214;         /* 3D 씬 clearColor */
  --color-bg-surface: #1A1D21;
  --color-bg-raised: #24282D;
  --color-border: #3A4048;
  --color-text-primary: #E7E9EC;
  --color-text-secondary: #A8AEB8;
  --color-text-disabled: #6A7078;

  /* action */
  --color-primary: #A78BFA; --color-primary-hover: #B9A3FC;
  --color-on-primary: #15171A;

  /* 상승/하강 — 원본 편집기 실측색(§1). *-fg는 다크 배경 전경 전용 */
  --color-rise: #AD0A09;  --color-rise-fg: #FF8D85;
  --color-fall: #004E8F;  --color-fall-fg: #7CB9EF;
  --color-fail-segment: #5C636C;      /* 비폐곡선 실패 구간, 점선과 병용 */

  /* semantic */
  --color-error: #F87171;  --color-warning: #FBBF24;
  --color-success: #4ADE80; --color-info: #60A5FA;

  /* 근거 등급 배지 (REQ-F-013) */
  --color-badge-measured: #7EE2A8; --color-badge-confirmed: #C9CED6;
  --color-badge-inferred: #F5C15C; --color-badge-unknown: #9AA1AA; /* 보더 dashed */

  /* motion — 인터랙션 전환 전용. 카메라·루프 애니메이션에 사용 금지(§4) */
  --duration-fast: 120ms; --duration-base: 200ms;
}

.light {
  --color-bg-canvas: #F5F6F8; --color-bg-surface: #FFFFFF; --color-bg-raised: #FFFFFF;
  --color-border: #C4C9D0; --color-text-primary: #1A1D21; --color-text-secondary: #555C66;
  --color-primary: #6D4AE0; --color-on-primary: #FFFFFF;
  --color-rise-fg: #AD0A09; --color-fall-fg: #004E8F;   /* 원본색 직접 사용, §1 대비 근거 */
  --color-error: #DC2626; --color-warning: #D97706;
  --color-success: #16A34A; --color-info: #2563EB;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; }
  /* + 자동재생 자동 진입 금지, 카메라 전환 즉시 컷 — §4 계약, JS에서 준수 */
}
```


## 8. Component inventory (semantic slot)

| Component | Location | 토큰 소비 |
|---|---|---|
| TopBar("다른 트랙 보기" 고정) | shared/ui/top-bar | surface, border, primary |
| UrlInputForm | features/load-track | surface, error, focus ring |
| StatusBanner(부분 실패·완화·WebGL) | shared/ui/status-banner | semantic 4종 subtle-bg+solid |
| EvidenceBadge(4등급) | shared/ui/evidence-badge | badge 4토큰 + caption 타입 |
| ProfileStrip | widgets/profile-strip | rise/fall(채움), rise-fg/fall-fg(선), fail-segment, primary(현재 마커) |
| SectionListTable | widgets/section-list | data 타입, tabular-nums, rise-fg/fall-fg |
| ControlCluster(시점·재생·"탐색 속도") | widgets/view-controls | surface .88 오버레이, duration-fast |
| Legend(범례) | shared/ui/legend | rise-fg/fall-fg + 아이콘 세트 |


