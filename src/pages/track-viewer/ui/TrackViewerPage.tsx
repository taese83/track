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
import { buildSceneLayout, markRenderStart } from '@/widgets/track-canvas'
import type { SceneLayout } from '@/widgets/track-canvas'

import { ErrorScreen } from './ErrorScreen'
import { InputScreen } from './InputScreen'
import { TrackScreen } from './TrackScreen'

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
  return { layout: buildSceneLayout({ oriented, elevated, truncated }), elevated }
}

/**
 * 화면 상태 머신의 소유자.
 *
 * fetch 성공 뒤의 파싱·순서 복원은 `track`의 동기 순수 파생이라 별도 상태를 두지 않는다.
 * `3d`/`partial-failure`/`webgl-unsupported`와 그 3분할 셸은 FEAT-006/012/013 소관이라
 * 여기서는 아직 그리지 않는다 — 임시 셸을 그리면 그 표면에 소유자가 둘이 된다.
 */
export function TrackViewerPage() {
  const { state, track, submit, retry, reset } = useTrackFetch()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

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

    return {
      kind: 'restored',
      restored,
      closure,
      layout: scene.layout,
      elevated: scene.elevated,
      totalPieceCount: parsed.pieces.length,
    }
  }, [track, parsed])

  /**
   * 파싱·복원 실패는 fetch 성공 뒤에 일어나므로 `state.status`만으로는 화면이 에러라는 사실이
   * 드러나지 않는다. component-spec의 ViewState는 이 경우를 `error`로 규정하므로 노출값을 맞춘다.
   */
  const viewState = state.status === 'success' && outcome?.kind === 'failure' ? 'error' : state.status

  /**
   * performance-budget §1의 "초기 렌더 시간" 시작점은 **fetch 완료 시각**이다 —
   * 씬 데이터가 준비된 시각이 아니다. 파싱·순서 복원·고도 산출도 사용자가 기다리는
   * 시간이므로 그 앞에서 시작해야 3초 목표가 실제로 기다린 시간을 잰다.
   */
  useEffect(() => {
    if (track !== null) markRenderStart()
  }, [track])

  const handleSwitchTrack = useCallback(() => {
    reset()
    setValue('')
    setTouched(false)
  }, [reset])

  const handleBlur = useCallback(() => setTouched(true), [])

  return (
    <div className="flex h-full flex-col">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <AppHeader onSwitchTrack={handleSwitchTrack} sourceUrl={SOURCE_EDITOR_URL} />

      <main id="main-content" className="flex flex-1 flex-col" data-view-state={viewState}>
        {state.status === 'error' ? (
          <ErrorScreen
            reason={state.reason}
            {...(state.rawSnippet === undefined ? {} : { rawSnippet: state.rawSnippet })}
            onRetry={retry}
          />
        ) : state.status === 'success' && track !== null && outcome !== null ? (
          outcome.kind === 'restored' ? (
            <TrackScreen
              layout={outcome.layout}
              elevated={outcome.elevated}
              closure={outcome.closure}
              totalPieceCount={outcome.totalPieceCount}
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
