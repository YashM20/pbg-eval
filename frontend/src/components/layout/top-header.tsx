import { Link, useLocation } from "react-router-dom"
import { ChevronRight, FileCheck2 } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "./theme-toggle"

export function TopHeader() {
  const location = useLocation()
  const path = location.pathname

  const getBreadcrumbs = () => {
    if (path.startsWith("/versions/")) {
      const label = decodeURIComponent(path.split("/versions/")[1].split("/")[0])
      return [
        { label: "Evaluation Hub", href: "/versions" },
        { label, href: `/versions/${encodeURIComponent(label)}` },
      ]
    }
    if (path.startsWith("/compare")) {
      return [{ label: "Version Comparison", href: "/compare" }]
    }
    if (path.startsWith("/studio")) {
      return [{ label: "Prompt Studio & Auto", href: "/studio" }]
    }
    if (path.startsWith("/synthetic")) {
      return [{ label: "Synthetic Benchmark Lab", href: "/synthetic" }]
    }
    return [{ label: "Evaluation Hub", href: "/versions" }]
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <header className="sticky top-0 z-30 flex h-13 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
      {/* Left: Sidebar toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="h-4" />

        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <div key={b.href} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3 text-muted-foreground/50" />}
              {i === breadcrumbs.length - 1 ? (
                <span className="font-semibold text-foreground">{b.label}</span>
              ) : (
                <Link to={b.href} className="hover:text-foreground transition-colors">
                  {b.label}
                </Link>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Right: Quick actions & Theme Toggle */}
      <div className="flex items-center gap-2.5">
        <a
          href="/api/gates/export/html"
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" }) + " hidden sm:inline-flex text-xs text-teal-600 border-teal-500/30 hover:bg-teal-500/10 dark:text-teal-400"}
        >
          <FileCheck2 className="size-3.5 mr-1" />
          Compliance Report ↗
        </a>
        <ThemeToggle />
      </div>
    </header>
  )
}
