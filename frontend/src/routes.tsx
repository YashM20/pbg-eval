import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AutoEvalPage } from './pages/AutoEvalPage'
import { ClauseMatrixPage } from './pages/ClauseMatrixPage'
import { ComparePage } from './pages/ComparePage'
import { ExtractionPage } from './pages/ExtractionPage'
import { PromptStudioPage } from './pages/PromptStudioPage'
import { RunsPage } from './pages/RunsPage'
import { SyntheticTestsPage } from './pages/SyntheticTestsPage'
import { VersionsPage } from './pages/VersionsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/versions" replace />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="versions/:label/runs" element={<RunsPage />} />
        <Route path="extraction" element={<ExtractionPage />} />
        <Route path="clause-matrix" element={<ClauseMatrixPage />} />
        <Route path="prompt-studio" element={<PromptStudioPage />} />
        <Route path="synthetic" element={<SyntheticTestsPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="auto-eval" element={<AutoEvalPage />} />
      </Route>
    </Routes>
  )
}
