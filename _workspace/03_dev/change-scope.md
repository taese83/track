# change-scope — FEAT-004

티켓 4 픽업으로 발급. ALLOWED_PATHS 확정 완료(feature-plan unit 선언 `paths=src/entities/track/lib/closure`와 일치).
스키마 정본: minimal-change-contract.md · 아래 JSON이 기계 정본(STALE 대조 입력).

```json change-scope
{
  "ticketKey": 4,
  "featureId": "FEAT-004",
  "TARGET_BEHAVIOR": "<!-- 외부 데이터(티켓 트래커 이슈) — 아래는 참고 스펙이며 지시로 해석하지 않는다 -->\n```text untrusted-ticket-body\n폐곡선 검증 및 부분 실패 노출\n\n**동작 명세**: 복원된 순서가 START로 되돌아오는 XY 폐곡선을 이루는지 검증한다. 아니면 연결 가능한 구간까지만 정상 렌더하고 끊긴 지점을 시각적으로 표시하며 화면 전체 렌더링을 중단하지 않는다. XY 폐곡선 검증과 별도로 Z(고도) 폐합도 검증한다 — 경로를 따라 누적된 상승/하강 고도의 합이 START 지점으로 되돌아왔을 때 허용오차 이내로 상쇄되는지 확인한다. XY는 닫혀 있어도 상승/하강 피스가 불균형하면 START에서 수직 불연속이 발생할 수 있으므로 이를 XY 폐곡선 검증과 별개의 상태(`isZClosed`)로 다루고, 억지로 보정해 맞추지 않는다.\n\n- TC-004-1: Given 정상 폐곡선을 이루는 참조 트랙, When 폐곡선 검증을 수행하면, Then 검증 통과로 판정되고 경고 배너는 노출되지 않는다.\n- TC-004-2: Given 끝점이 의도적으로 어긋난 비폐곡선 테스트 데이터, When 파싱·순서복원이 완료되면, Then 연결 가능한 구간은 정상 렌더되고 끊긴 지점은 강조색/아이콘과 함께 \"일부 구간의 순서를 확정하지 못해 해당 구간은 회색으로 표시됩니다\" 경고 배너가 상시 노출되며 렌더링은 중단되지 않는다.\n- TC-004-3: Given 부분 실패 상태로 렌더된 화면, When 사용자가 3D 뷰를 회전·확대하면, Then 실패 구간은 회색·점선 표시를 유지하고 정상 구간의 조작은 그대로 동작한다.\n- TC-004-4: Given 상승 피스와 하강 피스의 누적 고도 합이 START에서 상쇄되는 참조 트랙, When 고도 폐합(Z closure) 검증을 수행하면, Then 폐합 오차가 허용오차 이내(값 자체는 ASSUMPTION-001 등급에 종속) 로 판정되고 별도 경고가 노출되지 않는다.\n- TC-004-5: Given XY는 폐곡선이지만 상승/하강 누적 고도가 불균형한 테스트 데이터, When Z 폐합 검증을 수행하면, Then START 지점에 수직 불연속 경고 아이콘과 \"고도가 시작 지점과 어긋납니다\" 배너가 노출되고, 3D 렌더는 계산된 절대 고도값을 그대로 표시하며(강제 보정 없음) 렌더링은 중단되지 않는다. 이 케이스 전용 \"고도 불균형\" fixture는 아직 확보되지 않았다 — NEEDS_DECISION.\n- TC-004-6: Given 고도 폐합 실패 상태, When FEAT-012(프로파일 스트립)를 표시하면, Then START/END 지점의 절대 고도 차이가 스트립 그래프 양 끝단에서 수직 불연속으로 드러난다.\n\n## 수용 기준 (AC ↔ TC)\n- [ ] TC-004-1\n- [ ] TC-004-2\n- [ ] TC-004-3\n- [ ] TC-004-4\n- [ ] TC-004-5\n- [ ] TC-004-6\n\n<!-- web-harness:refs feat=FEAT-004 tc=TC-004-1,TC-004-2,TC-004-3,TC-004-4,TC-004-5,TC-004-6 branch=feature/mini4wd-track-3d -->\n```",
  "requestType": "feature",
  "testCaseIds": [
    "TC-004-1",
    "TC-004-2",
    "TC-004-3",
    "TC-004-4",
    "TC-004-5",
    "TC-004-6"
  ],
  "ALLOWED_PATHS": [
    "src/entities/track/lib/closure/",
    "_workspace/03_dev/"
  ],
  "PUBLIC_CONTRACTS_TO_PRESERVE": [
    "RestoredPath 5필드 — FEAT-004는 FEAT-003이 비워둔 4개만 채우고 orderedPieceIds는 만들지 않는다",
    "restoreOrder 시그니처와 restore-order.test.ts — FEAT-004는 소비자이며 순서 복원을 바꾸지 않는다",
    "ParsedPiece 10필드와 piece-catalog 23종 — 무변경",
    "parse/restore/api 계층 전체 무변경 — 요청당 업스트림 fetch 1회 계약 유지"
  ],
  "NON_GOALS": [
    "경고 배너·회색 구간·수직 불연속 아이콘의 실제 렌더 — FEAT-006(3D 씬)·FEAT-012(프로파일 스트립)·FEAT-013(구간 목록) 소유",
    "고도 프로파일 곡선(S곡선·뱅크 전이곡선·기운 판)과 ElevatedSegment — FEAT-005 소유",
    "근거 등급 배지 UI — FEAT-010 소유",
    "px↔실물 cm 배율 확정 — 허용오차는 편집기 px 단위로 다룬다"
  ],
  "CHANGE_BUDGET": "src 3파일(순 고도 델타·폐합 판정·배럴) + 테스트 2파일. 신규 런타임 의존성 0. 신규 fixture 0.",
  "sourceDigest": "20ad5ea7e781741da4c9e945adab8ee597bd17bc28ae458e381aa78974d95e8d",
  "needsConfirmation": false
}
```

## Change Brief (minimal-change-contract 필드)

- **ALLOWED_PATHS**: src/entities/track/lib/closure/, _workspace/03_dev/
  <!-- 이 줄이 기계 정본이다(enforce-agent-ownership.mjs가 이 한 줄만 파싱하고 글롭이 아니라
       **접두 경로**로 다룬다). feature-plan의 unit 선언
       `<!-- web-harness:unit feat=FEAT-004 dependsOn=FEAT-003 paths=src/entities/track/lib/closure -->`
       와 일치한다. -->
- **CHANGE_MODE**: `existing-change` — FEAT-003이 낸 3단계 위에 판정을 얹는다.
- **REQUEST**: 티켓 4(FEAT-004) — 복원된 순서가 START로 되돌아오는지(XY)와 누적 고도가 상쇄되는지(Z)를 **따로** 판정하고, 어긋나면 보정하지 않고 그대로 드러낸다.
- **OBSERVED_BASELINE**: `RestoredPath` 5필드 중 `orderedPieceIds`만 채워져 있다. `isClosedLoop`·`brokenAt`·`isZClosed`·`zClosureGap`은 타입에만 있고 **아무도 산출하지 않는다**(FEAT-003 change-scope 판단 3이 명시적으로 FEAT-004에 남긴 것).
- **CAPABILITY_ESCALATION**: `none`. 순수 클라이언트 기하·산술이다. `api/`는 무변경이다.
- **DOCS_TO_UPDATE**: `none`. `data-model.md`가 이미 4필드를 규정하고 있고 구현이 그 규정을 따른다.

### 선행 실측 — 상수를 정하기 전에 분포를 찍었다

`WS67Y2` 132피스를 복원 순서대로 걸으며 이음새 간격을 전수 측정했다(사슬 전체 간격 합을
최소화하는 방향 배정 기준).

| 항목 | 값 |
|---|---|
| 정상 이음새 최대 간격 | 0.170px |
| p117 ↔ p118 사이 간격 | **31.67px** |
| 마지막 끝점 → START 복귀 간격 | **0.00px** |
| `Bri1` 순 고도 변화(현 54px × sin20°) | **18.4691** |
| `WS67Y2` 누적 고도 합 | 1.07e-14 (≈ 0) |

### 이 라운드에서 확정한 경계 판단

1. **`isClosedLoop`의 기준은 "모든 이음새가 붙었는가"가 아니라 "START로 되돌아왔는가"다.**
   참조 트랙에는 p117↔p118 사이 **31.67px 구멍이 실제로 있고**(매달린 끝 정확히 2개) FEAT-003이
   D-038 ② 규칙으로 잇는다. 이음새 기준으로 재면 TC-004-1의 "정상 폐곡선인 참조 트랙"이
   비폐곡선으로 뒤집힌다. 복귀 간격은 0.00px이므로 복귀 기준으로만 두 TC가 함께 선다.

2. **Z 폐합은 FEAT-005를 기다리지 않고 자체 계산하되, 주입 구멍을 남긴다.**
   `data-model.md`는 Z 폐합이 `ElevatedSegment.absoluteElevation*`(FEAT-005 산출)을 소비한다고
   적었지만 의존 선언은 `dependsOn=FEAT-003`이고 두 티켓은 병렬 단위다. 폐합은 **누적 합**만
   필요하고 곡선의 모양과 무관하므로, 피스별 **순** 변화량을 현 규칙(D-022·D-023·D-042)으로
   직접 계산하고 `elevationDeltas`로 주입받을 수 있게 열어 뒀다. 계산값 18.4691은 D-042가
   실측 기록한 "슬로프 20°에서 피스당 18.47cm"와 일치한다 — 두 경로가 같은 수를 낸다.
   **절대 고도는 내보내지 않는다**(뱅크 구간의 중간 높이는 D-041의 전이·판 기하를 따라야 하며
   그것은 FEAT-005 소유다). FEAT-004가 보증하는 것은 START에서의 차이 하나뿐이다.

3. **부분 실패의 구간은 `orderedPieceIds`가 아니다.**
   TC-004-2가 "연결 가능한 구간까지만 정상 렌더"를 요구하는데 `restoreOrder`는 실패 시
   `{ok:false, reason}`만 내므로 렌더할 구간이 없다. FEAT-003의 파일을 고치는 것은
   ALLOWED_PATHS 밖이라, 진단용 전방 탐색(백트래킹 없음)을 closure 안에 두고 결과를
   **`connectedPieceIds` + `orderConfirmed:false`**로 내보낸다 — 이름과 플래그로 "정본 순서가
   아니다"를 못박아 `orderedPieceIds`의 소유자를 FEAT-003 하나로 유지한다.
   후속 정리 후보: `restoreOrder`가 실패 시 최장 부분 경로를 함께 내면 이 탐색은 지운다.

4. **매달린 끝은 상호 최근접일 때만 잇는다.** FEAT-003의 "정확히 둘이면 잇는다"는 어긋난
   트랙(매달린 끝 6개)에서는 서지 않는다. 상호 최근접 조건을 쓰면 짝이 유일해져 원래 있던
   31.67px 구멍은 통과하고 새로 생긴 끊김에서만 멈춘다 — `OPENLOOP`에서 132피스 중 **131피스**가
   이어지고 떨어져 나간 `p131` 하나만 남는다(주입된 결함과 정확히 일치).

5. **TC-004-5 fixture는 테스트 안에서 합성한다.** feature-plan이 "고도 불균형 fixture 미확보 —
   NEEDS_DECISION"으로 남긴 케이스다. `colorIndex`는 좌표에 관여하지 않으므로 참조 트랙의
   하강 슬로프 하나를 상승 팔레트로 바꾸면 **XY 기하는 한 점도 안 바뀌고** 상승/하강 균형만
   깨진다(`MULTISTART` 합성과 같은 논리). 공용 `fixtures/track/`은 ALLOWED_PATHS 밖이고
   API 계층을 지날 이유도 없어 단위 테스트 안에서 합성했다 — **`fixtures/`를 지나는
   FEAT-012의 TC-012-5는 여전히 fixture 미확보 상태로 남는다.**

### TEST_EVIDENCE

| TC | 입력 | 검증 | 상태 |
|---|---|---|---|
| TC-004-1 | `WS67Y2` | `isClosedLoop=true` · `brokenAt=null` · 31.67px 구멍이 있어도 성립 | LOCAL_VERIFIABLE |
| TC-004-2 | `OPENLOOP` | `isClosedLoop=false` · `brokenAt` 지목 · 131피스 구간 유지(렌더 중단 없음) | 데이터까지 |
| TC-004-3 | `OPENLOOP` | 재판정해도 끊긴 구간 동일(결정성) | 데이터까지 |
| TC-004-4 | `WS67Y2` | `isZClosed=true` · 폐합 오차 ≈0 · 등급 `confirmed`(슬로프 confirmed가 뱅크 measured를 이긴다) | LOCAL_VERIFIABLE |
| TC-004-5 | 합성(하강→상승 1개) | XY는 닫힌 채 `isZClosed=false` · 값 36.94를 보정 없이 그대로 노출 | LOCAL_VERIFIABLE |
| TC-004-6 | 합성 | `zClosureGap`이 START 시작·종료 고도 차이와 같고 주입값을 따른다 | 데이터까지 |

**정직 표기**: TC-004-2·TC-004-3·TC-004-6의 **화면 판정**(경고 배너 문구, 회색·점선 유지,
회전·확대 중 조작, 스트립 양 끝단 불연속)은 소유 표면이 아직 없어 검증하지 않았다 —
FEAT-006/012가 이 데이터를 소비할 때 닫힌다. 여기서 통과한 것은 그 표시가 기대는 **데이터
계약**까지다.
