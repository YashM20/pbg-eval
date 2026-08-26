import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AIHealthBannerProps {
  healthInsights: {
    status: string
    weaknesses: string[]
    recommendations: string[]
  }
  totalRuns: number
  sectionCount: number
}

export function AIHealthBanner({
  healthInsights,
  totalRuns,
  sectionCount,
}: AIHealthBannerProps) {
  const isHealthy = healthInsights.status === "Healthy"

  return (
    <Card
      className={
        isHealthy
          ? "border-emerald-500/30 bg-emerald-500/5 shadow-xs"
          : "border-amber-500/30 bg-amber-500/5 shadow-xs"
      }
    >
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            )}
            <span
              className={`text-xs font-bold ${
                isHealthy ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
              }`}
            >
              Proactive AI Health Diagnosis: {healthInsights.status}
            </span>
          </div>
          <span className="text-[0.7rem] text-muted-foreground font-mono">
            Analyzed {totalRuns} runs & {sectionCount} sections
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-muted-foreground text-[0.7rem] uppercase tracking-wider">
              Observed Failure Modes
            </span>
            <ul className="list-disc pl-4 space-y-0.5 text-foreground/90">
              {healthInsights.weaknesses.length > 0 ? (
                healthInsights.weaknesses.map((w, i) => (
                  <li key={i} className="text-amber-700 dark:text-amber-300">{w}</li>
                ))
              ) : (
                <li className="text-emerald-700 dark:text-emerald-300">
                  No recurring anomaly patterns. Model is well-balanced.
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-semibold text-muted-foreground text-[0.7rem] uppercase tracking-wider">
              Top Actionable Prompt Advice
            </span>
            <ul className="list-disc pl-4 space-y-0.5 text-foreground/90">
              {healthInsights.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
