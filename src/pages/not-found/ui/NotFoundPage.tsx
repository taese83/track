import { useEffect } from 'react'

/**
 * 정의 밖 경로. 화면 목록에 없는 표현이라도 안전망은 생략하지 않는다.
 * SPA라 서버가 404를 주지 못하므로 최소한 색인은 막는다.
 */
export function NotFoundPage() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-[20px] leading-[1.3] font-semibold">페이지를 찾을 수 없습니다</h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>주소를 확인하거나 처음 화면으로 돌아가세요.</p>
      <a
        href="/"
        className="rounded-[6px] px-5 py-3 text-[16px] font-semibold"
        style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
      >
        처음 화면으로
      </a>
    </main>
  )
}
