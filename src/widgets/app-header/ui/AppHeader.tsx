import { TopBar } from '@/shared/ui/top-bar/TopBar'

export interface AppHeaderProps {
  /** "다른 트랙 보기" — 입력 대기 화면으로 되돌아간다 */
  onSwitchTrack: () => void
  /** "원본 편집기 ↗" — TC-001-7/TC-014-4: 어떤 상태에서도 동일하게 노출된다 */
  sourceUrl: string
}

const SERVICE_NAME = '미니4WD 트랙 3D 뷰어'

/** 상태 없는 정적 액션 조합 — feature 계층 상태에 의존하지 않는다 */
export function AppHeader({ onSwitchTrack, sourceUrl }: AppHeaderProps) {
  return (
    <TopBar
      title={SERVICE_NAME}
      actions={
        <>
          <button
            type="button"
            onClick={onSwitchTrack}
            data-testid="app-header-switch-track"
            className="rounded-[6px] border px-3 py-1.5 text-[14px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            다른 트랙 보기
          </button>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener"
            data-testid="app-header-source-link"
            className="text-[14px] underline underline-offset-4"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            원본 편집기 ↗
          </a>
        </>
      }
    />
  )
}
