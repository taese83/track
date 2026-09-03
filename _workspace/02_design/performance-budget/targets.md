# Performance Budget — 목표·등급

## 1. Core Metrics (측정 가능한 목표)

| 지표 | 대상/전제 | 목표 | 측정 방법 | 근거 |
|---|---|---|---|---|
| 초기 렌더 시간 | 참조 트랙(WS67Y2, 132피스), 데스크톱 최신 Chrome, 유선망 | 3초 이내 | `fetch 완료 시각` → `씬 첫 프레임 onAfterRender` 콜백까지 `performance.now()` 델타. `window.__perfStats.initialRenderMs`로 노출, Playwright `waitForFunction`으로 캡처 | REQ-NFR-001, TC-006-4 |
| 오빗 조작 fps | 회전/줌 드래그 중 5초 창 | 30fps 이상 | `requestAnimationFrame` 델타 1초 롤링 평균, `window.__perfStats.orbitFps` 노출 | REQ-NFR-001, TC-006-4 |
| 플라이스루 fps | 트랙 추종 재생 전 구간 | 30fps 이상 | 동일 훅, 재생 시작~종료 평균. 오빗과 별개 필드 `flythroughFps` | ASSUMPTION — REQ-NFR-001 원문은 오빗만 명시, 플라이스루도 동일 상호작용이므로 동일 기준을 유추 적용 |
| Long Task | 데스크톱 Chrome, 초기 렌더~10초 | 100ms 초과 task 0건 목표 | `PerformanceObserver({type:'longtask'})`, 개수/최대 길이를 `evidence/browser.json`에 기록 | ASSUMPTION — web.dev 일반 baseline, 이 앱 실측 아님 |
| CLS (UI 크롬만) | 입력창·배지·프로파일 스트립 레이아웃 | 0.1 이하 | `web-vitals` 라이브러리 또는 `PerformanceObserver({type:'layout-shift'})` | ASSUMPTION — web.dev baseline. 캔버스 내부 렌더는 DOM 레이아웃 시프트 대상이 아니므로 제외 |
| LCP / INP | — | — | — | **NOT_MEASURED.** 단일 3D 캔버스 화면은 LCP 후보 element가 부적절하고 RUM 미도입(하니스 범위 밖). 도입 시 `web-vitals`의 `onLCP/onINP`를 실제 서비스 엔드포인트로 전송하는 RUM 계층 추가 필요 |

대상 기기·네트워크: 데스크톱 우선(REQ-NFR-002), 태블릿은 뷰포트/제스처 최소 동작만 확인하고
fps 목표를 적용하지 않는다. 모바일은 범위 밖(ASSUMPTION).

**추종 재생 중 프레임 예산**(PC-014, TC-012-6): 스트립 인디케이터의 연속 진행축은 렌더 루프에
**프레임당 DOM 쓰기 1건**(인디케이터 노드 transform)만 얹는다. React 재렌더 0건, 스트립 곡선·132개
경간선 재계산 0건이 상한이다 — 이 상한을 넘기는 구현(공유 커서 승격, 구독자 확대, 매 프레임
setState)은 위 `flythroughFps` 30fps 목표를 직접 위협한다. **회귀 판정**: 연속축 도입 전후를
같은 트랙·같은 속도로 대조해 30fps 하한 유지를 증거로 남긴다. **측정 경로 주의**: §1이 명시한
`window.__perfStats.flythroughFps`는 아직 구현돼 있지 않다(`perf-stats.ts`에는 `orbitFps`뿐이며
플라이스루 fps는 그때까지 NOT_MEASURED다). 그래서 이 회귀 대조는 재생 중 브라우저에서 직접
`requestAnimationFrame` 간격을 3초 표집해 잰다 — 훅이 생기면 그 필드로 갈아탄다.


**현재 구간 하이라이트의 프레임 예산**(PC-015, TC-019-7): 하이라이트 지오메트리는 `currentIndex`·
`layout`이 바뀔 때만 재생성한다 — **렌더 루프(`useFrame`) 안 재생성 0건**이 상한이다. 씬에 더해지는
draw call은 **면 1 + 밝은 띠 1 + 어두운 띠 1 = 3건**이며(구간 하나분이라 정점 수는 전체 면의 1/132 규모), 이전
지오메트리는 교체 시 `dispose()`한다. 하이라이트는 추종 중 렌더하지 않으므로 `flythroughFps`에
얹히지 않는다. **회귀 판정**: 커서를 연속으로 옮기며 오빗 조작 중 `orbitFps` 30fps 하한 유지를
증거로 남긴다. 카메라 타깃 이동(대상이 화면 밖일 때)은 이징 중에만 프레임을 쓰고 도달 후 멈춘다.

## 2. 피스 수 등급별 목표·완화 — 경계 구간 모순의 해소 (정본 결정)

| 등급 | 피스 수 | 렌더 시간 | fps | 완화 배지 |
|---|---|---|---|---|
| 참조 | 132 (WS67Y2) | 3초 이내 | 30fps+ | 미노출 (TC-011-3) |
| **경계 구간** | 132~300 | 3초 이내 | 30fps+ | **미노출 — 이 문서에서 강제 고정** |
| 대형 | 300+ | 예산 없음(완화 전제) | 대조군 대비 개선(§5) | 노출 필수 (TC-011-1) |

**모순과 결정**: requirements.md REQ-F-012는 "132~300은 완화가 조기 발동하지 않고 정상
렌더됨을 별도로 확인한다"고 명시하는 반면, feature-plan.md TC-011-4는 이 구간을 "구현체
재량"으로 풀어 배지 유무를 결함으로 보지 않는다고 적었다 — 두 문서가 정면으로 충돌한다.

**이 문서는 REQ-F-012 쪽으로 정한다.** 근거:
1. REQ-F-012는 Must 요구사항 원문이며 검증 문구("정상 렌더됨을 별도로 확인한다")를 명시적으로
   포함한다. TC-011-4는 그 요구사항에서 파생된 하위 산출물의 해석일 뿐 원문을 무를 권한이 없다.
2. "구현체 재량"으로 두면 performance-verifier가 경계 구간에서 어떤 관측 결과를 봐도 FAIL을
   선언할 수 없다 — 게이트가 공허해진다(판단 게이트 I2: 통과율을 위해 검증을 약화하지 않는다).
3. 세그먼트 분할 수가 실제 성능 레버이고 피스 수는 근사 프록시다(§0 전제). 경계 구간에서 배지가
   "때에 따라" 뜨는 비결정적 UX는 REQ-F-013(정직성 배지) 계약의 신뢰도를 스스로 갉아먹는다.

**메커니즘 결정**: 완화 트리거는 fps 저하가 아니라 **피스 수 게이트**다 — 완화 상태 머신
자체가 300피스 미만에서는 평가되지 않는다(호출되지 않음). 132~300에서 실측 fps가 30 밑으로
떨어지더라도 배지를 임의로 억제하는 것이 아니라,애초에 그 구간에서는 전체 화질로 렌더해야
한다는 요구다. 만약 실측 결과 경계 구간에서 실제로 30fps를 유지하지 못하면, 이는 런타임
결함이 아니라 **ASSUMPTION-006(임계값 300)이 틀렸다는 신호**로 취급하고 임계값을 재조정한다
(requirements.md ASSUMPTION-006 "실사용자 트랙 샘플 수집 후 재조정" 조항을 그대로 원용).
feature-plan.md TC-011-4는 이 판정과 모순되므로 다음 라운드에서 requirements-analyst/
feature-planner 쪽 정정이 필요하다(NEEDS_DECISION, 소유 이관) — 그러나 **performance-verifier는
이 문서의 규칙(경계 구간 배지 노출 시 FAIL)을 적용한다.**

