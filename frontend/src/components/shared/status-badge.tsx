import { Badge } from "@/components/ui/badge"

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const norm = (status || "").toLowerCase().trim()

  if (norm === "scored") {
    return (
      <Badge variant="success" className={className}>
        Scored
      </Badge>
    )
  }

  if (norm === "excluded") {
    return (
      <Badge variant="destructive" className={className}>
        Excluded
      </Badge>
    )
  }

  if (norm === "pending") {
    return (
      <Badge variant="warning" className={className}>
        Pending
      </Badge>
    )
  }

  if (norm === "running" || norm === "processing") {
    return (
      <Badge variant="teal" className={className}>
        Running
      </Badge>
    )
  }

  if (norm === "stopped") {
    return (
      <Badge variant="outline" className={className}>
        Stopped
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className={className}>
      {status}
    </Badge>
  )
}
