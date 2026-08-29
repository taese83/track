import { useId, type FormEvent } from 'react'

import { extractCode } from '@/entities/track/model/schema'

import type { LoadState } from '../model/types'

export interface UrlInputFormProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (url: string) => void
  /** useTrackFetch가 소유한다 — 이 컴포넌트는 props로만 받는다 */
  state: LoadState
  /** blur 이후 true. validation 표시 게이트 */
  touched: boolean
  onBlur: () => void
}

const PLACEHOLDER = 'https://mini4wd-track-editor.pimentoso.com/view/WS67Y2'

/** 입력 형식 판정은 서버와 같은 함수를 쓴다 — 두 벌의 정규식이 어긋나는 실패 모드를 만들지 않는다 */
const isAcceptable = (v: string): boolean => extractCode(v) !== null

export function UrlInputForm({ value, onChange, onSubmit, state, touched, onBlur }: UrlInputFormProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const busy = state.status === 'loading' || state.status === 'slow'
  // blur 전에는 에러를 그리지 않는다(interaction-controls, 협상 불가)
  const showFieldError = touched && value.trim() !== '' && !isAcceptable(value)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    // 형식이 어긋나면 제출 자체를 막는다. 입력값은 절대 지우지 않는다.
    if (!isAcceptable(value)) {
      onBlur()
      return
    }
    onSubmit(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="url-input-form">
      <label htmlFor={inputId} className="block text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
        공유 링크
      </label>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          data-testid="url-input"
          className="h-12 min-w-0 flex-1 rounded-[6px] border px-4 text-[16px]"
          style={{
            borderColor: showFieldError ? 'var(--color-error)' : 'var(--color-border)',
            background: 'var(--color-bg-canvas)',
            color: 'var(--color-text-primary)',
          }}
          placeholder={PLACEHOLDER}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={showFieldError}
          aria-describedby={showFieldError ? errorId : hintId}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="url-submit"
          className="inline-flex h-12 items-center gap-2 rounded-[6px] px-5 text-[16px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          {busy && (
            <span
              aria-hidden="true"
              className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          코스 불러오기
        </button>
      </div>

      {showFieldError ? (
        <p id={errorId} data-testid="url-field-error" className="mt-2 text-[14px]" style={{ color: 'var(--color-error)' }}>
          URL 형식이 올바르지 않습니다. <code>view/</code> 뒤에 코드가 와야 합니다 — 원본 편집기 주소를
          그대로 붙여넣으세요.
        </p>
      ) : (
        <p id={hintId} className="mt-2 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
          <code>view/XXXXXX</code> 형식의 공유 링크 또는 트랙 코드만 입력해도 됩니다.
        </p>
      )}

      <p
        aria-live="polite"
        data-testid="load-progress"
        className="mt-3 min-h-[22px] text-[14px]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {state.status === 'loading' && '트랙을 불러오는 중입니다…'}
        {/* 임계값을 넘겨도 자리는 그대로다 — 문구만 바뀐다(TC-001-4) */}
        {state.status === 'slow' && '시간이 걸리고 있어요. 편집기 응답을 기다리는 중입니다…'}
      </p>
    </form>
  )
}
