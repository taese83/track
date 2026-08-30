# fixtures/track — 녹화된 업스트림 원문

`GET https://mini4wd-track-editor.pimentoso.com/load/{CODE}.js`의 응답 본문을 그대로 녹화한
파일이다. 로컬 개발·테스트는 실제 사이트를 호출하지 않고 이 파일들을 읽는다 —
api-schema §2 "사용자 요청 1회당 업스트림 fetch 정확히 1회, 크롤링 금지" 계약을 개발 중에도
지키기 위함이다(BLOCKER-001 완화 장치).

`api/track.ts`는 `TRACK_UPSTREAM=fixtures`일 때(개발·테스트 기본값) 이 디렉터리를 업스트림
대신 읽는다. 파일명은 `{TRACK_CODE}.js.txt`이고, 여기 없는 코드는 `TRACK_NOT_FOUND`(404)다.

| 파일 | 성격 | rawData 특징 | API 응답 |
|---|---|---|---|
| `WS67Y2.js.txt` | measured (2026-08-28 실측 원문) | 정상 폐곡선 132피스, START 있음 | 200, `compat=false` |
| `COMPAT1.js.txt` | synthetic | WS67Y2 원문 + 저장 버전만 12345로 낮춤 | 200, `compat=true` |
| `OPENLOOP.js.txt` | synthetic | 마지막 피스 좌표를 의도적으로 어긋냄 | 200 (비폐곡선 판정은 클라이언트 FEAT-004) |
| `NOSTART.js.txt` | synthetic | `Str2`(START) 항목 제거, 131피스 | 200 (판정은 FEAT-003) |
| `MULTISTART.js.txt` | synthetic | WS67Y2 원문의 raw #6 `Str1`을 `Str2`로 교체, 132피스에 START 2개(raw #6·#81) | 200, `compat=false` |
| `UNSUPP.js.txt` | synthetic | 23종 밖 가상 클래스(`Xyz9`/`Wob2`) 삽입 | 200 (판정은 FEAT-009) |
| `LARGE1.js.txt` | synthetic | 피스 반복 복제로 304피스 | 200 (완화는 FEAT-011) |
| `PARSEFAIL.js.txt` | synthetic | 피스 문자열 중간 파괴 + 말미 절단 | 200 (파싱 실패 판정은 FEAT-002) |
| `EMPTY1.js.txt` | synthetic | `text`가 `'#'` 한 글자, 피스 0개 | 200 (0피스 판정은 FEAT-002) |
| `BADJS.js.txt` | synthetic | JS 래퍼 자체가 깨짐(`text` 변수 없음) | **502 `UPSTREAM_RESPONSE_UNRECOGNIZED`** |

`COMPAT1`은 실제 compat=true 트랙 코드를 확보하지 못해 원문의 저장 버전만 바꾼 합성본이다 —
compat 분기 로직은 검증하지만 "실제 구버전 트랙의 좌표"를 재현하지는 않는다(FEAT-002/006이
실캡처를 확보하면 교체 대상).

`MULTISTART`는 `WS67Y2` 원문에서 raw #6 `Str1;199.039;680.984;0;0`의 클래스만 `Str2`로 바꾼
합성본이다. `Str1`과 `Str2`는 끝점 오프셋이 `[-27,0]`/`[27,0]`으로 같아 **기하는 한 점도 바뀌지
않고 START 후보만 1개에서 2개로 는다** — 그래서 이 합성이 안전하다. 132피스·`compat=false`는
원본 그대로이며, 복원은 여전히 132피스 순서를 내되 START 선택 근거만 `only-start-piece`에서
`first-start-piece-in-input`으로 갈린다.

`EMPTY1`의 `text`가 빈 문자열이 아니라 `'#'`인 것은 의도다 — 빈 문자열은 `extractUpstreamVars`가
`text-empty`로 잡아 502가 되므로 파서에 닿지 못한다. `'#'`은 길이 1이라 API를 통과하고 파싱
단계에서 0피스가 된다.

`BADJS`를 뺀 9종은 전부 API 계층에서 **200 성공**이다. 비폐곡선·START 부재·미지원 피스·손상
인코딩은 모두 `rawData` 문자열의 *내용* 차이일 뿐이고 서버는 그 내용을 검증하지 않는다
(api-schema §3). 실패 판정은 클라이언트 파이프라인의 몫이다.

에러 fixture 중 파일로 녹화할 수 없는 것(존재하지 않는 코드·업스트림 5xx·timeout)은
`api/track.ts`의 fixture 모드가 예약 코드로 합성한다: `ZZZZZZ`(존재하지 않는 코드 → 404),
`SRVERR`(업스트림 503), `TIMEOUT`(응답 지연 → 504).

**여기 없고 예약 코드도 아닌 코드는 404가 아니다.** `FIXTURE_NOT_RECORDED`(501)로 갈린다 —
fixture 모드는 편집기를 호출하지 않으므로 그 트랙이 실제로 있는지 **알 수 없기 때문**이다.
404로 접으면 화면이 실재하는 코드에 대고 "코드가 맞는지 확인해 주세요"라고 말하게 된다
(2026-08-30 실측: `FTSBH1`은 업스트림 200·3343B인데 로컬에서 404였다).
