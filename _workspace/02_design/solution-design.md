# Solution Design — mini4wd-track-3d

STAGE: 0 (observational — not a gate)

진입 경로: **브라운필드**. FEAT-001이 이미 머지돼 소스가 존재한다. 이 문서의 값은 원칙적으로
`_workspace/01_plan`·`_workspace/02_design`의 확정 산출물과 **기존 소스 실측**에서 나왔고,
실측이 제안을 이긴다(계약 §3). 여기서 수용 기준을 새로 만들지 않는다 — feature-plan 샤드를
참조만 한다.

## 0. 무엇을 읽고 무엇을 확인했는가

| 대상 | 경로 | 결과 |
|---|---|---|
| 매니페스트 | `package.json` | 읽음 — `private: true`, `bin` 없음, `exports`/`main` 없음 |
| TS 설정 | `tsconfig.json` | 읽음 — `strict`+`noUncheckedIndexedAccess`+`exactOptionalPropertyTypes`, `paths: {"@/*": ["./src/*"]}`, `include: [src, api, e2e, vite.config.ts, vitest.config.ts, playwright.config.ts]` |
| 번들러 | `vite.config.ts` | 읽음 — `@` alias, `build.target: es2023`, `/api/track`을 dev·preview 미들웨어로 마운트하는 커스텀 플러그인 |
| 유닛 러너 | `vitest.config.ts` | 읽음 — `environment: node`, `include: ['src/**/*.test.ts','api/**/*.test.ts']`, `env.TRACK_UPSTREAM='fixtures'` |
| e2e 러너 | `playwright.config.ts` | 읽음 — `testDir: './e2e'`, `retries: 0`, webServer는 `pnpm build && pnpm preview`, fixture 업스트림 |
| 배포 | `vercel.json` | 읽음 — `functions["api/track.ts"].runtime = "nodejs22.x"` |
| 스타일 | `postcss.config.js`, `src/index.css` | 읽음 — `@tailwindcss/postcss` 한 개, `@import 'tailwindcss'` + CSS 변수 토큰 |
| lint 설정 | `eslint.config.js` / `.mjs`, `.prettierrc` | **찾아봤고 없다**(`measured-absent`) |
| 브라운필드 오버레이 | `_workspace/02_design/integration-overlay.json` | **찾아봤고 없다** — 이 프로젝트는 하네스가 처음부터 만들었으므로 오버레이가 존재하지 않는다. 레이어 맵은 오버레이가 아니라 **실제 트리 실측**에서 나왔다 |
| 기존 스팩 | `_workspace/03_dev/spec.json` | **없다** — 최초 확정이다(재진입 아님) |

실측한 소스 트리(22개 `src/` 파일 + `api/` 2 + `e2e/` 1 + `fixtures/track/` 9):

```
src/app/routes/Routes.tsx
src/pages/{track-viewer/ui/{TrackViewerPage,InputScreen,ErrorScreen}.tsx, not-found/{ui/NotFoundPage.tsx,index.ts}}
src/widgets/app-header/ui/AppHeader.tsx
src/features/load-track/{index.ts, ui/UrlInputForm.tsx, model/{useTrackFetch,types,track-cache}.ts, api/fetch-track.ts}
src/entities/track/model/{types,schema,schema.test}.ts
src/shared/{ui/{top-bar/TopBar.tsx, AlertSlot/AlertSlot.tsx}, lib/track/{extract-upstream-vars.ts,extract-upstream-vars.test.ts}}
src/{main.tsx,index.css}
api/{track.ts,track.test.ts}
e2e/track-load.spec.ts
fixtures/track/{WS67Y2,UNSUPP,PARSEFAIL,OPENLOOP,NOSTART,LARGE1,COMPAT1,BADJS}.js.txt + README.md
index.html
```

## 1. 산출물 형태 (targetShapes)

**`["web-app", "serverless-functions"]`** — 둘 다 실측이다.

| 형태 | 근거(measured) | 왜 뺄 수 없는가 |
|---|---|---|
| `web-app` | 루트 `index.html`이 `/src/main.tsx`를 로드하고 `vite build`가 정적 산출물을 낸다. React 19 + react-router SPA | `userInterface: true` → e2e 필수 |
| `serverless-functions` | `api/track.ts`가 `export default async function handler(req,res)`이고 `vercel.json`이 `nodejs22.x` 런타임을 명시한다 | 이 형태를 빼면 `api.unit`·`api.guards` 검사가 통째로 사라진다(계약 §6 "형태 생략도 대조 대상이다") |

**선언하지 않는 형태와 그 근거**: `package.json`에 `bin`이 없으므로 `cli` 아님. `exports`/`main`이
없고 `private: true`이므로 `library` 아님. 형태 신호와 어긋나지 않는다.

## 2. 고정 기반 (constitution.substrate)

실제로 파일에서 확인한 키만 `measured`로 적는다. **확인하지 못한 키는 적지 않는다** — 미지정은
하네스 기본값으로 채워지고 `source: "default"`로 기록된다.

| 키 | 값 | source | 실측 근거 |
|---|---|---|---|
| `packageManager` | `pnpm` | measured | `package.json` → `"packageManager": "pnpm@11.18.0"` |
| `language` | `typescript` | measured | `tsconfig.json` 존재 + `typescript@6.0.2` devDependency + 전 소스가 `.ts`/`.tsx` |
| `bundler` | `vite` | measured | `vite.config.ts` + `vite@8.2.2` |
| `testRunner` | `vitest` | measured | `vitest.config.ts` + `vitest@4.1.11` |
| `e2e` | `playwright` | measured | `playwright.config.ts` + `@playwright/test@1.62.1` |

**`lint`·`formatter`는 의도적으로 비운다.** 두 도구 모두 **찾아보고 없음을 확인**했다(설정 파일
부재 + 의존성 선언 부재). 그런데 substrate의 `source` 열거값에는 `measured-absent`가 없어서
"확인된 부재"를 표현할 자리가 없다. `{value:"none", source:"declared"}`로 닫으면 사용자에게
제시하지 않고 기본값(eslint/prettier)을 뒤집는 것이 되고, 형태 카탈로그의 `common` 검사에는
`quality.lint`가 들어 있어 이 부재는 릴리스 경로에 실제로 닿는다. 그래서 **닫지 않고 OD-003으로
올린다**(§8). 확정 전까지 이 두 키는 하네스 기본값으로 채워지며, 그 값은 프로젝트 실측이 아니다.

**실측 관찰(결정 아님, 기록만)**: `tech-stack.md`는 pnpm 11.24.0 / Node 22.23.2를 적었으나
`package.json`은 `pnpm@11.18.0`, `engines.node: "^20.19.0 || >=22.12.0"`, `vercel.json`은
`nodejs22.x`다. substrate가 담는 것은 도구 **이름**이라 이 드리프트는 기반 결정에 영향을 주지
않는다. 값을 바꿔 적지 않고 사실만 남긴다.

## 3. 아키텍처 패턴

`pattern: "fsd"` — **추론이 아니라 실측이다.** 기존 트리가 `app/pages/widgets/features/entities/shared`
6레이어에 `ui`/`model`/`api`/`lib` 세그먼트를 그대로 쓰고 있고, import는 `@/` alias(tsconfig
`paths` + vite `resolve.alias`)로 절대 경로를 쓰며 슬라이스 내부는 상대 경로를 쓴다
(`src/features/load-track/model/useTrackFetch.ts`가 `@/entities/...`와 `../api/fetch-track`을
동시에 쓰는 것이 실측된 관례다).

**실측된 관례 중 일관되지 않은 것(지어내지 않고 그대로 기록)**:

- 배럴(`index.ts`)이 **부분적으로만** 있다 — `features/load-track/index.ts`, `pages/not-found/index.ts`에는
  있고 `entities/track`·`widgets/app-header`·`shared/ui/*`에는 없다. 실제로 `Routes.tsx`는
  `@/pages/not-found`(배럴)와 `@/pages/track-viewer/ui/TrackViewerPage`(직접 경로)를 섞어 쓴다.
- 디렉터리 이름이 kebab-case(`top-bar`, `load-track`)와 PascalCase(`AlertSlot`)로 갈린다.
  component-spec도 이 갈림을 그대로 승계했다(`shared/ui/EvidenceBadge/` vs `shared/ui/legend/`).
- **이 두 가지는 미결정으로 올리지 않는다** — 되돌리기 비용이 낮고 관례가 이미 문서(component-spec)에
  경로 단위로 고정돼 있어 개발이 그것을 따르면 된다. 다만 "일관된 관례가 있다"고 적는 것은
  거짓이므로 여기 그대로 남긴다.

FSD 밖에 있는 두 트리도 이 프로젝트의 관례다: 루트 `api/`(Vercel Node Serverless Function,
`../src/entities/...`를 `.js` 확장자로 import한다)와 루트 `fixtures/track/`(녹화된 업스트림 응답).
`api/track.ts`는 런타임 비의존 코어(`handleTrackRequest`)와 Vercel 엔트리(`default handler`)를
분리했고, `vite.config.ts`가 같은 코어를 dev·preview 미들웨어로 재사용한다 — **계약이 두 벌이
되지 않게 하는 실측된 구조 결정**이다. 이 구조는 유지한다.

## 4. 레이어 맵 (developer 쓰기 소유권의 유일한 공급원)

`agent-registry`의 `developer`는 소유권이 **비어 있고** `layerMap`이 그것을 공급한다. 여기서
빠진 경로는 아무도 쓸 수 없다. 아래는 전부 실존 경로이며 서로 겹치지 않는다.

| 논리 레이어 | 경로 | 근거 |
|---|---|---|
| `appShell` | `src/app` | `src/app/routes/Routes.tsx` |
| `routes` | `src/pages` | `track-viewer`·`not-found` 슬라이스 |
| `composedUI` | `src/widgets` | `app-header` 슬라이스, component-spec이 4개 슬라이스를 더 고정 |
| `featureLogic` | `src/features` | `load-track` 슬라이스 |
| `domainModel` | `src/entities` | `track/model/{types,schema}.ts` |
| `sharedKernel` | `src/shared` | `ui/top-bar`, `ui/AlertSlot`, `lib/track` |
| `appEntry` | `src/main.tsx` | `src/` 루트 파일이라 어느 레이어 디렉터리에도 안 들어간다 |
| `globalStyles` | `src/index.css` | 위와 같음 — 토큰 정의가 여기 산다 |
| `htmlEntry` | `index.html` | Vite SPA 진입 문서. 등록부의 어느 에이전트도 소유하지 않는다 |
| `serverlessApi` | `api` | Vercel Node Function |
| `upstreamFixtures` | `fixtures` | 녹화 업스트림. api-schema가 Phase 3 생성 대상으로 지정 |

**`src/main.tsx`·`src/index.css`·`index.html`을 개별 레이어로 올린 이유**: 이들은 디렉터리가
아니라 파일이라 `src/app` 같은 레이어에 덮이지 않는다. 넣지 않으면 앱 진입점과 토큰 파일이
무소유로 남는다. `src` 하나로 뭉뚱그리면 `src/pages`를 삼켜 겹침이 되고 스팩이 통째로
불신된다 — 그래서 파일 단위로 못박는다.

**루트 설정 파일은 일부러 넣지 않았다**: `package.json`·`tsconfig.json`·`vite.config.ts`·
`vitest.config.ts`·`playwright.config.ts`·`vercel.json`·`postcss.config.js`는 등록부상
`environment-scaffolder` 소유다. layerMap에 넣으면 그 경계를 무너뜨린다.

## 5. 테스트 레이어

| 키 | 경로 | 실측 |
|---|---|---|
| `unit` | `src` | `src/entities/track/model/schema.test.ts`, `src/shared/lib/track/extract-upstream-vars.test.ts` — **소스 옆 병치**가 이 프로젝트의 관례다 |
| `e2e` | `e2e` | `e2e/track-load.spec.ts` 실존, `playwright.config.ts`의 `testDir: './e2e'` |

`testLayers`는 단일 문자열이라 유닛 테스트의 두 번째 서식지인 `api/**/*.test.ts`
(`api/track.test.ts` 실존, `vitest.config.ts` include에 명시)를 함께 담을 수 없다. 그 경로의
소유권은 `layerMap.serverlessApi = "api"`가 공급하므로 무소유가 되지 않는다 — 겹치는 것이
아니라 서로 다른 출처가 각각 덮는 구조다.

`e2e`는 선택이 아니다 — `targetShapes`에 `web-app`(`userInterface: true`)이 있으면 형태
카탈로그가 e2e를 요구한다.

## 6. 라이브러리 결정

**전부 `package.json` 실측이다.** 채택/미채택과 버전은 `tech-stack.md`가 이미 고정했으므로
여기서 재결정하지 않는다(계약 §3). 아래는 그 결정이 실제 매니페스트와 일치하는지 확인한
결과다.

| 역할 | 선택 | source | 근거 |
|---|---|---|---|
| UI 프레임워크 | `react` 19.2.8 | measured | dependencies |
| 라우팅 | `react-router` 8.3.1 | measured | dependencies + `src/app/routes/Routes.tsx`의 `createBrowserRouter` |
| 3D 렌더러 | `three` 0.185.1 | measured | dependencies |
| 3D React 바인딩 | `@react-three/fiber` 9.7.0 | measured | dependencies |
| 3D 헬퍼 | `@react-three/drei` 10.7.8 | measured | dependencies |
| 스타일링 | `tailwindcss` 4.3.3 (+`@tailwindcss/postcss`) | measured | devDependencies + `postcss.config.js` + `src/index.css`의 `@import 'tailwindcss'` |
| 접근성 스캔 | `@axe-core/playwright` 4.13.0 | measured | devDependencies + `e2e/track-load.spec.ts`의 `AxeBuilder` 사용 |
| 서버리스 타입 | `@vercel/node` 10.0.0 | measured | devDependencies |
| 서버 상태 | 없음 | measured-absent | `@tanstack/react-query` 선언 없음. `src/features/load-track/model/useTrackFetch.ts`의 자체 상태 머신(idle/loading/slow/error/success)이 대신한다 |
| 전역 상태 | 없음 | measured-absent | `zustand`가 **직접 의존성으로 선언되지 않았다**. `node_modules/.pnpm`에 zustand 4·5가 있으나 `@react-three/fiber`의 전이 의존이다 — 직접 import 금지 |
| 폼 | 없음 | measured-absent | `react-hook-form` 선언 없음. `UrlInputForm` controlled input |
| 스키마 검증 | 없음 | measured-absent | `zod` 선언 없음. `src/entities/track/model/schema.ts`의 수기 타입가드(`isRawTrackResponse`, `extractCode`) |
| HTTP 클라이언트 | 없음 | measured-absent | `axios` 선언 없음. 서버는 Node 내장 `fetch`+`AbortController`(`api/track.ts`), 클라이언트는 브라우저 `fetch`(`fetch-track.ts`) |
| API mock | 없음 | measured-absent | `msw` 선언 없음. 업스트림 대역은 `fixtures/track/*.js.txt` 파일 + `TRACK_UPSTREAM=fixtures` 환경변수로 대체된다(vitest·playwright 양쪽 설정에 명시) |
| UI 컴포넌트 킷 | 없음 | measured-absent | `shadcn/ui`·`radix-ui`·`class-variance-authority`·`clsx`·`tailwind-merge` **전부 선언 없음**. UI_LANE은 `tailwind-shadcn`인데 킷이 설치돼 있지 않다 → OD-002 |

## 7. 모듈 경계 (병렬 쓰기 범위)

FEAT 단위 티켓 14건이 병행될 예정이라 이 경계가 실사용된다. 1차 근거는
`feature-plan/data-model.md`의 병렬 작업 단위이고, 2차 근거는 component-spec이 이미 슬라이스
경로까지 고정한 위젯·공유 계층이다.

`data-model.md`가 고정한 병렬 순서(재서술이 아니라 참조):
`{FEAT-001}` → `{FEAT-002}` → `{FEAT-003, FEAT-009}` → `{FEAT-004, FEAT-005}` →
`{FEAT-006, FEAT-008, FEAT-010, FEAT-013}` → `{FEAT-007, FEAT-012}`. `{FEAT-011}`·`{FEAT-014}`는
독립 슬라이스.

| 경계 | 담당 | 근거 |
|---|---|---|
| `api` | FEAT-001 서버 취득 | 완결된 단위(실측) |
| `fixtures` | fixture 추가 | compat=true·고도 불균형 등 미확보 fixture가 여기로 |
| `src/entities/track` | 4단계 파이프라인 타입·순수 함수 정본 | `data-model.md`의 4타입이 여기 산다 — 단, 하위 배치는 OD-001에 종속 |
| `src/features/load-track` | FEAT-001 클라이언트 | 실존 슬라이스 |
| `src/shared/lib/track-cursor` | 공유 커서 owner | component-spec이 경로까지 고정 |
| `src/shared/ui` | EvidenceBadge/AlertSlot/Legend/TopBar | component-spec이 경로까지 고정 |
| `src/widgets/track-canvas` | FEAT-006/007/008/009/011 3D 표면 | component-spec |
| `src/widgets/profile-strip` | FEAT-012 owner | component-spec |
| `src/widgets/section-list` | FEAT-013/014 대체 표현 | component-spec |
| `src/widgets/view-controls` | ControlCluster | component-spec |
| `src/widgets/app-header` | FEAT-001 출처 링크 | 실존 슬라이스 |
| `src/pages/track-viewer` | 6상태 머신 + FEAT-014 게이트 | 실존 슬라이스 |
| `e2e` | e2e 시나리오 | 실존 |

**FEAT-006/007/008/009/011이 `src/widgets/track-canvas` 하나를 공유한다** — 이 다섯은 같은 3D
표면을 건드리므로 경계로 갈라지지 않는다. 병렬로 돌리려면 티켓을 순차화하거나 캔버스 내부를
더 잘라야 한다. 경계가 표현하지 못하는 충돌이므로 여기 명시한다(숨기지 않는다).

## 8. 결정 (셋 다 `confirmed` — 2026-08-30 사용자 확정)

서브에이전트는 사용자에게 직접 묻지 못한다. 설계자는 셋을 `open`으로 남기고 멈췄고,
오케스트레이터가 제시해 답을 받아 닫았다(`spec.mjs`는 `open`이 하나라도 남으면 확정을 거부한다).
셋 다 설계자 추천안 그대로다.

| 결정 | 답 | 반영된 곳 |
|---|---|---|
| OD-001 | `src/entities/track/lib/{parse,restore,closure,elevation}/` | §7 경계 4개 신설 |
| OD-002 | cva + clsx + tailwind-merge (radix 보류) | §6 `ui-variant` |
| OD-003 | eslint + prettier 도입 | §2 substrate 기본값 유지 |

**OD-003 정정**: 설계자는 `eslint.config.*` 부재를 정확히 실측했으나 그것은 이 브랜치
(`feat/FEAT-002-parse-track-string`) 기준이다. 청구 브랜치 `feature/mini4wd-track-3d`에는
lint 축이 이미 서 있다(341531c — `eslint`·`@eslint/js`·`typescript-eslint` + script 5개).
작업 브랜치가 2커밋 뒤쳐져 갈라져 나온 결과이며, **남은 것은 prettier뿐이다.**
이 스팩은 확정 시점의 브랜치 상태를 기록한 것이고, 브랜치를 최신화하면 `lint`는
`default`가 아니라 `measured`가 된다.

### OD-001 — 파이프라인 순수 함수(FEAT-002~005)를 어느 레이어에 두는가

되돌리기 비용이 크다(디렉터리 구조). 실측된 선례가 **둘로 갈린다**:
`src/entities/track/model/schema.ts`는 도메인 순수 함수를 `entities/.../model`에 뒀고,
`src/shared/lib/track/extract-upstream-vars.ts`는 업스트림 포맷 파서를 `shared/lib`에 뒀다.
파싱·순서복원·폐곡선·고도 4종은 어느 쪽으로도 갈 수 있고, 어디로 가느냐가 §7의 병렬 경계를
바꾼다. 추천: `src/entities/track/lib/{parse,restore,closure,elevation}/` — 도메인 지식이고
UI 상태가 없으며, 4개 티켓이 하위 디렉터리로 각각 독립 경계를 갖는다.

### OD-002 — UI_LANE `tailwind-shadcn`인데 킷이 설치돼 있지 않다

component-spec은 "cva variant + className 병합, substring/generated class selector 금지"를
계약으로 고정했는데 `class-variance-authority`·`clsx`·`tailwind-merge`·radix가 매니페스트에
없다(실측). 모든 UI 티켓이 이 답에 의존하고, 나중에 바꾸면 이미 쓴 컴포넌트를 전부 손대야 한다.
추천: cva+clsx+tailwind-merge만 도입하고 radix는 필요한 프리미티브가 생길 때 판단 —
`tech-stack.md`가 이 세 패키지를 미채택으로 고정한 적은 없으므로 신설이지 번복이 아니다.

### OD-003 — lint·formatter 부재를 유지할 것인가

`eslint.config.*`·`.prettierrc` 부재를 확인했고 의존성 선언도 없다(실측). 그런데 형태
카탈로그의 `common` 검사에 `quality.lint`가 있어 이 부재는 릴리스 경로에 닿는다. 확정 전까지
substrate의 두 키는 **하네스 기본값**(eslint/prettier)으로 채워지며 그것은 프로젝트 실측이
아니다. 추천: 기본값대로 eslint+prettier를 도입한다 — 티켓 14건이 병행될수록 형식 다툼 비용이
커지고, `quality.lint` receipt를 만들 유일한 경로다.

## 9. 비목표

- 저장소·DB·계정 없음(`no-persistence`·`no-auth`, D-004/D-016). 영속 캐시(Vercel KV/Upstash)는 폐기된 안이다
- SSR·RSC·Edge Runtime 미사용 — Vercel Node Serverless Function만 쓴다
- headless 브라우저 렌더 경로 없음(D-013 실측으로 불필요해졌다)
- 트랙 편집·저장·공유 생성 없음 — 읽기 전용 뷰어다
- 3D 캔버스 픽셀 스크린샷 diff로 CI를 게이팅하지 않는다(tech-stack Test Strategy)
- 절대 단위(m·cm) 표기 없음(B-001 미해소)
- 다단(연속) 뱅크 기하 미구현(D-030)
- `axios`·`@tanstack/react-query`·`zustand`·`react-hook-form`·`zod` 미채택(tech-stack 확정)

## 10. 참조만 하는 것 (복제 금지)

- 수용 기준: `_workspace/01_plan/feature-plan/{feature-list,specs-pipeline,specs-scene,specs-surfaces,traceability}.md`
- 데이터 계약: `_workspace/02_design/api-schema/`(공통 봉투·`/api/track`·fixture), `_workspace/01_plan/feature-plan/data-model.md`
- 화면·컴포넌트: `_workspace/02_design/component-spec/`, `layout-spec/`, `design-system/`
- 성능 예산·완화: `_workspace/02_design/performance-budget/`
- 이미 내려진 결정: `_workspace/01_plan/decision-log/`

## 11. 확정 후 알려질 공백(숨기지 않는다)

`acceptanceRefs`에 FEAT/TC 85건을 전부 적었다. `validate-spec-conformance`의 `acceptanceCoverage`는
`testLayers`(`src`·`e2e`) 안에서 ID 문자열 인용만 보므로, 아직 구현되지 않은 FEAT-002~014의 TC는
**인용 없음으로 보고된다**. 그것이 지금의 사실이다 — 적게 적어 보고를 조용하게 만들지 않는다.
그중 아래 넷은 구현해도 자동 인용이 어렵다는 것이 기획 단계에서 이미 기록됐다:

- `TC-001-8` — `x-vercel-cache` HIT/STALE은 배포된 CDN에서만 관측된다(e2e는 전제만 검증하고 통과로 표시하지 않는다)
- `TC-002-5` — compat=true fixture 미확보(기획 NEEDS_DECISION)
- `TC-003-5` — Str2 2개 이상 fixture 미확보(기획 NEEDS_DECISION)
- `TC-004-5` — 고도 불균형 fixture 미확보(기획 NEEDS_DECISION)

```json web-harness:solution-design
{
  "stage": 0,
  "targetShapes": ["web-app", "serverless-functions"],
  "constitution": {
    "substrate": {
      "packageManager": {"value": "pnpm", "source": "measured"},
      "language": {"value": "typescript", "source": "measured"},
      "bundler": {"value": "vite", "source": "measured"},
      "testRunner": {"value": "vitest", "source": "measured"},
      "e2e": {"value": "playwright", "source": "measured"}
    }
  },
  "communication": ["rest"],
  "concurrency": [],
  "architecture": {
    "pattern": "fsd",
    "rationale": "기존 트리를 실측한 결과 app/pages/widgets/features/entities/shared 6레이어와 ui·model·api·lib 세그먼트가 이미 성립해 있고 import는 tsconfig paths + vite alias의 '@/'를 쓴다. 브라운필드이므로 관례 실측이 제안을 이긴다(계약 §3). FSD 밖의 루트 api/(Vercel Node Serverless Function)와 fixtures/(녹화 업스트림)도 실측된 이 프로젝트의 관례이며, api/track.ts가 런타임 비의존 코어와 Vercel 엔트리를 분리해 vite.config.ts의 dev·preview 미들웨어와 같은 코어를 공유하는 구조를 유지한다. 다만 배럴(index.ts) 유무와 디렉터리 대소문자 관례는 실제로 일관되지 않으며 그 사실을 지어내 메우지 않는다."
  },
  "layerMap": {
    "appShell": "src/app",
    "routes": "src/pages",
    "composedUI": "src/widgets",
    "featureLogic": "src/features",
    "domainModel": "src/entities",
    "sharedKernel": "src/shared",
    "appEntry": "src/main.tsx",
    "globalStyles": "src/index.css",
    "htmlEntry": "index.html",
    "serverlessApi": "api",
    "upstreamFixtures": "fixtures"
  },
  "testLayers": {
    "unit": "src",
    "e2e": "e2e"
  },
  "libraries": {
    "ui-variant": {"choice": "class-variance-authority + clsx + tailwind-merge", "alternatives": ["shadcn/ui 전체(radix 포함)", "순수 Tailwind + 수기 variant 함수"], "source": "confirmed", "rationale": "OD-002 확정. component-spec이 cva variant + className 병합을 계약으로 고정했는데 매니페스트에 없었다. radix는 필요한 프리미티브가 생길 때 별도 판단 — 이 뷰어는 다이얼로그·팝오버가 거의 없다"},
    "uiFramework": {"choice": "react", "alternatives": ["vue", "svelte"], "source": "measured"},
    "routing": {"choice": "react-router", "alternatives": ["@tanstack/react-router", "wouter", "none"], "source": "measured"},
    "renderer3d": {"choice": "three", "alternatives": ["babylonjs"], "source": "measured"},
    "reactBinding3d": {"choice": "@react-three/fiber", "alternatives": ["명령형 three.js 직접 제어"], "source": "measured"},
    "helpers3d": {"choice": "@react-three/drei", "alternatives": ["OrbitControls 수기 이식"], "source": "measured"},
    "styling": {"choice": "tailwindcss", "alternatives": ["@mui/material", "css-modules"], "source": "measured"},
    "accessibilityScan": {"choice": "@axe-core/playwright", "alternatives": ["axe-core 직접 주입", "none"], "source": "measured"},
    "serverlessTypes": {"choice": "@vercel/node", "alternatives": ["수기 최소 인터페이스"], "source": "measured"},
    "serverState": {"choice": "none", "alternatives": ["@tanstack/react-query", "swr"], "source": "measured-absent"},
    "globalState": {"choice": "none", "alternatives": ["zustand", "jotai", "@reduxjs/toolkit"], "source": "measured-absent"},
    "form": {"choice": "none", "alternatives": ["react-hook-form"], "source": "measured-absent"},
    "schemaValidation": {"choice": "none", "alternatives": ["zod", "valibot"], "source": "measured-absent"},
    "httpClient": {"choice": "none", "alternatives": ["axios", "ky"], "source": "measured-absent"},
    "apiMock": {"choice": "none", "alternatives": ["msw"], "source": "measured-absent"},
    "uiComponentKit": {"choice": "none", "alternatives": ["shadcn/ui + radix + cva"], "source": "measured-absent"}
  },
  "moduleBoundaries": [
    {"scope": "api", "rationale": "FEAT-001 서버 취득 계약. 파이프라인 이전 단계라 단독 완결 단위다(data-model 인접 상호작용)"},
    {"scope": "fixtures", "rationale": "녹화 업스트림. compat=true·고도 불균형 등 미확보 fixture 추가가 여기서만 일어난다"},
    {"scope": "src/entities/track/model", "rationale": "4단계 파이프라인 타입 정본"},
    {"scope": "src/entities/track/lib/parse", "rationale": "FEAT-002 파싱 — OD-001 확정으로 하위 디렉터리가 병렬 경계가 된다"},
    {"scope": "src/entities/track/lib/restore", "rationale": "FEAT-003 순서 복원"},
    {"scope": "src/entities/track/lib/closure", "rationale": "FEAT-004 폐곡선 검증"},
    {"scope": "src/entities/track/lib/elevation", "rationale": "FEAT-005 고도 프로파일"},
    {"scope": "src/features/load-track", "rationale": "FEAT-001 클라이언트 슬라이스(실존)"},
    {"scope": "src/shared/lib/track-cursor", "rationale": "공유 커서 단일 owner. component-spec이 경로까지 고정했다"},
    {"scope": "src/shared/ui", "rationale": "EvidenceBadge·AlertSlot·Legend·TopBar 공용 프리미티브"},
    {"scope": "src/widgets/track-canvas", "rationale": "FEAT-006/007/008/009/011이 공유하는 3D 표면 — 이 다섯은 경계로 갈라지지 않으므로 순차화가 필요하다"},
    {"scope": "src/widgets/profile-strip", "rationale": "FEAT-012 owner. FEAT-007은 이벤트 구독자일 뿐이다"},
    {"scope": "src/widgets/section-list", "rationale": "FEAT-013 owner이자 FEAT-014 대체 표현의 주 콘텐츠"},
    {"scope": "src/widgets/view-controls", "rationale": "ControlCluster — 시점·재생·탐색 속도"},
    {"scope": "src/widgets/app-header", "rationale": "FEAT-001 출처 링크 상시 노출(PAGE-000 전역 책임)"},
    {"scope": "src/pages/track-viewer", "rationale": "6화면 상태 머신과 FEAT-014 WebGL 게이트"},
    {"scope": "e2e", "rationale": "Playwright 시나리오. testDir './e2e' 실측"}
  ],
  "acceptanceSource": "feature-plan",
  "acceptanceRefs": [
    "FEAT-001", "FEAT-002", "FEAT-003", "FEAT-004", "FEAT-005", "FEAT-006", "FEAT-007",
    "FEAT-008", "FEAT-009", "FEAT-010", "FEAT-011", "FEAT-012", "FEAT-013", "FEAT-014",
    "TC-001-1", "TC-001-2", "TC-001-3", "TC-001-4", "TC-001-5", "TC-001-6", "TC-001-7", "TC-001-8",
    "TC-002-1", "TC-002-2", "TC-002-3", "TC-002-4", "TC-002-5",
    "TC-003-1", "TC-003-2", "TC-003-3", "TC-003-4", "TC-003-5", "TC-003-6",
    "TC-004-1", "TC-004-2", "TC-004-3", "TC-004-4", "TC-004-5", "TC-004-6",
    "TC-005-1", "TC-005-2", "TC-005-3", "TC-005-4", "TC-005-5", "TC-005-6",
    "TC-006-1", "TC-006-2", "TC-006-3", "TC-006-4", "TC-006-5",
    "TC-007-1", "TC-007-2", "TC-007-3", "TC-007-4", "TC-007-5", "TC-007-6",
    "TC-008-1", "TC-008-2", "TC-008-3",
    "TC-009-1", "TC-009-2", "TC-009-3",
    "TC-010-1", "TC-010-2", "TC-010-3", "TC-010-4", "TC-010-5",
    "TC-011-1", "TC-011-2", "TC-011-3", "TC-011-4",
    "TC-012-1", "TC-012-2", "TC-012-3", "TC-012-4", "TC-012-5",
    "TC-013-1", "TC-013-2", "TC-013-3", "TC-013-4", "TC-013-5",
    "TC-014-1", "TC-014-2", "TC-014-3", "TC-014-4"
  ],
  "nonGoals": [
    "저장소·DB·계정 없음(no-persistence·no-auth) — 영속 캐시(Vercel KV/Upstash)는 D-016에서 폐기됐다",
    "SSR·RSC·Edge Runtime 미사용 — Vercel Node Serverless Function만 쓴다",
    "headless 브라우저 렌더 경로 없음 — D-013 실측으로 불필요해졌다",
    "트랙 편집·저장·공유 링크 생성 없음(읽기 전용 뷰어)",
    "3D 캔버스 픽셀 스크린샷 diff로 CI를 게이팅하지 않는다",
    "절대 단위(m·cm) 표기 없음(B-001 미해소)",
    "다단(연속) 뱅크 기하 미구현(D-030)",
    "axios·@tanstack/react-query·zustand·react-hook-form·zod 미채택(tech-stack 확정)"
  ],
  "openDecisions": [
    {
      "id": "OD-001",
      "question": "FEAT-002~005의 파이프라인 순수 함수(파싱·순서복원·폐곡선검증·고도프로파일)를 어느 레이어에 두는가? 실측된 선례가 둘로 갈린다 — entities/track/model/schema.ts(도메인 순수 함수)와 shared/lib/track/extract-upstream-vars.ts(포맷 파서). 이 답이 병렬 쓰기 경계를 바꾼다.",
      "options": [
        "src/entities/track/lib/{parse,restore,closure,elevation}/ — 도메인 레이어에 lib 세그먼트를 신설하고 4개 티켓이 하위 디렉터리로 독립 경계를 갖는다",
        "src/features/{parse-track,restore-path,elevation-profile}/ — feature 슬라이스로 분리해 경계가 슬라이스 단위로 떨어진다",
        "src/shared/lib/track/ 아래에 모은다 — extract-upstream-vars.ts 선례를 그대로 따른다"
      ],
      "recommended": "src/entities/track/lib/{parse,restore,closure,elevation}/ — 이들은 사용자 시나리오가 아니라 도메인 지식이고 UI 상태가 없다. 하위 디렉터리가 그대로 병렬 경계가 되어 4개 티켓이 서로 침범하지 않는다.",
      "status": "confirmed"
    },
    {
      "id": "OD-002",
      "question": "UI_LANE이 tailwind-shadcn이고 component-spec이 'cva variant + className 병합'을 계약으로 고정했는데, class-variance-authority·clsx·tailwind-merge·radix가 package.json에 전혀 없다(실측). 킷을 도입할 것인가?",
      "options": [
        "cva + clsx + tailwind-merge를 도입한다(radix는 필요한 프리미티브가 생길 때 별도 판단)",
        "shadcn/ui 전체(radix 포함)를 도입한다",
        "도입하지 않고 순수 Tailwind 유틸리티 + 수기 variant 함수로 간다 — 그 경우 component-spec의 cva 계약 문구를 정정해야 한다"
      ],
      "recommended": "cva + clsx + tailwind-merge만 도입한다 — 모든 UI 티켓이 이 답에 의존하고 나중에 바꾸면 이미 쓴 컴포넌트를 전부 손대야 한다. tech-stack.md가 이 세 패키지를 미채택으로 고정한 적은 없으므로 신설이지 번복이 아니다. 이 뷰어는 다이얼로그·팝오버가 거의 없어 radix 전체는 아직 근거가 없다.",
      "status": "confirmed"
    },
    {
      "id": "OD-003",
      "question": "eslint·prettier가 설정 파일과 의존성 선언 양쪽에서 부재함을 확인했다(measured-absent). substrate의 source 열거값에는 '확인된 부재'가 없어 설계자가 닫을 수 없다. 형태 카탈로그의 common 검사에는 quality.lint가 있어 이 부재는 릴리스 경로에 닿는다. 도입할 것인가?",
      "options": [
        "하네스 기본값대로 eslint + prettier를 도입한다(substrate source: default 유지)",
        "eslint만 도입하고 formatter는 두지 않는다",
        "둘 다 두지 않는다 — substrate에 lint·formatter를 value 'none' + declared로 명시하고 quality.lint receipt를 만들 수 없음을 감수한다"
      ],
      "recommended": "eslint + prettier를 도입한다 — FEAT 단위 티켓 14건이 병행될수록 형식 다툼 비용이 커지고, quality.lint receipt를 만들 유일한 경로다. 결정 전까지 substrate의 두 키는 하네스 기본값으로 채워지며 그것은 프로젝트 실측이 아니다.",
      "status": "confirmed"
    }
  ]
}
```
