// app.js — 화면 렌더링 + 이벤트 바인딩 (mini4wd-track-3d 프리뷰)
// 공유 커서(component-spec/shared.md), 6상태 머신(pages.md), 3표면 동기화를 실제로 수행한다.
import * as store from './store.js'
import { buildLanes, makeProjector, LANE_COUNT, LANE_PITCH, TRACK_WIDTH } from './geom3d.js'
import { parseHash, navigate, onHashChange } from './router.js'
import { initWhOverlay } from './wh-overlay.mjs'

const appEl = document.getElementById('app')

// ---------------------------------------------------------------------------
// DOM 헬퍼
// ---------------------------------------------------------------------------
function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'text') node.textContent = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v)
    else node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of [].concat(children)) if (c) node.append(c)
  return node
}
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v)
  return node
}

// ---------------------------------------------------------------------------
// 앱 상태 (메모리, 새로고침 시 휘발 — 영속 불필요)
// ---------------------------------------------------------------------------
const S = {
  view: { kind: 'input' },
  inputValue: '',
  lastCode: null,
  track: null,           // {segments, isXyClosed, isZClosed, truncatedAt, extraStartIndexes, label}
  cursor: null,           // createTrackCursor() 인스턴스
  followMode: false,
  playbackSpeed: 'normal',
  isPlaying: false,
  playTimer: null,
  focusedIndex: 0,
  listExpanded: true,
  stripCollapsed: false,
  legendOpen: false,
  webglOverride: null,    // null=실감지, true/false=데모 강제
  runtimeFailureSim: false,
  // 세 축 모두 360도. x축은 종전 0~89로 잠겨 있어 트랙을 아래에서 올려다볼 수
  // 없었다(사용자 요구로 해제, PC-010).
  orbitAngle: 0,   // = rz (화면 평면 회전)
  orbitRx: 58,     // x축 — 눕히기. 기본값은 입체가 바로 보이도록 기울여 둔다
  orbitRy: 0,      // y축
  orbitZoom: 1,
  zExaggerate: 1,  // 고저차 과장 배율(ND — 실측 아님을 화면에 표기)
  orbitDragging: false,
  orbitDebounceTimer: null,
  stripScrubPointerId: null,
  orbitHintDismissed: false,
  loadingSlowTimer: null,
  error: null,            // {reason, rawSnippet, messageKey}
}
const REAL_WEBGL = store.detectWebglSupport()
const effectiveWebgl = () => (S.webglOverride !== null ? S.webglOverride : REAL_WEBGL)

// ---------------------------------------------------------------------------
// 상태 전이 (pages.md 상태 머신)
// ---------------------------------------------------------------------------
function resetPlayback() {
  if (S.playTimer) clearInterval(S.playTimer)
  S.playTimer = null
  S.isPlaying = false
}

function mountCursor(segments) {
  S.cursor = store.createTrackCursor(segments)
  S.cursor.subscribe(() => { syncHash(); renderViewerBody() })
}

function goInput() {
  resetPlayback()
  S.view = { kind: 'input' }
  S.track = null
  S.cursor = null
  S.error = null
  navigate({ state: 'input' })
  render()
}

function goError(reason, extra = {}) {
  resetPlayback()
  S.view = { kind: 'error', reason }
  S.error = { reason, ...extra }
  navigate({ state: 'error', code: S.lastCode, reason })
  render()
}

function enterLoadedState(result, code) {
  S.track = result
  S.lastCode = code
  S.focusedIndex = 0
  mountCursor(result.segments)
  const webglOk = S.runtimeFailureSim ? (S.runtimeFailureSim = false, false) : effectiveWebgl()
  if (!webglOk) {
    S.view = { kind: 'webgl-unsupported' }
    S.listExpanded = true
    navigate({ state: 'webgl', code, i: 0 })
  } else if (result.truncatedAt !== null || !result.isZClosed) {
    S.view = { kind: 'partial-failure' }
    navigate({ state: 'partial', code, i: 0 })
  } else {
    S.view = { kind: '3d' }
    navigate({ state: '3d', code, i: 0 })
  }
  render()
}

function submitCode(code, opts = {}) {
  resetPlayback() // 이전 트랙에서 재생 중이던 자동 추종이 새 트랙으로 새어나가지 않게 한다.
  S.error = null
  // FEAT-014: WebGL 게이트는 fetch 이전에도 동작할 수 있다 — 로딩 스피너 없이 즉시 대체 표현.
  if (!S.runtimeFailureSim && effectiveWebgl() === false) {
    const result = loadTrackByCode(code, opts)
    if (result.ok) return enterLoadedState(result, code)
  }
  S.view = { kind: 'loading' }
  navigate({ state: 'loading', code })
  render()
  if (S.loadingSlowTimer) clearTimeout(S.loadingSlowTimer)
  S.loadingSlowTimer = setTimeout(() => {
    if (S.view.kind === 'loading') { S.view = { kind: 'loading-slow' }; render() }
  }, 1400) // ASSUMPTION-007 잠정 임계값 데모(1.4s)
  // 완료 지연은 기본 650ms — 임계값(1.4s)보다 짧아 정상 로드는 loading-slow를 거치지 않는다.
  // "로딩(느림)" 데모는 완료를 임계값 너머로 늦춰(opts.simulateSlow) 실제로 그 상태를 보여준다.
  const completeDelay = opts.simulateSlow ? 2200 : 650
  setTimeout(() => {
    clearTimeout(S.loadingSlowTimer)
    const result = loadTrackByCode(code, opts)
    if (!result.ok) {
      if (result.errorReason === 'parse') return goError('parse', { rawSnippet: result.rawSnippet, messageKey: result.messageKey })
      if (result.notFound) return goError('network', { messageKey: 'not-found' })
      return goError(result.errorReason)
    }
    enterLoadedState(result, code)
  }, completeDelay)
}

function syncHash() {
  if (!S.cursor) return
  const stateParam = S.view.kind === '3d' ? '3d' : S.view.kind === 'partial-failure' ? 'partial' : S.view.kind === 'webgl-unsupported' ? 'webgl' : S.view.kind
  navigate({ state: stateParam, code: S.lastCode, i: S.cursor.state.currentIndex })
}

// ---------------------------------------------------------------------------
// 근거 등급 배지 (EvidenceBadge) — 4등급 상시 렌더, 고정폭
// ---------------------------------------------------------------------------
const GRADE_LABEL = { measured: '실측', confirmed: '확인', inferred: '추정', unknown: '미확인' }
function evidenceBadge(grade, anchor) {
  if (!grade) return null
  return h('span', { class: 'evidence-badge', 'data-grade': grade, ...(anchor ? { 'data-wh-anchor': anchor, 'data-wh-feature': 'FEAT-010', 'data-wh-tests': 'TC-010-1,TC-010-2,TC-010-3' } : {}) }, GRADE_LABEL[grade])
}

// ---------------------------------------------------------------------------
// 세그먼트 아이콘/텍스트 (3중 인코딩: 색 + 형태 + 텍스트)
// ---------------------------------------------------------------------------
function segIcon(seg) {
  if (seg.segmentKind === 'unsupported') return '▦'
  if (seg.segmentKind === 'marker') return '⚑'
  if (seg.segmentKind === 'lane-change') return '⑂'
  if (seg.segmentKind === 'bank') return '▱'
  if (seg.segmentKind === 'corner') return '⌒'
  if (seg.segmentKind === 'slope') return seg.direction === 'rise' ? '↑' : '↓'
  return '―'
}
function segKindLabel(seg) {
  const map = { straight: '직선', corner: '코너', slope: seg.direction === 'rise' ? '슬로프(상승)' : '슬로프(하강)', bank: `뱅크(${seg.direction === 'rise' ? '상승' : '하강'})`, 'lane-change': '레인체인지', marker: '스타트 마커', unsupported: '미지원' }
  return map[seg.segmentKind] ?? seg.segmentKind
}
function segColorClass(seg) {
  if (seg.segmentKind === 'slope' || seg.segmentKind === 'bank') return seg.direction === 'rise' ? 'rise' : 'fall'
  return ''
}

// ---------------------------------------------------------------------------
// 렌더: 충실도 배너 옆 디자인 근거 패널
// ---------------------------------------------------------------------------
function renderRationale() {
  const panel = document.getElementById('design-rationale')
  panel.innerHTML = ''
  panel.append(h('strong', { text: '디자인 근거 (design-system/tokens.md §0~1)' }))
  panel.append(h('ul', {}, [
    h('li', { text: '커밋: 다크 계측기 톤(무채색 90%+데이터색 10%) — 3D 형상 대비가 어두운 배경에서 더 크고, 대조는 배경이 아니라 피스 색 일치로 성립.' }),
    h('li', { text: '기각: 라이트 "도면 앱" 톤 — 편집기와 배경까지 맞추는 안. 형상 대비 근거 부족.' }),
    h('li', { text: '커밋: 상승=원본 빨강 #AD0A09, 하강=원본 파랑 #004E8F — 편집기 실측색과 다르면 도면·3D 대조가 깨짐.' }),
    h('li', { text: '기각: ux-brief 제안 초록/주황 — 근거 기록 없음 + 편집기 팔레트 다른 인덱스와 충돌.' }),
    h('li', { text: 'NEEDS_DECISION: 고저차 시각 과장 배율 적용 여부(FEAT-005/010) — 이 프로토타입은 과장 미적용, "상대 스케일" 표기로 대응.' }),
    h('li', { text: 'NEEDS_DECISION: 3D 뷰 기본 배경(다크/라이트) — 기능 영향 없어 다크를 임시값으로 진행(project-brief).' }),
  ]))
}

// ---------------------------------------------------------------------------
// 화면: 입력 대기
// ---------------------------------------------------------------------------
function renderInputScreen() {
  const codes = store.FIXTURE_CODES.filter(c => !['MALFORMED', 'EMPTY'].includes(c))
  const card = h('div', { class: 'center-card' }, [
    h('h1', { text: '미니4WD 트랙 3D 뷰어' }),
    h('p', { class: 'hint', text: '공유 링크(view/XXXXXX 형식)를 붙여넣으면 트랙을 조회합니다.' }),
    (() => {
      const form = h('form', { 'data-wh-anchor': 'wh-feat-url-input-form', 'data-wh-feature': 'FEAT-001', 'data-wh-tests': 'TC-001-1,TC-001-2,TC-001-3,TC-001-4,TC-001-5,TC-001-6,TC-001-8' })
      const input = h('input', { type: 'text', id: 'url-input', 'aria-label': 'view URL', placeholder: 'view/DEMO01', value: S.inputValue })
      const errorEl = h('p', { class: 'field-error', role: 'alert', id: 'url-input-error' })
      form.append(
        h('div', { class: 'field-row' }, [input, h('button', { class: 'btn btn-primary', type: 'submit', text: '조회' })]),
        errorEl,
      )
      form.addEventListener('submit', e => {
        e.preventDefault()
        const val = input.value.trim()
        const m = val.match(/^(?:https?:\/\/[^/]+\/)?view\/([A-Za-z0-9]{6})$/)
        if (!m) { errorEl.textContent = '유효하지 않은 링크입니다. view/XXXXXX 형식으로 입력하세요.'; return }
        errorEl.textContent = ''
        S.inputValue = val
        const code = m[1].toUpperCase()
        if (code === 'NETERR') return submitCode(code, { simulateNetworkError: true })
        if (code === 'TIMEOUT') return submitCode(code, { simulateTimeout: true })
        submitCode(code)
      })
      return form
    })(),
    h('div', { class: 'example-codes' }, [
      '예시 코드: ',
      ...codes.flatMap(c => [h('code', { text: `view/${c}`, tabindex: '0', role: 'button', onClick: () => { S.inputValue = `view/${c}`; render(); document.getElementById('url-input')?.focus() } }), ' ']),
      h('br'),
      '오류 데모: ',
      h('code', { text: 'view/NETERR', tabindex: '0', role: 'button', onClick: () => { S.inputValue = 'view/NETERR'; render() } }), ' ',
      h('code', { text: 'view/TIMEOUT', tabindex: '0', role: 'button', onClick: () => { S.inputValue = 'view/TIMEOUT'; render() } }), ' ',
      h('code', { text: 'view/PARSEER', tabindex: '0', role: 'button', onClick: () => { S.inputValue = 'view/PARSEER'; render() } }), ' ',
      h('code', { text: 'view/ZZZZZZ', tabindex: '0', role: 'button', onClick: () => { S.inputValue = 'view/ZZZZZZ'; render() } }),
      h('span', { class: 'sr-only', text: '(미등록 코드 — 트랙을 찾을 수 없습니다)' }),
    ]),
  ])
  return h('div', { class: 'center-card-shell' }, [card])
}

// PARSEER, MALFORMED 코드를 파싱 실패 fixture로 매핑(6자리 형식 유지를 위한 별칭).
// 주의: `import * as store`의 모듈 네임스페이스 객체는 읽기 전용이라 store.loadTrackByCode에
// 재할당하면 TypeError로 모듈 평가 자체가 실패한다 — 로컬 래퍼로 감싼다(store 원본은 불변).
const CODE_ALIAS = { PARSEER: 'MALFORMED' }
function loadTrackByCode(code, opts) { return store.loadTrackByCode(CODE_ALIAS[code] ?? code, opts) }

// ---------------------------------------------------------------------------
// 화면: 로딩
// ---------------------------------------------------------------------------
function renderLoadingScreen() {
  return h('div', { class: 'loading-shell' }, [
    h('div', { class: 'spinner', role: 'status', 'aria-label': '로딩 중' }),
    h('p', { text: '트랙을 불러오는 중입니다…' }),
    S.view.kind === 'loading-slow' ? h('p', { class: 'loading-slow-text', text: '시간이 걸리고 있어요…' }) : null,
  ])
}

// ---------------------------------------------------------------------------
// 화면: 에러
// ---------------------------------------------------------------------------
const ERROR_MESSAGES = {
  network: '편집기 서버에 연결하지 못했습니다.',
  timeout: '응답이 시간 초과되었습니다.',
  parse: '트랙 데이터를 해석하지 못했습니다.',
  'not-closed-fatal': '트랙 데이터가 심각하게 손상되어 표시할 수 없습니다.',
}
function renderErrorScreen() {
  const reason = S.error?.reason ?? 'network'
  const message = S.error?.messageKey === 'no-start' ? '시작 지점(START)을 찾을 수 없습니다.'
    : S.error?.messageKey === 'not-found' ? '트랙을 찾을 수 없습니다.'
    : ERROR_MESSAGES[reason]
  const card = h('div', { class: 'center-card' }, [
    h('h1', { text: '불러오지 못했습니다' }),
    h('div', { id: 'wh-feat-alert-slot' }, [
      h('div', { class: 'banner error', role: 'alert', 'aria-live': 'assertive' }, [
        '⚠ ' + message,
      ]),
    ]),
    S.error?.rawSnippet !== undefined ? (() => {
      const details = h('details', { style: 'margin-top:12px;font-size:12px;color:var(--text-secondary)' })
      details.append(h('summary', { text: '원본 응답 일부 보기(디버그)' }))
      details.append(h('pre', { style: 'white-space:pre-wrap;word-break:break-all', text: S.error.rawSnippet || '(빈 응답)' }))
      return details
    })() : null,
    h('button', {
      class: 'btn btn-primary', type: 'button', style: 'margin-top:16px', text: '다시 시도',
      'data-wh-anchor': 'wh-feat-error-retry-button', 'data-wh-feature': 'FEAT-001', 'data-wh-tests': 'TC-001-5',
      onClick: () => submitCode(S.lastCode ?? 'DEMO01'),
    }),
  ])
  return h('div', { class: 'center-card-shell' }, [card])
}

// ---------------------------------------------------------------------------
// AppHeader / TopBar (공통, FEAT-001 관련 출처 링크 상시 노출 — TC-001-7/TC-014-4)
// ---------------------------------------------------------------------------
function appHeader() {
  return h('header', { class: 'top-bar', role: 'banner' }, [
    h('h1', { text: '미니4WD 트랙 3D 뷰어' }),
    h('div', { class: 'actions' }, [
      h('button', {
        class: 'btn', type: 'button', text: '다른 트랙 보기',
        'data-wh-anchor': 'wh-feat-app-header-switch-track', 'data-wh-feature': 'FEAT-001',
        onClick: goInput,
      }),
      h('a', {
        class: 'source-link', href: 'https://mini4wd-track-editor.pimentoso.com/', target: '_blank', rel: 'noopener', text: '원본 편집기 ↗',
        'data-wh-anchor': 'wh-feat-app-header-source-link', 'data-wh-feature': 'FEAT-001', 'data-wh-tests': 'TC-001-7,TC-014-4',
      }),
    ]),
  ])
}

// ---------------------------------------------------------------------------
// SectionList (FEAT-013, +FEAT-008/009 표기)
// ---------------------------------------------------------------------------
function renderSectionList() {
  const segs = S.track.segments
  const panel = h('div', { class: 'section-list-panel' })
  panel.append(h('div', { class: 'section-list-header' }, [
    h('h2', { text: '텍스트 구간 목록' }),
    h('span', { class: 'count-badge', text: `${segs.length}개 구간` }),
    S.view.kind !== 'webgl-unsupported' ? h('button', {
      class: 'btn', style: 'font-size:11px;padding:2px 8px', 'aria-expanded': String(S.listExpanded), text: S.listExpanded ? '접기' : '펼치기',
      onClick: () => { S.listExpanded = !S.listExpanded; renderViewerBody() },
    }) : null,
  ]))
  if (!S.listExpanded) { panel.style.flex = '0 0 auto'; return panel }

  const list = h('ul', {
    // `section-list`가 스크롤 규칙(app.css `[role="listbox"].section-list`)을 받는 클래스다.
    // 종전에는 앵커 클래스만 붙어 규칙이 한 번도 걸리지 않았고, 132행이 그대로 펼쳐져
    // 목록이 4536px가 됐다(사용자 지적: "뷰어와 같은 높이로 하고 스크롤 추가해줘").
    class: 'wh-feat-section-list section-list', role: 'listbox', id: 'main-content', tabindex: '-1', 'aria-label': '텍스트 구간 목록',
    'data-wh-anchor': 'wh-feat-section-list', 'data-wh-feature': 'FEAT-013', 'data-wh-tests': 'TC-013-1,TC-013-2,TC-013-3,TC-013-4,TC-013-5',
  })
  list.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); S.focusedIndex = Math.min(segs.length - 1, S.focusedIndex + 1); renderViewerBody() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.focusedIndex = Math.max(0, S.focusedIndex - 1); renderViewerBody() }
    else if (e.key === 'Enter') { e.preventDefault(); commitSelect(S.focusedIndex, 'list') }
  })

  segs.forEach((seg, i) => {
    const isFirstUnsupported = seg.segmentKind === 'unsupported' && segs.findIndex(s => s.segmentKind === 'unsupported') === i
    const isLaneChange = seg.segmentKind === 'lane-change'
    const row = h('li', {
      class: `section-row${S.focusedIndex === i ? ' roving-focus' : ''}`,
      role: 'option', 'aria-selected': String(S.cursor.state.currentIndex === i), 'aria-disabled': seg.failed ? 'true' : null,
      tabindex: S.focusedIndex === i ? '0' : '-1', 'data-index': i,
      ...(isLaneChange ? { 'data-wh-anchor': 'wh-feat-list-row-lane-change', 'data-wh-feature': 'FEAT-008', 'data-wh-tests': 'TC-008-3' } : {}),
      ...(isFirstUnsupported ? { 'data-wh-anchor': 'wh-feat-list-row-unsupported', 'data-wh-feature': 'FEAT-009', 'data-wh-tests': 'TC-009-1,TC-009-3' } : {}),
      onClick: () => { if (seg.failed) return; S.focusedIndex = i; commitSelect(i, 'list') },
    }, [
      h('span', { class: 'idx', text: String(i + 1) }),
      h('span', { class: 'kind-icon', 'aria-hidden': 'true', text: segIcon(seg) }),
      h('span', { class: `label ${segColorClass(seg)}-text` }, [
        `${seg.pieceType} · ${segKindLabel(seg)}`,
        seg.unsupportedLabel ? h('span', { class: 'unsupported-label', text: `  ${seg.unsupportedLabel}` }) : null,
      ]),
      seg.failed ? h('span', { class: 'sr-only', text: '연결 실패로 접근 불가' }) : null,
      seg.evidenceGrade ? evidenceBadge(seg.evidenceGrade, i === segs.findIndex(s => s.evidenceGrade) ? 'wh-feat-list-row-evidence-badge' : null) : null,
    ])
    list.append(row)
  })
  panel.append(list)
  return panel
}

function commitSelect(index, source) {
  if (!S.cursor.isReachable(index)) return
  S.cursor.setCursor(index, source)
}

// ---------------------------------------------------------------------------
// TrackCanvas 근사 (SVG 2D 평면도) — FEAT-006/007/008/009/011
// ---------------------------------------------------------------------------
function pathD(segs) {
  return segs.map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join(' ')
}

function renderCanvasColumn() {
  const segs = S.track.segments
  const col = h('div', { class: 'canvas-column' })
  col.append(h('div', { class: 'canvas-fidelity-note', text: `실렌더링 근사치 — 실제 구현은 three.js 3D · 3레인(폭 ${TRACK_WIDTH}cm) · 고저차 ${S.zExaggerate}× 과장(실측 아님)` }))

  // viewBox는 **데이터 경계에서 계산**한다. 고정값을 쓰면 편집기 절대좌표를 가진 실 트랙이
  // 화면 밖으로 나간다(실측: viewBox -330..330 vs 실데이터 x 118~820).
  const pts = segs.flatMap(s2 => (s2.p1 && s2.p2) ? [s2.p1, s2.p2] : [[s2.x, s2.y]])
  const bx = pts.map(p => p[0]), by = pts.map(p => p[1])
  const pad = 40
  const cx = (Math.min(...bx) + Math.max(...bx)) / 2, cy = (Math.min(...by) + Math.max(...by)) / 2
  const bw = Math.max(Math.max(...bx) - Math.min(...bx), 1) + pad * 2
  const bh = Math.max(Math.max(...by) - Math.min(...by), 1) + pad * 2
  // 투영 좌표는 center 기준 원점 정렬이므로 viewBox도 원점 대칭이다.
  const span = Math.max(bw, bh) * 1.15 * S.orbitZoom
  const viewBox = `${(-span / 2).toFixed(1)} ${(-span / 2).toFixed(1)} ${span.toFixed(1)} ${span.toFixed(1)}`
  const svgEl = svg('svg', { class: 'track-plan-svg', viewBox, tabindex: '0', role: 'img', 'aria-label': `트랙 3레인 입체 형상(근사) — x ${S.orbitRx.toFixed(0)}도 y ${S.orbitRy.toFixed(0)}도 z ${S.orbitAngle.toFixed(0)}도`, 'data-wh-anchor': 'wh-feat-canvas-3d-approx', 'data-wh-feature': 'FEAT-006', 'data-wh-tests': 'TC-006-2,TC-006-3,TC-006-5' })
  // 회전 기준은 원점이 아니라 **트랙 중심**이다. 원점 기준이면 절대좌표 트랙이 화면 밖으로 튄다.
  // 회전할 때 SVG 요소 자체는 유지하고 **내용만** 다시 그린다. 요소를 갈아끼우면
  // 드래그 중 pointer capture와 리스너가 끊겨 드래그가 멈춘다(PC-010).
  function paint() {
    const span2 = Math.max(bw, bh) * 1.15 * S.orbitZoom
    svgEl.setAttribute('viewBox', `${(-span2 / 2).toFixed(1)} ${(-span2 / 2).toFixed(1)} ${span2.toFixed(1)} ${span2.toFixed(1)}`)
    svgEl.setAttribute('aria-label', `트랙 3레인 입체 형상(근사) — x ${S.orbitRx.toFixed(0)}도 y ${S.orbitRy.toFixed(0)}도 z ${S.orbitAngle.toFixed(0)}도`)
  const g = svg('g', { 'data-cx': cx.toFixed(1), 'data-cy': cy.toFixed(1) })  // 회전은 투영 행렬이 한다

  // ── 3레인 3D 렌더 ────────────────────────────────────────────────────
  // 근거: 00_source/piece-shapes.md — 레인 3 · 폭 12cm · 1px=1cm (전부 measured)
  //       decision-log D-022 — 슬로프 S곡선 40° · 뱅크 로그 20°
  // 형상은 순서와 무관하다(PC-005). z(고도)만 진행 순서를 따른다.
  const built = buildLanes(segs, { steps: 6, zExaggerate: S.zExaggerate })
  const zs = built.flatMap(b => b.lanes[0].map(p => p[2]))
  const zMid = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0
  const project = makeProjector({
    rx: S.orbitRx, ry: S.orbitRy, rz: S.orbitAngle, zoom: 1,
    center: [cx, cy, zMid],
  })
  const zx = S.zExaggerate
  const P3 = ([x, y, z]) => project([x, y, z * zx])

  // 깊이 정렬 — 뒤쪽부터 그려야 겹침이 자연스럽다.
  const drawables = []
  for (const { seg, lanes, bands, rim } of built) {
    const projected = lanes.map(L => L.map(P3))
    const projBands = bands.map(([lo, hi]) => [lo.map(P3), hi.map(P3)])
    const projRim = rim.map(E => E.map(P3))
    const depth = projected[1].reduce((a, p) => a + p[2], 0) / projected[1].length
    drawables.push({ seg, projected, projBands, projRim, depth })
  }
  drawables.sort((a, b) => b.depth - a.depth)

  for (const { seg, projBands, projRim } of drawables) {
    // 면에는 옛 선 렌더용 seg-path를 붙이지 않는다 — stroke-width/dasharray가 딸려 와
    // 가장자리에 얇은 선을 남긴다(D-036).
    const cls = [segColorClass(seg), seg.segmentKind === 'bank' ? 'bank' : '', seg.failed ? 'seg-order-unknown' : ''].filter(Boolean).join(' ')
    // 레인은 선이 아니라 **면**이다 — 레인마다 자기 폭(12cm)을 가진 폴리곤을 그린다.
    // 종전에는 바깥 레인 두 개의 중심선만 이어 24cm로 그렸다(실제 36cm, D-034).
    projBands.forEach(([lo, hi], li) => {
      const pts = [...lo.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`),
                   ...hi.slice().reverse().map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)].join(' ')
      g.append(svg('polygon', { class: `track-face lane-band lane-${li} ` + cls, points: pts }))
    })
    // 레인 경계선 — 면의 가장자리를 따라 그어 레인 구분을 드러낸다.
    //
    // 종전에는 `[레인0의 왼쪽 가장자리, 각 레인의 오른쪽 가장자리]` 4줄을 그었다.
    // **레인 번호 순서 = 좌우 순서**라는 가정인데 레인체인지에서 깨진다 — 레인2가
    // 오른쪽 끝에서 왼쪽 끝으로 건너가므로, 피스 끝에서 그리는 위치가
    // [6, −6, −18, 6]이 되어 **바깥 경계 +18이 빠지고 선 하나가 트랙을 대각선으로
    // 가로질렀다**(사용자 지적). 바깥 경계는 geom3d가 가로 위치로 뽑아 주는 rim을 쓰고,
    // 자리바꿈이 있는 피스는 레인마다 **자기 윤곽**을 그린다.
    const reorders = seg.segmentKind === 'lane-change' || (seg.pieceType || '').startsWith('Lan')
    const inner = reorders ? projBands.flatMap(([lo, hi]) => [lo, hi])
                           : [projBands[0][1], projBands[1][1]]
    const pathOf = E => E.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    inner.forEach(E => g.append(svg('path', { class: 'lane-line', d: pathOf(E) })))
    projRim.forEach(E => g.append(svg('path', { class: 'lane-line lane-edge', d: pathOf(E) })))
  }

  // 순서 복원이 끊긴 지점 표시(투영 좌표)
  if (S.track.truncatedAt !== null) {
    const b0 = built[S.track.truncatedAt]
    if (b0) {
      const mid = b0.lanes[1][Math.floor(b0.lanes[1].length / 2)]
      const c0 = P3(mid)
      g.append(svg('circle', { class: 'truncate-marker', cx: c0[0], cy: c0[1], r: 14, 'data-wh-anchor': 'wh-feat-canvas-truncate-marker', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-004-2,TC-004-3' }))
    }
  }
  // 미지원 피스 · 레인체인지 · 커서는 투영 좌표를 쓴다.
  const projCenter = seg => { const b = built.find(x => x.seg === seg); if (!b) return null
    const mid = b.lanes[1][Math.floor(b.lanes[1].length / 2)]; return P3(mid) }
  let unsupportedAnchored = false
  segs.forEach(seg => {
    if (seg.segmentKind !== 'unsupported') return
    const c = projCenter(seg); if (!c) return
    const anchorAttrs = !unsupportedAnchored ? { 'data-wh-anchor': 'wh-feat-canvas-unsupported-marker', 'data-wh-feature': 'FEAT-009', 'data-wh-tests': 'TC-009-1,TC-009-3' } : {}
    unsupportedAnchored = true
    g.append(svg('rect', { class: 'seg-unsupported', x: c[0] - 10, y: c[1] - 10, width: 20, height: 20, ...anchorAttrs }))
  })
  segs.forEach(seg => {
    if (seg.segmentKind !== 'lane-change') return
    const c = projCenter(seg); if (!c) return
    g.append(svg('line', { x1: c[0], y1: c[1], x2: c[0] + 18, y2: c[1] - 10, stroke: 'var(--text-secondary)', 'stroke-width': 2, 'stroke-dasharray': '2 2' }))
  })
  const cur = segs[S.cursor.state.currentIndex]
  if (cur) {
    const c = projCenter(cur)
    if (c) {
      g.append(svg('circle', { class: 'cursor-dot-halo', cx: c[0], cy: c[1], r: 12 }))
      g.append(svg('circle', { class: 'cursor-dot', cx: c[0], cy: c[1], r: 6 }))
    }
  }
    // 집기 판정은 **투영 좌표**로 해야 한다. 편집기 원좌표(s.x, s.y)와 비교하면
    // 3D 회전 상태에서 엉뚱한 구간이 잡힌다(PC-010).
    svgEl.__whCenters = segs.map((seg, i) => ({ i, c: seg.failed ? null : projCenter(seg) })).filter(o => o.c)
  svgEl.replaceChildren(g)
    window.__whOverlay?.refresh()
  }
  paint()
  svgEl.__whRepaint = paint

  // 오빗(드래그): 회전은 커서를 쓰지 않는다. pointerup 후 ≥250ms debounce로만 onOrbitDepart 발행.
  let dragStart = null
  let candidateIndex = null
  svgEl.addEventListener('pointerdown', e => {
    dragStart = { x: e.clientX, y: e.clientY, rz: S.orbitAngle, rx: S.orbitRx }
    svgEl.setPointerCapture(e.pointerId)
    hideOrbitHint()
  })
  svgEl.addEventListener('pointermove', e => {
    if (!dragStart) return
    // 좌우 드래그 = z축(평면 회전), 상하 드래그 = x축(눕히기). 사용자 요구: x·y·z 회전
    // 좌우 드래그는 잡아 돌리는 감각이어야 한다 — 오른쪽으로 끌면 트랙 앞면이
    // 오른쪽으로 따라온다. 부호가 반대였다(PC-011).
    S.orbitAngle = wrap360(dragStart.rz - (e.clientX - dragStart.x) * 0.4)
    S.orbitRx = wrap360(dragStart.rx + (e.clientY - dragStart.y) * 0.3)
    const pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const local = pt.matrixTransform(svgEl.getScreenCTM().inverse())
    // <g transform="rotate(...)">는 3D 재작업에서 없어졌다. 역회전 대신 paint()가
    // 남긴 투영 중심과 직접 비교한다.
    candidateIndex = nearestProjectedIndex(svgEl, local.x, local.y)
    renderCanvasOnlyOrbit()
  })
  const finishOrbit = () => {
    if (!dragStart) return
    dragStart = null
    if (S.orbitDebounceTimer) clearTimeout(S.orbitDebounceTimer)
    const idx = candidateIndex
    S.orbitDebounceTimer = setTimeout(() => { if (idx !== null) commitSelect(idx, 'canvas') }, 260)
  }
  svgEl.addEventListener('pointerup', finishOrbit)
  svgEl.addEventListener('pointercancel', finishOrbit)
  svgEl.addEventListener('wheel', e => { e.preventDefault(); S.orbitZoom = Math.min(2, Math.max(0.5, S.orbitZoom + (e.deltaY > 0 ? 0.1 : -0.1))); renderCanvasOnlyOrbit() }, { passive: false })
  svgEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { S.orbitAngle = wrap360(S.orbitAngle + 8); renderCanvasOnlyOrbit() }
    else if (e.key === 'ArrowUp') { S.orbitRx = wrap360(S.orbitRx + 6); renderCanvasOnlyOrbit() }
    else if (e.key === 'ArrowDown') { S.orbitRx = wrap360(S.orbitRx - 6); renderCanvasOnlyOrbit() }
    else if (e.key === 'q' || e.key === 'Q') { S.orbitRy = wrap360(S.orbitRy - 6); renderCanvasOnlyOrbit() }
    else if (e.key === 'e' || e.key === 'E') { S.orbitRy = wrap360(S.orbitRy + 6); renderCanvasOnlyOrbit() }
    else if (e.key === 'ArrowRight') { S.orbitAngle = wrap360(S.orbitAngle - 8); renderCanvasOnlyOrbit() }
    else if (e.key === '+' || e.key === '=') { S.orbitZoom = Math.max(0.5, S.orbitZoom - 0.1); renderCanvasOnlyOrbit() }
    else if (e.key === '-') { S.orbitZoom = Math.min(2, S.orbitZoom + 0.1); renderCanvasOnlyOrbit() }
  })

  col.append(svgEl)
  col.append(renderOrbitHint())
  col.append(renderLegend())
  col.append(renderControlCluster())
  return col
}

// 투영 좌표 기준 최근접 구간. paint()가 기록한 __whCenters만 본다.
function nearestProjectedIndex(svgEl, x, y) {
  const list = svgEl.__whCenters || []
  let best = null, bestDist = Infinity
  for (const o of list) {
    const d = (o.c[0] - x) ** 2 + (o.c[1] - y) ** 2
    if (d < bestDist) { bestDist = d; best = o.i }
  }
  return best
}

// 각도를 0~359로 접는다. 세 축 모두 한 바퀴를 돌 수 있어야 한다.
const wrap360 = v => ((v % 360) + 360) % 360

function nearestIndexByXY(segs, x, y) {
  let best = 0, bestDist = Infinity
  segs.forEach((s, i) => {
    if (s.failed) return
    const d = (s.x - x) ** 2 + (s.y - y) ** 2
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

// 회전은 투영 행렬이 하므로 기하를 다시 계산해야 한다. 프레임당 1회로 묶는다.
let orbitRaf = 0
function renderCanvasOnlyOrbit() {
  if (orbitRaf) return
  orbitRaf = requestAnimationFrame(() => {
    orbitRaf = 0
    appEl.querySelector('.track-plan-svg')?.__whRepaint?.()
  })
}

function hideOrbitHint() {
  S.orbitHintDismissed = true
  const hint = appEl.querySelector('.orbit-hint')
  if (hint) hint.classList.add('hidden')
}
function renderOrbitHint() {
  return h('div', { class: `orbit-hint${S.orbitHintDismissed ? ' hidden' : ''}`, text: '드래그: ←→ z축 / ↑↓ x축 · Q·E: y축 · 방향키: 회전 · 휠·+/-: 확대/축소 · 세 축 모두 360도' })
}

function renderLegend() {
  const alignment = h('div', { class: 'legend-align-layer' })
  const wrap = h('div', { class: 'legend' })
  const trigger = h('button', { class: 'legend-trigger', type: 'button', 'aria-expanded': String(S.legendOpen), 'aria-controls': 'legend-panel', text: '범례', 'data-wh-anchor': 'wh-feat-legend-toggle', 'data-wh-feature': 'FEAT-010' })
  const panelItems = [
    ['rise', '↑ 상승', 'var(--rise-fg)'],
    ['fall', '↓ 하강', 'var(--fall-fg)'],
    ['measured', '실선·실측', 'var(--badge-measured)'],
    ['confirmed', '실선·확인', 'var(--badge-confirmed)'],
    ['inferred', '실선·추정', 'var(--badge-inferred)'],
    ['unknown', '점선·미확인', 'var(--badge-unknown)'],
  ]
  const panel = h('div', { class: 'legend-panel', id: 'legend-panel', hidden: !S.legendOpen },
    panelItems.map(([k, label, color]) => h('span', { class: 'legend-item' }, [h('span', { style: `width:10px;height:10px;border-radius:2px;background:${color}` }), label])))
  trigger.addEventListener('click', () => { S.legendOpen = !S.legendOpen; renderViewerBody() })
  wrap.append(trigger, panel)
  alignment.append(wrap)
  return alignment
}

// ---------------------------------------------------------------------------
// ControlCluster — FEAT-007
// ---------------------------------------------------------------------------
function renderControlCluster() {
  const wrap = h('div', { class: 'wh-feat-control-cluster', 'data-wh-anchor': 'wh-feat-control-cluster', 'data-wh-feature': 'FEAT-007', 'data-wh-tests': 'TC-007-1,TC-007-3,TC-008-2' })
  const followId = 'follow-switch'
  const switchWrap = h('label', { class: 'switch', for: followId }, [
    h('input', { type: 'checkbox', id: followId, checked: S.followMode || null, onChange: e => { S.followMode = e.target.checked; renderViewerBody() } }),
    h('span', { class: 'track' }, [h('span', { class: 'thumb' })]),
    '트랙 따라가기',
  ])
  const speedGroup = h('div', { role: 'radiogroup', class: 'segmented', 'aria-label': '탐색 속도' },
    ['slow', 'normal', 'fast'].map(v => h('button', {
      role: 'radio', type: 'button', 'aria-checked': String(S.playbackSpeed === v), text: { slow: '느리게', normal: '보통', fast: '빠르게' }[v],
      onClick: () => { S.playbackSpeed = v; renderViewerBody() },
    })))
  const playBtn = h('button', {
    class: 'play-btn', type: 'button', 'aria-label': S.isPlaying ? '일시정지' : '재생', text: S.isPlaying ? '⏸' : '▶',
    onClick: () => togglePlay(),
    disabled: !S.followMode || null,
  })
  wrap.append(switchWrap, speedGroup, playBtn)
  return wrap
}

function togglePlay() {
  if (S.isPlaying) {
    resetPlayback()
    renderViewerBody()
    return
  }
  S.isPlaying = true
  const interval = { slow: 900, normal: 550, fast: 280 }[S.playbackSpeed]
  S.playTimer = setInterval(() => {
    const next = S.cursor.state.currentIndex + 1
    if (!S.cursor.isReachable(next)) { resetPlayback(); renderViewerBody(); return }
    S.cursor.setCursor(next, 'canvas')
  }, interval)
  renderViewerBody()
}

// ---------------------------------------------------------------------------
// ProfileStrip — FEAT-012 (+FEAT-005 곡선 렌더)
// ---------------------------------------------------------------------------
function smoothPath(points) {
  if (points.length < 2) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const mx = (x0 + x1) / 2
    d += ` Q ${x0} ${y0} ${mx} ${(y0 + y1) / 2} T ${x1} ${y1}`
  }
  return d
}

function renderProfileStrip() {
  const segs = S.track.segments
  const wrap = h('div', { class: `profile-strip${S.stripCollapsed ? ' collapsed' : ''}` })
  const summary = segs[S.cursor.state.currentIndex]
  wrap.append(h('div', { class: 'profile-strip-header' }, [
    h('span', { 'aria-live': 'polite', text: `${segKindLabel(summary)} · ${S.cursor.state.currentIndex + 1}/${segs.length}` }),
    h('span', { class: 'sr-only', id: 'strip-desc', text: '상세 목록은 구간 목록 참고' }),
    h('button', { class: 'btn toggle-collapse', type: 'button', 'aria-expanded': String(!S.stripCollapsed), text: S.stripCollapsed ? '펼치기' : '접기', onClick: () => { S.stripCollapsed = !S.stripCollapsed; renderViewerBody() } }),
  ]))

  const body = h('div', { class: 'profile-strip-body' })
  const W = 1000, H = 120, PAD = 20
  const minWidthOk = true // 데스크탑 전용(min-width 960px 셸)이라 320px 폴백 경로는 구조적으로 도달하지 않음(문서화)
  if (!minWidthOk) { body.append(h('a', { class: 'profile-fallback-link', href: '#main-content', text: '구간 목록에서 확인' })); wrap.append(body); return wrap }

  const stripSvg = svg('svg', {
    class: 'wh-feat-profile-strip-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'slider',
    'aria-valuemin': '0', 'aria-valuemax': String(segs.length - 1), 'aria-valuenow': String(S.cursor.state.currentIndex),
    'aria-valuetext': `${segKindLabel(summary)}, ${S.cursor.state.currentIndex + 1}/${segs.length}`,
    'aria-describedby': 'strip-desc', tabindex: '0',
    'data-wh-anchor': 'wh-feat-profile-strip-svg', 'data-wh-feature': 'FEAT-012', 'data-wh-tests': 'TC-012-1,TC-012-2,TC-012-3,TC-012-4,TC-012-5',
  })

  const elevations = segs.map(s => s.elevationRelative)
  const validElevs = elevations.filter(v => v !== null)
  const maxE = Math.max(1, ...validElevs)
  const minE = Math.min(0, ...validElevs)
  const range = maxE - minE || 1
  const xOf = i => PAD + (i / (segs.length - 1)) * (W - PAD * 2)
  const yOf = e => H - PAD - ((e - minE) / range) * (H - PAD * 2)

  // 정상/실패 구간을 나눠 별도 path로(회색 점선 구간 분리, TC-012-3)
  let curPts = [], failPts = []
  segs.forEach((s, i) => {
    const pt = [xOf(i), s.elevationRelative === null ? H - PAD : yOf(s.elevationRelative)]
    if (s.failed) failPts.push(pt); else curPts.push(pt)
  })
  if (curPts.length > 1) stripSvg.append(svg('path', { class: 'profile-curve', d: smoothPath(curPts), 'data-wh-anchor': 'wh-feat-elevation-curve-path', 'data-wh-feature': 'FEAT-005', 'data-wh-tests': 'TC-005-3,TC-005-4,TC-005-5' }))
  if (failPts.length > 1) stripSvg.append(svg('path', { class: 'profile-curve-fail', d: smoothPath(failPts), 'data-wh-anchor': 'wh-feat-strip-fail-segment', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-012-3' }))

  // 세그먼트 경계 구분선
  segs.forEach((s, i) => stripSvg.append(svg('line', { x1: xOf(i), y1: 0, x2: xOf(i), y2: H, stroke: 'var(--border)', 'stroke-width': 0.5, opacity: 0.4 })))

  // Z-closure gap(TC-012-5/004-6)
  if (!S.track.isZClosed) {
    stripSvg.append(svg('line', { class: 'profile-zgap-marker', x1: xOf(0), y1: yOf(0), x2: xOf(0), y2: yOf(elevations.at(-1) ?? 0), 'data-wh-anchor': 'wh-feat-strip-zgap-marker', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-004-6,TC-012-5' }))
    const zgapText = svg('text', { x: xOf(0) + 4, y: 14, class: 'profile-axis-label', fill: 'var(--warning)' })
    zgapText.textContent = 'Z 불일치'
    stripSvg.append(zgapText)
  }

  // 커서 라인
  stripSvg.append(svg('line', { class: 'profile-cursor-line', x1: xOf(S.cursor.state.currentIndex), y1: 0, x2: xOf(S.cursor.state.currentIndex), y2: H }))
  const scaleLabel = svg('text', { x: PAD, y: 12, class: 'profile-axis-label' })
  scaleLabel.textContent = '상대 스케일(실측 아님)'
  stripSvg.append(scaleLabel)

  // 드래그 스크럽
  // 드래그 상태는 클로저 로컬 변수가 아니라 S에 둔다 — commitSelect가 매 픽셀 이동마다
  // renderViewerBody()로 이 svg 자체를 새로 만들기 때문에(공유 커서는 항상 최신 DOM으로
  // 전체를 다시 그린다), 로컬 변수에 두면 재생성된 새 엘리먼트에서 매번 false로 리셋되어
  // 드래그가 한 픽셀만 반영되고 멈추는 버그가 난다.
  const scrubAt = clientX => {
    const rect = stripSvg.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const idx = Math.round(ratio * (segs.length - 1))
    if (segs[idx]?.failed) return // TC-012-3: 회색 구간 드래그는 무시
    commitSelect(idx, 'strip')
  }
  if (S.stripScrubPointerId !== null) { try { stripSvg.setPointerCapture(S.stripScrubPointerId) } catch { /* 이미 해제된 포인터 id일 수 있음 — 무시 */ } }
  stripSvg.addEventListener('pointerdown', e => { S.stripScrubPointerId = e.pointerId; stripSvg.setPointerCapture(e.pointerId); scrubAt(e.clientX) })
  stripSvg.addEventListener('pointermove', e => { if (S.stripScrubPointerId !== null) scrubAt(e.clientX) })
  stripSvg.addEventListener('pointerup', () => { S.stripScrubPointerId = null })
  stripSvg.addEventListener('pointercancel', () => { S.stripScrubPointerId = null })
  stripSvg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); S.cursor.stepBy(1, 'strip'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); S.cursor.stepBy(-1, 'strip'); }
    else if (e.key === 'Home') { e.preventDefault(); commitSelect(0, 'strip') }
    else if (e.key === 'End') { e.preventDefault(); commitSelect(segs.length - 1, 'strip') }
  })

  body.append(stripSvg)
  wrap.append(body)
  return wrap
}

// ---------------------------------------------------------------------------
// 총계 표기 (TC-010-5) — 절대 단위 금지
// ---------------------------------------------------------------------------
function renderTotalsBar() {
  const totals = store.computeTotals(S.track.segments)
  return h('div', { class: 'totals-bar', 'data-wh-anchor': 'wh-feat-totals-evidence-badges', 'data-wh-feature': 'FEAT-010', 'data-wh-tests': 'TC-010-5' }, [
    h('span', {}, ['총 피스 수: ', h('span', { class: 'value', text: `${totals.totalPieces}피스` }), ' ', evidenceBadge('confirmed')]),
    h('span', {}, ['총 길이: ', h('span', { class: 'value', text: `${totals.totalLengthUnits}(편집기 l 단위)` }), ' ', evidenceBadge('unknown')]),
    S.track.label ? h('span', { style: 'margin-left:auto;color:var(--text-secondary)', text: `fixture: ${S.track.label}${S.track.fromCache ? ' (세션 캐시 복원)' : ''}` }) : null,
  ])
}

// ---------------------------------------------------------------------------
// AlertSlot — 부분 실패/대형 트랙 배너
// ---------------------------------------------------------------------------
function renderAlertSlot() {
  const slot = h('div', { id: 'wh-feat-alert-slot', 'data-wh-anchor': 'wh-feat-alert-slot', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-004-1,TC-004-4' })
  if (S.view.kind === 'partial-failure' && S.track.truncatedAt !== null) {
    slot.append(h('div', { class: 'banner warning', role: 'status', 'aria-live': 'polite', 'data-wh-anchor': 'wh-feat-partial-failure-banner', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-004-2,TC-004-3' },
      '⚠ 일부 구간의 순서를 확정하지 못해 해당 구간은 회색으로 표시됩니다.'))
  } else if (S.view.kind === 'partial-failure' && !S.track.isZClosed) {
    slot.append(h('div', { class: 'banner warning', role: 'status', 'aria-live': 'polite', 'data-wh-anchor': 'wh-feat-zgap-banner', 'data-wh-feature': 'FEAT-004', 'data-wh-tests': 'TC-004-5,TC-004-6' },
      '⚠ 고도가 시작 지점과 어긋납니다(Z 폐합 실패). 계산된 절대 고도값을 보정 없이 표시합니다.'))
  } else if (S.track.extraStartIndexes?.length) {
    slot.append(h('div', { class: 'banner info', role: 'status', 'aria-live': 'polite' },
      `ℹ START(Str2)가 ${S.track.extraStartIndexes.length + 1}개 발견되어 최초 등장 지점만 시작점으로 채택했습니다. 나머지는 일반 마커 직선으로 처리됩니다.`))
  } else if (S.track.segments.length > 300) {
    slot.append(h('div', { class: 'banner info', role: 'status', 'aria-live': 'polite', 'data-wh-anchor': 'wh-feat-large-track-banner', 'data-wh-feature': 'FEAT-011', 'data-wh-tests': 'TC-011-1,TC-011-3,TC-011-4' },
      `ℹ 대형 트랙: 일부 최적화 적용 (${S.track.segments.length}피스 > 300, ASSUMPTION-006)`))
  }
  return slot
}

// ---------------------------------------------------------------------------
// 화면: WebGL 미지원 대체 표현 (FEAT-014)
// ---------------------------------------------------------------------------
function renderWebglFallback() {
  const root = h('div', { class: 'viewer-shell', 'data-wh-anchor': 'wh-feat-webgl-fallback-screen', 'data-wh-feature': 'FEAT-014', 'data-wh-tests': 'TC-014-1,TC-014-2,TC-014-3,TC-014-4' })
  root.append(appHeader())
  root.append(h('div', { class: 'webgl-note', text: '이 브라우저는 3D 보기를 지원하지 않습니다. 파싱된 경로 데이터를 텍스트 구간 목록으로 대신 표시합니다.' }))
  root.append(renderAlertSlot())
  const main = h('div', { class: 'viewer-main full-width' })
  S.listExpanded = true
  main.append(renderSectionList())
  root.append(main)
  root.append(renderProfileStrip())
  return root
}

// ---------------------------------------------------------------------------
// 화면: 3D 표시 / 부분 실패 (3분할 셸)
// ---------------------------------------------------------------------------
function renderViewerShellScreen() {
  const root = h('div', { class: 'viewer-shell' })
  root.append(appHeader())
  root.append(renderAlertSlot())
  const main = h('div', { class: `viewer-main${S.listExpanded ? '' : ' full-width'}` })
  main.append(renderSectionList())
  main.append(renderCanvasColumn())
  root.append(main)
  root.append(renderProfileStrip())
  root.append(renderTotalsBar())
  return root
}

// renderViewerBody: 커서/컨트롤 변화 시 헤더는 그대로 두고 본문만 다시 그린다(포커스 보존을 위해
// SectionList의 roving focus는 다시 그린 뒤 focusedIndex 위치로 복원한다).
function renderViewerBody() {
  // 재렌더 전 포커스를 기억해두고, 같은 종류의 요소로 복원한다 — 목록 화살표/Enter,
  // 스트립 화살표, 캔버스 키보드 오빗 도중 DOM이 통째로 재생성되어도 포커스가 body로
  // 떨어지지 않게 한다(키보드 조작 연속성 보장).
  const active = document.activeElement
  const wasListRow = active?.classList?.contains('section-row')
  const wasStrip = active?.classList?.contains('wh-feat-profile-strip-svg')
  const wasCanvas = active?.classList?.contains('track-plan-svg')

  const root = S.view.kind === 'webgl-unsupported' ? renderWebglFallback() : renderViewerShellScreen()
  appEl.replaceChildren(root)

  if (wasListRow) appEl.querySelector(`.section-row[data-index="${S.focusedIndex}"]`)?.focus()
  else if (wasStrip) appEl.querySelector('.profile-strip-svg')?.focus()
  else if (wasCanvas) appEl.querySelector('.track-plan-svg')?.focus()
  window.__whOverlay?.refresh()
}

// ---------------------------------------------------------------------------
// 개발용 상태 전환 패널 (프로토타입 전용 — 실제 제품 기능 아님, FEAT 앵커 없음)
// ---------------------------------------------------------------------------
function renderDevPanel() {
  const btn = (label, fn) => h('button', { class: 'btn', type: 'button', text: label, onClick: fn })
  return h('div', { class: 'dev-state-panel' }, [
    h('div', { class: 'dev-label', text: '프로토타입 전용 · 상태 전환 데모(제품 기능 아님)' }),
    btn('입력 화면', goInput),
    btn('로딩(느림)', () => submitCode('DEMO01', { simulateSlow: true })),
    btn('실 트랙 WS67Y2', () => { S.webglOverride = null; submitCode('WS67Y2') }),
    btn('3D 정상(합성)', () => { S.webglOverride = null; submitCode('DEMO01') }),
    btn('부분 실패', () => { S.webglOverride = null; submitCode('PARTIAL') }),
    btn('Z 불균형', () => { S.webglOverride = null; submitCode('ZGAP') }),
    btn('START 없음', () => { S.webglOverride = null; submitCode('NOSTART') }),
    btn('START 2개+', () => { S.webglOverride = null; submitCode('MULTI') }),
    btn('대형 트랙(320)', () => { S.webglOverride = null; submitCode('LARGE') }),
    btn('완전 실패(네트워크)', () => submitCode('DEMO01', { simulateNetworkError: true })),
    btn('완전 실패(타임아웃)', () => submitCode('DEMO01', { simulateTimeout: true })),
    btn('완전 실패(파싱)', () => submitCode('MALFORMED')),
    btn('WebGL 미지원', () => { S.webglOverride = false; submitCode(S.lastCode ?? 'DEMO01') }),
    btn('WebGL 런타임 실패', () => { S.webglOverride = null; S.runtimeFailureSim = true; submitCode(S.lastCode ?? 'DEMO01') }),
    btn('WebGL 복원(실감지)', () => { S.webglOverride = null; render() }),
  ])
}

// ---------------------------------------------------------------------------
// 마스터 렌더
// ---------------------------------------------------------------------------
function render() {
  renderRationale()
  let content
  if (S.view.kind === 'input') content = renderInputScreen()
  else if (S.view.kind === 'loading' || S.view.kind === 'loading-slow') content = renderLoadingScreen()
  else if (S.view.kind === 'error') content = renderErrorScreen()
  else if (S.view.kind === 'webgl-unsupported') content = renderWebglFallback()
  else content = renderViewerShellScreen()
  appEl.replaceChildren(content)
  window.__whOverlay?.refresh()
}

// ---------------------------------------------------------------------------
// 초기화 — 딥링크(해시) 복원 + 배너 토글 + 오버레이
// ---------------------------------------------------------------------------
document.getElementById('rationale-toggle').addEventListener('click', e => {
  const panel = document.getElementById('design-rationale')
  const open = panel.hasAttribute('hidden')
  panel.toggleAttribute('hidden', !open)
  e.target.setAttribute('aria-expanded', String(open))
})

;(function init() {
  const initial = parseHash()
  if (initial.kind === '3d' || initial.kind === 'partial' || initial.kind === 'webgl') {
    const kindMap = { '3d': '3d', partial: 'partial-failure', webgl: 'webgl-unsupported' }
    const code = initial.code ?? 'DEMO01'
    if (kindMap[initial.kind] === 'webgl-unsupported') S.webglOverride = false
    const result = loadTrackByCode(code)
    if (result.ok) {
      S.track = result
      S.lastCode = code
      mountCursor(result.segments)
      S.view = { kind: kindMap[initial.kind] }
      if (Number.isFinite(initial.i)) S.cursor.setCursor(initial.i, 'initial')
      S.focusedIndex = S.cursor.state.currentIndex
    }
  } else if (initial.kind === 'error') {
    S.view = { kind: 'error', reason: initial.reason ?? 'network' }
    S.error = { reason: initial.reason ?? 'network' }
  }
  render()
  // dev 패널은 #app 밖(document.body)에 1회만 부착한다 — renderViewerBody()가
  // #app.replaceChildren()으로 본문만 다시 그릴 때 함께 지워지지 않도록 한다.
  document.body.append(renderDevPanel())
  window.__whOverlay = initWhOverlay()
})()

onHashChange(hash => {
  // 브라우저 Back/Forward: 최소한 입력 화면 복귀만 지원(그 외는 재조회 필요하므로 현재 화면 유지 안내는 생략)
  if (hash.kind === 'input' && S.view.kind !== 'input') { S.view = { kind: 'input' }; render() }
})
