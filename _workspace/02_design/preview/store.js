import { endTangents } from './geom3d.js'

// store.js — in-memory 도메인 store (mini4wd-track-3d 프리뷰)
// 실제 fetch/DB/three.js 없음. 메모리 state + fixture로 Feature List의 동작을 실제 수행한다.
// 참조: component-spec/shared.md §공유 커서 계약, feature-plan/specs-*.md TC 정의.

// ---------------------------------------------------------------------------
// 1. 피스 지오메트리 — 실제 "class;x;y;angle;color" 원본 문자열을 만들고, 그 문자열을
//    실제로 파싱(parseTrackString)해 되돌린 결과를 앱이 사용한다(왕복 검증, TC-002-1).
// ---------------------------------------------------------------------------

// 축약 참조 트랙(WS67Y2 축약, 30피스). 실제 132피스 대신 20~30피스로 축약하되
// 슬로프·뱅크·레인체인지·웨이브·미지원 피스를 각각 최소 1개 포함한다.
// x,y는 타원형 폐곡선 위에 프로그램적으로 배치한다(진짜 트랙 좌표 대신 형상 근사).
const TOTAL = 30
const RX = 260
const RY = 150

function ellipsePoint(i, total) {
  const t = (i / total) * Math.PI * 2
  return { x: Math.cos(t) * RX, y: Math.sin(t) * RY, angleDeg: (t * 180) / Math.PI }
}

// pieceType, segmentKind(widgets.md SegmentKind), direction(rise/fall/null), color(팔레트 인덱스),
// evidenceGrade, elevationDelta(이 피스 통과 후 상대 고도 변화량)
const PIECE_PLAN = [
  { pieceType: 'Str2', segmentKind: 'marker', color: 5 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Bri1', segmentKind: 'slope', color: 3, direction: 'rise', elevationDelta: 4, evidenceGrade: 'confirmed', valueLabel: '상승 40°(지정)' },
  { pieceType: 'Bri1', segmentKind: 'slope', color: 3, direction: 'rise', elevationDelta: 4, evidenceGrade: 'confirmed', valueLabel: '상승 40°(지정)' },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Bri1', segmentKind: 'slope', color: 2, direction: 'fall', elevationDelta: -4, evidenceGrade: 'confirmed', valueLabel: '하강 40°(지정)' },
  { pieceType: 'Bri1', segmentKind: 'slope', color: 2, direction: 'fall', elevationDelta: -4, evidenceGrade: 'confirmed', valueLabel: '하강 40°(지정)' },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Cor1', segmentKind: 'corner', color: 1 },
  { pieceType: 'Ban1', segmentKind: 'bank', color: 3, direction: 'rise', elevationDelta: 2, evidenceGrade: 'confirmed', valueLabel: '뱅크 20°(지정)' },
  { pieceType: 'Ban1', segmentKind: 'bank', color: 2, direction: 'fall', elevationDelta: -2, evidenceGrade: 'confirmed', valueLabel: '뱅크 20°(지정)' },
  { pieceType: 'Chi1', segmentKind: 'unsupported', color: 1, unsupportedLabel: '미지원: Chi1(웨이브)' },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Chi1', segmentKind: 'unsupported', color: 1, unsupportedLabel: '미지원: Chi1(웨이브)' },
  { pieceType: 'Lan1', segmentKind: 'lane-change', color: 6, evidenceGrade: 'confirmed', valueLabel: '레인체인지' },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
  { pieceType: 'Str1', segmentKind: 'straight', color: 1 },
]

// 원본 "class;x;y;angle;color#..." 문자열을 실제로 생성한다(왕복 파싱 대상).
function buildRawString(plan) {
  return plan
    .map((p, i) => {
      const pt = ellipsePoint(i, plan.length)
      return [p.pieceType, pt.x.toFixed(2), pt.y.toFixed(2), pt.angleDeg.toFixed(2), p.color].join(';')
    })
    .join('#')
}

export const RAW_NORMAL = buildRawString(PIECE_PLAN)

// 비폐곡선(부분 실패) fixture: 22번 인덱스 이후 접점이 어긋난 것으로 취급한다.
export const RAW_PARTIAL = RAW_NORMAL // 파싱 결과는 동일, restoreOrder 이후 별도 truncate 처리(BROKEN_AT)
export const BROKEN_AT = 22

// 손상 문자열(파싱 실패, TC-002-2/2-3)
export const RAW_MALFORMED = 'Str2;0;0;0;5#Cor1;10;10;NaN' // 필드 5개 불일치 + 숫자 아님
export const RAW_EMPTY = ''

// START(Str2) 부재 fixture (TC-003-4)
export const RAW_NO_START = buildRawString(PIECE_PLAN.filter(p => p.pieceType !== 'Str2'))

// START(Str2) 2개 이상 fixture (TC-003-5) — 15번 위치에 Str2 하나를 더 끼워 넣는다.
const MULTI_START_PLAN = [...PIECE_PLAN.slice(0, 15), { pieceType: 'Str2', segmentKind: 'marker', color: 5 }, ...PIECE_PLAN.slice(15)]
export const RAW_MULTI_START = buildRawString(MULTI_START_PLAN)

// 대형 트랙(300+ 피스, FEAT-011) — Str1/Cor1 반복
function buildLargeRaw(count) {
  const plan = [{ pieceType: 'Str2', segmentKind: 'marker', color: 5 }]
  for (let i = 1; i < count; i++) {
    plan.push(i % 5 === 0
      ? { pieceType: 'Cor1', segmentKind: 'corner', color: 1 }
      : { pieceType: 'Str1', segmentKind: 'straight', color: 1 })
  }
  return buildRawString(plan)
}
export const RAW_LARGE = buildLargeRaw(320)

// Z 폐합 실패(XY는 닫혔지만 고도 불균형, TC-004-5/004-6/012-5) — 상승 피스만 있고 하강이 부족하게 만든다.
const ZGAP_PLAN = PIECE_PLAN.map((p, i) => (i === 14 || i === 15 ? { ...p, direction: 'rise', elevationDelta: 2, color: 3, valueLabel: '상승 40°(지정, Z 불균형 데모)' } : p))
export const RAW_ZGAP = buildRawString(ZGAP_PLAN)

// ---------------------------------------------------------------------------
// 1-B. 피스 기하 (편집기 카탈로그 실측) — vertex는 원점 기준, 회전 후 position에 더한다.
//      근거: viewer.js의 Sprite.prototype.getVertex1 = position.clone().add(rvertex1)
export const PIECE_GEOM = {
  Str1: [[-27,0],[27,0]], Str2: [[-27,0],[27,0]], Str3: [[-15,0],[15,0]], Str4: [[-30,0],[30,0]],
  Str5: [[-45,0],[45,0]], Str6: [[-60,0],[60,0]],
  Cor1: [[-26,-8],[12.2,7.8]], Cor2: [[-36,-6],[6.42,11.58]], Cor3: [[-45,-15],[15,45]],
  Cor4: [[-45,-15],[15,45]], Cor5: [[-105,-75],[75,105]],
  Ban1: [[-14,0],[14,0]], Ban2: [[-27,0],[27,0]],
  Bri1: [[-27,0],[27,0]], Bri2: [[-27,0],[27,0]], Bri3: [[-30,0],[30,0]], Bri4: [[-60,0],[60,0]],
  Lan1: [[-81,0],[81,0]], Lan2: [[-90,-54],[-90,54]], Lan3: [[-45,-60],[-45,60]], Lan4: [[-120,0],[120,0]],
  Chi1: [[-27,3],[27,3]], Chi2: [[-60,6],[60,6]],
}
export function rotatePoint([x, y], deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r)
  return [x * c - y * sn, x * sn + y * c]
}

// 2. 파서 (FEAT-002) — 실제 "class;x;y;angle;color#..." 문법을 검사·분해한다.
// ---------------------------------------------------------------------------
export function parseTrackString(raw) {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'empty', raw }
  }
  const chunks = raw.split('#').filter(Boolean)
  if (chunks.length === 0) return { ok: false, reason: 'empty', raw }
  const pieces = []
  for (const chunk of chunks) {
    const parts = chunk.split(';')
    if (parts.length !== 5) return { ok: false, reason: 'malformed', raw, badChunk: chunk }
    const [pieceType, x, y, angle, color] = parts
    if (!pieceType || [x, y, angle, color].some(v => v === '' || Number.isNaN(Number(v)))) {
      return { ok: false, reason: 'malformed', raw, badChunk: chunk }
    }
    const geom = PIECE_GEOM[pieceType]
    const piece = { pieceType, x: Number(x), y: Number(y), angle: Number(angle), color: Number(color) }
    if (geom) {
      // 편집기 실측 계약: 절대 끝점 = position + rotate(vertex, angle)  (원점 기준 회전)
      const [e1, e2] = geom.map(v => rotatePoint(v, piece.angle))
      piece.p1 = [piece.x + e1[0], piece.y + e1[1]]
      piece.p2 = [piece.x + e2[0], piece.y + e2[1]]
    } else {
      piece.p1 = [piece.x, piece.y]; piece.p2 = [piece.x, piece.y]; piece.unknownGeom = true
    }
    pieces.push(piece)
  }
  return { ok: true, pieces }
}

// ---------------------------------------------------------------------------
// 3. 진행 순서 복원 (FEAT-003, 실제 로직의 축약형)
//    실제 알고리즘(끝점 회전+이동 최근접 매칭)은 3D 기하 엔진 몫이라 이식하지 않되,
//    "Str2부터 시작", "START 0개→실패", "START 2개 이상→첫 등장만 채택"은 실제로 수행한다.
// ---------------------------------------------------------------------------
// 주행 순서 복원.
//
// 세 가지가 함께 있어야 옳은 답이 나온다(D-038):
//   ① 화살표 방향 — START 피스의 두 번째 정점(local +x)이 화살표가 가리키는 쪽이다.
//      종전에는 "더 멀리 가는 쪽"을 골랐는데, 폐곡선이 끊겨 있으면 화살표 반대편이
//      더 멀리 가므로 **항상 거꾸로** 돌았다.
//   ② 매달린 끝 잇기 — 어디에도 닿지 않는 끝이 정확히 둘이면 서로 잇는다. 참조 트랙은
//      225°로 놓인 대각 직선 두 개의 끝이 22.3cm 떨어져 폐곡선이 끊겨 있었다.
//   ③ 되돌아가기 — 입체교차에서 방향만 보고 고르면 갇힌다. 막히면 되돌아가 다른 가지를
//      시도한다. 참조 트랙은 212노드 만에 132피스 폐곡선을 찾는다.
//
// 판정 기준은 명확하다: **전 피스를 지나 출발점으로 돌아와야 한다.**
export function restoreOrder(pieces) {
  const startIdx = pieces.findIndex(p => p.pieceType === 'Str2')
  if (startIdx === -1) return { ok: false, reason: 'no-start' }

  const TOL = 3
  const key = p => p.map(v => Math.round(v / TOL)).join(',')
  const endOf = (p, ei) => (ei === 0 ? p.p1 : p.p2)
  const unit = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m] }

  const bucket = new Map()
  pieces.forEach((p, i) => {
    for (const ei of [0, 1]) {
      const k = key(endOf(p, ei))
      if (!bucket.has(k)) bucket.set(k, [])
      bucket.get(k).push({ i, ei })
    }
  })
  // ② 매달린 끝 잇기
  const lone = [...bucket.entries()].filter(([, v]) => v.length === 1)
  let joinedGap = false
  if (lone.length === 2) {
    const [[k0, v0], [k1, v1]] = lone
    bucket.set(k0, [...v0, ...v1])
    bucket.set(k1, [...v1, ...v0])
    joinedGap = true
  }

  const extraStartIndexes = []
  pieces.forEach((p, i) => { if (i !== startIdx && p.pieceType === 'Str2') extraStartIndexes.push(i) })

  // ③ 되돌아가며 폐곡선 찾기
  const NODE_CAP = 2000000
  function search(firstEnd) {
    const used = new Uint8Array(pieces.length)
    used[startIdx] = 1
    const chain = [{ i: startIdx, ei: 1 - firstEnd }]
    const goal = key(endOf(pieces[startIdx], 1 - firstEnd))
    let nodes = 0, ambiguous = 0
    const dfs = (cur, curEnd) => {
      if (++nodes > NODE_CAP) return false
      if (chain.length === pieces.length) return key(endOf(pieces[cur], curEnd)) === goal
      const p = pieces[cur]
      // 진출 **접선**. 현이 아니라 실제 접선이어야 한다 — 코너는 둘이 turn/2 만큼
      // 어긋나서, 현으로 판정하면 입체교차에서 잘못된 가지를 고른다(D-039).
      const tp = endTangents(p)
      const head = curEnd === 1 ? tp.exit : [-tp.entry[0], -tp.entry[1]]
      const cand = (bucket.get(key(endOf(p, curEnd))) || []).filter(x => !used[x.i])
      if (cand.length > 1) ambiguous += 1
      // **정확 일치를 먼저 본다.** 편집기는 실제로 물린 이음새의 좌표를 소수점까지
      // 똑같이 저장한다. 한 점에 네 끝이 모이는 입체교차에서도 두 무리로 정확히
      // 갈린다(실측: 0.00 vs 0.06cm). TOL로 뭉개면 그 구분이 사라져 잘못된 가지를
      // 고른다 — 각도로는 오히려 틀린 쪽이 더 직진이라 되돌릴 수 없다(D-039).
      const here = endOf(p, curEnd)
      const gap = x => Math.hypot(...[0, 1].map(k => endOf(pieces[x.i], x.ei)[k] - here[k]))
      const best = Math.min(...cand.map(gap))
      const scored = cand.map(x => {
        const q = pieces[x.i]
        const tq = endTangents(q)
        // 진입 접선 — 들어가는 끝이 p1이면 정방향, p2면 역방향이다.
        const v = x.ei === 0 ? tq.entry : [-tq.exit[0], -tq.exit[1]]
        // 좌표가 더 가까운 쪽이 먼저다. 같은 무리(0.02cm 이내) 안에서만 접선으로 가른다.
        return { x, near: gap(x) - best < 0.02 ? 1 : 0, s: head[0] * v[0] + head[1] * v[1] }
      }).sort((a, b) => (b.near - a.near) || (b.s - a.s))
      for (const { x } of scored) {
        used[x.i] = 1; chain.push({ i: x.i, ei: x.ei })
        if (dfs(x.i, 1 - x.ei)) return true
        chain.pop(); used[x.i] = 0
        if (nodes > NODE_CAP) return false
      }
      return false
    }
    const ok = dfs(startIdx, firstEnd)
    return { ok, chain, used, ambiguous, nodes }
  }

  // ① 화살표 방향(=출구가 두 번째 정점)을 먼저. 실패하면 반대도 시도한다.
  const ARROW_END = 1
  let r = search(ARROW_END)
  let arrowRespected = r.ok
  if (!r.ok) r = search(1 - ARROW_END)

  const toPiece = c => ({ ...pieces[c.i], flipped: c.ei === 1 })
  if (r.ok) {
    return {
      ok: true,
      ordered: r.chain.map(toPiece),
      extraStartIndexes,
      ambiguous: r.ambiguous,
      closed: true,
      unreached: [],
      brokenAt: null,
      joinedGap,
      arrowRespected,
    }
  }

  // 폐곡선을 못 찾으면 닿은 데까지만 내놓고 나머지는 "순서 미확정"으로 드러낸다.
  const unreached = pieces.filter((_, i) => !r.used[i])
  return {
    ok: true,
    ordered: [...r.chain.map(toPiece), ...unreached],
    extraStartIndexes,
    ambiguous: r.ambiguous,
    closed: false,
    unreached,
    brokenAt: r.chain.length - 1,
    joinedGap,
    arrowRespected: false,
  }
}
export function deriveMeta(raw) {
  const t = raw.pieceType, c = raw.color
  const dir = c === 3 ? 'rise' : (c === 2 ? 'fall' : null)
  const grade = 'confirmed'  // D-022: 사용자 지정 렌더 규칙 — measured 아님
  if (/^Bri/.test(t)) return { pieceType: t, segmentKind: 'slope', direction: dir ?? 'rise',
    evidenceGrade: grade, valueLabel: (dir === 'fall' ? '하강' : '상승') + ' 22°(지정)' }
  if (/^Ban/.test(t)) return { pieceType: t, segmentKind: 'bank', direction: dir ?? 'rise',
    evidenceGrade: grade, valueLabel: '뱅크 20°(지정)' }
  if (/^Chi/.test(t)) return { pieceType: t, segmentKind: 'wave', direction: null,
    evidenceGrade: grade, valueLabel: '웨이브 진폭 5cm(실측)' }
  if (/^Lan/.test(t)) return { pieceType: t, segmentKind: 'lane-change', direction: null }
  if (/^Cor/.test(t)) return { pieceType: t, segmentKind: 'corner', direction: null }
  if (t === 'Str2') return { pieceType: t, segmentKind: 'marker', direction: null }
  if (/^Str/.test(t) && c === 5) return { pieceType: t, segmentKind: 'marker', direction: null,
    valueLabel: '출발선 표식' }  // D-014 결론 3
  if (/^Str/.test(t)) return { pieceType: t, segmentKind: 'straight', direction: null }
  return { pieceType: t, segmentKind: 'unsupported', unsupportedLabel: '미지원: ' + t }
}

function assembleSegments(orderedRawPieces, planForMeta, brokenAt) {
  let cum = 0
  return orderedRawPieces.map((raw, i) => {
    // plan 메타가 없으면(실데이터) **타입·색에서 직접 유도한다** — 실서비스의 정본 규칙이다.
    // 근거: D-014(c는 팔레트 인덱스, Bri*/Ban*에 한해 c=3 상승·c=2 하강), D-022(고도 규칙),
    //       piece-shapes.md(웨이브 진폭 5cm, 레인체인지 162cm)
    const meta = planForMeta[i] ?? deriveMeta(raw)
    const failed = typeof brokenAt === 'number' && i > brokenAt
    if (!failed && meta.elevationDelta) cum += meta.elevationDelta
    return {
      id: `seg-${i}`,
      index: i,
      pieceType: meta.pieceType ?? raw.pieceType,
      segmentKind: meta.segmentKind ?? 'straight',
      direction: meta.direction ?? null,
      evidenceGrade: meta.evidenceGrade,
      unsupportedLabel: meta.unsupportedLabel,
      valueLabel: meta.valueLabel,
      elevationRelative: failed ? null : cum,
      x: raw.x, y: raw.y, angle: raw.angle, p1: raw.p1, p2: raw.p2, flipped: raw.flipped === true,
      failed,
    }
  })
}

// ---------------------------------------------------------------------------
// 5. Fixture 로더 — "URL 제출"을 흉내 낸다. 실제 fetch 없음.
// ---------------------------------------------------------------------------
// 실 트랙 WS67Y2 — 편집기에서 실제로 받은 원문(132피스). 합성이 아니다.
export const RAW_WS67Y2 = 'Cor1;121.111;641.142;225;0#Cor1;780.181;677.872;135;0#Cor1;812.023;652.945;90;0#Cor1;146.039;672.984;180;0#Cor1;157.809;197.994;315;0#Cor1;125.968;222.922;270;0#Str1;199.039;680.984;0;0#Str1;684.951;194.883;180;0#Str1;738.951;194.883;180;0#Cor1;791.951;202.883;0;0#Cor1;816.879;234.724;45;0#Str1;819.990;599.866;90;0#Str1;630.951;194.883;0;0#Str1;118.000;600.000;90;0#Cor1;535.777;359.916;315;0#Cor1;503.935;384.843;270;0#Cor1;618.181;677.873;135;0#Cor1;686.039;672.983;180;0#Cor1;661.111;641.142;225;0#Str1;658.023;383.945;90;0#Str1;658.023;329.945;90;0#Cor1;666.023;276.945;270;0#Cor1;697.864;252.017;315;0#Cor1;738.007;256.906;0;0#Cor1;762.934;288.747;45;0#Cor1;666.000;601.000;270;0#Cor1;697.841;576.072;315;0#Cor1;726.126;569.849;135;0#Cor1;757.967;544.921;90;0#Str1;658.023;491.945;90;0#Str1;658.023;545.945;90;0#Str1;658.023;599.945;270;0#Cor1;650.023;652.945;90;0#Bri1;658.023;437.945;270;3#Lan1;765.967;437.921;90;0#Str1;765.967;329.921;90;0#Str1;414.951;194.883;180;0#Cor1;121.079;317.064;225;0#Cor1;146.007;348.906;180;0#Str1;819.990;545.866;90;0#Str1;279.857;437.876;270;0#Cor1;282.968;479.018;225;0#Cor1;307.896;510.860;180;0#Str1;495.935;437.843;270;0#Str1;360.896;518.860;0;0#Str1;414.951;518.882;0;0#Str1;279.834;383.931;270;0#Cor1;185.992;353.859;135;0#Cor1;217.834;328.931;90;0#Cor1;233.834;276.931;270;0#Cor1;265.675;252.003;315;0#Str1;171.850;329.970;270;0#Str1;171.850;383.970;90;0#Cor1;499.046;478.985;225;0#Cor1;523.974;510.827;180;0#Cor1;575.974;526.827;0;0#Cor1;499.102;587.008;225;0#Cor1;492.879;558.724;45;0#Cor1;467.951;526.882;0;0#Cor1;305.818;256.892;0;0#Cor1;330.745;288.734;45;0#Cor1;449.880;276.820;270;0#Cor1;481.721;251.893;315;0#Str1;522.863;248.781;180;0#Str1;333.857;329.876;270;0#Str1;333.857;383.876;270;0#Str1;333.857;545.876;270;0#Str1;441.880;437.820;270;0#Str1;441.880;491.820;270;0#Str1;441.880;545.820;270;0#Cor1;336.968;587.018;225;0#Cor1;361.896;618.860;180;0#Cor1;402.038;623.748;135;0#Cor1;433.880;598.820;90;0#Ban1;563.919;356.805;180;3#Ban1;563.864;248.781;180;2#Bri1;576.951;194.883;0;2#Bri1;468.951;194.883;180;3#Str1;522.951;194.883;0;0#Str1;361.039;680.984;180;0#Str1;415.039;680.984;180;0#Str2;253.039;680.984;180;0#Str1;307.039;680.984;180;0#Bri1;469.039;680.984;180;2#Str1;523.039;680.984;180;0#Str1;577.039;680.984;180;0#Str1;819.990;275.866;90;0#Str1;819.990;329.866;90;0#Str1;198.951;194.883;0;0#Str1;252.951;194.883;0;0#Str1;306.951;194.883;0;0#Str1;360.951;194.883;0;0#Str1;441.880;329.820;270;0#Bri1;441.880;383.820;270;3#Bri1;819.990;383.866;270;3#Bri1;819.990;437.866;270;2#Str1;819.990;491.866;270;0#Str1;333.857;491.876;270;0#Bri1;333.857;437.876;270;2#Bri1;279.834;329.931;90;2#Str1;279.834;275.931;90;0#Cor1;276.723;234.789;45;0#Cor1;251.795;202.947;0;0#Cor1;211.653;198.059;315;0#Cor1;179.811;222.986;270;0#Str1;171.811;275.986;90;0#Str1;118.000;546.000;90;0#Cor1;126.000;493.000;270;0#Cor1;157.842;468.072;315;0#Cor1;197.984;472.961;0;0#Str1;171.984;437.961;270;0#Str1;171.984;545.961;270;0#Cor1;175.095;587.103;225;0#Cor1;200.023;618.945;180;0#Cor1;240.165;623.833;135;0#Cor1;272.007;598.905;90;0#Cor1;276.895;558.763;45;0#Str1;245.076;515.630;225;5#Str1;229.276;499.853;225;0#Bri1;171.984;491.961;90;3#Cor1;603.864;256.781;0;0#Cor1;628.792;288.623;45;0#Cor1;623.903;328.765;90;0#Cor1;592.062;353.693;135;0#Chi1;120.968;275.922;90;0#Chi1;739.039;677.983;0;0#Ban1;521.729;620.949;45;3#Ban1;598.073;544.526;45;2#Cor1;543.829;638.649;180;0#Cor1;583.971;643.537;135;0#Cor1;615.813;618.609;90;0#Cor1;620.701;578.467;45;0#'

const FIXTURES = {
  WS67Y2: { raw: RAW_WS67Y2, plan: null, brokenAt: null, label: '실 트랙 WS67Y2(132피스)' },
  DEMO01: { raw: RAW_NORMAL, plan: PIECE_PLAN, brokenAt: null, label: '정상(폐곡선)' },
  PARTIAL: { raw: RAW_PARTIAL, plan: PIECE_PLAN, brokenAt: BROKEN_AT, label: '부분 실패(비폐곡선)' },
  ZGAP: { raw: RAW_ZGAP, plan: ZGAP_PLAN, brokenAt: null, label: '폐곡선(XY)이지만 Z 불균형' },
  MULTI: { raw: RAW_MULTI_START, plan: [...PIECE_PLAN.slice(0, 15), { pieceType: 'Str2', segmentKind: 'marker', color: 5 }, ...PIECE_PLAN.slice(15)], brokenAt: null, label: 'START 2개 이상' },
  LARGE: { raw: RAW_LARGE, plan: null, brokenAt: null, label: '대형 트랙(320피스)' },
  NOSTART: { raw: RAW_NO_START, plan: PIECE_PLAN.filter(p => p.pieceType !== 'Str2'), brokenAt: null, label: 'START 없음' },
  MALFORMED: { raw: RAW_MALFORMED, plan: null, brokenAt: null, label: '손상된 문자열' },
  EMPTY: { raw: RAW_EMPTY, plan: null, brokenAt: null, label: '빈 응답' },
}

export const FIXTURE_CODES = Object.keys(FIXTURES)

const sessionCache = new Map() // TC-001-6: 같은 코드 재조회 시 즉시 복원

export function loadTrackByCode(code, { simulateNetworkError, simulateTimeout } = {}) {
  if (simulateNetworkError) return { ok: false, errorReason: 'network' }
  if (simulateTimeout) return { ok: false, errorReason: 'timeout' }
  const fixture = FIXTURES[code]
  if (!fixture) return { ok: false, errorReason: 'network', notFound: true }

  const cached = sessionCache.get(code)
  const parseResult = parseTrackString(fixture.raw)
  if (!parseResult.ok) {
    return { ok: false, errorReason: 'parse', rawSnippet: fixture.raw.slice(0, 120) || '(빈 응답)' }
  }
  const orderResult = restoreOrder(parseResult.pieces)
  if (!orderResult.ok) {
    return { ok: false, errorReason: 'parse', messageKey: 'no-start', rawSnippet: fixture.raw.slice(0, 120) }
  }
  // plan 메타가 없으면 타입·색에서 유도한다. 종전 폴백은 Str2/Cor1/그 외 3분류뿐이라
  // 슬로프·뱅크·웨이브·레인체인지를 전부 'straight'로 뭉갰다(실측 결함, PC-008).
  const planForMeta = fixture.plan ?? orderResult.ordered.map(deriveMeta)
  const segments = assembleSegments(orderResult.ordered, planForMeta, fixture.brokenAt)
  const isZClosed = segments.every(s => s.failed) ? true : (segments.at(-1)?.elevationRelative ?? 0) === 0
  const result = {
    ok: true,
    code,
    label: fixture.label,
    segments,
    isXyClosed: fixture.brokenAt === null,
    isZClosed,
    truncatedAt: fixture.brokenAt,
    extraStartIndexes: orderResult.extraStartIndexes,
    fromCache: cached === true,
  }
  sessionCache.set(code, true)
  return result
}

// ---------------------------------------------------------------------------
// 6. 공유 커서 (component-spec/shared.md §공유 커서 계약)
//    단일 owner. 세 표면은 구독+발행 대칭 소비자. 쓰기는 사용자 이벤트에서만.
// ---------------------------------------------------------------------------
export function createTrackCursor(segments) {
  const listeners = new Set()
  let state = { currentIndex: 0, totalCount: segments.length, lastSource: 'initial' }

  function isReachable(index) {
    if (index < 0 || index >= segments.length) return false
    return !segments[index]?.failed
  }

  function notify() { for (const fn of listeners) fn(state) }

  function setCursor(index, source) {
    const clamped = Math.max(0, Math.min(segments.length - 1, index))
    if (!isReachable(clamped)) return state // 2차 게이트: 실패 구간 no-op
    if (clamped === state.currentIndex) return state // 2차 게이트: 등가 검사, 재렌더 없음
    state = { ...state, currentIndex: clamped, lastSource: source }
    notify()
    return state
  }

  function stepBy(delta, source) {
    let target = state.currentIndex + delta
    // 실패 구간 경계에서 멈춘다(넘어가지 않음)
    while (target >= 0 && target < segments.length && !isReachable(target)) {
      target += delta > 0 ? -1 : 1
      if (target === state.currentIndex) break
    }
    return setCursor(target, source)
  }

  return {
    get state() { return state },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    setCursor,
    stepBy,
    isReachable,
  }
}

// ---------------------------------------------------------------------------
// 7. WebGL 감지 (FEAT-014) — 실제 canvas.getContext 시도 + 데모용 강제 오버라이드.
// ---------------------------------------------------------------------------
export function detectWebglSupport() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 8. 총계 표기 (FEAT-010, TC-010-5) — 절대 단위 금지, 등급 배지와 함께 표기.
// ---------------------------------------------------------------------------
const LENGTH_UNITS = { straight: 1, corner: 0.68, slope: 1.2, bank: 1.5, 'lane-change': 1.0, marker: 1.0, unsupported: 1.0 }
export function computeTotals(segments) {
  const totalPieces = segments.length
  const totalLengthUnits = segments.reduce((sum, s) => sum + (LENGTH_UNITS[s.segmentKind] ?? 1), 0)
  return { totalPieces, totalLengthUnits: totalLengthUnits.toFixed(2) }
}
