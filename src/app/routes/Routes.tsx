import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { NotFoundPage } from '@/pages/not-found'
import { TrackViewerPage } from '@/pages/track-viewer/ui/TrackViewerPage'

const router = createBrowserRouter([
  { path: '/', element: <TrackViewerPage /> },
  // 목록에 없는 표현이라도 안전망은 필수
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
