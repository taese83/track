# Piece Geometry — 피스 끝점 카탈로그 (구현 정본)

FEAT-002가 `ParsedPiece.vertex1/vertex2`를 산출하는 데 필요한 **로컬 끝점 오프셋 23종**이다.
`00_source/track-editor-data-model.md`의 피스 카탈로그(`w`/`h`/`l`/`colors`)는 끝점 오프셋을
담지 않고, 실측 수치는 그동안 `02_design/preview/store.js`에만 있었다. Phase 3은 preview
HTML/CSS/JS를 구현 입력으로 전달하는 것을 금지하므로(`phase-3-development.md`), 그 수치를
구현이 참조할 수 있는 정본 위치로 **승격**한다. 값은 원본 그대로이며 새 결정을 만들지 않는다.

## 좌표 계약

편집기 `viewer.js`의 `Sprite.prototype.getVertex1 = position.clone().add(rvertex1)`.
즉 **끝점(절대) = position + rotate(vertex, angleDeg)** 이고, 회전은 **원점 기준**이며
`position` 가산은 회전 **뒤**다. 순서를 바꾸면 좌표가 어긋난다.

```
rotate([x, y], deg) = [x·cos θ − y·sin θ,  x·sin θ + y·cos θ],  θ = deg × π / 180
vertex1_abs = { x: piece.x + rotate(v1, angleDeg).x,  y: piece.y + rotate(v1, angleDeg).y }
vertex2_abs = { x: piece.x + rotate(v2, angleDeg).x,  y: piece.y + rotate(v2, angleDeg).y }
```

단위는 편집기 px다(실물 cm 환산은 미해결 — `00_source/piece-dimensions.md` "스케일 미해결").
`vertex2`가 **local +x 쪽**이며 START(`Str2`)에서 화살표가 가리키는 방향이다(FEAT-003 D-038 ①).

## 카탈로그 (23종)

| pieceClass | label | vertex1 [x, y] | vertex2 [x, y] |
|---|---|---|---|
| `Str1` | straight | [-27, 0] | [27, 0] |
| `Str2` | **start** | [-27, 0] | [27, 0] |
| `Str3` | 1/4 straight | [-15, 0] | [15, 0] |
| `Str4` | 1/2 straight | [-30, 0] | [30, 0] |
| `Str5` | 3/4 straight | [-45, 0] | [45, 0] |
| `Str6` | straight | [-60, 0] | [60, 0] |
| `Cor1` | 45° corner | [-26, -8] | [12.2, 7.8] |
| `Cor2` | 45° corner | [-36, -6] | [6.42, 11.58] |
| `Cor3` | 90° corner | [-45, -15] | [15, 45] |
| `Cor4` | digital curve | [-45, -15] | [15, 45] |
| `Cor5` | r2100 curve | [-105, -75] | [75, 105] |
| `Ban1` | **bank** | [-14, 0] | [14, 0] |
| `Ban2` | bank | [-27, 0] | [27, 0] |
| `Bri1` | **slope** | [-27, 0] | [27, 0] |
| `Bri2` | jump | [-27, 0] | [27, 0] |
| `Bri3` | 1/2 slope | [-30, 0] | [30, 0] |
| `Bri4` | slope | [-60, 0] | [60, 0] |
| `Lan1` | **lane changer** | [-81, 0] | [81, 0] |
| `Lan2` | rainbow changer | [-90, -54] | [-90, 54] |
| `Lan3` | burning changer | [-45, -60] | [-45, 60] |
| `Lan4` | lane changer | [-120, 0] | [120, 0] |
| `Chi1` | **wave** | [-27, 3] | [27, 3] |
| `Chi2` | wave | [-60, 6] | [60, 6] |

이 표의 23종이 `ParsedPiece.isSupported === true`의 판정 집합이다(FEAT-009 소비).
표 밖 클래스는 `isSupported: false`이고, 끝점을 알 수 없으므로 **좌표를 지어내지 않는다** —
`vertex1 = vertex2 = { x, y }`(피스 position)로 두고 미지원임을 드러낸다.

## compat 위치 보정 (REQ-F-021)

`00_source/track-editor-data-model.md` §응답 형태:

> `compat` — 트랙 저장 시점 버전이 `COMPATIBILITY_ID`(26586)보다 오래됐는지. **true이면 `Cor1`의
> 45°/135°/225°/315° 배치에 위치 보정(`Point(11.1, 4.88).rotate(angle)`)이 더해진다.**

FEAT-002는 **보정을 적용하지 않는다** — 해당 피스에 `compatCorrectionApplied: true` 메타데이터만
부여하고, 실제 좌표 가산은 배치 단계인 FEAT-006이 소비한다(`data-model.md` 인접 상호작용).
보정 대상 판정: `pieceClass === 'Cor1'` **그리고** `angleDeg ∈ {45, 135, 225, 315}` **그리고**
응답 `compat === true`. 셋 중 하나라도 아니면 메타데이터를 부여하지 않는다.

## 근거 등급

| 항목 | 등급 | 근거 |
|---|---|---|
| 끝점 오프셋 23종 | `measured` | 편집기 `viewer.js` 카탈로그 실측 (decision-log PC-006) |
| 좌표 계약(회전 후 position 가산) | `measured` | `Sprite.prototype.getVertex1` 원문 |
| compat 보정 벡터 `(11.1, 4.88)` | `measured` | 편집기 응답 스크립트 원문 (`00_source`) |
| px ↔ 실물 cm 배율 | `unknown` | `00_source/piece-dimensions.md` "스케일 미해결" — FEAT-002 범위 밖 |

**교차 확인**: 이 카탈로그로 실 WS67Y2 132피스의 끝점을 계산했을 때 끝점 264개 중 262개가
0.5cm 이내에 짝을 가졌고(decision-log PC-001~005), 승인된 디자인 프리뷰가 같은 값으로
132피스 폐곡선을 복원했다(PC-006). 카탈로그가 틀렸다면 두 결과 모두 성립하지 않는다.
