# Tech Stack — mini4wd-track-3d

## Architecture Profile
CSR가 기본이다: 3D 렌더는 어차피 클라이언트 JS가 필요해 SSR로 얻을 이득이 없고 SEO 요구도 없다(단일 분석 화면, 공유 URL 자체를 검색 노출시킬 필요 없음). 다만 외부 편집기(mini4wd-track-editor.pimentoso.com)로의 직접 fetch가 CORS로 막히므로 **서버 사이드 프록시 function이 필수**다 — 이는 순수 `react-vite-spa`(정적)로는 충족 불가. 저장소/DB/계정은 결정대로 없음.

## Harness Profile
- WEB_PROFILE: `vite-serverless-hybrid` (오케스트레이터 확정값, 변경 없음) — 표준 2종(react-vite-spa / next-app-fullstack) 중 어느 것도 정확히 맞지 않는다. 가장 가까운 골격은 `react-vite-spa` + 루트 `api/`(Vercel Serverless Functions)이며, RSC/App Router/SSR은 쓰지 않으므로 `next-app-fullstack`은 채택하지 않는다.
- UI_LANE: `tailwind-shadcn` — 이 서비스는 밀도 높은 폼/테이블이 아니라 단일 화면 3D 뷰어이고, three.js+R3F+drei로 이미 번들 예산(REQ-NFR-001 초기 렌더 3초)을 상당히 소모한다. MUI+Emotion의 CSS-in-JS 런타임 비용을 얹기보다 런타임 비용이 거의 0인 Tailwind 유틸리티 CSS로 UI 크롬(입력창·범례·배지)을 가볍게 유지하는 쪽이 성능 요구에 부합한다.
- deployment provider: `vercel` (요구사항 REQ-F-005/019의 serverless function 전제)
- deployment target: `vercel-hybrid` (static SPA + `api/` Node Serverless Functions; Edge 런타임 아님 — 근거는 Architecture Decisions 참조)
- selected capabilities: `server-side-fetch-proxy`(FEAT-001), `cdn-response-cache`(REQ-F-019b), `no-auth`, `no-persistence`(결정: DB/계정 없음)
- support level: compatible (certified 2종 프로필 밖의 하이브리드 구성이므로 harness 자동검증 범위 밖일 수 있음)
- excluded scope / blocker: SSR/RSC/Edge Runtime 미사용. **BLOCKER-001 운영 정의**: '로컬/소규모 사용'과 '공개 배포'의 경계는 의도한 트래픽 규모가 아니라 **인증 없이 도달 가능한 URL의 존재 여부**로 판정한다 — 그런 URL이 하나라도 있으면 공개로 간주한다. Vercel은 프리뷰·프로덕션 배포 모두 추가 조치 없이 기본값으로 `*.vercel.app` 공개 URL을 발급하므로, 이 정의상 '로컬 사용'은 오직 `pnpm dev`(로컬호스트)뿐이다. **배포 전 확인 지점**: (a) 프로덕션 도메인 연결 또는 배포 URL을 제3자에게 공유하기 전, 대상 사이트(`mini4wd-track-editor.pimentoso.com`) 운영자에게 BLOCKER-001 사전고지 완료 여부를 확인한다. (b) 고지 완료 전까지는 Vercel Deployment Protection(Password Protection 또는 Vercel Authentication — 플랜별 제공 범위는 배포 시점에 Vercel 대시보드에서 재확인)을 프로덕션에도 적용해 '공개 URL'이 실제로 발생하지 않도록 기술적으로 강제한다. (c) 고지가 확인된 이후에만 보호를 해제한다. 재확인 없이 공개 배포 금지.

## Compatibility Matrix
| Component | Version | Engine/Peer Constraints | Primary Source | Decision |
|---|---|---|---|---|
| Node.js | 22.23.2 (22 LTS) | Vite 8 engines `^20.19 \|\| >=22.12` | nodejs.org 릴리스 노트 | 채택 |
| pnpm | 11.24.0 | — | registry.npmjs.org | 채택 |
| React / react-dom | 19.2.8 | R3F 9 peer `>=19 <19.3` | registry.npmjs.org | 채택 |
| TypeScript | 6.0.2 | TS7(7.0.2)은 Go 네이티브 신규 major, 생태계 fixture 미검증 | registry.npmjs.org + TS 6.0 공지 | TS6 고정, TS7 보류(CLAUDE.md 지침) |
| Vite | 8.2.2 | engines `^20.19 \|\| >=22.12` | registry.npmjs.org | 채택 |
| @vitejs/plugin-react | 6.1.1 | Vite 8 대응 | registry.npmjs.org | 채택 |
| three | 0.185.1 | **정정(2026-08-30 FEAT-006 실측)**: 타입 미내장 — `node_modules/three`에 `.d.ts` 0개, `package.json`에 `types` 필드 없음. `@types/three@0.185.4`를 devDependency로 둔다(drei의 `maath`·`stats-gl`가 이미 같은 버전을 끌어와 추가 설치 없음) | registry.npmjs.org + 설치본 실측 | 채택 |
| @react-three/fiber | 9.7.0 | peer `three>=0.156`, `react/react-dom >=19 <19.3` | registry.npmjs.org | 채택 |
| @react-three/drei | 10.7.8 | peer `@react-three/fiber ^9.0.0`, `three>=0.159`, `react ^19` | registry.npmjs.org | 채택 (구버전의 v9 peer 미지원 이슈는 이 버전에서 해소 확인) |
| Vitest | 4.1.11 | engines `^20 \|\| ^22 \|\| >=24` | registry.npmjs.org | 채택 |
| @playwright/test | 1.62.1 | — | registry.npmjs.org | 채택 |
| axios | (미채택) | — | — | 미채택, 근거는 Architecture Decisions |
| @tanstack/react-query, zustand, react-hook-form, zod | (미채택) | — | lib-catalog | 미채택, 근거는 Architecture Decisions |

## Architecture Decisions
| Decision | Requirement | Choice | Rejected Alternative | Trade-off |
|---|---|---|---|---|
| 3D 렌더러 | REQ-F-001/002/006, FEAT-005~008 | three.js + `@react-three/fiber`(선언적) + `@react-three/drei`(OrbitControls 등 헬퍼) | Babylon.js: 게임엔진급 기능(물리·오디오)이 과잉이고 성숙한 공식 React 바인딩이 없어 명령형 글루 코드가 늘어남 | R3F는 `ElevatedSegment[]` 배열(데이터 모델 4번 타입)을 컴포넌트 배열로 매핑하는 이 앱의 구조와 자연히 맞고, FEAT-009/010의 HTML 배지 오버레이도 같은 트리 안에서 동기화하기 쉽다. 대신 R3F 재조정 오버헤드가 붙는다 |
| React 통합 방식 | REQ-NFR-001(성능), FEAT-011 | 선언적(R3F 컴포넌트 트리) + 지오메트리 생성만 `useMemo` 내부에서 명령형(BufferGeometry 직접 생성) 하이브리드 | 완전 명령형(순수 three.js, R3F 미사용): 재조정 오버헤드는 없으나 132+피스의 조건부 표시(FEAT-009 플레이스홀더, FEAT-010 배지, FEAT-011 완화 배지)를 React 상태와 수동 동기화해야 해 버그 표면이 커짐 | 이건 실제로 갈리는 선택이었다 — "많은 수의 타입이 있는 조건부 3D 객체"라는 이 앱의 형태가 선언적 트리를 정당화한다 |
| 커브/경로 수학 | FEAT-005(h(x) S곡선/로그곡선), FEAT-006 형상 일치, FEAT-007 카메라 피치 | three.js 내장 `Curve` 서브클래싱 + `TubeGeometry`/`ExtrudeGeometry` + `Curve.computeFrenetFrames()` | 별도 curve/spline 라이브러리(예: 수작업 스플라인 피팅) | 이미 번들에 포함돼 추가 무게가 0이고, `getPoint(t)`를 커스텀 서브클래스로 오버라이드하면 확정된 h(x) 공식을 그대로 꽂을 수 있다. frenet frame이 `slopeAt(t)`(데이터 모델)와 카메라 피치 양쪽의 공급원이 된다 |
| 커브 적용 단위 | FEAT-004(비폐곡선 부분 실패), D-011/D-012(뱅크 진입부 꺾임 우려) | **피스 단위 로컬 프레임** — 132피스 전체를 하나의 연속 Curve로 잇지 않고, 각 피스가 자기 `vertex1/vertex2 + angleDeg`로 독립된 로컬 좌표계를 가짐 | 전체 트랙을 하나의 글로벌 CatmullRomCurve3로 연결 | 글로벌 커브는 (a) 비폐곡선일 때 통째로 무효화되어 FEAT-004의 "연결 가능한 구간만 정상 렌더"를 못 만족하고 (b) frenet frame이 긴 커브를 따라 누적 드리프트(twist)를 일으켜 rotation-minimizing frame 보정이 별도로 필요해진다. 피스 단위면 두 문제 모두 회피된다 |
| serverless 런타임 | REQ-F-005/010, WEB_PROFILE 결정 | Vercel **Node.js** Serverless Function (Edge Runtime 아님) | Edge Runtime | (D-013 반영) 실제 취득 계약은 `GET /load/{CODE}.js` + 커스텀 헤더 1회 호출로 끝나 네이티브 Node 패키지가 필요 없다 — Edge Runtime도 기술적으로 가능하다. 그래도 Node를 유지하는 이유는 (a) 응답이 `var text='...'` JS 리터럴이라 파싱 실패 시 표준 Node 로깅/디버깅 도구가 더 유리하고 (b) 외부 호스트가 Rails 앱이라 헤더 계약이 바뀔 경우의 재시도 로직을 Node 표준 라이브러리로 다루는 쪽이 유지보수 비용이 낮기 때문 — 성능상 필수 요건은 아니다 |
| 외부 fetch 방식 (계약 확정, measured) | REQ-F-001, FEAT-001, REQ-F-019 | `GET https://mini4wd-track-editor.pimentoso.com/load/{CODE}.js` + 헤더 `X-Requested-With: XMLHttpRequest`. 헤더 누락 시 서버가 422(Rails CSRF 보호)를 반환하므로 서버 함수는 이 헤더를 항상 주입한다. 응답 바디는 `var text='<피스문자열>';`와 `compat` 플래그를 포함하는 JS 스니펫 — 정규식으로 `text`/`compat` 값을 추출해 클라이언트에 JSON으로 넘긴다. `compat = parseInt(<저장버전>) < COMPATIBILITY_ID(26586)`이면 `Cor1`의 45/135/225/315° 배치에 위치 보정이 필요함을 그대로 클라이언트 파싱 계층(FEAT-002)에 전달한다 | headless 브라우저 렌더링(puppeteer-core+@sparticuz/chromium) — **채택하지 않음**: 위 measured 증거로 헤더 하나만 붙이면 렌더 없이 원시 데이터가 그대로 반환되는 것이 확인됐다. headless 경로는 처음부터 불필요했다 | 응답이 JSON이 아니라 JS 리터럴이므로 정규식 추출이 실패하는 형태(따옴표 이스케이프, 멀티라인)에 대한 방어적 파싱이 필요하다 — 이 실패 케이스는 "파싱 실패" fixture로 유닛 테스트에서 결박한다. 헤더 누락 422는 서버 함수 내부에서만 발생 가능하므로(클라이언트가 헤더를 임의로 뺄 수 없음) 런타임에서 관측되면 버그로 취급한다 |
| 캐시 (층별 보장 수준) | REQ-F-019(b) | **(b-1) 클라이언트 세션 인메모리 캐시 — 결정적 층.** 트랙 코드를 key로 파싱 결과를 React 상태/모듈 스코프 `Map`에 보관해, 같은 탭에서 같은 코드 재제출 시 `/api/track` 호출이 0회다. 새로고침·탭 종료 시 소멸하므로 "저장소 없음"(D-004)과 충돌하지 않는다. **(b-2) 이하 서버 층은 best-effort.** | `/api/track` 응답에 `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` 헤더로 **Vercel CDN 캐시**에 적재(TTL 1시간, 최대 24시간 stale 서빙). **명시적 보장 수준**: 이는 재fetch를 원천 차단하는 계약이 아니라 **best-effort**다 — CDN POP 캐시 미스, 수동 purge, 재배포에 따른 캐시 초기화, TTL 1시간 경과 후 최초 요청은 origin(`mini4wd-track-editor.pimentoso.com`)으로 반드시 재fetch된다. REQ-F-019(b)의 "재fetch하지 않는다"는 문구가 요구하는 절대적 보장보다 약하다는 간극을 여기 기록한다. 워밍 인스턴스 내 in-memory `Map`은 보조 수단일 뿐 계약의 근거가 아님 | ~~코드→데이터 영속 캐시(Vercel KV/Upstash Redis)~~ — **2026-08-28 폐기(D-016, 사용자 결정)**. 결정적 보장을 원하면 이쪽이지만 채택하지 않는다: "저장소/DB 없음" 결정(harness profile `no-persistence`)과 정면으로 충돌해 이 문서 단독으로 뒤집을 수 없는 제품 결정이기 때문 | best-effort CDN 캐시는 추가 인프라·비용·데이터 보존 정책 부담이 없어 "저장소 없음" 결정과 정합적이지만, REQ-F-019(b)가 요구하는 절대성은 만족하지 못한다. 이 간극이 실제로 문제라면(예: origin 부하 상한이 하드 제약) NEEDS_DECISION으로 처리 — 아래 참조 |
| 서버 상태 관리 | 앱 전체에 API 호출이 `/api/track` 1개뿐 | `@tanstack/react-query` 미채택, 자체 `useTrackFetch` 훅(discriminated union 상태: idle/loading/slow/error/success) | `@tanstack/react-query v5`(lib-catalog 기본) | 캐시 계약은 이미 서버 CDN이 담당하므로 클라이언트 쿼리 캐싱은 불필요한 중복 기능이다. 쿼리가 하나뿐인데 ~13KB(gzip) 라이브러리를 얹는 대신 TC-001-1~7을 커버하는 얇은 상태 머신을 직접 작성해 3D 번들 예산을 지킨다 |
| 클라이언트 전역 상태 | 단일 화면, 복잡한 공유 상태 없음(lib-catalog 판단 축) | `zustand` 미채택, React state/context로 충분 | `zustand v5` | 카메라 모드 토글·근거등급 목록 정도만 상태이며 여러 트리에 걸친 복잡한 공유 상태가 아니다 |
| 폼 | 입력 필드가 URL 문자열 1개뿐 | `react-hook-form`+`zod` 미채택, controlled input + 정규식(`/^view\/[A-Za-z0-9]+$/` 등, 실제 형식은 구현 시 확정) 검증 | RHF+Zod(lib-catalog 기본) | 필드 1개짜리 입력에 폼 라이브러리 전체를 얹는 것은 과잉이다 |
| HTTP 클라이언트 (서버) | FEAT-001 단일 외부 호출 | Node 22 내장 `fetch`(undici, AbortController로 타임아웃) | `axios` | 외부 호출 지점이 하나뿐이라 axios의 인터셉터/공통설정 이점이 없고, 서버리스 함수 콜드스타트 크기를 늘릴 이유가 없다 |
| 테스트 러너 | 전체 | Vitest 4(유닛) + Playwright(e2e) + `@axe-core/playwright`(접근성) | Jest | 아래 Test Strategy 참조 |

## Test Strategy
- **유닛(Vitest, 최우선)**: FEAT-002 파싱, FEAT-003 순서 복원(끝점 매칭 결정성 — TC-003-2/3), FEAT-004 폐곡선 검증, FEAT-005 `heightAt`/`slopeAt` 공식(S곡선·로그곡선, 이음매 접선=0 검증)은 전부 **순수 함수**다. 이 계층이 이 앱에서 가장 신뢰도 높은 테스트 표면이므로 table-driven 케이스(참조 트랙 132피스, 손상 데이터, 비폐곡선 fixture)로 결박한다. 3D 렌더링과 완전히 분리해 GPU 없이 CI에서 100% 결정적으로 돈다.
- **e2e(Playwright)**: URL 제출→에러 분기(TC-001-2~5), 캐시 재사용(TC-001-6, 서버 로그/네트워크 요청 횟수로 검증), 미지원 피스 라벨(FEAT-009), 근거등급 배지(FEAT-010), 키보드 대체 조작(REQ-NFR-003) 등은 **DOM/오버레이 어서션**(라벨 텍스트, `data-testid`, ARIA 상태)으로 검증한다.
- **3D 캔버스는 픽셀 스크린샷 비교로 게이팅하지 않는다** — GPU/드라이버별 안티앨리어싱·색 재현 차이로 불안정하다. 대신 (a) 씬 그래프에 테스트 훅(`window.__trackScene`)을 노출해 렌더된 세그먼트 개수·미지원 플레이스홀더 개수를 수치로 검증, (b) 플라이스루는 결정적 순서 복원(FEAT-003)을 전제로 카메라 위치/쿼터니언을 알려진 waypoint에서 수치 비교. 시각 스모크 확인이 필요하면 별도 수동 리뷰로 두고 자동 diff 임계값으로 CI를 막지 않는다.
- 접근성은 `@axe-core/playwright`로 UI 크롬(입력창·범례·프로파일 스트립·포커스 표시)에 대해 검사한다 — canvas 자체는 axe 대상이 아니다.

## Package Changes
| Package | Exact Version | Scope | Requirement | Source |
|---|---:|---|---|---|
| react, react-dom | 19.2.8 | dependencies | 전체 | registry.npmjs.org |
| three | 0.185.1 | dependencies | FEAT-005~008 | registry.npmjs.org |
| @types/three | 0.185.4 | devDependencies | three 0.185.1의 타입(미내장 — 위 정정) | registry.npmjs.org |
| @react-three/fiber | 9.7.0 | dependencies | FEAT-005~008 | registry.npmjs.org |
| @react-three/drei | 10.7.8 | dependencies | FEAT-006(OrbitControls)/007 | registry.npmjs.org |
| typescript | 6.0.2 | devDependencies | 전체 | registry.npmjs.org |
| vite | 8.2.2 | devDependencies | 전체 | registry.npmjs.org |
| @vitejs/plugin-react | 6.1.1 | devDependencies | 전체 | registry.npmjs.org |
| vitest | 4.1.11 | devDependencies | 유닛 테스트 | registry.npmjs.org |
| @playwright/test | 1.62.1 | devDependencies | e2e | registry.npmjs.org |
| @axe-core/playwright | 미확인 — 실행 시 최신 안정판 조회 필요 | devDependencies | REQ-NFR-003 | 미확인 |

- 실행: environment-scaffolder 반영 → typed `lockfile` operation → lockfile source/integrity 검토 → typed frozen `install`. 직접 `pnpm add` 제안하지 않음.

## Required Environment Configuration
- 없음(외부 API 키·DB 자격증명 불필요) — 캐시 TTL(`s-maxage=3600`)/`stale-while-revalidate=86400`은 코드 상수로 고정하며 env 분리 대상이 아니다.
- Vercel 함수 설정: `functions.runtime` 명시적으로 Node.js 지정. 단일 외부 GET 호출 + 정규식 파싱만 수행하므로 Hobby 플랜 기본 실행시간 한도(10초)로 충분 — `maxDuration` 상향 불필요.
- 배포 전 확인(BLOCKER-001, 상세는 Harness Profile 참조): 프로덕션 도메인 연결/URL 공유 전 사이트 운영자 사전고지 완료 여부를 확인하고, 미완료 시 Vercel Deployment Protection을 적용한다.

## NEEDS_DECISION
- ~~1. 1차 fetch로 데이터가 나오는지 여부~~ — **폐기(해소)**. D-013 measured 증거로 확정: `GET /load/{CODE}.js` + `X-Requested-With: XMLHttpRequest` 헤더 하나로 원시 피스문자열이 직접 반환된다. headless 브라우저는 처음부터 불필요했다.
- ~~2. 캐시 TTL/stale-while-revalidate 수치~~ — **해소**. `s-maxage=3600, stale-while-revalidate=86400`로 확정(위 Architecture Decisions "재fetch 방지 캐시" 참조).
- ~~3. headless fallback 채택 시 Vercel 플랜/함수 크기 제약 수용 여부~~ — **폐기**. headless 경로 자체가 없으므로 이 질문은 무의미해졌다.

1. ~~CDN best-effort 캐시로 볼지, 영속 KV로 전환해 "저장소 없음"을 뒤집을지~~ — **해소(2026-08-28, 사용자 결정 D-016): 저장소 없음 유지.** 영속 KV 전환은 폐기한다. 대신 REQ-F-019(b)의 절대 문구를 메커니즘에 맞춰 "origin fetch 최소화"로 완화했고, TC-001-6은 `x-vercel-cache` 헤더로 관찰 가능하게 재작성됐다. **간극은 요구를 낮춰 닫았지 메커니즘을 올려 닫은 것이 아니다** — origin 부하 상한이 하드 제약이 되면 이 결정을 다시 열어야 한다.
