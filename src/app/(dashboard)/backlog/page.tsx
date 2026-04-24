"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { KanbanBoard } from "@/components/backlog/kanban-board"
import { ListView } from "@/components/backlog/list-view"
import { UseCaseDetailDialog } from "@/components/backlog/use-case-detail-dialog"
import { CreateUseCaseDialog } from "@/components/backlog/create-use-case-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { KanbanSquare, List } from "lucide-react"
import { useDisplayPrefs } from "@/hooks/use-display-prefs"
import type { UseCase, Sprint } from "@/types/database"

type ViewMode = "kanban" | "list"

export default function BacklogPage() {
  const [useCases, setUseCases] = useState<UseCase[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [sprintMappings, setSprintMappings] = useState<Record<string, string[]>>({})
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterSprint, setFilterSprint] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string | null>(null)
  const [displayPrefs] = useDisplayPrefs()

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    const [ucRes, sprintsRes, sucRes] = await Promise.all([
      supabase
        .from("ia_lab_use_cases")
        .select(`
          *,
          owner:profiles!use_cases_owner_id_fkey(*),
          sprint:ia_lab_sprints(*),
          tags:ia_lab_use_case_tags(tag:ia_lab_tags(*))
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("ia_lab_sprints")
        .select("*")
        .order("start_date", { ascending: false }),
      supabase
        .from("ia_lab_sprint_use_cases")
        .select("sprint_id, use_case_id"),
    ])

    if (ucRes.data) {
      const transformed = ucRes.data.map((uc) => ({
        ...uc,
        tags: uc.tags?.map((t: { tag: unknown }) => t.tag).filter(Boolean) || [],
      }))
      setUseCases(transformed as UseCase[])
    }
    if (sprintsRes.data) setSprints(sprintsRes.data)
    if (sucRes.data) {
      // Build mapping: sprintId -> [useCaseId, ...]
      const mappings: Record<string, string[]> = {}
      for (const row of sucRes.data) {
        if (!mappings[row.sprint_id]) mappings[row.sprint_id] = []
        mappings[row.sprint_id].push(row.use_case_id)
      }
      setSprintMappings(mappings)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredUseCases = useCases.filter((uc) => {
    if (filterCategory !== "all" && uc.category !== filterCategory) return false
    if (filterSprint !== "all") {
      const sprintUcIds = sprintMappings[filterSprint] || []
      if (!sprintUcIds.includes(uc.id)) return false
    }
    return true
  })

  const handleSelectUseCase = (id: string) => {
    setSelectedUseCaseId(id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backlog</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos use cases par sprint
          </p>
        </div>
        <CreateUseCaseDialog onCreated={fetchData} />
      </div>

      <div className="flex items-center gap-3">
        {/* View toggle */}
        <div className="flex items-center rounded-lg border p-0.5">
          <Button
            variant={viewMode === "kanban" ? "default" : "ghost"}
            size="sm"
            className="h-8 px-3"
            onClick={() => setViewMode("kanban")}
          >
            <KanbanSquare className="h-4 w-4 mr-1.5" />
            Kanban
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="h-8 px-3"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4 mr-1.5" />
            Liste
          </Button>
        </div>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="IMPACT">IMPACT</SelectItem>
            <SelectItem value="LAB">LAB</SelectItem>
            <SelectItem value="PRODUCT">PRODUCT</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSprint} onValueChange={setFilterSprint}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sprint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les sprints</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{filteredUseCases.length} use cases</Badge>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <KanbanBoard
          useCases={filteredUseCases}
          onUpdate={fetchData}
          onSelectUseCase={handleSelectUseCase}
          displayPrefs={displayPrefs.kanban}
        />
      ) : (
        <ListView
          useCases={filteredUseCases}
          onSelectUseCase={handleSelectUseCase}
          displayPrefs={displayPrefs.list}
        />
      )}

      {/* Detail Dialog */}
      <UseCaseDetailDialog
        useCaseId={selectedUseCaseId}
        open={!!selectedUseCaseId}
        onOpenChange={(open) => {
          if (!open) setSelectedUseCaseId(null)
        }}
        onUpdate={fetchData}
      />
    </div>
  )
}
