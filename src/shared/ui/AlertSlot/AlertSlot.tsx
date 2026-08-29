export type BannerLevel = 'info' | 'warning' | 'error'

export interface AlertSlotProps {
  content: null | {
    level: BannerLevel
    message: string
    actionLabel?: string
    onAction?: () => void
  }
}

const LEVEL_STYLE: Record<BannerLevel, { fg: string; bg: string; icon: string }> = {
  info: { fg: 'var(--color-info)', bg: 'var(--color-info-subtle)', icon: 'ℹ' },
  warning: { fg: 'var(--color-warning)', bg: 'var(--color-warning-subtle)', icon: '⚠' },
  error: { fg: 'var(--color-error)', bg: 'var(--color-error-subtle)', icon: '⚠' },
}

/**
 * 40px를 상태와 무관하게 항상 점유한다 — 배너가 뜨고 사라져도 셸 높이는 불변
 * (layout-spec §Layout stability #1). 내용만 비거나 채워진다.
 *
 * role/aria-live는 레벨에 따라 래퍼가 스스로 전환한다: error는 즉시 통지(assertive),
 * info/warning은 polite. 치명적 에러를 toast로 흘리지 않기 위한 착지점이다.
 */
export function AlertSlot({ content }: AlertSlotProps) {
  const isError = content?.level === 'error'
  const style = content === null ? null : LEVEL_STYLE[content.level]

  return (
    <div
      id="alert-slot"
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="flex shrink-0 items-center gap-3 px-4"
      style={{
        minHeight: 'var(--alert-slot-height)',
        background: style?.bg ?? 'transparent',
        transition: `background var(--duration-base) ease`,
      }}
    >
      {content !== null && style !== null && (
        <>
          <span aria-hidden="true" style={{ color: style.fg }}>
            {style.icon}
          </span>
          <span className="text-[14px]" style={{ color: style.fg }}>
            {content.message}
          </span>
          {content.actionLabel !== undefined && content.onAction !== undefined && (
            <button
              type="button"
              onClick={content.onAction}
              className="ml-auto rounded-[6px] px-3 py-1 text-[14px] font-semibold"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              {content.actionLabel}
            </button>
          )}
        </>
      )}
    </div>
  )
}
