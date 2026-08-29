// router.js — 해시 기반 클라이언트 라우팅.
// 이 앱은 layout-spec대로 단일 라우트(`/`)이지만, 화면 상태(kind)와 공유 커서 위치(i)를
// 해시에 반영해 "지금 보고 있는 지점"을 공유·새로고침·뒤로가기로 복원 가능하게 한다.
// 문법: #state=<kind>&code=<fixtureCode>&i=<index>&reason=<errorReason>

function encodeHash(params) {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v))
  }
  return `#${usp.toString()}`
}

export function parseHash() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  const usp = new URLSearchParams(raw)
  const out = { kind: usp.get('state') || 'input' }
  if (usp.has('code')) out.code = usp.get('code')
  if (usp.has('i')) out.i = Number(usp.get('i'))
  if (usp.has('reason')) out.reason = usp.get('reason')
  return out
}

// pushState 대신 replace: 화면 상태 전이 자체는 히스토리 엔트리를 쌓지 않는다(폼 제출·재시도가
// 브라우저 Back 스택을 어지럽히지 않도록). 커서 이동만 남기고 싶다면 push=true로 호출한다.
export function navigate(params, { push = false } = {}) {
  const hash = encodeHash(params)
  if (hash === location.hash) return
  if (push) {
    location.hash = hash
  } else {
    const url = `${location.pathname}${location.search}${hash}`
    history.replaceState(null, '', url)
    // replaceState는 hashchange를 발생시키지 않으므로 리스너에 수동 통지한다.
    dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

export function onHashChange(callback) {
  const handler = () => callback(parseHash())
  addEventListener('hashchange', handler)
  return () => removeEventListener('hashchange', handler)
}
