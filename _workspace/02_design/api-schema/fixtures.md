# API Schema — fixture·구현 계획

## 9. Fixture 7종 (dev-read-only)

**중요**: 아래 7종은 모두 **API 계층에서는 200 성공 응답**이다 — 비폐곡선·START 부재·미지원
피스·손상 인코딩은 전부 `rawData` 문자열의 *내용* 차이일 뿐, 서버는 그 내용을 검증하지 않으므로
구분되지 않는다(§3 근거 2). 실패 판정은 클라이언트 FEAT-002/003/004가 `rawData`를 소비할 때
발생한다. 로컬 개발에서는 실제 사이트를 호출하지 않고 녹화된 업스트림 JS 텍스트를 `fixtures/`에서
읽어 대체한다(§2 "1회 fetch" 계약을 개발 중에도 지키기 위함).

| Fixture | rawData 특징 | API 응답 |
|---|---|---|
| normal (WS67Y2) | 정상 폐곡선 132피스, START 있음 | 200, `compat=false` |
| open-loop | 마지막 피스 좌표를 의도적으로 어긋냄(synthetic) | 200, `compat=false` (내용 실패는 클라이언트 판정) |
| no-start | Str2 항목 제거(synthetic) | 200, `compat=false` |
| unsupported-mix | 23종 밖 가상 클래스명 삽입(synthetic) | 200, `compat=false` |
| large | 피스 배열 반복 복제로 300+피스 확장(synthetic) | 200, `compat=false`, `rawData` 길이 큼 |
| parse-fail | 피스 문자열 중간을 임의로 절단/인코딩 파괴(synthetic) | 200, `rawData`가 손상 문자열 그대로 (서버는 검증 안 함) |
| compat-true | 저장 버전 < 26586인 실제 트랙 코드 캡처 필요(별도 확보) | 200, `compat=true` |

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

