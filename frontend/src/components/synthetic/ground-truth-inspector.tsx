import type { InjectedAnomaly } from "@/api/types"
import { Badge } from "@/components/ui/badge"

interface GroundTruthInspectorProps {
  anomalies: InjectedAnomaly[]
}

export function GroundTruthInspector({ anomalies }: GroundTruthInspectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.7rem] uppercase font-semibold text-muted-foreground tracking-wider">
        Injected Legal Anomalies (Ground Truth Specification)
      </span>
      <div className="flex flex-col gap-2">
        {anomalies.map((anom) => (
          <div
            key={anom.id}
            className="flex flex-col gap-1 p-3 rounded-md border border-border bg-muted/40 text-xs"
          >
            <div className="flex items-center gap-2">
              <Badge variant={anom.severity === "CRITICAL" ? "destructive" : "warning"} className="text-[0.65rem] px-1.5 py-0 font-bold">
                {anom.severity}
              </Badge>
              <span className="font-bold text-foreground">{anom.clause_no}: {anom.name}</span>
            </div>

            <div className="text-muted-foreground font-mono text-[0.75rem] mt-0.5">
              <span className="text-destructive font-semibold">Appearing in Vendor: </span>
              "{anom.appearing_in_bg}"
            </div>

            <div className="text-muted-foreground font-mono text-[0.75rem]">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Should Be Corrected As: </span>
              "{anom.should_be_corrected_as}"
            </div>

            <p className="text-[0.7rem] text-muted-foreground mt-0.5 italic">
              Legal Consequence: {anom.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
