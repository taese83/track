import type { ReactNode } from 'react'

export interface TopBarProps {
  /** 서비스명. h1으로 감싼다 — 페이지의 유일한 h1이다 */
  title: string
  /** 우측 정렬 액션 슬롯. AppHeader가 조립해 주입한다 */
  actions: ReactNode
}

/**
 * 헤더 레이아웃 프리미티브. 화면 최상단 가장자리는 Fitts's Law "무한 크기" 타깃이라
 * actions 슬롯은 항상 헤더 우측에 고정된다(스크롤로 사라지지 않음).
 */
export function TopBar({ title, actions }: TopBarProps) {
  return (
    <header
      role="banner"
      className="flex shrink-0 items-center justify-between gap-4 border-b px-4"
      style={{
        height: 'var(--header-height)',
        borderColor: 'var(--color-border)',
        background: 'var(--color-bg-surface)',
      }}
    >
      <h1 className="text-[20px] leading-[1.3] font-semibold">{title}</h1>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  )
}
