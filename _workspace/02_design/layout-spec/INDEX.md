# Layout Spec — mini4wd-track-3d

> 단일 라우트 `/`, 화면 상태 6종으로 분기한다. 핵심 문제는 132피스 트랙을 캔버스 하나로 못 보는 것 — **전체 조망(스트립·목록)과 구간 확대(캔버스)가 "현재 구간" 상태 하나를 공유**하도록 3분할 셸로 푼다.

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| 글로벌 셸·라우팅 | `global-shell.md` | 단일 라우트 상태 전이, 3분할 셸, 안정성 규칙 | component-designer, developer, design-preview-builder |
| 상태별 레이아웃 | `states.md` | 6개 상태 각각의 배치, 스트립 리사이즈 | component-designer, design-preview-builder |
| 시맨틱·포커스·반응형·경로 | `a11y-responsive.md` | 랜드마크, 키보드 계약, reflow, 컴포넌트 경로 | component-designer, developer, browser-verifier |

## 전역 결정

