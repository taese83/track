# API Schema — mini4wd-track-3d

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| 공통 봉투·에러·캐시·단위 | `common-envelope.md` | 에러 코드 7종(fixture 전용 1종 포함), 캐시 헤더 계약, 절대 단위 금지 | 전체 |
| /api/track | `track-endpoint.md` | 입력 검증·allowlist, 외부 호출 계약, 응답 스키마 | developer, api-contract-verifier, security-reviewer |
| fixture·구현 계획 | `fixtures.md` | fixture 7종, Phase 3 생성 대상 | test-executor, developer |

## 전역 결정

