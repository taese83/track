import { useCallback, useEffect, useMemo, useState } from 'react'

import { validateClosure } from '@/entities/track/lib/closure'
import type { ClosureValidation } from '@/entities/track/lib/closure'
import { buildElevatedSegments, elevationDeltasOf, orientPath } from '@/entities/track/lib/elevation'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import { parseTrackString } from '@/entities/track/lib/parse'
import type { ParseTrackStringResult } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type {
  RestoreOrderFailureReason,
  RestoreOrderSuccess,
  StartSelection,
} from '@/entities/track/lib/restore'
import { SOURCE_EDITOR_URL } from '@/entities/track/model/schema'
import { useTrackFetch } from '@/features/load-track'
import type { LoadErrorReason } from '@/features/load-track'
import type { ParsedPiece } from '@/entities/track/model/types'
import { AppHeader } from '@/widgets/app-header/ui/AppHeader'
import { buildSectionItems } from '@/widgets/section-list'
import type { SectionListItem } from '@/widgets/section-list'
import { buildSceneLayout, markRenderStart } from '@/widgets/track-canvas'
import type { SceneLayout } from '@/widgets/track-canvas'

import { isCanvasBroken } from '../lib/canvas-failure-watch'
import { buildScreenProfileModel } from '../lib/profile-model'
import { detectWebglSupport } from '../lib/webgl-support'

import { ErrorScreen } from './ErrorScreen'
import { InputScreen } from './InputScreen'
import { TrackScreen } from './TrackScreen'
import { WebglFallbackScreen } from './WebglFallbackScreen'

/** 디버그 영역에 흘릴 원문 발췌 상한 — 전문을 그대로 노출하지 않는다 */
const SNIPPET_MAX_CHARS = 300

type ParseFailure = Extract<ParseTrackStringResult, { ok: false }>

function excerptOf(rawData: string): string {
  return rawData.length > SNIPPET_MAX_CHARS
    ? `${rawData.slice(0, SNIPPET_MAX_CHARS)}…(이하 생략, 전체 ${rawData.length}자)`
    : rawData
}

function buildParseSnippet(rawData: string, failure: ParseFailure): string {
  if (failure.reason === 'empty-track') {
    return `원문에 피스가 하나도 없습니다(원문 ${rawData.length}자).`
  }

  const first = failure.failures[0]
  const cause = first === undefined ? '' : ` 처음 어긋난 곳 — 세그먼트 ${first.segmentIndex}: ${first.detail}.`

  return `${excerptOf(rawData)}\n\n어긋난 세그먼트 ${failure.failures.length}건.${cause}`
}

/**
 * `traversal-incomplete`·`search-budget-exceeded`는 START가 없는 것이 아니라 끝점을 잇다 막힌
 * 경우다. START 부재 문구로 뭉개면 화면이 없는 원인을 지목하므로, 뜻이 맞는 기존 축인
 * `not-closed-fatal`("데이터가 심각하게 손상되어 표시할 수 없습니다")에 태운다.
 */
const RESTORE_ERROR_REASON: Record<RestoreOrderFailureReason, LoadErrorReason> = {
  'start-piece-missing': 'start-piece-missing',
  'traversal-incomplete': 'not-closed-fatal',
  'search-budget-exceeded': 'not-closed-fatal',
}

const RESTORE_FAILURE_DETAIL: Record<RestoreOrderFailureReason, string> = {
  'start-piece-missing': '피스 목록에 START(Str2)가 없어 시작 지점을 정하지 못했습니다.',
  'traversal-incomplete': '끝점을 이어도 모든 피스를 한 줄로 꿰지 못했습니다.',
  'search-budget-exceeded': '순서 탐색이 허용 범위를 넘겨 중단했습니다.',
}

function buildRestoreSnippet(
  rawData: string,
  reason: RestoreOrderFailureReason,
  pieceCount: number,
): string {
  return `${excerptOf(rawData)}\n\n${RESTORE_FAILURE_DETAIL[reason]}(파싱된 피스 ${pieceCount}개)`
}

// TC-003-5 — 후보가 여럿이었다는 사실과 고른 근거가 화면에 남아야 한다
function describeStart(start: StartSelection): string {
  return start.reason === 'only-start-piece'
    ? `${start.pieceId} · 유일한 START`
    : `${start.pieceId} · START 후보 ${start.candidatePieceIds.length}개 중 원문에 처음 나온 것`
}

type ViewOutcome =
  | {
      kind: 'restored'
      restored: RestoreOrderSuccess
      closure: ClosureValidation
      layout: SceneLayout
      elevated: readonly ElevatedSegment[]
      items: SectionListItem[]
      totalPieceCount: number
    }
  | { kind: 'failure'; reason: LoadErrorReason; rawSnippet: string }

/**
 * FEAT-004가 확보한 **연결된 구간까지만** 배치한다. 끊긴 뒤의 피스를 이어 그리면 화면이
 * 있지도 않은 연결을 주장한다(제품 계약 §5). `orderConfirmed=false`면 순서의 정본이
 * 아니라 진단용 접두부이므로 그 사실이 `truncated`로 드러난다.
 */
function buildScene(pieces: readonly ParsedPiece[], closure: ClosureValidation) {
  const byId = new Map(pieces.map((piece) => [piece.pieceId, piece]))
  const connected: ParsedPiece[] = []
  for (const pieceId of closure.connectedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) connected.push(found)
  }

  const oriented = orientPath(connected)
  const elevated = buildElevatedSegments(oriented).segments
  const truncated = connected.length < pieces.length
  // 피스 전체를 넘긴다 — `oriented`는 순서에 자리를 얻은 것만 담으므로, 이것이 없으면
  // 씬이 미지원 피스의 **존재 자체를 모른다**(FEAT-009). 실측: `UNSUPP` 134피스 중 2개가
  // `connectedPieceIds`에서 빠져 3D에 한 개도 들어오지 않았다.
  return {
    layout: buildSceneLayout({ oriented, elevated, truncated, allPieces: pieces }),
    elevated,
  }
}

/**
 * 화면 상태 머신의 소유자.
 *
 * fetch 성공 뒤의 파싱·순서 복원은 `track`의 동기 순수 파생이라 별도 상태를 두지 않는다.
 * `webgl-unsupported`는 **FEAT-014가 여기에 넣은 게이트**다 — component-spec §화면 상태
 * 머신이 "3D 진입 이전 게이트"로 규정했고, 데이터 fetch와 독립적으로 마운트 즉시 판정된다.
 */
export function TrackViewerPage() {
  const { state, track, submit, retry, reset } = useTrackFetch()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  /**
   * FEAT-014 게이트. **마운트 시 한 번만** 판정한다(lazy initializer) — fetch·파싱과 독립이고,
   * 렌더마다 다시 물으면 컨텍스트를 반복 생성해 오히려 소진의 원인이 된다. 미지원이면
   * `TrackCanvas`가 애초에 마운트되지 않으므로 "3D 렌더 시도 자체가 발생하지 않는다"
   * (TC-014-1)가 코드 구조로 성립한다 — 그린 뒤 숨기는 방식이 아니다.
   */
  const [webglSupported] = useState(detectWebglSupport)

  /**
   * 게이트를 통과했는데 렌더 도중 무너진 경우(TC-014-3). 게이트 판정과 **다른 축**이라
   * 따로 둔다 — 합치면 "지원하지 않는다"와 "지원하는데 실패했다"가 구분되지 않는다.
   */
  const [canvasRuntimeFailed, setCanvasRuntimeFailed] = useState(false)
  const canRender3d = webglSupported && !canvasRuntimeFailed

  const parsed = useMemo(
    () => (track === null ? null : parseTrackString(track.rawData, track.compat)),
    [track],
  )

  const stats = useMemo(() => {
    const pieces = parsed !== null && parsed.ok ? parsed.pieces : []
    return {
      total: pieces.length,
      unsupported: pieces.filter((piece) => !piece.isSupported).length,
      compatCorrected: pieces.filter((piece) => piece.compatCorrectionApplied === true).length,
    }
  }, [parsed])

  const outcome = useMemo<ViewOutcome | null>(() => {
    if (track === null || parsed === null) return null
    if (!parsed.ok) {
      return { kind: 'failure', reason: 'parse', rawSnippet: buildParseSnippet(track.rawData, parsed) }
    }

    const restored = restoreOrder(parsed.pieces)
    if (!restored.ok) {
      return {
        kind: 'failure',
        reason: RESTORE_ERROR_REASON[restored.reason],
        rawSnippet: buildRestoreSnippet(track.rawData, restored.reason, parsed.pieces.length),
      }
    }

    // 고도 프로파일을 폐합 판정에 주입한다 — FEAT-004가 열어 둔 구멍이고, 넣지 않으면
    // 현 규칙 근사가 화면의 Z 폐합 판정을 대신한다.
    const oriented = orientPath(
      restored.orderedPieceIds
        .map((pieceId) => parsed.pieces.find((piece) => piece.pieceId === pieceId))
        .filter((piece): piece is ParsedPiece => piece !== undefined),
    )
    const closure = validateClosure({
      pieces: parsed.pieces,
      restored,
      elevationDeltas: elevationDeltasOf(buildElevatedSegments(oriented)),
    })
    const scene = buildScene(parsed.pieces, closure)

    // 목록의 순서는 **자리가 정해진 것만** — 복원이 확정됐으면 그 순서, 부분 실패면
    // FEAT-004가 이어붙인 접두부다. 나머지 피스는 buildSectionItems가 자리 없음으로 남긴다.
    const items = buildSectionItems({
      pieces: parsed.pieces,
      orderedPieceIds: closure.connectedPieceIds,
    })

    return {
      kind: 'restored',
      restored,
      closure,
      layout: scene.layout,
      elevated: scene.elevated,
      items,
      totalPieceCount: parsed.pieces.length,
    }
  }, [track, parsed])

  /**
   * 파싱·복원 실패는 fetch 성공 뒤에 일어나므로 `state.status`만으로는 화면이 에러라는 사실이
   * 드러나지 않는다. component-spec의 ViewState는 이 경우를 `error`로 규정하므로 노출값을 맞춘다.
   */
  const viewState =
    state.status === 'success' && outcome?.kind === 'failure'
      ? 'error'
      : state.status === 'success' && outcome?.kind === 'restored' && !canRender3d
        ? 'webgl-unsupported'
        : state.status

  /**
   * performance-budget §1의 "초기 렌더 시간" 시작점은 **fetch 완료 시각**이다 —
   * 씬 데이터가 준비된 시각이 아니다. 파싱·순서 복원·고도 산출도 사용자가 기다리는
   * 시간이므로 그 앞에서 시작해야 3초 목표가 실제로 기다린 시간을 잰다.
   */
  useEffect(() => {
    if (track !== null) markRenderStart()
  }, [track])

  /**
   * TC-014-3 — 렌더러가 컨텍스트를 못 만들면 three가 예외를 **다시 던지고**, 그 던지기는
   * R3F 초기화 경로라 React 렌더/커밋 밖이다. 어떤 채널로 나오는지는 추측하지 않고 쟀다
   * (2026-08-30, `getContext` 소진 스텁):
   *
   * - `componentDidCatch` — **미포착**. 에러 경계를 두면 이 경로에 대해 죽은 코드가 된다.
   * - window `error` — **미발화**. 리스너가 한 번도 불리지 않았다.
   * - window `unhandledrejection` — **발화**. R3F가 초기화를 Promise 경로에서 하기 때문이다.
   *
   * 그래서 `unhandledrejection`을 정본 신호로 쓰고, `error`도 함께 듣는다(R3F 구현이 동기
   * 경로로 바뀌어도 계약이 조용히 죽지 않게 — 두 채널 모두 아래 같은 확인을 거친다).
   *
   * 무관한 에러를 "WebGL 미지원"으로 표기하지 않도록 귀속은 메시지가 아니라 **캔버스가
   * 실제로 컨텍스트를 갖고 있는지**로 가른다(`canvas-failure-watch`).
   * 3D를 그리는 동안에만 건다 — 대체 화면으로 내려간 뒤에는 들을 이유가 없다.
   */
  useEffect(() => {
    if (!canRender3d || outcome?.kind !== 'restored') return

    const inspect = () => {
      if (isCanvasBroken(document.querySelector('canvas'))) setCanvasRuntimeFailed(true)
    }

    window.addEventListener('unhandledrejection', inspect)
    window.addEventListener('error', inspect)
    return () => {
      window.removeEventListener('unhandledrejection', inspect)
      window.removeEventListener('error', inspect)
    }
  }, [canRender3d, outcome])

  const handleSwitchTrack = useCallback(() => {
    reset()
    setValue('')
    setTouched(false)
    // 런타임 실패는 그 트랙의 씬에 딸린 사실이다 — 다른 트랙까지 3D를 막으면 일시적
    // 컨텍스트 소진이 영구 강등이 된다. 게이트 판정(`webglSupported`)은 그대로 둔다.
    setCanvasRuntimeFailed(false)
  }, [reset])

  const handleBlur = useCallback(() => setTouched(true), [])

  return (
    <div className="flex h-full flex-col">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <AppHeader onSwitchTrack={handleSwitchTrack} sourceUrl={SOURCE_EDITOR_URL} />

      {/*
        `min-h-0` — flex 자식의 기본 `min-height: auto`는 내용이 커지면 `flex-1`을 밀어낸다.
        FEAT-013의 132행 목록이 들어오면서 셸이 뷰포트를 넘겨 스트립이 화면 밖으로 밀렸다
        (실측: 목록 4211px · 스트립 y=4342). 스크롤은 목록 안에서만 일어나야 한다.
      */}
      <main id="main-content" className="flex min-h-0 flex-1 flex-col" data-view-state={viewState}>
        {state.status === 'error' ? (
          <ErrorScreen
            reason={state.reason}
            {...(state.rawSnippet === undefined ? {} : { rawSnippet: state.rawSnippet })}
            onRetry={retry}
          />
        ) : state.status === 'success' && track !== null && outcome !== null ? (
          outcome.kind === 'restored' ? (
            !canRender3d ? (
              <WebglFallbackScreen items={outcome.items} profileModel={buildScreenProfileModel({ elevated: outcome.elevated, items: outcome.items, closure: outcome.closure })} />
            ) : (
            <TrackScreen
              layout={outcome.layout}
              elevated={outcome.elevated}
              closure={outcome.closure}
              totalPieceCount={outcome.totalPieceCount}
              items={outcome.items}
              pipelineSummary={
                <div data-testid="fetch-success">
                  <h2 className="text-[15px] leading-[1.3] font-semibold">
                    트랙 <span className="tabular">{track.trackCode}</span>
                  </h2>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px]">
                    <dt style={{ color: 'var(--color-text-secondary)' }}>원문 길이</dt>
                    <dd className="tabular" data-testid="raw-length">
                      {track.rawData.length}자
                    </dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>조회 시각</dt>
                    <dd className="tabular">{track.fetchedAt}</dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>compat</dt>
                    <dd data-testid="compat-flag">{String(track.compat)}</dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>피스 수</dt>
                    <dd className="tabular" data-testid="piece-count">
                      {stats.total}
                    </dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>미지원 피스</dt>
                    <dd className="tabular" data-testid="unsupported-count">
                      {stats.unsupported}
                    </dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>compat 보정 대상</dt>
                    <dd className="tabular" data-testid="compat-corrected-count">
                      {stats.compatCorrected}
                    </dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>복원된 순서</dt>
                    <dd className="tabular" data-testid="ordered-count">
                      {outcome.restored.orderedPieceIds.length}
                    </dd>
                    <dt style={{ color: 'var(--color-text-secondary)' }}>시작 피스</dt>
                    <dd data-testid="start-selection">{describeStart(outcome.restored.start)}</dd>
                  </dl>
                  <p className="mt-3 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                    구간 목록(FEAT-013)과 근거 등급 배지(FEAT-010)가 들어오면 이 요약을 대신합니다.
                  </p>
                </div>
              }
            />
            )
          ) : (
            <ErrorScreen reason={outcome.reason} rawSnippet={outcome.rawSnippet} onRetry={retry} />
          )
        ) : (
          <InputScreen
            formProps={{ value, onChange: setValue, onSubmit: submit, state, touched, onBlur: handleBlur }}
          />
        )}
      </main>
    </div>
  )
}
