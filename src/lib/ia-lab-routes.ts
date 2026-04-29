import {
  LayoutDashboard,
  KanbanSquare,
  CalendarRange,
  BarChart3,
  Store,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface DashboardRoute {
  name: string
  href: string
  icon: LucideIcon
  adminOnly: boolean
  /** When true, only the exact pathname matches; otherwise startsWith. */
  exact: boolean
}

export const dashboardRoutes: readonly DashboardRoute[] = [
  { name: 'Dashboard',  href: '/',         icon: LayoutDashboard, adminOnly: true,  exact: true  },
  { name: 'Backlog',    href: '/backlog',  icon: KanbanSquare,    adminOnly: false, exact: false },
  { name: 'Sprints',    href: '/sprints',  icon: CalendarRange,   adminOnly: false, exact: false },
  { name: 'Métriques',  href: '/metrics',  icon: BarChart3,       adminOnly: true,  exact: false },
  { name: 'Galerie',    href: '/gallery',  icon: Store,           adminOnly: false, exact: false },
  { name: 'Paramètres', href: '/settings', icon: Settings,        adminOnly: true,  exact: false },
] as const

export function isAdminOnlyPath(pathname: string): boolean {
  return dashboardRoutes.some(
    (r) =>
      r.adminOnly && (r.exact ? pathname === r.href : pathname.startsWith(r.href))
  )
}
