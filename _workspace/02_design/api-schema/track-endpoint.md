# API Schema — /api/track

## 범위

- 엔드포인트 1개: `GET /api/track` (Vercel serverless function, Node 런타임)
- DB·인증·mutation 없음. 외부 편집기 사이트를 그대로 프록시하지 않고, 코드로 재조립한
  고정 URL만 서버가 직접 fetch한다.
- `WEB_PROFILE = vite-serverless-hybrid`
- 응답 타입은 `feature-plan.md` Data Model 1단계에서 이미 확정된 `RawTrackResponse`를
  **그대로 재사용**한다 — 이 문서는 그 타입을 재정의하지 않고, 그 위에 envelope·에러·캐시·
  접근 계약만 얹는다(중복 타입 방지).


## Endpoints

| Method | Path | Description | Request Params | Response Type |
|---|---|---|---|---|
| GET | /api/track | 공유 URL/코드로 트랙 원문 조회 | `url: string` (query, URL 또는 코드) | `RawTrackResponse` |


## 1. 입력 스키마 및 검증

```ts
// src/entities/track/model/schema.ts (계획)
// zod 미채택 — tech-stack.md Architecture Decisions "폼" 결정을 따른다(2026-08-30 재확인).
// 런타임 스키마 라이브러리 없이 정규식 + 수기 타입가드로 검증한다.
const TRACK_CODE_PATTERN = /^[A-Z0-9]{4,10}$/
// 근거: 실측 예시 WS67Y2(6자). 정확한 길이 규격 미확인 — 보수적으로 4~10자 대문자 영숫자만 허용.
export const isTrackCode = (v: string): boolean => TRACK_CODE_PATTERN.test(v)

const ALLOWED_HOST = 'mini4wd-track-editor.pimentoso.com'

function extractCode(rawUrlParam: string): string | null {
  const upper = rawUrlParam.trim().toUpperCase()
  if (isTrackCode(upper)) return upper // 바로 코드로 온 경우(편의 입력)
  try {
    const u = new URL(rawUrlParam) // REQ-F-005 기준 정형 입력은 .../view/{CODE}
    if (u.hostname !== ALLOWED_HOST) return null // 서브도메인/유사 호스트 우회 금지 — 정확 일치만
    const seg = u.pathname.split('/').filter(Boolean).pop()?.toUpperCase()
    return seg && isTrackCode(seg) ? seg : null
  } catch {
    return null
  }
}
```

**핵심 계약**: 서버는 사용자가 준 URL을 그대로 fetch하지 않는다. 코드만 추출해
`https://mini4wd-track-editor.pimentoso.com/load/{CODE}.js`를 서버가 직접 조립·fetch한다
(임의 프록시·SSRF 차단). 코드 추출에 실패하면 `INVALID_INPUT_FORMAT`(400)이며, 이때 업스트림
fetch는 발생하지 않는다.


## 2. 외부 호출 계약

| 항목 | 값 |
|---|---|
| 대상 | `https://mini4wd-track-editor.pimentoso.com/load/{CODE}.js` (host allowlist 고정, 정확 일치) |
| 필수 헤더 | `X-Requested-With: XMLHttpRequest` (없으면 편집기가 422 반환 → `UPSTREAM_FETCH_FAILED`) |
| User-Agent | 식별 가능한 값, 예: `mini4wd-track-3d/1.0 (+<repo-or-site-url>; contact:<email>)` (REQ-F-019 c) |
| 호출 횟수 | 사용자 요청 1회당 업스트림 fetch 정확히 1회. 자동 재시도·백오프·프리페치·크롤링 금지(REQ-F-019 a) |
| 타임아웃 | 고정 timeout(예: 8s) 초과 시 즉시 `UPSTREAM_TIMEOUT`, 재시도 없음 |
| 출처 링크 | 화면에 원본 편집기 링크 상시 노출은 클라이언트(FEAT-001) 책임이며 이 API 계약이 아니다(REQ-F-019 d) |

이 표는 BLOCKER-001(개인 운영 사이트 부하) 완화 장치이며 구현체가 임의로 완화·강화할 수 없다.


## 3. 응답 형태 결정 (근거)

**서버는 피스 문자열을 파싱하지 않는다.** `text`(피스 목록 원문)를 그대로 `rawData`에 담아
넘긴다. 근거:

1. `feature-plan.md` Data Model이 이미 파이프라인을 4단계로 분리했다 — 1단계
   `RawTrackResponse`(서버 fetch 출력)는 `rawData: string`만 갖고, 피스 배열(`ParsedPiece[]`)은
   2단계(FEAT-002, 클라이언트)의 출력이다. API가 피스 배열을 직접 반환하면 이미 확정된 타입
   경계를 어기고 두 개의 서로 다른 "정답" 스키마가 생긴다.
2. 진행 순서 복원(FEAT-003)·폐곡선 검증(FEAT-004)·compat 보정 적용(FEAT-006)은 모두
   클라이언트 파이프라인 단계로 이미 배정돼 있다 — 서버가 선제적으로 검증·보정하면 그 결과와
   클라이언트 재계산 결과가 어긋날 경우 "어느 쪽이 진실인지" 불명확해진다.
3. compat 보정은 좌표 자체를 바꾸는 연산이다. 서버가 원좌표를 변형해 내려보내면 REQ-F-021 검증
   (compat=true fixture로 Cor1 배치 보정 여부 확인)이 서버·클라이언트 어느 계층의 버그인지
   구분할 수 없어진다. **서버는 `compat: boolean`만 그대로 전달하고 절대 보정을 적용하지 않는다**
   — 이 불변식으로 "보정 적용 여부"가 응답에 드러난다(REQ-F-021): `compat=true`이면 클라이언트가
   반드시 보정을 적용해야 한다는 뜻이고, 서버가 이미 적용했을 가능성은 계약상 0이다.


## 4. Runtime Schema

```ts
// src/entities/track/model/types.ts — 타입 정본(수기 선언, z.infer 미사용)
export interface RawTrackResponse {
  trackCode: string // §1 TRACK_CODE_PATTERN 충족
  rawData: string   // "클래스;x;y;각도;색" 을 '#'로 이은 원본 문자열, 검증 없이 통과. 빈 문자열 아님
  fetchedAt: string // 캐시 판단용(REQ-F-019 b-1), UTC 오프셋 포함 ISO 8601
  compat: boolean   // parseInt(저장버전) < COMPATIBILITY_ID(26586)
}

// src/entities/track/model/schema.ts — 수기 타입가드(zod 미채택)
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export function isRawTrackResponse(v: unknown): v is RawTrackResponse {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.trackCode === 'string' && isTrackCode(o.trackCode) &&
    typeof o.rawData === 'string' && o.rawData.length > 0 &&
    typeof o.fetchedAt === 'string' && ISO_WITH_OFFSET.test(o.fetchedAt) &&
    typeof o.compat === 'boolean'
  )
}
```

**검증 강도 공시(zod 대체의 정직한 간극)**: `ISO_WITH_OFFSET`은 형식만 본다 — `2026-13-45T99:99:99Z`
같은 형식-합치·값-불성립 문자열을 통과시킨다(zod의 `z.iso.datetime({offset:true})`도 파서 구현에
따라 다르므로 "동등"이라 주장하지 않는다). 값 범위까지 필요하면 `Date.parse` 결과의 유한성 검사를
덧대야 하며, 이 가드는 그 수준을 강제하지 않는다. 이 응답의 **유일한 생산자가 우리 서버 함수**이므로
이 가드는 신뢰 경계 검증이 아니라 자체 버그·응답 변형에 대한 방어적 체크다 — 업스트림 원문 검증은
§4 아래 정규식 추출과 `UPSTREAM_RESPONSE_UNRECOGNIZED`가 담당한다.

업스트림 JS 텍스트에서 `compat`/`text` 두 변수를 뽑아내는 것은 **정규식 추출**이지 피스 파싱이
아니다(`const COMPATIBILITY_ID`, `var compat = ...`, `var text = '...'` 3개 라인만 매칭). 이
추출 자체가 실패하면(편집기가 응답 포맷을 바꾼 경우) `UPSTREAM_RESPONSE_UNRECOGNIZED`로 구분한다
— REQ-F-011(피스 인코딩 파싱 실패)과는 다른 계층의 실패이며 클라이언트 FEAT-002가 담당하는
파싱 실패가 아니다.


## 5. 성공 응답

```ts
type ResponseSuccessType<T> = { statusCode: 200; isSuccess: true; data: T }
// GET /api/track -> ResponseSuccessType<RawTrackResponse>
```

