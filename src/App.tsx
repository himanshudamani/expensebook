import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Spinner } from './components/ui'
import { LedgerPage } from './pages/LedgerPage'
import { LedgersPage } from './pages/LedgersPage'
import { LoginPage } from './pages/LoginPage'

// Less-used screens load on demand to keep the first load small.
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

function Routed() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <LoginPage />

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<LedgersPage />} />
        <Route path="/l/:id" element={<LedgerPage />} />
        <Route path="/l/:id/settings" element={<SettingsPage />} />
        <Route path="/l/:id/import" element={<ImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Routed />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
