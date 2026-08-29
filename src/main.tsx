import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppRouter } from '@/app/routes/Routes'

import './index.css'

const container = document.getElementById('root')
if (container === null) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
