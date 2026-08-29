# Plan Review — Phase 1 준비도 리뷰 (read-only)

`plan-reviewer` 반환 (2026-08-28, Phase 1 Wave 6).

> **출처 표기(I1)**: 이 스폰은 foreground로 실행돼 transcript 파일이 비어 있어(0 bytes)
> 기계 추출이 불가능했다. 아래는 오케스트레이터가 반환 텍스트를 **전사**한 것이다.
> `execution-budget-contract.md`는 전사 대신 기계 추출을 권한다 — 이 문서는 그 하한을
> 충족하지 못한다. 판정·심각도·지적 내용은 원문 그대로이며 축약하지 않았다.

## Result

**STATUS: NEEDS_DECISION**

Phase 2가 새 제품 결정을 발명하지 않고 시작할 수 없다. 디자인은 대체로 소비 가능하지만
(정보 위계 표·디자인 방향 절 존재), (a) 화면에 표시될 대표 수치의 진실성 규칙이 비어 있고
(b) feature-plan에 Page Groups·Feature List 표준 표·Traceability가 아예 없어 다듬기 라운드와
owner 추적이 불가능하며 (c) D-013이 만든 신규 구현 요구가 정본 문서(feature-plan/requirements/
tech-stack)에 write-back되지 않았다. BLOCKED은 아니다 — BLOCKER-001은 배포 단계만 막고,
FEAT-001~004/009 슬라이스는 안전하게 착수 가능하다.

## Findings — 21건 (HIGH 8 / MEDIUM 11 / LOW 2)

| # | 심각도 | 위치 | 지적 |
|---|---|---|---|
| 1 | HIGH | project-brief §3 / requirements REQ-NFR-001·REQ-F-016 / ux-brief UX Check | **190.84m를 실측 미터로 제시**하는데, 검증된 것은 "132피스 `l` 합 = 편집기 `track_length`"라는 **자기참조 일치**뿐이다. D-005가 "타미야 JCJC 스트레이트는 1.62m가 아니다"로 미터 해석 자체를 열어놨다. 1.62m가 3레인 합이면 실제 길이는 약 1/3이다. 이 서비스가 화면에 내보내는 가장 큰 숫자에 근거 등급이 없다 |
| 2 | HIGH | project-brief §3 (`c`는 상승/하강 전용 `[confirmed]`) | **inferred를 confirmed로 승급**했다. 카탈로그 `colors`는 Str1 7색·Bri1 4색·Ban1 4색이고, 참조 트랙에 `Str1 c=5`가 1개 있다. 색이 상승/하강 전용이면 Bri1/Ban1은 2색이어야 하고 직선에 색이 붙을 이유가 없다. 5/5·2/2 대칭은 "팔레트 인덱스"와도 무모순이다. `c=5` 직선 처리 정책·TC도 없다 |
| 3 | HIGH | feature-plan FEAT-002 / requirements 전체 | **compat 플래그가 정본에 없다.** project-brief와 Dev 체크리스트에는 있는데 FEAT-002 본문·TC-002-1~3·REQ-F-005/011 어디에도 없다. **WS67Y2는 compat=false**라 유일 fixture로는 이 경로가 영원히 실행되지 않는다 — 조용히 틀린 형상을 내는 정확한 시나리오 |
| 4 | HIGH | tech-stack (serverless·환경·NEEDS_DECISION 1·3) | **tech-stack이 D-013 이전 상태 그대로다.** "headless 브라우저 fallback", "스파이크로 검증"이 살아 있고 ND #1·#3도 그대로다. 실제 취득 계약(`GET /load/{CODE}.js` + `X-Requested-With`)이 한 줄도 없다. Phase 3가 읽는 문서가 폐기된 지시를 준다 |
| 5 | HIGH | feature-plan FEAT-004 / `ElevatedSegment` | **고도 폐합(Z closure)을 아무도 검증하지 않는다.** FEAT-004는 XY 폐곡선만 본다. 상승/하강 불균형 트랙은 START에서 수직 불연속이 생기는데 상태·경고·TC가 없다. `ElevatedSegment`에 **절대 고도 필드가 없어** 누적 고도를 표현할 타입 자체가 없다 — ux-brief가 Primary로 삼은 프로파일 스트립도 이 필드 없이는 못 만든다 |
| 6 | HIGH | feature-plan FEAT-003 / TC-003-1 | **START(Str2) 부재·복수 케이스 미정의.** 순서 복원 전체가 "Str2에서 시작"을 전제하는데 편집기는 미완성 트랙도 저장한다. Str2 0개/2개 이상의 동작·문구·TC가 없다. WS67Y2가 Str2 정확히 1개라서 안 보인 과적합 |
| 7 | HIGH | 전 문서 | **데이터 전략 미선언.** `mock/dev-read-only/real-read-only/production-integration-later` 중 무엇도 없고 Mock→real 전환 조건도 없다. TC 44개 중 최소 8개가 fixture 없이 실행 불가인데 fixture owner·생성 방법·격리 규칙이 없다 |
| 8 | HIGH | feature-plan 전체 | **Page Groups 표·Feature List 표준 표(Scope 열 포함)·REQ→FEAT→TC Traceability 표가 모두 없다.** 다듬기 라운드 수행 수단 자체가 없다. 동시에 REQ-F-014/015/016(Should)에 대응 FEAT가 없어 고아 REQ가 발생했는데 감사되지 않는다 |
| 9 | MEDIUM | requirements ASSUMPTION-004 | **검증 방법이 원리적으로 판별 불가.** "5/5 대칭으로 역추정"은 swap에 불변이라 상승 방향을 결정할 수 없다. D-003의 "도면 대조"와도 방법이 어긋난다. "역추정 후 하드코딩"은 WS67Y2 과적합 |
| 10 | MEDIUM | ux-brief KUD1 vs ND1 / FEAT-007 | **미결이면서 동시에 확정됐다.** ND1은 "스크럽 vs 자동재생 기본값" 미결인데 같은 문서와 TC-007-2/3은 "기본은 스크럽"으로 단정한다 |
| 11 | MEDIUM | ux-brief KUD2·Accessibility / TC-007-2·007-6·008-3·010-4 | **소유자 없는 UI 표면 2개가 Must TC에 박혔다.** "하단 프로파일 스트립"과 "텍스트 구간 목록"은 REQ도 FEAT도 없는데 Must TC의 조작 수단이다. 노력도 `L` 추정이 이 둘을 포함하지 않는다 |
| 12 | MEDIUM | REQ-F-019(b) / TC-001-6 vs tech-stack 캐시 | **계약은 결정적, 메커니즘은 best-effort.** "재fetch하지 않는다"를 단언하지만 수단은 CDN `s-maxage`(리전별·TTL 만료 시 miss)이고 TTL은 미정. 이 계약이 BLOCKER-001을 완화하는 바로 그 장치다 |
| 13 | MEDIUM | ux-brief 정보위계(로딩) | ASSUMPTION-007이 미정인데 "5초 초과 시"로 값을 확정했다 |
| 14 | MEDIUM | project-brief §6 B-001 행 | **B-001이 막는 FEAT에서 FEAT-007이 빠졌다.** TC-007-4는 카메라 피치를 `h'(x)`에서 파생시키므로 L 미확정이면 피치도 잠정치 |
| 15 | MEDIUM | requirements Should REQ-F-019 vs project-brief §2 | 우선순위 모순 — Should인데 "실질 Must급". **BLOCKER-001 완화 수단이 defer 가능 등급**에 있어, 다듬기에서 cut되면 윤리 가드가 조용히 사라진다 |
| 16 | MEDIUM | REQ-NFR-004 / ux-brief 상태 인벤토리 | **WebGL 미지원 경로 무커버.** "안내 메시지로 대체"라고만 쓰고 상태 5종에 없으며 FEAT·TC 0개. 3D 앱에서 가장 흔한 완전 실패 |
| 17 | MEDIUM | decision-log A-00x vs requirements ASSUMPTION-00x | **ID 이중 체계 충돌.** A-001=외부 접근, ASSUMPTION-001=슬로프 낙차로 같은 꼴 ID가 다른 대상을 가리킨다. project-brief 표가 두 체계를 매핑 없이 섞어 쓴다 |
| 18 | MEDIUM | decision-log 전체 | append-only는 준수됐으나 형식이 계약의 `PC-NNN`·트리거·대상 ID·영향 산출물이 아니라 서술형 `D-NNN`이고, **D-013의 write-back 3종이 실행되지 않았다**(#3·#4가 그 증거). "N-002" 엔트리는 D 번호조차 없다 |
| 19 | MEDIUM | BLOCKER-001 / tech-stack | **blocker 경계가 비운영적.** "로컬/소규모 사용"의 정의가 없는데 tech-stack은 Vercel 배포(공개 URL 기본)를 전제한다. 정상 경로를 따라가면 아무도 의식하지 않고 공개 배포에 도달한다 |
| 20 | LOW | TC-011-1~3 / ASSUMPTION-006 | 임계값 불일치 — 300피스 vs "132피스 이하"로 **132~300 구간 미정의**. TC-011-2는 대조군 정의가 없어 관찰 절차가 성립 안 함 |
| 21 | LOW | REQ-F-001/002 검증 / TC-006-1 | MVP 1순위 성공 조건이 "육안 대조"뿐이고 **허용 오차·판정 규칙이 없다.** 씬그래프 수치 검증을 택했는데 "도면 일치"에 대응하는 수치 어서션이 없다 |

## 긍정 확인 (공정성)

실패 경로 커버리지는 전반적으로 구체적이다 — 잘못된 URL·없는 코드·지연·fetch 실패·파싱 실패·
비폐곡선·미지원 피스·대형 트랙이 각각 별개 TC를 가진다. MVP 4종은 FEAT-006/005/007/008에
1:1 대응하고 **요청에 없는 기능이 유입된 흔적은 없다**. 정보 위계의 Primary는 어느 화면도
3개를 넘지 않는다. NON_GOALS 5종이 명시적이다.

## 우선 결정 3개

**1. 스케일·단위 진실성 규칙 확정 (B-001 + #1/#2)**
(a) 실물 스트레이트 1개를 실측해 `l`=1.62m의 정체를 확정하거나, (b) 확정 전까지 **화면에서
"m" 절대 단위 표기를 금지**하고 총 길이·피스 수·낙차 전부에 등급 배지를 강제한다.
지금 상태로 Phase 2에 넘기면 디자인이 "190.84m"를 헤드라인으로 배치하고, 그것이 이 제품이
막겠다고 선언한 바로 그 오해다. `c` 색 의미를 `confirmed`→`inferred`로 강등할지도 함께 결정.

**2. 범위를 다시 자를지 결정 (D-006이 미룬 split 재권고)**
근거가 쌓였다 — 노력도 `L`, B-001이 FEAT-005/006/010(+007)을 잠정치로 묶음, 소유자 없는
UI 표면 2개가 Must TC에 편입, compat·Z폐합·Str2 부재로 TC가 더 늘어남.
(a) 4종 유지 + 추가 TC 수용, (b) 1차를 FEAT-001~006 + 009/010으로 자르고 007·008을 2차로.
어느 쪽이든 feature-plan에 표준 표 3종을 먼저 만들어야 다듬기가 성립한다.

**3. D-013 write-back + 데이터 전략을 한 세트로 확정**
① FEAT-002에 compat 계약 + TC 추가, **compat=true인 오래된 트랙 코드 1건을 fixture로 확보**할지
(WS67Y2로는 검증 불가) ② tech-stack을 `/load/{CODE}.js` 기준으로 현재화하고 ND #1·#3 폐기
③ 데이터 전략을 `dev-read-only`로 선언할지 명시하고 fixture 6종(정상·비폐곡선·Str2 부재·
미지원 피스·대형·파싱 실패)의 owner와 전환 조건 고정.

**FINDINGS: 21**

## 리뷰어 자기 보고

검토 파일: `_workspace/01_plan/*.md` 7종 + `_workspace/00_source/track-editor-data-model.md`.
판정 기준: `web-plan/references/{planning-readiness-contract,design-readiness-contract,plan-history-contract}.md`.
`scenario-contract.md`는 web-plan/references에 없어 해당 항목 미적용(실제로는
`web-orchestrator/references/`에 있다 — 리뷰어가 못 찾은 것이며, 이 항목은 미검증으로 남는다).
파일은 수정하지 않았다.

## 완결성 마커 (에이전트 재개 요청으로 직접 수령, 2026-08-28)

오케스트레이터의 최초 프롬프트가 판정 계열 필수 마커를 요구하지 않아 1차 반환에 빠졌다.
게이트가 FAIL했고, **오케스트레이터가 대신 써 넣지 않고** 에이전트를 재개해 직접 받았다.

```
SPAWN_RESULT: complete
FINDINGS: 21
```

SELF_CHECK 요지 — 직접 확인: FEAT 11·TC 44 집계와 MVP 4종 1:1 대응, 참조 트랙 구성과
`l` 합의 자기참조성, WS67Y2 `compat=false`이며 FEAT-002에 compat 언급 0건, tech-stack에
`/load/{CODE}.js`·`X-Requested-With` 부재 및 ND #1/#3 생존, decision-log append-only 준수.

**확인하지 못한 것(리뷰어 자기 신고)**:
- `scenario-contract.md`를 `web-plan/references/`에서 찾지 못해 시나리오 카테고리 대조를
  **미적용**으로 남겼다. 세 문서가 공통으로 누락한 축이 있으면 이 리뷰는 잡지 못한다.
  (실제 위치는 `web-orchestrator/references/`다 — 리뷰어가 잘못된 경로만 찾았다.)
- `00_source/piece-dimensions.md`를 읽지 않아 낙차 11cm·뱅크 20°의 1차 출처는 미검증이며
  D-005 서술을 신뢰한 판단이다.
- npm 실제 버전은 검증 범위 밖이다. (오케스트레이터가 별도로 8종 중 7종을 registry와
  대조해 일치 확인했고, TypeScript만 최신 7.0.2 대신 6.0.2를 의도적으로 고른 것을 확인했다.)
