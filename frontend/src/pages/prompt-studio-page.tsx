import { useCallback, useEffect, useState } from "react"
import { api } from "@/api/client"
import type { DaemonStatusResponse, PipelineVersion, PromptCandidate, PromptDiagnosticReport } from "@/api/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AIDiagnosticianCard } from "@/components/studio/ai-diagnostician-card"
import { DaemonControlCard } from "@/components/studio/daemon-control-card"
import { PromptCandidatesView } from "@/components/studio/prompt-candidates-view"

export function PromptStudioPage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState("")
  const [baselinePrompt, setBaselinePrompt] = useState("")
  const [diagnosis, setDiagnosis] = useState<PromptDiagnosticReport | null>(null)
  const [candidates, setCandidates] = useState<PromptCandidate[]>([])
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [verList, basePromptRes, dStatus] = await Promise.all([
        api.listVersions(),
        api.getBaselinePrompt().catch(() => ({ baseline_prompt: "" })),
        api.getDaemonStatus().catch(() => null),
      ])
      setVersions(verList)
      setBaselinePrompt(basePromptRes.baseline_prompt)
      setDaemonStatus(dStatus)
      if (verList.length > 0) {
        setSelectedVersion(verList[0].label)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDiagnose = async () => {
    if (!selectedVersion) return
    setLoading(true)
    try {
      const res = await api.diagnosePrompt(selectedVersion)
      setDiagnosis(res)
    } finally {
      setLoading(false)
    }
  }

  const handleMutate = async () => {
    if (!selectedVersion) return
    setMutating(true)
    try {
      const res = await api.mutatePrompt(selectedVersion, baselinePrompt, "balanced")
      setDiagnosis(res.diagnosis)
      setCandidates(res.candidates)
    } finally {
      setMutating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Prompt Studio & Automation Control</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Diagnose failure modes, generate AI genetic prompt mutations, and configure continuous background evaluation sweeps.
        </p>
      </div>

      <Tabs defaultValue="evolution" className="w-full">
        <TabsList>
          <TabsTrigger value="evolution">⚡ Prompt Evolution & AI Mutator</TabsTrigger>
          <TabsTrigger value="daemon">🔄 Continuous Daemon & Self-Healing</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution" className="mt-4 flex flex-col gap-5">
          <AIDiagnosticianCard
            versions={versions}
            selectedVersion={selectedVersion}
            setSelectedVersion={setSelectedVersion}
            onDiagnose={handleDiagnose}
            onMutate={handleMutate}
            diagnosis={diagnosis}
            loading={loading}
            mutating={mutating}
          />

          <PromptCandidatesView candidates={candidates} />
        </TabsContent>

        <TabsContent value="daemon" className="mt-4">
          <DaemonControlCard
            daemonStatus={daemonStatus}
            onReloadStatus={() => api.getDaemonStatus().then(setDaemonStatus).catch(() => {})}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
