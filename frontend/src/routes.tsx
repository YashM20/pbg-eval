import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "./components/layout/app-shell"
import { Skeleton } from "./components/ui/skeleton"

// Code-split route bundles for high initial load performance
const VersionsPage = lazy(() => import("./pages/versions-page").then((m) => ({ default: m.VersionsPage })))
const VersionWorkspacePage = lazy(() => import("./pages/version-workspace-page").then((m) => ({ default: m.VersionWorkspacePage })))
const ComparePage = lazy(() => import("./pages/compare-page").then((m) => ({ default: m.ComparePage })))
const PromptStudioPage = lazy(() => import("./pages/prompt-studio-page").then((m) => ({ default: m.PromptStudioPage })))
const SyntheticTestsPage = lazy(() => import("./pages/synthetic-tests-page").then((m) => ({ default: m.SyntheticTestsPage })))
const PlaygroundPage = lazy(() => import("./pages/playground-page").then((m) => ({ default: m.PlaygroundPage })))
const ArenaPage = lazy(() => import("./pages/arena-page").then((m) => ({ default: m.ArenaPage })))

function RouteFallback() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      <Skeleton className="h-8 w-64 rounded-md" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/versions" replace />} />
        <Route
          path="versions"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VersionsPage />
            </Suspense>
          }
        />
        <Route
          path="versions/:label"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VersionWorkspacePage />
            </Suspense>
          }
        />
        <Route
          path="versions/:label/runs"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VersionWorkspacePage />
            </Suspense>
          }
        />
        <Route
          path="compare"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ComparePage />
            </Suspense>
          }
        />
        <Route
          path="studio"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PromptStudioPage />
            </Suspense>
          }
        />
        <Route
          path="synthetic"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SyntheticTestsPage />
            </Suspense>
          }
        />
        <Route
          path="playground"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PlaygroundPage />
            </Suspense>
          }
        />
        <Route
          path="arena"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ArenaPage />
            </Suspense>
          }
        />

        {/* Legacy redirect aliases */}
        <Route path="clause-matrix" element={<Navigate to="/versions" replace />} />
        <Route path="extraction" element={<Navigate to="/versions" replace />} />
        <Route path="auto-eval" element={<Navigate to="/studio" replace />} />
        <Route path="prompt-studio" element={<Navigate to="/studio" replace />} />
      </Route>
    </Routes>
  )
}
