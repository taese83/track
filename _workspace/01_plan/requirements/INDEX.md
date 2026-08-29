# Requirements — mini4wd-track-3d

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| 기능 요구 | `functional.md` | REQ-F-001~024 (Must/Should/Could/Won't) | feature-planner, component-designer, developer |
| 비기능 요구 | `non-functional.md` | REQ-NFR-001~004 (성능·반응형·접근성·WebGL) | performance-budget-designer, design-system-architect |
| 데이터 전략·fixture | `data-strategy.md` | dev-read-only 선언, fixture 7종, API 목록 | api-schema-designer, test-executor, developer |
| 맥락·화면·ID 체계 | `context.md` | 모드 판정, ID 정본 규칙, 서비스 개요, 화면 목록 | 전체 |
| 미결 | `open-items.md` | ASSUMPTION·BLOCKER 전체 | 전체 |

## 전역 결정

- ID 정본은 이 산출물의 `ASSUMPTION-NNN`/`BLOCKER-NNN`이며, decision-log의 `A-00x`/`N-00x` 인용 시 출처를 병기한다(R3).
