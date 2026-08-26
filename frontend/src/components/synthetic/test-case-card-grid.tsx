import { FlaskConical, ShieldAlert } from "lucide-react"
import type { SyntheticDocument } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface TestCaseCardGridProps {
  suite: SyntheticDocument[]
  selectedDocId: string
  onSelectDoc: (doc: SyntheticDocument) => void
}

export function TestCaseCardGrid({
  suite,
  selectedDocId,
  onSelectDoc,
}: TestCaseCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {suite.map((doc) => {
        const isSelected = selectedDocId === doc.doc_id

        return (
          <Card
            key={doc.doc_id}
            onClick={() => onSelectDoc(doc)}
            className={`cursor-pointer transition-all border ${
              isSelected
                ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <CardContent className="p-3.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <FlaskConical className={`size-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  {doc.title}
                </span>
                <Badge variant={isSelected ? "default" : "outline"} className="text-[0.65rem] px-1.5 py-0 font-mono">
                  {doc.doc_id}
                </Badge>
              </div>

              <p className="text-[0.75rem] text-muted-foreground line-clamp-2 leading-relaxed">
                {doc.description}
              </p>

              <div className="flex items-center gap-1 mt-1 text-[0.7rem] font-semibold text-amber-600 dark:text-amber-400">
                <ShieldAlert className="size-3" />
                <span>{doc.injected_anomalies.length} Ground-Truth Anomaly</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
