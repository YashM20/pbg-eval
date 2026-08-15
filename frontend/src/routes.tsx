import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ComparePage } from './pages/ComparePage'
import { PromptStudioPage } from './pages/PromptStudioPage'
import { SyntheticTestsPage } from './pages/SyntheticTestsPage'
import { VersionsPage } from './pages/VersionsPage'
import { VersionWorkspacePage } from './pages/VersionWorkspacePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/versions" replace />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="versions/:label" element={<VersionWorkspacePage />} />
        <Route path="versions/:label/runs" element={<VersionWorkspacePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="studio" element={<PromptStudioPage />} />
        <Route path="synthetic" element={<SyntheticTestsPage />} />

        {/* Legacy redirect aliases */}
        <Route path="clause-matrix" element={<Navigate to="/versions" replace />} />
        <Route path="extraction" element={<Navigate to="/versions" replace />} />
        <Route path="auto-eval" element={<Navigate to="/studio" replace />} />
        <Route path="prompt-studio" element={<Navigate to="/studio" replace />} />
      </Route>
    </Routes>
  )
}
