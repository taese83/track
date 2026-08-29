import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `/api/track`은 Vercel Serverless Function이라 Vite dev/preview 서버에는 존재하지 않는다.
 * 배포와 로컬의 동작이 갈리지 않도록 같은 핸들러 코어를 dev 미들웨어로 마운트한다 —
 * 별도 mock 구현을 만들지 않는다(계약이 두 벌이 되는 것을 막는다).
 */
function trackApiDevServer(): Plugin {
  const middleware = async (
    req: { url?: string | undefined },
    res: {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (chunk: string) => void
    },
    next: () => void,
  ): Promise<void> => {
    const requested = new URL(req.url ?? '/', 'http://localhost')
    if (requested.pathname !== '/api/track') {
      next()
      return
    }
    const { handleTrackRequest } = await import('./api/track.js')
    const result = await handleTrackRequest(requested.searchParams.get('url'))
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
    res.statusCode = result.status
    res.end(JSON.stringify(result.body))
  }

  return {
    name: 'track-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), trackApiDevServer()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2023',
  },
})
