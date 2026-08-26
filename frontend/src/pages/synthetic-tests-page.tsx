import { useCallback, useEffect, useState } from "react"
import { api } from "@/api/client"
import type { SyntheticDocument, SyntheticEvalResult } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GroundTruthInspector } from "@/components/synthetic/ground-truth-inspector"
import { TestCaseCardGrid } from "@/components/synthetic/test-case-card-grid"
import { VerificationRunner } from "@/components/synthetic/verification-runner"

export function SyntheticTestsPage() {
  const [suite, setSuite] = useState<SyntheticDocument[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SyntheticDocument | null>(null)
  const [targetOutput, setTargetOutput] = useState("")
  const [evalResult, setEvalResult] = useState<SyntheticEvalResult | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSuite = useCallback(async () => {
    try {
      const res = await api.getSyntheticSuite()
      setSuite(res)
      if (res.length > 0) {
        setSelectedDoc(res[0])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuite()
  }, [loadSuite])

  const handleVerify = async () => {
    if (!selectedDoc || !targetOutput.trim()) return
    setEvaluating(true)
    try {
      const res = await api.evaluateSynthetic(selectedDoc.doc_id, targetOutput)
      setEvalResult(res)
    } finally {
      setEvaluating(false)
    }
  }

  if (loading && suite.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading synthetic test suite…</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Synthetic Adversarial Benchmark Lab</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deterministic stress-testing against programmatically generated Bank Guarantees with injected legal anomalies.
        </p>
      </div>

      {/* 1. Document Selector Grid */}
      <TestCaseCardGrid
        suite={suite}
        selectedDocId={selectedDoc?.doc_id || ""}
        onSelectDoc={(doc) => {
          setSelectedDoc(doc)
          setEvalResult(null)
          setTargetOutput("")
        }}
      />

      {/* 2. Document Inspector & Verification Test */}
      {selectedDoc && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-foreground">
              Selected Test Case: {selectedDoc.title} ({selectedDoc.doc_id})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3 flex flex-col gap-4">
            <GroundTruthInspector anomalies={selectedDoc.injected_anomalies} />

            <VerificationRunner
              selectedDoc={selectedDoc}
              targetOutput={targetOutput}
              setTargetOutput={setTargetOutput}
              onVerify={handleVerify}
              evalResult={evalResult}
              evaluating={evaluating}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
