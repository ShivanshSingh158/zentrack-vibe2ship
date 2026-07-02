import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { UpdatePrompt } from './components/UpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ErrorBoundary name="Root">
      {/* UpdatePrompt lives here — exactly ONE instance, always mounted,
          regardless of auth state. Prevents double-banner when auth state
          transitions cause App to render two separate tree branches. */}
      <UpdatePrompt />
      <App />
    </ErrorBoundary>
  </BrowserRouter>
)
