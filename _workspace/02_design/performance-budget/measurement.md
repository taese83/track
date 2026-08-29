# Performance Budget — 예산·측정

## 5. 번들 예산

단일 라우트(`/`) SPA이므로 route별 표는 1행으로 충분하다(규모상 과도한 예산 체계 불필요).

| 대상 | 상한(gzip) | 근거 |
|---|---|---|
| `/` 진입 시 초기 JS 합계 (three+R3F+drei+앱코드+Tailwind 런타임) | 400KB | ASSUMPTION — three.js(~150KB)+R3F/drei(~60~80KB)+앱코드/Tailwind(~50KB) 합산 추정, 실측 아님 |
| three+R3F+drei 공유 vendor chunk | 280KB | ASSUMPTION — 위 합산의 하위 구성 요소 추정 |
| CSS (Tailwind 유틸리티, purge 후) | 30KB | ASSUMPTION |

**초과 시 대응**: 기계적으로 나머지 코드를 lazy-split하지 않는다. `evidence/build.json`
번들 분석에서 초과 사실이 **측정으로 확인된 경우에만** 초과 원인 모듈을 특정해 분할한다
(예: drei 헬퍼 중 미사용 서브모듈 tree-shake 실패 확인 시 개별 import로 전환). 이 앱은 단일
라우트라 route 단위 code-splitting 자체가 무의미하다 — three.js/R3F는 첫 화면부터 필요하므로
지연 로딩 대상이 아니다.


## 6. Asset Policy

- 이미지: 이 서비스는 사진/일러스트 자산이 없다(3D는 프로시저럴 지오메트리, 데이터 기반).
  아이콘은 SVG(인라인 또는 lucide 계열) 사용, 래스터 포맷 상한을 정의할 필요 없음.
- 폰트: 커스텀 웹폰트 미사용, 시스템 폰트 스택(Tailwind 기본값) — FOIT/FOUT 정책 자체가
  해당 없음(ASSUMPTION, 커스텀 폰트 도입 시 재정의 필요).
- 3rd-party script: 현재 0건(분석/광고 스크립트 없음). 향후 추가 시 이 문서에 예산 행을 신설한다.


## 7. Runtime Budget

- Long task: §1 참조(중복 정의 없음).
- 메모리: 이 서비스는 timeseries-architecture 문서가 없다(TIMESERIES_MODE=false, 실시간 스트림
  아님). 대신 플라이스루 반복 재생 시 지오메트리 disposal 누락으로 인한 힙 성장을 감시한다 —
  10분 반복 재생 전/후 `performance.memory.usedJSHeapSize` 비교, 20% 이상 성장 시 누수 의심
  (ASSUMPTION 임계치, `evidence/browser.json`에 기록되는 경우에 한해 측정).
- 인터랙션 응답: 오빗 드래그 입력→화면 반영 지연 1프레임 이내(§1 fps 목표에 종속, 별도 지표
  아님).


## 8. Measurement Matrix

| 지표 | Evidence Source | 비고 |
|---|---|---|
| 초기 렌더 시간, orbitFps, flythroughFps | `evidence/browser.json` (`window.__perfStats` 훅 수집 시) | 수집 안 되면 NOT_MEASURED — 훅 구현은 FEAT-006/007 소관 |
| Long task 개수/최대 길이 | `evidence/browser.json` | `PerformanceObserver` 등록 필요, 미등록 시 NOT_MEASURED |
| 힙 성장률 | `evidence/browser.json` | Chrome 전용 API, 다른 브라우저는 NOT_MEASURED |
| CLS | `evidence/browser.json` (web-vitals 도입 시) | 미도입 시 NOT_MEASURED, 도입 가이드: §1 참조 |
| LCP/INP | — | NOT_MEASURED (RUM 미도입, §1 참조) |
| 번들 크기(초기 JS/CSS, vendor chunk) | `evidence/build.json` | `vite build` 산출물 stats |
| 경계 구간 배지 미노출 (§2) | 사용자 실행 명령: 200피스 fixture로 Playwright에서 `[data-testid=mitigation-badge]` 부재 어서션 | TC-011-4 대체, 이 문서 §2 규칙 적용 |
| 완화 개선(대조군, §4) | 사용자 실행 명령: `?perfDebug=raw` 유/무 두 실행의 `flythroughFps` 비교 | TC-011-2 |


## SELF_CHECK 참고

경계 구간 모순은 REQ-F-012(정상 렌더 확정) 쪽으로 닫았다 — feature-plan.md TC-011-4의
"구현체 재량"은 Must 요구의 검증 문구를 무력화해 게이트를 공허하게 만들기 때문이다. 각 목표는
`window.__perfStats` 커스텀 훅 + PerformanceObserver + Playwright 캡처로 측정하며, 측정 불가
항목(LCP/INP)은 NOT_MEASURED로 명시했다.

