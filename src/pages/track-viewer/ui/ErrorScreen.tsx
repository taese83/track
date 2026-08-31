import type { LoadErrorReason } from '@/features/load-track'
import { AlertSlot } from '@/shared/ui/AlertSlot/AlertSlot'

export interface ErrorScreenProps {
  reason: LoadErrorReason
  /** 파싱·순서 복원 실패일 때만. 접이식 디버그 영역에 그대로 노출한다 */
  rawSnippet?: string
  onRetry: () => void
}

/** 원인별 문구 — TC-001-2/3/5, TC-003-4가 요구하는 "원인이 구분된" 표시의 실체 */
const MESSAGE: Record<LoadErrorReason, string> = {
  'invalid-input': '유효하지 않은 링크입니다. view/XXXXXX 형식으로 다시 입력해 주세요.',
  'not-found': '트랙을 찾을 수 없습니다. 코드가 맞는지 확인해 주세요.',
  // 여기서 "코드를 확인하라"고 말하지 않는다 — 코드는 맞을 수 있고, 서버는 확인하지 않았다
  'fixture-not-recorded':
    '이 트랙은 로컬 녹화본에 없어 조회하지 못했습니다. 녹화본 전용 모드(TRACK_UPSTREAM=fixtures)는 편집기를 호출하지 않습니다 — 모드를 해제하고 다시 시도하거나 배포본에서 조회하세요.',
  network: '편집기 서버에 연결하지 못했습니다.',
  timeout: '응답이 시간 초과되었습니다.',
  parse: '트랙 데이터를 해석하지 못했습니다.',
  'not-closed-fatal': '트랙 데이터가 심각하게 손상되어 표시할 수 없습니다.',
  'start-piece-missing': '시작 지점(START)을 찾을 수 없습니다. 편집기에서 START 피스를 놓았는지 확인해 주세요.',
}

export function ErrorScreen({ reason, rawSnippet, onRetry }: ErrorScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-[640px] rounded-[6px] border p-6"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
      >
        <h2 className="text-[20px] leading-[1.3] font-semibold">불러오지 못했습니다</h2>

        {/* 치명적 에러는 toast로 흘리지 않는다 — 상시 슬롯에 assertive로 착지시킨다 */}
        <div className="mt-3">
          <AlertSlot content={{ level: 'error', message: MESSAGE[reason] }} />
        </div>

        {rawSnippet !== undefined && (
          <details className="mt-3 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            <summary className="cursor-pointer">원본 응답 일부 보기(디버그)</summary>
            <pre
              data-testid="error-raw-snippet"
              className="mt-2 overflow-x-auto rounded-[4px] border p-3 break-all whitespace-pre-wrap"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-canvas)' }}
            >
              {rawSnippet === '' ? '(빈 응답)' : rawSnippet}
            </pre>
          </details>
        )}

        {/* 화면당 유일한 primary */}
        <button
          type="button"
          onClick={onRetry}
          data-testid="error-retry"
          className="mt-4 h-12 rounded-[6px] px-5 text-[16px] font-semibold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
