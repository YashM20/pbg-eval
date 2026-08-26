import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatGridProps {
  stats: Record<string, number | string | null | undefined>
  className?: string
}

export function StatGrid({ stats, className }: StatGridProps) {
  const entries = Object.entries(stats)
  if (entries.length === 0) return null

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3", className)}>
      {entries.map(([key, val]) => (
        <Card key={key} size="sm" className="bg-muted/40 border-border/80">
          <CardContent className="p-3 flex flex-col gap-0.5">
            <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
              {key}
            </span>
            <span className="text-base font-bold text-foreground">
              {val !== null && val !== undefined ? String(val) : "—"}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
