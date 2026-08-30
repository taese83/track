// geom3d.js — 3레인 3D 기하 생성과 투영. 의존성 0.
//
// 근거 (전부 00_source 실측):
//   piece-shapes.md §1  레인 3개 · 레인 폭 12px · 트랙 폭 36px
//   piece-shapes.md §2  1 px = 1 cm
//   piece-shapes.md §3  웨이브 진폭 5cm · 슬로프/뱅크 음영 방향
//   decision-log D-022  H = 밑변 × tan(각도) · 슬로프 S곡선 40° · 뱅크 로그 20°
//   track-editor-data-model.md  끝점 = position + rotate(vertex, angle)

export const LANE_COUNT = 3
export const LANE_PITCH = 12 // px = cm (측정)
export const TRACK_WIDTH = LANE_COUNT * LANE_PITCH

// 피스 타입별 회전량(도). 현 각도의 2배가 실제 선회각이다(piece-shapes 카탈로그).
const TURN = { Cor1: 45, Cor2: 45, Cor3: 90, Cor4: 90, Cor5: 45 }
// 꺾임 강도. 선회각을 키우면 원호 반지름이 작아져 더 급하게 꺾인다.
// 끝점은 그대로이고 가운데가 더 부풀 뿐이라 이음새는 벌어지지 않는다(D-036).
const TURN_SCALE = 1

// 고도 프로파일 f(t) — t∈[0,1], 반환 0..1. D-022: 모양은 총 상승량을 바꾸지 않는다.
const PROFILE = {
  slope: t => (1 - Math.cos(Math.PI * t)) / 2,        // S곡선, 양 끝 기울기 0
  bank: t => Math.log(1 + 9 * t) / Math.log(10),      // 로그, 단조 증가, 끝이 완만
  wave: t => Math.sin(Math.PI * t),                   // 볼록 범프, 양 끝 0
  flat: () => 0,
  linear: t => t,   // 이웃이 넘겨받은 경사를 일정하게 따라간다
}

const RAD = Math.PI / 180
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const len2 = v => Math.hypot(v[0], v[1]) || 1
const unit2 = v => { const m = len2(v); return [v[0] / m, v[1] / m] }

// 코너를 원호로 샘플링한다 — "곡선은 곡면으로"(사용자 요구).
// 현(chord)과 선회각으로 원호를 복원한다: R = chord / (2 sin(turn/2)).
// seg.flipped: 주행이 p2→p1 방향이면 표본을 뒤집어 t=0이 실제 진입점이 되게 한다.
// 이것을 빠뜨리면 고도 프로파일이 피스 안에서 거꾸로 깔린다(PC-009).
function samplePiece(seg, steps) {
  const out = sampleForward(seg, steps)
  if (!seg.flipped) return out
  // 형상은 그대로 두고 표본 순서만 뒤집는다. 끝점을 바꾸면 원호 중심이 현의
  // 반대편으로 넘어가 코너가 거울상이 된다.
  out.reverse()
  for (let i = 0; i < out.length; i++) out[i][2] = i / (out.length - 1)
  return out
}

function sampleForward(seg, steps) {
  const p1 = seg.p1, p2 = seg.p2
  const turn = TURN[seg.pieceType] ? TURN[seg.pieceType] * TURN_SCALE : undefined
  const out = []
  if (!turn) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      out.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t, t])
    }
    return out
  }
  const chordV = sub(p2, p1), chord = len2(chordV)
  const half = (turn / 2) * RAD
  const R = chord / (2 * Math.sin(half))
  // 원 중심: 현의 수직이등분선 위. 부호는 진행 방향 기준 좌/우 — 현 각도로 결정한다.
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const nrm = [-chordV[1] / chord, chordV[0] / chord]
  const d = Math.sqrt(Math.max(R * R - (chord / 2) ** 2, 0))
  const c = [mid[0] + nrm[0] * d, mid[1] + nrm[1] * d]
  const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0])
  let a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0])
  let sweep = a2 - a1
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a1 + sweep * t
    out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a), t])
  }
  return out
}

// 피스 양 끝에서의 **실제 접선**(p1→p2 진행 기준). 순서 복원의 분기 판정에 쓴다.
// 코너는 현과 접선이 turn/2 만큼 어긋나므로, 현으로 판정하면 입체교차에서
// 잘못된 가지를 고른다(D-039). 렌더와 같은 원호 생성기를 써야 값이 어긋나지 않는다.
export function endTangents(seg) {
  const pts = sampleForward(seg, 8)
  const n = pts.length
  return {
    entry: unit2([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]),
    exit: unit2([pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]]),
  }
}

// 세그먼트 목록 → 레인별 3D 폴리라인.
// z(고도)는 진행 순서를 따라 누적한다. 노면은 좌우로 평평하다(롤 없음 — D-024 철회).
export function buildLanes(segments, opts = {}) {
  const steps = opts.steps ?? 6
  // 슬로프 현 각도. 40°(D-022) → 25°(D-025, 육안 판단으로 두 차례 하향) → 22°(기록 없음)
  // → **20°(사용자 "조금만 낮춰줘")**. 피스당 낙차 = 54cm × sin(각도): 20.23 → 18.47cm.
  // 실물 실측이 아니라 사용자 지정 렌더 규칙(`confirmed`)이므로 육안 조정이 정당하다.
  const slopeDeg = opts.slopeDeg ?? 20
  // 이 렌더의 규약: **양수 z가 화면에서 위로** 보인다(rx 30·60·90·120° 전부에서 실증).
  // D-037이 투영 깊이 부호를 고치기 전에는 규약이 반대(음수=위)였고, 그때 맞춰 둔
  // 부호 보정들을 D-037이 자연값으로 되돌렸다. 슬로프도 같은 규약을 쓴다.
  const slopeSign = opts.slopeSign ?? 1
  // 뱅크 기울기. **뱅크 피스와 그 사이 구간(뱅크 위의 트랙)에 함께 적용된다.**
  // 20°(D-024) → 14°(완만하게) → 18°(다시 올림) → **20°(복귀, 사용자 지시)**.
  // 20°는 타미야 공식 "バンク角20度"에서 온 `measured` 값이고 문서 전체가 이 값을 쓴다
  // (piece-dimensions.md · specs-pipeline.md FEAT-005 · TC-005-2/6 · piece-shapes.md §4).
  // 18°로 내려가 있던 동안 코드와 문서가 어긋나 있었다 — 복귀로 해소된다.
  const bankDeg = opts.bankDeg ?? 20
  // 웨이브 돌출량 5cm — 픽셀 측정값과 일치한다(piece-shapes.md §3).
  const waveAmp = opts.waveAmp ?? 5
  // 레인체인지에서 폭을 가로지르는 레인(3→1)이 나머지 둘 위로 넘어가는 높이(육교).
  // **양수가 화면에서 위로 솟는다**(D-037 이후 규약). 뱅크가 위로 솟는 것과 같다.
  // D-035가 다섯 번 왕복 끝에 +8로 확정했고 D-037의 부호 정정 뒤에도 +8이 유지된다.
  const changerHill = opts.changerHill ?? 8
  // 자리바꿈이 일어나는 구간이 피스 길이의 몇 할인가. 1 = 전 구간에 걸쳐 완만,
  // 작을수록 가운데에서 급하게 꺾인다. 앞뒤는 직선으로 남는다(D-036).
  const changerSpan = opts.changerSpan ?? 0.45
  // 돌출 방향: +1 = 진행 방향 기준 오른쪽, −1 = 왼쪽(법선 n = [−tan.y, tan.x], y는 아래로 증가).
  //
  // **−1이 확정값이다**(D-032 개정, 사용자 재지정: "지금 웨이브를 반대로 튀어나오게 하고").
  // 개정에서 모양은 삼각형 → sin²로 바꿨는데 **방향 뒤집기가 이 상수에 반영되지 않은 채
  // 남아 있었다** — 그래서 프리뷰만 오른쪽으로 튀어나오고 구현(왼쪽)과 반대였다
  // (2026-08-31 사용자 지적으로 발견). 결정 로그가 "구현은 waveAmp와 waveSide 두 상수이며
  // 각각 한 줄"이라고 적어 둔 그 한 줄이 실제로는 적용되지 않았다.
  const waveSide = opts.waveSide ?? -1
  // 웨이브는 **고도가 아니라 평면상 좌우 흔들림**이다(D-032).
  // 편집기는 위에서 내려다본 도면이라 고도를 그릴 수단이 없다 — 슬로프조차 평평하게
  // 그리고 색으로만 표시한다. 따라서 Chi1 이미지에서 띠가 휘어 보이는 것은 평면상
  // 휘어진 것이다. 세로 범프로 읽은 것이 오독이었다.
  // 뱅크 구간의 기울기 방향. **위로 솟는 쪽이 맞다** — D-031에서 사용자가 두 방향을
  // 나란히 보고 확정한 그림("지금이 맞아 정확해")이 이 방향이다(D-045로 재확인).
  // D-031 본문이 그것을 "아래로 파임"이라고 적은 것은 **투영 부호가 틀린 상태의 규약**
  // 이었기 때문이다(D-037이 정정). false로 두면 아래로 파인다.
  const bankUp = opts.bankUp ?? true
  // 뱅크 전이 곡선 — 사용자가 그려 준 도면 그대로다(D-040):
  //
  //      ────────╮
  //               ╰──── 일정 각도의 직선
  //
  //   평지 → 둥근 전이 → 일정 각도의 직선.
  //   도면대로 되려면 전이의 **기울기가 0에서 판 기울기까지 단조 증가**해야 한다.
  //
  //   종전 구현은 3차 곡선 r(e)=e²(3−2e)를 판 높이에 곱했다. 판축 거리가 e에 비례하므로
  //   높이는 h ∝ e³(3−2e)가 되고, h′=9e²−8e³의 최댓값은 e=0.75에서 **1.6875**다 —
  //   전이 한가운데가 판보다 1.69배 가팔라졌다가 되내려온다. 도면에 없는 **혹**이다
  //   (bankDeg=18°일 때 실측: 판 18.9°인데 전이 중간이 28.7°까지 솟았다가 19.9°로 복귀).
  //
  //   기울기를 판축 거리에 비례시키면(g′(d) = d/dEnd) 단조가 되고 끝에서 판과 접한다.
  //   대신 전이가 올리는 높이는 판을 연장한 높이의 절반뿐이므로 **판을 그만큼 내려놓아야**
  //   이음새가 붙는다(아래 pl.lift). 이 대가는 단조 조건에서 피할 수 없다 —
  //   기울기가 0에서 시작해 판 기울기까지만 커지면 평균 기울기는 판보다 작을 수밖에 없다.
  // ── 뱅크 쌍 구간 = 하나의 기울어진 평면 ────────────────────────────────
  // "20도 올라가는 것을 평면으로 생각하고 그려봐"(D-029).
  //
  // 상승 뱅크와 하강 뱅크 사이 구간 전체가 **20°로 기운 단일 평면** 위에 놓인다.
  // 트랙이 그 평면 위를 돌기 때문에 저절로 올라갔다 내려오고, 구간 안에 꺾이는 곳이
  // 없다. 기울기 축은 **구간의 진입점과 진출점을 잇는 선**이다 — 그래야 두 점의
  // 높이가 같아져 폐곡선이 정확히 닫힌다.
  //
  // 폐기된 해석: 지붕(절반 오르고 절반 내려옴, D-028)은 구간 한가운데가 꺾였다.
  // 뱅크는 **기울기를 바꾸는 피스**다. 상승 뱅크가 +20°, 하강 뱅크가 −20°를 더한다.
  // 따라서 상승 뱅크가 둘 연속이면 그 뒤 구간은 **40°**로 기운다(사용자 확인, D-030).
  // 기울기가 0이 아닌 동안이 하나의 평면 구간이고, 0으로 돌아오면 평지로 복귀한다.
  //
  // 색(c=2/c=3)은 편집기 팔레트이고 우리 진행 방향이 실제 주행 방향과 반대일 수 있다.
  // "뱅크는 위로 올라가는 형태"(D-029)를 기준으로 전체 부호를 한 번 정규화한다.
  const list = segments.filter(sg => sg.p1 && sg.p2)
  // 표본 수는 **피스 길이에 비례**한다. 모든 피스에 똑같이 주면 긴 피스가 거칠어진다 —
  // 레인체인지(Lan1)는 162cm로 다른 피스의 3배인데 같은 6표본을 받았고, 육교 sin² 곡면이
  // 가운데 45% 구간에 3점만 찍혀 **볼록한 언덕이 아니라 뾰족한 텐트**로 그려졌다
  // (사용자 지적: "각지지 않고 곡면 언덕이야 / 볼록하게 솟아있어").
  // 육교가 든 피스는 자리바꿈 구간 안에 최소 CHANGER_SPAN_SAMPLES 표본을 보장한다.
  const SAMPLE_UNIT = 54          // cm. 기준 직선 피스 길이 — 이 길이에 steps 표본을 준다.
  const CHANGER_SPAN_SAMPLES = 48 // 자리바꿈 구간(changerSpan) 안에 들어갈 최소 표본 수.
  const stepsFor = sg => {
    const prop = Math.max(steps, Math.round(steps * len2(sub(sg.p2, sg.p1)) / SAMPLE_UNIT))
    const changer = sg.segmentKind === 'lane-change' || (sg.pieceType || '').startsWith('Lan')
    return changer ? Math.max(prop, Math.ceil(CHANGER_SPAN_SAMPLES / changerSpan)) : prop
  }
  const sampled = list.map(sg => samplePiece(sg, stepsFor(sg)))

  const planes = [] // {from, to, origin:[x,y], up:[ux,uy], slope, level}
  const bankAt = list.map((sg, i) => (sg.segmentKind === 'bank' ? i : -1)).filter(i => i >= 0)
  const globalSign = bankAt.length > 0 && list[bankAt[0]].direction === 'fall' ? -1 : 1
  let level = 0, secStart = -1
  for (const i of bankAt) {
    const step = (list[i].direction === 'fall' ? -1 : 1) * globalSign * bankDeg
    const before = level
    level += step
    if (before === 0 && level !== 0) secStart = i          // 평지 → 경사 시작
    else if (before !== 0 && level === 0 && secStart >= 0) { // 경사 → 평지 복귀
      planes.push({ from: secStart, to: i, level: before })
      secStart = -1
    }
  }
  // 닫히지 않은 구간(마지막 뱅크까지 0으로 안 돌아옴)은 마지막 뱅크에서 끊는다.
  if (secStart >= 0 && bankAt.length) planes.push({ from: secStart, to: bankAt[bankAt.length - 1], level })

  for (const pl of planes) {
    const entry = sampled[pl.from][0]
    const exit = sampled[pl.to][sampled[pl.to].length - 1]
    const ax = [exit[0] - entry[0], exit[1] - entry[1]]
    const m = Math.hypot(ax[0], ax[1])
    // 진입·진출을 잇는 축을 수평으로 두고 그 법선 방향으로 기운다 — 두 점 높이가 같아야
    // 폐곡선이 닫힌다.
    const up = m > 1e-6 ? [-ax[1] / m, ax[0] / m] : [0, 1]
    const h = [sampled[pl.from][1][0] - entry[0], sampled[pl.from][1][1] - entry[1]]
    const along = h[0] * up[0] + h[1] * up[1]
    // 진입에서 오르막이 되도록 맞춘다. level의 크기가 구간의 기울기다.
    const sign = (along >= 0 ? 1 : -1) * Math.sign(pl.level || 1) * (bankUp ? 1 : -1)
    pl.origin = [entry[0], entry[1]]
    pl.up = up
    pl.slope = sign * Math.tan(Math.abs(pl.level) * RAD)

    // 판을 얼마나 내려놓을지(lift). 전이가 판 연장선보다 낮게 끝나므로 그 차이를 판
    // 전체에서 빼야 뱅크 끝과 붙는다.
    //
    // g′(d) = (d/dEnd)^k 로 두면 g(dEnd) = dEnd/(k+1), 즉 lift = dEnd·k/(k+1)이다.
    // 진입 뱅크와 진출 뱅크의 판축 거리(dIn·dOut)는 다를 수 있는데 판은 하나뿐이라
    // lift도 하나여야 한다 — **짧은 쪽을 k=1(포물선)로 두고 lift를 정한 뒤, 긴 쪽의 k를
    // 그 lift에 맞춰 역산한다.** 좌우가 대칭이면 양쪽 모두 k=1이다.
    const dOf = q => (q[0] - pl.origin[0]) * pl.up[0] + (q[1] - pl.origin[1]) * pl.up[1]
    const bpIn = sampled[pl.from], bpOut = sampled[pl.to]
    const dIn = dOf(bpIn[bpIn.length - 1])
    const dOut = dOf(bpOut[0])
    // 진입·진출이 판축 반대편에 있거나 한쪽이 0이면 전이를 만들 수 없다 —
    // 판만 쓰고 꺾임을 남긴다(종전 동작). 다단 뱅크(BLOCKER-002)도 여기로 떨어진다.
    const usable = Math.abs(dIn) > 1e-9 && Math.abs(dOut) > 1e-9 && Math.sign(dIn) === Math.sign(dOut)
    pl.dIn = dIn
    pl.dOut = dOut
    pl.lift = usable ? Math.sign(dIn) * Math.min(Math.abs(dIn), Math.abs(dOut)) / 2 : 0
    pl.kIn = usable ? pl.lift / (dIn - pl.lift) : 0
    pl.kOut = usable ? pl.lift / (dOut - pl.lift) : 0
  }
  const planeOf = i => planes.find(pl => i >= pl.from && i <= pl.to) || null

  // ── 레인 생성 ────────────────────────────────────────────────────────
  // 노면은 평면을 그대로 따른다 — 레인마다 높이가 달라지므로 기울어진 구간에서는
  // 좌우로도 기운다(평면이 하는 일이지 별도의 롤 값이 아니다).
  let z = 0
  const pieces = []
  list.forEach((seg, idx) => {
    const pts = sampled[idx]
    const run = len2(sub(seg.p2, seg.p1))
    const dir = seg.direction === 'fall' ? -1 : 1
    const plane = planeOf(idx)
    // 구간의 기준 높이는 진입 시점의 z다. 구간 안에서는 평면이 z를 결정한다.
    if (plane && plane.baseZ === undefined) plane.baseZ = z

    let total = 0
    let prof = PROFILE.flat
    if (!plane && seg.segmentKind === 'slope') {
      // 높이는 tan이 아니라 sin이다 — run은 밑변이 아니라 달린 거리다(D-023).
      total = run * Math.sin(slopeDeg * RAD) * dir * slopeSign
      prof = PROFILE.slope // 양 끝 기울기 0 → 평지와 접선 연속
    }

    const z0 = z
    const isWave = !plane && (seg.segmentKind === 'wave' || (seg.pieceType || '').startsWith('Chi'))
    // 레인체인지: 레인이 한 칸씩 순환한다(0→1, 1→2, 2→0). 공식 API의 order:[1,2,3]이
    // changer 하나로 레인이 한 칸 돌아간다는 뜻이다(track-editor-data-model.md).
    // 바깥으로 나간 레인이 나머지 둘을 가로지르며 되돌아오는 것이 교차 형상이다(D-033).
    const isChanger = seg.segmentKind === 'lane-change' || (seg.pieceType || '').startsWith('Lan')
    // 웨이브는 z를 바꾸지 않는다. 중심선을 법선 방향으로 밀어 활 모양을 만든다.
    const lanes = Array.from({ length: LANE_COUNT }, () => [])
    // 레인은 선이 아니라 **면**이다. 레인마다 좌·우 가장자리를 함께 만든다.
    // 종전에는 레인0~레인2 중심선만 이어 면을 만들어 실제보다 12cm 좁았다
    // (36cm여야 하는데 24cm로 그려졌다 — 양쪽 바깥 반 레인 누락, D-034).
    const bands = Array.from({ length: LANE_COUNT }, () => [[], []])
    // 트랙 바깥 경계(rim). **레인 번호가 아니라 가로 위치로** 정한다 — 레인체인지에서는
    // 레인2가 오른쪽 끝에서 왼쪽 끝으로 건너가 번호 순서와 좌우 순서가 어긋난다.
    // 점 배열을 bands와 공유하므로 weldSeams가 이음새를 고치면 rim도 함께 따라온다.
    const rim = [[], []]
    for (let i = 0; i < pts.length; i++) {
      const [x, y, t] = pts[i]
      // 접선 → 법선. 레인은 법선 방향으로 등간격 배치한다.
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
      const tan = unit2([b[0] - a[0], b[1] - a[1]])
      const n = [-tan[1], tan[0]]
      let rimLo = null, rimHi = null, rimLoPt = null, rimHiPt = null
      for (let L = 0; L < LANE_COUNT; L++) {
        // 부드러운 곡면 범프 — sin²는 양 끝 기울기가 0이라 직선 구간과 매끄럽게 잇고
        // 마루도 각지지 않는다. 삼각형(각진 형태)에서 바꿨다(D-032 개정).
        const bow = isWave ? Math.sin(Math.PI * t) ** 2 * waveAmp * waveSide : 0
        // 순환 방향: 레인1→2, 2→3, 3→1. 두 칸 건너뛰는 레인이 3→1이고
        // 그 레인이 나머지 위로 넘어간다.
        const shift = (((L + 1) % LANE_COUNT) - L) * LANE_PITCH
        // 자리바꿈은 가운데 changerSpan 구간에서만 **직선으로** 건너간다.
        // 앞뒤는 직선으로 남고 양 끝에서 각지게 꺾인다 — 완만한 S곡선이 아니다(D-036).
        const u = Math.max(0, Math.min(1, (t - (1 - changerSpan) / 2) / changerSpan))
        const swap = isChanger ? shift * u : 0
        // 트랙 폭을 가로지르는 레인(|shift| > 레인 폭)은 나머지 둘 **위로** 넘어간다.
        // 같은 높이로 지나가면 서로 통과해 버린다 — 실제로는 육교다(D-035).
        const hill = isChanger && Math.abs(shift) > LANE_PITCH
          ? changerHill * Math.sin(Math.PI * u) ** 2   // 육교도 같은 구간에서만
          : 0
        const off = (L - (LANE_COUNT - 1) / 2) * LANE_PITCH + bow + swap
        // 중심선과 좌·우 가장자리를 같은 규칙으로 만든다. 레인체인지 구간에서는
        // 가장자리도 중심선을 따라 움직이므로 레인 면 전체가 자리를 옮긴다.
        const at = o => {
          const px = x + n[0] * o, py = y + n[1] * o
          let zi
          if (plane) {
            // ── 손으로 들어올리는 모델(D-040, 사용자 지정) ─────────────────
            // 사이 구간의 판은 **평평한 채로** 들리고, 휘는 것은 **뱅크 피스뿐**이다.
            //
            // 뱅크의 기울기는 0에서 판의 기울기까지 단조롭게 커진다(C자, S자 아님).
            // 기울기가 판축 거리에 비례하면 높이는 그 적분이라 끝에서 판과 접한다.
            // 대신 뱅크가 올린 높이는 판을 연장했을 때에 못 미치므로, 판을 그만큼
            // (lift) 내려놓아야 이어진다.
            const d = (px - plane.origin[0]) * plane.up[0] + (py - plane.origin[1]) * plane.up[1]
            const isEntry = idx === plane.from, isExit = idx === plane.to
            if ((isEntry || isExit) && plane.lift !== 0) {
              // 전이 구간 — 평지와 직선(판) 양쪽에 접한다.
              //   g(d) = dEnd/(k+1) · (d/dEnd)^(k+1),  g′(0)=0,  g′(dEnd)=1
              const dEnd = isEntry ? plane.dIn : plane.dOut
              const k = isEntry ? plane.kIn : plane.kOut
              const u = Math.max(0, Math.min(1, d / dEnd))
              zi = plane.baseZ + plane.slope * (dEnd / (k + 1)) * Math.pow(u, k + 1)
            } else {
              // 전이가 끝난 뒤로는 일정 각도의 직선(평판)이다.
              zi = plane.baseZ + plane.slope * (d - plane.lift)
            }
          } else {
            zi = z0 + total * prof(t)   // 웨이브는 total=0이라 평평하다
          }
          return [px, py, zi]
        }
        const lift = q => { q[2] += hill; return q }
        const eLo = off - LANE_PITCH / 2, eHi = off + LANE_PITCH / 2
        const pLo = lift(at(eLo)), pHi = lift(at(eHi))
        lanes[L].push(lift(at(off)))
        bands[L][0].push(pLo)
        bands[L][1].push(pHi)
        if (rimLo === null || eLo < rimLo) { rimLo = eLo; rimLoPt = pLo }
        if (rimHi === null || eHi > rimHi) { rimHi = eHi; rimHiPt = pHi }
      }
      rim[0].push(rimLoPt)
      rim[1].push(rimHiPt)
    }
    z = plane ? z0 : (isWave ? z0 : z0 + total)
    pieces.push({ seg, lanes, bands, rim, onPlane: !!plane })
  })

  weldSeams(pieces)
  return pieces
}
// 이음새 용접 — 맞닿는 두 피스를 **하나의 곧은 절단선**으로 자른다.
//
// 실제 트랙 피스는 진행 방향에 수직인 직선으로 잘려 서로 맞물린다. 그래서 코너에서는
// **바깥쪽 가장자리가 더 길고 안쪽이 더 짧다** — 같은 절단선에 닿으려면 반지름이 큰
// 바깥이 더 멀리 나가야 하기 때문이다(사용자 지적, D-036).
//
// 피스마다 자기 끝점의 법선으로 폭을 만들면 두 피스의 절단선이 몇 도씩 어긋나
// 바깥쪽에 삼각 노치가 생긴다. 양쪽 가장자리를 **공통 절단선 위로 옮겨** 없앤다.
//
// 레인체인지를 지나면 레인 번호와 가로 위치가 어긋나므로 번호가 아니라 **위치 순서로**
// 짝짓는다.
function weldSeams(pieces) {
  const TOL = 8 // cm. 이보다 멀면 실제로 떨어진 구간이므로 건드리지 않는다.
  const edgesEnd = pc => pc.bands.flatMap(([lo, hi]) => [lo[lo.length - 1], hi[hi.length - 1]])
  const edgesStart = pc => pc.bands.flatMap(([lo, hi]) => [lo[0], hi[0]])
  const tanEnd = pc => { const M = pc.lanes[1], n = M.length
    const v = [M[n - 1][0] - M[n - 2][0], M[n - 1][1] - M[n - 2][1]]
    const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m] }
  const tanStart = pc => { const M = pc.lanes[1]
    const v = [M[1][0] - M[0][0], M[1][1] - M[0][1]]
    const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m] }

  for (let i = 1; i < pieces.length; i++) {
    const A = pieces[i - 1], B = pieces[i]
    const ea = A.lanes[1][A.lanes[1].length - 1], sb = B.lanes[1][0]
    if (Math.hypot(ea[0] - sb[0], ea[1] - sb[1]) > TOL) continue // 끊긴 이음새는 그대로 둔다

    // 절단선: 두 피스의 평균 진행 방향에 수직인 직선. 중심은 두 중심선 끝의 중점.
    const t1 = tanEnd(A), t2 = tanStart(B)
    const tv = [t1[0] + t2[0], t1[1] + t2[1]]
    const tm = Math.hypot(tv[0], tv[1]) || 1
    const T = [tv[0] / tm, tv[1] / tm]
    const N = [-T[1], T[0]]
    const C = [(ea[0] + sb[0]) / 2, (ea[1] + sb[1]) / 2]

    const ae = edgesEnd(A), bs = edgesStart(B)
    if (ae.length !== bs.length) continue
    const key = q => (q[0] - C[0]) * N[0] + (q[1] - C[1]) * N[1]
    const oa = ae.slice().sort((x, y) => key(x) - key(y))
    const ob = bs.slice().sort((x, y) => key(x) - key(y))
    for (let k = 0; k < oa.length; k++) {
      const q = oa[k], r = ob[k]
      // 가로 위치는 두 점의 평균을 쓰되, **절단선 위에 정확히 올린다.**
      const d = (key(q) + key(r)) / 2
      const x = C[0] + N[0] * d, y = C[1] + N[1] * d, z = (q[2] + r[2]) / 2
      q[0] = x; q[1] = y; q[2] = z
      r[0] = x; r[1] = y; r[2] = z
    }
  }
}
// x·y·z 축 회전 후 투영. 사용자 요구: "x y z 축으로 회전하여 돌려볼 수 있어야"
export function makeProjector({ rx = 0, ry = 0, rz = 0, zoom = 1, center = [0, 0, 0], dist = 1400 } = {}) {
  const cx = Math.cos(rx * RAD), sx = Math.sin(rx * RAD)
  const cy = Math.cos(ry * RAD), sy = Math.sin(ry * RAD)
  const cz = Math.cos(rz * RAD), sz = Math.sin(rz * RAD)
  return ([X, Y, Z]) => {
    let x = X - center[0], y = Y - center[1], z = Z - center[2]
    // Z축(화면 평면 내 회전)
    let x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z
    // X축(위아래로 눕히기 — 입체감의 주 축)
    let y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx, x2 = x1
    // Y축
    let x3 = x2 * cy + z2 * sy, z3 = -x2 * sy + z2 * cy, y3 = y2
    // 깊이는 회전 결과의 **부호를 뒤집어** 쓴다.
    //
    // z3를 그대로 깊이로 쓰면 rx=0(위에서 내려다보기)에서 "고도가 높을수록 멀다"가
    // 되어 **카메라가 트랙 아래에 있는 셈**이 된다. 그러면 가림 순서가 뒤집혀
    // 언덕이 골짜기처럼 보인다 — 뱅크·육교 부호를 반대로 맞춰 온 원인이었다(D-037).
    //
    // 뒤집으면 rx=0에서 높은 z가 가깝고, rx=90에서 도면 아래쪽(큰 y)이 가깝다.
    // 위에서 남쪽에 선 카메라와 같다.
    const depth = -z3
    // 약한 원근 — 깊이감을 주되 형상 왜곡은 최소화한다
    const k = (dist / (dist + depth)) * zoom
    return [x3 * k, y3 * k, depth]
  }
}
