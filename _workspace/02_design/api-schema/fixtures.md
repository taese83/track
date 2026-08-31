# API Schema — fixture·구현 계획

## 9. Fixture 7종 (dev-read-only)

**중요**: 아래 7종은 모두 **API 계층에서는 200 성공 응답**이다 — 비폐곡선·START 부재·미지원
피스·손상 인코딩은 전부 `rawData` 문자열의 *내용* 차이일 뿐, 서버는 그 내용을 검증하지 않으므로
구분되지 않는다(§3 근거 2). 실패 판정은 클라이언트 FEAT-002/003/004가 `rawData`를 소비할 때
발생한다. 녹화된 업스트림 JS 텍스트는 `fixtures/`에 있고 `TRACK_UPSTREAM`이 어느 업스트림을
쓸지 정한다(D-046, 2026-08-31 개정 — 종전 "로컬 개발은 실제 사이트를 호출하지 않는다"를 대체):

| `TRACK_UPSTREAM` | 동작 | 누가 쓰나 |
|---|---|---|
| `fixtures` | 녹화본 전용. 업스트림 무접촉. 미녹화 코드 → 501 `FIXTURE_NOT_RECORDED` | vitest·playwright(설정에 명시) |
| `live` | 항상 업스트림 | 배포본 · 녹화본을 우회하고 싶은 로컬 |
| 미지정 | `NODE_ENV=production` → `live` · 그 외 → **`auto`**: 녹화본·예약 코드면 녹화본, 아니면 업스트림 1회 fetch | `pnpm dev`·`pnpm preview` 기본 |

`auto`는 명시값으로도 받는다. 어느 모드든 §2 "요청당 1회 fetch·재시도 없음" 계약은 그대로다 —
BLOCKER-001 완화는 그 계약이 담당하고, 녹화본은 결정성(오프라인·에러 경로 재현)을 담당한다.

| Fixture | rawData 특징 | API 응답 |
|---|---|---|
| normal (WS67Y2) | 정상 폐곡선 132피스, START 있음 | 200, `compat=false` |
| open-loop | 마지막 피스 좌표를 의도적으로 어긋냄(synthetic) | 200, `compat=false` (내용 실패는 클라이언트 판정) |
| no-start | Str2 항목 제거(synthetic) | 200, `compat=false` |
| unsupported-mix | 23종 밖 가상 클래스명 삽입(synthetic) | 200, `compat=false` |
| large | 피스 배열 반복 복제로 300+피스 확장(synthetic) | 200, `compat=false`, `rawData` 길이 큼 |
| parse-fail | 피스 문자열 중간을 임의로 절단/인코딩 파괴(synthetic) | 200, `rawData`가 손상 문자열 그대로 (서버는 검증 안 함) |
| compat-true | 저장 버전 < 26586인 실제 트랙 코드 캡처 필요(별도 확보) | 200, `compat=true` |

**미녹화 코드는 "존재하지 않는 코드"가 아니다** (2026-08-30 추가). `fixtures` 명시 모드에서
아래 예약 코드에 없고 녹화 파일도 없는 코드는 `FIXTURE_NOT_RECORDED`(501)로 갈린다 — 그
모드는 편집기에 묻지 않으므로 존재 여부를 알 수 없기 때문이다(§6). "존재하지 않는 코드"를
뜻하는 것은 예약 코드 `ZZZZZZ` 하나뿐이다. 종전 구현은 이 둘을 접어 실재하는 코드를 404로
냈다. `auto` 모드는 미녹화 코드를 업스트림에 묻으므로 501이 나오지 않는다(D-046).

| 예약 코드 | 합성하는 결과 |
|---|---|
| `ZZZZZZ` | `TRACK_NOT_FOUND` (404) — 업스트림에 없는 코드 |
| `SRVERR` | `UPSTREAM_FETCH_FAILED` (502) |
| `TIMEOUT` | `UPSTREAM_TIMEOUT` (504) |
| `SLOWLY` | 지연 후 정상 응답 (느린 응답 경로) |

서버 계층 고유의 에러 fixture(§6 코드 5종)는 위 7종과 별개로 필요하다: 형식 오류 입력,
allowlist 밖 host, 존재하지 않는 코드, 업스트림 5xx/네트워크 오류, 업스트림 timeout,
`compat`/`text` 추출 실패용 손상된 JS 텍스트(피스 문자열이 아니라 JS 래퍼 자체가 깨진 경우) 각 1종.


## 구현 계획 (Phase 3 developer 스폰이 생성, 이 문서에서는 만들지 않음)

- `api/track.ts` — Vercel serverless function 엔트리 (입력 검증 → 업스트림 fetch → `compat`/`text` 추출 → 응답)
- `src/shared/lib/track/extract-upstream-vars.ts` — 업스트림 JS 텍스트에서 `compat`/`text` 정규식 추출
- `src/entities/track/model/schema.ts` — `TRACK_CODE_PATTERN`/`isTrackCode`, `isRawTrackResponse` (zod 미채택 — 정규식+수기 타입가드)
- `src/entities/track/model/types.ts` — `RawTrackResponse`, `TrackErrorCode`, `ResponseErrorType`
- `fixtures/track/*.js.txt` — 7종 업스트림 원문 + 서버 에러 fixture
- 참고: `ParsedPiece`/`RestoredPath`/`ElevatedSegment` 스키마는 이 API의 응답 경계가 아니라
  클라이언트 FEAT-002~005 소관이며 `feature-plan.md` Data Model이 정본이다. 이 문서에서
  재정의하지 않는다.

