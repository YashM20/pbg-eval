import { CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react"

import type { SyntheticDocument, SyntheticEvalResult } from "@/api/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface VerificationRunnerProps {
  selectedDoc: SyntheticDocument
  targetOutput: string
  setTargetOutput: (val: string) => void
  onVerify: () => void
  evalResult: SyntheticEvalResult | null
  evaluating: boolean
}

export function VerificationRunner({
  selectedDoc,
  targetOutput,
  setTargetOutput,
  onVerify,
  evalResult,
  evaluating,
}: VerificationRunnerProps) {
  const loadPassingSample = () => {
    const sampleDeviations = selectedDoc.injected_anomalies.map((a) => ({
      clauseNo: a.clause_no,
      appearingInBg: a.appearing_in_bg,
      shouldBeCorrectedAs: a.should_be_corrected_as,
      severity: a.severity,
      reason: a.reason,
    }))
    setTargetOutput(
      JSON.stringify(
        {
          deviations: sampleDeviations,
          vendorMetadata: {
            bgNumber: "0504726IBGP0012",
            amount: "Rs. 50,00,000/-",
            validityDate: "31-DEC-2028",
            claimPeriod: "31-MAR-2029",
          },
        },
        null,
        2
      )
    )
  }

  const loadFailingSample = () => {
    setTargetOutput(
      JSON.stringify(
        {
          deviations: [],
          vendorMetadata: {},
        },
        null,
        2
      )
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Target Output Input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <label className="font-semibold text-foreground">Target Comparison JSON Output:</label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={loadPassingSample}
              className="text-[0.65rem] h-6 px-2 text-teal-600 border-teal-500/30 hover:bg-teal-500/10"
            >
              Load Passing Sample
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={loadFailingSample}
              className="text-[0.65rem] h-6 px-2 text-muted-foreground hover:text-foreground"
            >
              Load Failing Sample
            </Button>
          </div>
        </div>

        <Textarea
          value={targetOutput}
          onChange={(e) => setTargetOutput(e.target.value)}
          placeholder='Paste {"deviations": [...], "vendorMetadata": {...}} here...'
          className="font-mono text-xs min-h-[110px]"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[0.7rem] text-muted-foreground">
          Deterministic ground-truth evaluation checks that all injected anomalies were caught with 0 false alarms.
        </span>

        <Button
          type="button"
          onClick={onVerify}
          disabled={evaluating || !targetOutput.trim()}
          size="sm"
          className="h-8 px-4 text-xs font-bold gap-1.5"
        >
          {evaluating ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
          {evaluating ? "Verifying..." : "Run Ground-Truth Verification"}
        </Button>
      </div>

      {/* Verification Verdict */}
      {evalResult && (
        <Alert
          variant={evalResult.passed ? "success" : "destructive"}
          className="mt-2 py-3 px-3.5"
        >
          {evalResult.passed ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <AlertTitle className="text-xs font-bold">
                {evalResult.passed ? "✓ VERIFICATION PASSED — 100% Injected Anomalies Caught" : "✗ VERIFICATION FAILED — Missed Injected Anomalies"}
              </AlertTitle>
              <span className="text-xs font-bold font-mono">
                Recall: {(evalResult.recall * 100).toFixed(0)}% ({evalResult.caught_count}/{evalResult.total_injected})
              </span>
            </div>

            {evalResult.missed.length > 0 && (
              <AlertDescription className="text-xs mt-1">
                <strong>Missed Ground-Truth Anomalies:</strong>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5 font-mono text-[0.75rem]">
                  {evalResult.missed.map((m) => (
                    <li key={m.id}>
                      [{m.severity}] {m.clause_no}: {m.name} — "{m.appearing_in_bg}"
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </div>
        </Alert>
      )}
    </div>
  )
}
