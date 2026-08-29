import { useCallback, useState } from 'react'

import { SOURCE_EDITOR_URL } from '@/entities/track/model/schema'
import { useTrackFetch } from '@/features/load-track'
import { AppHeader } from '@/widgets/app-header/ui/AppHeader'

import { ErrorScreen } from './ErrorScreen'
import { InputScreen } from './InputScreen'

/**
 * 화면 상태 머신의 소유자.
 *
 * FEAT-001 범위에서 도달 가능한 상태는 `input`/`loading`/`loading-slow`/`error`와, fetch 성공 후의
 * 대기 상태다. `3d`/`partial-failure`/`webgl-unsupported`는 파싱·순서복원·씬 생성이 붙는
 * FEAT-002~006/014 소관이고, 그 상태들이 쓰는 3분할 셸(목록·스트립·캔버스 위젯)도 이 티켓의
 * 소유 경로 밖이다 — 여기서 임시 셸을 그리면 그 표면에 소유자가 둘이 된다. 그래서 성공 직후에는
 * 받아온 원문의 도착 사실만 정직하게 표시하고 다음 단계로 넘긴다.
 */
export function TrackViewerPage() {
  const { state, track, submit, retry, reset } = useTrackFetch()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

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

      <main id="main-content" className="flex flex-1 flex-col" data-view-state={state.status}>
        {state.status === 'error' ? (
          <ErrorScreen
            reason={state.reason}
            {...(state.rawSnippet === undefined ? {} : { rawSnippet: state.rawSnippet })}
            onRetry={retry}
          />
        ) : state.status === 'success' && track !== null ? (
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
              </dl>
              <p className="mt-4 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
                피스 파싱·순서 복원·3D 표시는 아직 구현되지 않았습니다(FEAT-002 이후).
              </p>
            </div>
          </div>
        ) : (
          <InputScreen
            formProps={{ value, onChange: setValue, onSubmit: submit, state, touched, onBlur: handleBlur }}
          />
        )}
      </main>
    </div>
  )
}
