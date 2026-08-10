import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ComparePage } from './pages/ComparePage'
import { RunsPage } from './pages/RunsPage'
import { VersionsPage } from './pages/VersionsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/versions" replace />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="versions/:label/runs" element={<RunsPage />} />
        <Route path="compare" element={<ComparePage />} />
      </Route>
    </Routes>
  )
}
