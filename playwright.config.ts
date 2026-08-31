import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// 127.0.0.1이 아니라 localhost — Vite 8 preview는 localhost가 ::1로 풀리는 호스트에서 IPv6에만
// 바인딩하므로 127.0.0.1 폴링은 webServer 대기 시간 초과로 끝난다(2026-08-31 실측, D-046 라운드).
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0, // 재시도로 불안정을 가리지 않는다 — 실패는 실패로 본다
  reporter: process.env.CI !== undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 실제 편집기 사이트를 호출하지 않는다 — 녹화된 fixture를 업스트림으로 쓴다(api-schema §9)
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { TRACK_UPSTREAM: 'fixtures' },
  },
})
