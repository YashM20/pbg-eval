import { Link, useLocation } from "react-router-dom"
import {
  Award,
  BarChart3,
  Code2,
  FileCheck2,
  FlaskConical,
  GitCompare,
  Layers,
  Play,
  Sparkles,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const NAV_ITEMS = [
  {
    title: "Evaluation Hub",
    url: "/versions",
    icon: BarChart3,
  },
  {
    title: "Version Compare",
    url: "/compare",
    icon: GitCompare,
  },
  {
    title: "Prompt Studio & Auto",
    url: "/studio",
    icon: Sparkles,
  },
  {
    title: "Synthetic Lab",
    url: "/synthetic",
    icon: FlaskConical,
  },
  {
    title: "Live Playground",
    url: "/playground",
    icon: Play,
  },
  {
    title: "Model Arena",
    url: "/arena",
    icon: Award,
  },
]

export function AppSidebar() {
  const location = useLocation()
  const currentPath = location.pathname

  const isNavActive = (url: string) => {
    if (url === "/versions") {
      return currentPath === "/" || currentPath.startsWith("/versions")
    }
    return currentPath.startsWith(url)
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar text-sidebar-foreground">
      {/* Brand Header */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <Link to="/versions" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold shadow-xs">
            <Layers className="size-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5 font-bold leading-none text-foreground">
              <span>PBG Eval</span>
              <span className="rounded bg-teal-500/15 px-1 py-0.5 text-[0.65rem] font-semibold text-teal-600 dark:text-teal-400">
                v0.5
              </span>
            </div>
            <span className="text-[0.65rem] text-muted-foreground mt-0.5">
              IOCL Autonomous Engine
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Main Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Platform Hubs
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = isNavActive(item.url)
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      render={<Link to={item.url} />}
                      className={active ? "bg-sidebar-accent font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Audit & Developer Quick Links */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Compliance & APIs
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Export HTML Compliance Certificate"
                  render={<a href="/api/gates/export/html" target="_blank" rel="noreferrer" />}
                >
                  <FileCheck2 className="size-4 text-teal-600" />
                  <span>Export Report ↗</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="FastAPI Swagger Documentation"
                  render={<a href="http://localhost:8003/docs" target="_blank" rel="noreferrer" />}
                >
                  <Code2 className="size-4 text-amber-600" />
                  <span>REST Docs ↗</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer System Status */}
      <SidebarFooter className="border-t border-sidebar-border p-3 text-xs group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-2 border border-border">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-foreground">Backend Connected</span>
          </div>
          <span className="text-[0.7rem] text-muted-foreground">
            Judge: Gemini 2.0 Flash
          </span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
