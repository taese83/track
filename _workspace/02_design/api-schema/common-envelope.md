# API Schema — 공통 봉투·에러·캐시·단위

## 6. 에러 봉투

```ts
// src/entities/track/model/types.ts (계획)
type ResponseErrorType = { statusCode: number; isSuccess: false; code: TrackErrorCode; message: string }
type TrackErrorCode =
  | 'INVALID_INPUT_FORMAT'          // 400 — 코드/URL 형식 불일치, allowlist 밖 host 포함 (REQ-F-009 전반)
  | 'TRACK_NOT_FOUND'                // 404 — 존재하지 않는 코드 (REQ-F-009 후반)
  | 'UPSTREAM_FETCH_FAILED'          // 502 — 편집기 비-2xx 응답(422 CSRF 포함) 또는 네트워크 오류 (REQ-F-010)
  | 'UPSTREAM_TIMEOUT'               // 504 — 고정 timeout 초과 (REQ-F-010)
  | 'UPSTREAM_RESPONSE_UNRECOGNIZED' // 502 — compat/text 변수 추출 실패(편집기 응답 포맷 변경 등)
  | 'FIXTURE_NOT_RECORDED'           // 501 — 로컬 fixture 모드 전용. 녹화본 부재 (2026-08-30 추가)
  | 'INTERNAL_ERROR'                 // 500 — 위 어디에도 속하지 않는 예외
```

**`FIXTURE_NOT_RECORDED`는 왜 `TRACK_NOT_FOUND`와 갈라져 있는가** (2026-08-30 추가, 코드 7종):
로컬 fixture 모드는 편집기를 호출하지 않는다(§9). 그래서 녹화본이 없는 코드에 대해 서버는
**존재 여부를 알지 못한다**. 종전 구현은 파일 읽기 실패를 전부 `TRACK_NOT_FOUND`로 접었고,
화면은 실재하는 코드에 대고 "코드가 맞는지 확인해 주세요"라고 말했다(실측: `FTSBH1`은
업스트림 200·3343B인데 로컬에서 404). **묻지 않은 것을 안다고 말하지 않는다** — 이 코드는
"녹화본이 없어 조회하지 않았다"만 주장한다.

- production(`NODE_ENV=production` 또는 `TRACK_UPSTREAM=live`)에서는 **발생하지 않는다**.
  실제 fetch 경로는 업스트림 404만 `TRACK_NOT_FOUND`로 옮긴다.
- "존재하지 않는 코드"는 §9가 규정한 대로 **예약 fixture 1종**(`ZZZZZZ`)이 담당한다.
- 501을 쓴 이유: 이 조회는 요청이 잘못돼서가 아니라 **이 환경이 그 기능을 갖추지 않아서**
  수행되지 않았다. 4xx는 요청 탓으로 읽히고, 502/504는 업스트림과 대화했다는 뜻이 된다.

**REQ-F-011(피스 인코딩 파싱 실패)은 이 API의 에러가 아니다** — `rawData`는 손상됐어도
그대로 200으로 통과하며, 실패 판정은 클라이언트 FEAT-002(`ParsedPiece[]` 생성)의 몫이다.
같은 이유로 REQ-F-007(비폐곡선)·REQ-F-008(미지원 피스)도 이 API 계층에서는 발생하지 않는다
(FEAT-003/004/009 소관). 클라이언트는 `code`만으로 문구를 분기하고 `message`는 로그용이다.


## 7. 캐시 헤더 계약

| 계층 | 정책 | 성격 |
|---|---|---|
| 서버 응답 헤더(200) | `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` | best-effort, 강제 아님 (REQ-F-019 b-2) |
| 서버 응답 헤더(4xx/5xx) | `Cache-Control: no-store` | 에러 응답은 캐시 금지 |
| 클라이언트 세션 인메모리 캐시 | `trackCode → RawTrackResponse` 매핑을 탭 세션 동안 보관, 동일 코드 재조회 시 fetch 0건 | **결정적 층. 서버 계약이 아니라 클라이언트 구현 책임**(REQ-F-019 b-1, TC-001-6) |

서버는 `s-maxage`를 "보장"하지 않는다(CDN 미스·POP 미스·재배포·콜드스타트 시 재fetch 가능,
TC-001-8은 콜드 캐시 재fetch를 결함으로 보지 않는다). 사용자 행동당 1회 fetch를 실제로
보장하는 것은 클라이언트 캐시(b-1)다. `fetchedAt`은 이 클라이언트 캐시 판단의 재료로만 쓰이고
서버가 TTL을 강제하지 않는다.


## 8. 단위 계약

응답에 물리 단위(m, cm)는 없다. `rawData`의 `x`/`y`/`angle` 필드는 편집기 원단위·px 좌표
그대로이며, 등급 배지·실측 환산은 클라이언트(R2)가 담당한다. 서버는 임의로 스케일을 곱하거나
반올림하지 않는다.

