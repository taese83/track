# Performance Budget — mini4wd-track-3d

> 3D 캔버스가 이 서비스의 핵심 화면이다(단일 라우트 SPA, PAGE-001). 표준 Core Web Vitals보다 **렌더 완료 시간·상호작용 fps**가 1차 지표이며, 픽셀 스크린샷 비교는 tech-stack의 결정대로 채택하지 않는다(GPU/드라이버 불안정). 측정 방법이 없는 목표는 이 문서에 쓰지 않는다.

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| 목표·등급 | `targets.md` | Core metrics, 피스 수 등급별 목표(경계 구간 정본 결정) | performance-verifier, developer |
| 완화·대조군 | `mitigation.md` | 완화 수단과 대가, 대조군 스위치 | developer, performance-verifier |
| 예산·측정 | `measurement.md` | 번들·asset·runtime 예산, 측정 매트릭스 | performance-verifier, environment-scaffolder |

## 전역 결정

