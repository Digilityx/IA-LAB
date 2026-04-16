"use client"

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UseCase } from "@/types/database"
import type { ListDisplayPrefs } from "@/hooks/use-display-prefs"

const categoryColors: Record<string, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
  abandoned: "Abandonné",
}

const statusColors: Record<string, string> = {
  backlog: "bg-gray-100 text-gray-700",
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  abandoned: "bg-red-100 text-red-700",
}

const priorityLabels: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
}

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
}

const priorityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const statusOrder: Record<string, number> = {
  in_progress: 0,
  todo: 1,
  backlog: 2,
  done: 3,
  abandoned: 4,
}

type SortField = "title" | "status" | "category" | "priority" | "owner" | "updated_at"
type SortDirection = "asc" | "desc"

interface ListViewProps {
  useCases: UseCase[]
  onSelectUseCase: (id: string) => void
  displayPrefs?: ListDisplayPrefs
}

export function ListView({ useCases, onSelectUseCase, displayPrefs }: ListViewProps) {
  const [sortField, setSortField] = useState<SortField>("updated_at")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sorted = [...useCases].sort((a, b) => {
    const dir = sortDirection === "asc" ? 1 : -1

    switch (sortField) {
      case "title":
        return dir * a.title.localeCompare(b.title, "fr")
      case "status":
        return dir * ((statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99))
      case "category":
        return dir * a.category.localeCompare(b.category)
      case "priority":
        return dir * ((priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99))
      case "owner":
        return dir * (a.owner?.full_name || "").localeCompare(b.owner?.full_name || "", "fr")
      case "updated_at":
        return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      default:
        return 0
    }
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 h-3.5 w-3.5" />
    )
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  // Count visible columns (title is always shown)
  const visibleColumnCount =
    1 +
    (displayPrefs?.status !== false ? 1 : 0) +
    (displayPrefs?.category !== false ? 1 : 0) +
    1 + // priority always shown
    (displayPrefs?.owner !== false ? 1 : 0) +
    (displayPrefs?.tags !== false ? 1 : 0) +
    (displayPrefs?.updated_at !== false ? 1 : 0)

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button
                onClick={() => handleSort("title")}
                className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
              >
                Titre
                <SortIcon field="title" />
              </button>
            </TableHead>
            {displayPrefs?.status !== false && (
              <TableHead>
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Statut
                  <SortIcon field="status" />
                </button>
              </TableHead>
            )}
            {displayPrefs?.category !== false && (
              <TableHead>
                <button
                  onClick={() => handleSort("category")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Catégorie
                  <SortIcon field="category" />
                </button>
              </TableHead>
            )}
            <TableHead>
              <button
                onClick={() => handleSort("priority")}
                className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
              >
                Priorité
                <SortIcon field="priority" />
              </button>
            </TableHead>
            {displayPrefs?.owner !== false && (
              <TableHead>
                <button
                  onClick={() => handleSort("owner")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Responsable
                  <SortIcon field="owner" />
                </button>
              </TableHead>
            )}
            {displayPrefs?.tags !== false && <TableHead>Tags</TableHead>}
            {displayPrefs?.updated_at !== false && (
              <TableHead>
                <button
                  onClick={() => handleSort("updated_at")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Mis à jour
                  <SortIcon field="updated_at" />
                </button>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                Aucun use case trouvé
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((uc) => {
              const ownerInitials =
                uc.owner?.full_name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "?"

              return (
                <TableRow
                  key={uc.id}
                  className="cursor-pointer"
                  onClick={() => onSelectUseCase(uc.id)}
                >
                  <TableCell className="max-w-[300px]">
                    <span className="font-medium text-sm line-clamp-1">
                      {uc.title}
                    </span>
                  </TableCell>
                  {displayPrefs?.status !== false && (
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${statusColors[uc.status] || ""}`}
                      >
                        {statusLabels[uc.status] || uc.status}
                      </Badge>
                    </TableCell>
                  )}
                  {displayPrefs?.category !== false && (
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${categoryColors[uc.category] || ""}`}
                      >
                        {uc.category}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${priorityColors[uc.priority] || ""}`}
                    >
                      {priorityLabels[uc.priority] || uc.priority}
                    </Badge>
                  </TableCell>
                  {displayPrefs?.owner !== false && (
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">
                            {ownerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                          {uc.owner?.full_name}
                        </span>
                      </div>
                    </TableCell>
                  )}
                  {displayPrefs?.tags !== false && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {uc.tags?.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: tag.color + "20",
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {(uc.tags?.length || 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{(uc.tags?.length || 0) - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {displayPrefs?.updated_at !== false && (
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(uc.updated_at)}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
