"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import type { Sprint } from "@/types/database"
import { SPRINT_BUDGET_DAYS } from "@/types/database"
import { SprintInlineDetail } from "@/components/sprints/sprint-inline-detail"

interface SprintWithStats extends Sprint {
  use_case_count: number
  total_days: number
  done_count: number
}

const statusConfig: Record<string, { label: string; color: string; order: number }> = {
  active: { label: "Actif", color: "bg-emerald-100 text-emerald-700", order: 0 },
  planned: { label: "Planifié", color: "bg-gray-100 text-gray-700", order: 1 },
  completed: { label: "Terminé", color: "bg-slate-100 text-slate-700", order: 2 },
}

type SortField = "name" | "status" | "start_date" | "use_case_count" | "capacity" | "progress"
type SortDirection = "asc" | "desc"

export default function SprintsPage() {
  const [sprints, setSprints] = useState<SprintWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedYear, setSelectedYear] = useState("")
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>("start_date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ]
  const YEARS = Array.from({ length: 6 }, (_, i) => (2025 + i).toString())

  const fetchSprints = useCallback(async () => {
    const supabase = createClient()
    const [sprintsRes, sucRes] = await Promise.all([
      supabase
        .from("sprints")
        .select("*")
        .order("start_date", { ascending: false }),
      supabase
        .from("sprint_use_cases")
        .select(
          `sprint_id,
          assignments:sprint_use_case_assignments(estimated_days),
          use_case:use_cases(status)`
        ),
    ])

    if (sprintsRes.data) {
      const statsMap = new Map<
        string,
        { count: number; days: number; done: number }
      >()
      if (sucRes.data) {
        for (const row of sucRes.data as unknown as Array<{
          sprint_id: string
          assignments: { estimated_days: number | null }[] | null
          use_case: { status: string } | null
        }>) {
          const existing = statsMap.get(row.sprint_id) || {
            count: 0,
            days: 0,
            done: 0,
          }
          existing.count += 1
          existing.days += (row.assignments || []).reduce(
            (s, a) => s + (a.estimated_days || 0),
            0
          )
          if (row.use_case?.status === "done") existing.done += 1
          statsMap.set(row.sprint_id, existing)
        }
      }

      setSprints(
        sprintsRes.data.map((s) => {
          const stats = statsMap.get(s.id) || { count: 0, days: 0, done: 0 }
          return {
            ...s,
            use_case_count: stats.count,
            total_days: stats.days,
            done_count: stats.done,
          }
        })
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSprints()
  }, [fetchSprints])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMonth || !selectedYear) return
    setCreating(true)

    const monthIndex = parseInt(selectedMonth)
    const year = parseInt(selectedYear)
    const startDate = new Date(year, monthIndex, 1)
    const endDate = new Date(year, monthIndex + 1, 0)
    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("sprints").insert({
      name: name || `${MONTHS[monthIndex]} ${year}`,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      status: "planned",
      created_by: user.id,
    })

    if (error) {
      toast.error("Erreur lors de la création du sprint")
    } else {
      toast.success("Sprint créé avec succès")
    }

    setDialogOpen(false)
    setName("")
    setSelectedMonth("")
    setSelectedYear("")
    setCreating(false)
    fetchSprints()
  }

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection(field === "name" ? "asc" : "desc")
    }
  }

  const sorted = [...sprints].sort((a, b) => {
    const dir = sortDirection === "asc" ? 1 : -1
    switch (sortField) {
      case "name":
        return dir * a.name.localeCompare(b.name, "fr")
      case "status":
        return dir * ((statusConfig[a.status]?.order ?? 9) - (statusConfig[b.status]?.order ?? 9))
      case "start_date":
        return dir * (new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      case "use_case_count":
        return dir * (a.use_case_count - b.use_case_count)
      case "capacity":
        return dir * (a.total_days - b.total_days)
      case "progress": {
        const pa = a.use_case_count > 0 ? a.done_count / a.use_case_count : 0
        const pb = b.use_case_count > 0 ? b.done_count / b.use_case_count : 0
        return dir * (pa - pb)
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sprints</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos cycles de développement
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau sprint
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un sprint</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sprint 1"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mois</Label>
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Année</Label>
                  <Select
                    value={selectedYear}
                    onValueChange={setSelectedYear}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Année" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Création..." : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Nom
                  <SortIcon field="name" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Statut
                  <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("start_date")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Période
                  <SortIcon field="start_date" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button
                  onClick={() => handleSort("use_case_count")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Use cases
                  <SortIcon field="use_case_count" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button
                  onClick={() => handleSort("capacity")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Capacité
                  <SortIcon field="capacity" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("progress")}
                  className="flex items-center text-xs font-semibold hover:text-foreground transition-colors"
                >
                  Progression
                  <SortIcon field="progress" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Aucun sprint créé. Commencez par en créer un.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((sprint) => {
                const config = statusConfig[sprint.status]
                const isExpanded = expandedId === sprint.id
                const progressPercent =
                  sprint.use_case_count > 0
                    ? Math.round(
                        (sprint.done_count / sprint.use_case_count) * 100
                      )
                    : 0
                const capacityPercent = Math.round(
                  (sprint.total_days / SPRINT_BUDGET_DAYS) * 100
                )

                return (
                  <TableRow
                    key={sprint.id}
                    data-expanded={isExpanded}
                    className="group"
                  >
                    <TableCell colSpan={7} className="!p-0">
                      {/* Summary row */}
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : sprint.id)
                        }
                        className="flex items-center w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        {/* Chevron */}
                        <div className="w-10 shrink-0 flex justify-center">
                          <ChevronRight
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-w-0 pr-4">
                          <span className="text-sm font-medium">
                            {sprint.name}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="w-24 shrink-0 pr-4">
                          <Badge
                            variant="secondary"
                            className={`text-xs ${config?.color || ""}`}
                          >
                            {config?.label || sprint.status}
                          </Badge>
                        </div>

                        {/* Period */}
                        <div className="w-44 shrink-0 pr-4">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(sprint.start_date), "d MMM", {
                              locale: fr,
                            })}{" "}
                            —{" "}
                            {format(new Date(sprint.end_date), "d MMM yyyy", {
                              locale: fr,
                            })}
                          </span>
                        </div>

                        {/* UC count */}
                        <div className="w-20 shrink-0 pr-4 hidden md:block">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {sprint.use_case_count}
                          </span>
                        </div>

                        {/* Capacity */}
                        <div className="w-28 shrink-0 pr-4 hidden md:block">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {sprint.total_days}/{SPRINT_BUDGET_DAYS}j
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({capacityPercent}%)
                          </span>
                        </div>

                        {/* Progress */}
                        <div className="w-32 shrink-0 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500 transition-all"
                              style={{
                                width: `${Math.min(progressPercent, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                            {progressPercent}%
                          </span>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-l-2 border-l-primary bg-muted/30">
                          <SprintInlineDetail
                            sprintId={sprint.id}
                            sprint={sprint}
                            onDataChange={fetchSprints}
                            onDeleted={() => {
                              setExpandedId(null)
                              fetchSprints()
                            }}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
