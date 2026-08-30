import { useCallback, useMemo, useState } from 'react'

import { parseTrackString } from '@/entities/track/lib/parse'
import type { ParseTrackStringResult } from '@/entities/track/lib/parse'
import { SOURCE_EDITOR_URL } from '@/entities/track/model/schema'
import { useTrackFetch } from '@/features/load-track'
import { AppHeader } from '@/widgets/app-header/ui/AppHeader'

import { ErrorScreen } from './ErrorScreen'
import { InputScreen } from './InputScreen'

/** 디버그 영역에 흘릴 원문 발췌 상한 — 전문을 그대로 노출하지 않는다 */
const SNIPPET_MAX_CHARS = 300

type ParseFailure = Extract<ParseTrackStringResult, { ok: false }>

function buildParseSnippet(rawData: string, failure: ParseFailure): string {
  if (failure.reason === 'empty-track') {
    return `원문에 피스가 하나도 없습니다(원문 ${rawData.length}자).`
  }

  const excerpt =
    rawData.length > SNIPPET_MAX_CHARS
      ? `${rawData.slice(0, SNIPPET_MAX_CHARS)}…(이하 생략, 전체 ${rawData.length}자)`
      : rawData
  const first = failure.failures[0]
  const cause = first === undefined ? '' : ` 처음 어긋난 곳 — 세그먼트 ${first.segmentIndex}: ${first.detail}.`

  return `${excerpt}\n\n어긋난 세그먼트 ${failure.failures.length}건.${cause}`
}

/**
 * 화면 상태 머신의 소유자.
 *
 * fetch 성공 뒤의 파싱은 `track`의 동기 순수 파생이라 별도 상태를 두지 않는다.
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

  /**
   * 파싱 실패는 fetch 성공 뒤에 일어나므로 `state.status`만으로는 화면이 에러라는 사실이 드러나지
   * 않는다. component-spec의 ViewState는 이 경우를 `error`로 규정하므로 노출값을 그에 맞춘다.
   */
  const viewState = state.status === 'success' && parsed !== null && !parsed.ok ? 'error' : state.status

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
        ) : state.status === 'success' && track !== null && parsed !== null ? (
          parsed.ok ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div
                className="w-full max-w-[640px] rounded-[6px] border p-6"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
                data-testid="fetch-success"
              >
                <h2 className="text-[20px] leading-[1.3] font-semibold">
                  트랙 <span className="tabular">{track.trackCode}</span> 원문을 받았습니다
                </h2>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
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
                </dl>
                <p className="mt-4 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                  피스 파싱까지 마쳤습니다. 순서 복원·폐곡선 검증·3D 표시는 아직 구현되지
                  않았습니다(FEAT-003 이후).
                </p>
              </div>
            </div>
          ) : (
            <ErrorScreen
              reason="parse"
              rawSnippet={buildParseSnippet(track.rawData, parsed)}
              onRetry={retry}
            />
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
