"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  CalendarRange,
  X,
  Users,
  Clock,
  Save,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { AddUseCaseToSprint } from "@/components/sprints/add-use-case-to-sprint"
import { BurndownChart } from "@/components/sprints/burndown-chart"
import type {
  Sprint,
  SprintUseCase,
  SprintUseCaseAssignment,
  SprintStatus,
  UseCaseStatus,
} from "@/types/database"
import { listAllProfiles } from "@/lib/stafftool/profiles"
import type { StafftoolProfile } from "@/lib/stafftool/types"
import { SPRINT_BUDGET_DAYS } from "@/types/database"

const statusConfig: Record<string, { label: string; color: string }> = {
  planned: { label: "Planifié", color: "bg-gray-100 text-gray-700" },
  active: { label: "Actif", color: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Terminé", color: "bg-slate-100 text-slate-700" },
}

const ucStatusLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
  abandoned: "Abandonné",
}

const ucStatusColors: Record<string, string> = {
  backlog: "bg-gray-100 text-gray-700",
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  abandoned: "bg-red-100 text-red-700",
}

const categoryColors: Record<string, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
const YEARS = Array.from({ length: 6 }, (_, i) => (2025 + i).toString())

export default function SprintDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [sprintUseCases, setSprintUseCases] = useState<SprintUseCase[]>([])
  const [originalSucs, setOriginalSucs] = useState<SprintUseCase[]>([])
  const [profiles, setProfiles] = useState<StafftoolProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Edit / delete sprint
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editMonth, setEditMonth] = useState("")
  const [editYear, setEditYear] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [sprintRes, sucRes, allProfiles] = await Promise.all([
      supabase.from("ia_lab_sprints").select("*").eq("id", id).single(),
      supabase
        .from("ia_lab_sprint_use_cases")
        .select(
          "*, use_case:ia_lab_use_cases(*, owner:profiles!use_cases_owner_id_fkey(*)), assignments:ia_lab_sprint_use_case_assignments(*, profile:profiles(*))"
        )
        .eq("sprint_id", id)
        .order("created_at"),
      listAllProfiles(),
    ])
    if (sprintRes.data) setSprint(sprintRes.data)
    if (sucRes.data) {
      const data = sucRes.data as SprintUseCase[]
      // Sort assignments stably by created_at within each UC
      for (const suc of data) {
        if (suc.assignments) {
          suc.assignments.sort((a, b) => a.created_at.localeCompare(b.created_at))
        }
      }
      setSprintUseCases(data)
      setOriginalSucs(JSON.parse(JSON.stringify(data)))
      setDirty(false)
    }
    setProfiles(allProfiles)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleStatusChange = async (newStatus: SprintStatus) => {
    const supabase = createClient()
    const { error } = await supabase.from("ia_lab_sprints").update({ status: newStatus }).eq("id", id)
    if (error) toast.error("Erreur lors du changement de statut")
    else toast.success("Statut du sprint mis à jour")
    fetchData()
  }

  const openEditDialog = () => {
    if (!sprint) return
    setEditName(sprint.name)
    const start = new Date(sprint.start_date)
    setEditMonth(start.getMonth().toString())
    setEditYear(start.getFullYear().toString())
    setEditOpen(true)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editMonth || !editYear || !editName.trim()) return
    setEditSubmitting(true)

    const monthIndex = parseInt(editMonth)
    const year = parseInt(editYear)
    const startDate = new Date(year, monthIndex, 1)
    const endDate = new Date(year, monthIndex + 1, 0)
    const formatDate = (d: Date) => d.toISOString().split("T")[0]

    const supabase = createClient()
    const { error } = await supabase
      .from("ia_lab_sprints")
      .update({
        name: editName.trim(),
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
      })
      .eq("id", id)

    if (error) toast.error("Erreur lors de la modification")
    else toast.success("Sprint modifié")

    setEditSubmitting(false)
    setEditOpen(false)
    fetchData()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("ia_lab_sprints").delete().eq("id", id)
    setDeleting(false)
    setDeleteOpen(false)
    if (error) {
      toast.error("Erreur lors de la suppression")
    } else {
      toast.success("Sprint supprimé")
      router.push("/sprints")
    }
  }

  const updateAssignments = (
    sucId: string,
    updater: (prev: SprintUseCaseAssignment[]) => SprintUseCaseAssignment[]
  ) => {
    setSprintUseCases((prev) =>
      prev.map((suc) =>
        suc.id === sucId
          ? { ...suc, assignments: updater(suc.assignments || []) }
          : suc
      )
    )
    setDirty(true)
  }

  const handleAssignmentProfileChange = (
    sucId: string,
    assignmentId: string,
    profileId: string
  ) => {
    updateAssignments(sucId, (prev) =>
      prev.map((a) =>
        a.id === assignmentId ? { ...a, profile_id: profileId } : a
      )
    )
  }

  const handleAssignmentDaysChange = (
    sucId: string,
    assignmentId: string,
    value: string
  ) => {
    const newValue = value ? parseFloat(value) : null
    updateAssignments(sucId, (prev) =>
      prev.map((a) =>
        a.id === assignmentId ? { ...a, estimated_days: newValue } : a
      )
    )
  }

  const handleAddAssignment = (sucId: string) => {
    updateAssignments(sucId, (prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        sprint_use_case_id: sucId,
        profile_id: "",
        estimated_days: null,
        created_at: new Date().toISOString(),
      },
    ])
  }

  const handleRemoveAssignment = (sucId: string, assignmentId: string) => {
    updateAssignments(sucId, (prev) =>
      prev.filter((a) => a.id !== assignmentId)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const ops: PromiseLike<unknown>[] = []

    for (const suc of sprintUseCases) {
      const original = originalSucs.find((o) => o.id === suc.id)
      const origAssigns = original?.assignments || []
      const currAssigns = suc.assignments || []

      // Deletions: ids present in original but missing in current
      const currPersistedIds = new Set(
        currAssigns.filter((a) => !a.id.startsWith("new-")).map((a) => a.id)
      )
      for (const orig of origAssigns) {
        if (!currPersistedIds.has(orig.id)) {
          ops.push(
            supabase
              .from("ia_lab_sprint_use_case_assignments")
              .delete()
              .eq("id", orig.id)
          )
        }
      }

      // Inserts & updates
      for (const a of currAssigns) {
        if (!a.profile_id) continue // skip un-picked rows
        if (a.id.startsWith("new-")) {
          ops.push(
            supabase.from("ia_lab_sprint_use_case_assignments").insert({
              sprint_use_case_id: suc.id,
              profile_id: a.profile_id,
              estimated_days: a.estimated_days,
            })
          )
        } else {
          const orig = origAssigns.find((o) => o.id === a.id)
          if (
            orig &&
            (orig.profile_id !== a.profile_id ||
              orig.estimated_days !== a.estimated_days)
          ) {
            ops.push(
              supabase
                .from("ia_lab_sprint_use_case_assignments")
                .update({
                  profile_id: a.profile_id,
                  estimated_days: a.estimated_days,
                })
                .eq("id", a.id)
            )
          }
        }
      }
    }

    await Promise.all(ops)
    toast.success("Assignations enregistrées")
    setSaving(false)
    fetchData()
  }

  const hasChanges = dirty

  const handleUcStatusChange = async (useCaseId: string, newStatus: UseCaseStatus) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("ia_lab_use_cases")
      .update({ status: newStatus })
      .eq("id", useCaseId)
    if (error) toast.error("Erreur lors du changement de statut")
    else toast.success(`Statut mis à jour : ${ucStatusLabels[newStatus]}`)
    fetchData()
  }

  const handleRemove = async (sucId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("ia_lab_sprint_use_cases").delete().eq("id", sucId)
    if (error) toast.error("Erreur lors du retrait")
    else toast.success("Use case retiré du sprint")
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!sprint) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Sprint introuvable</p>
      </div>
    )
  }

  const config = statusConfig[sprint.status]
  const doneCount = sprintUseCases.filter(
    (suc) => suc.use_case?.status === "done"
  ).length
  const progress =
    sprintUseCases.length > 0
      ? Math.round((doneCount / sprintUseCases.length) * 100)
      : 0

  // Capacity: sum of all assignment days across all UCs of the sprint
  const totalDays = sprintUseCases.reduce(
    (sum, suc) =>
      sum +
      (suc.assignments || []).reduce(
        (s, a) => s + (a.estimated_days || 0),
        0
      ),
    0
  )
  const capacityPercent = Math.round((totalDays / SPRINT_BUDGET_DAYS) * 100)
  const capacityColor =
    capacityPercent > 100
      ? "bg-red-500"
      : capacityPercent >= 80
        ? "bg-amber-500"
        : "bg-emerald-500"

  const existingUseCaseIds = sprintUseCases.map((suc) => suc.use_case_id)

  return (
    <div className="max-w-5xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/sprints")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour
      </Button>

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{sprint.name}</h1>
          <div className="flex items-center gap-3">
            <Badge className={config.color}>{config.label}</Badge>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarRange className="h-4 w-4" />
              {format(new Date(sprint.start_date), "d MMM", { locale: fr })} —{" "}
              {format(new Date(sprint.end_date), "d MMM yyyy", { locale: fr })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={sprint.status}
            onValueChange={(v) => handleStatusChange(v as SprintStatus)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Planifié</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="completed">Terminé</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={openEditDialog}
            title="Modifier le sprint"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDeleteOpen(true)}
            title="Supprimer le sprint"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Edit sprint dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le sprint</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Sprint 1"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mois</Label>
                <Select value={editMonth} onValueChange={setEditMonth}>
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
                <Select value={editYear} onValueChange={setEditYear}>
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
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce sprint ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le sprint « {sprint.name} »
              {sprintUseCases.length > 0
                ? ` et ses ${sprintUseCases.length} use case${sprintUseCases.length > 1 ? "s" : ""} associé${sprintUseCases.length > 1 ? "s" : ""} (avec toutes les assignations) seront détachés définitivement.`
                : " sera supprimé définitivement."}
              {" "}Les use cases eux-mêmes ne sont pas supprimés, uniquement leur rattachement à ce sprint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress + Capacity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progression</span>
              <span className="text-sm text-muted-foreground">
                {doneCount}/{sprintUseCases.length} terminés ({progress}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Capacité</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {totalDays} / {SPRINT_BUDGET_DAYS} jours ({capacityPercent}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${capacityColor} transition-all`}
                style={{ width: `${Math.min(capacityPercent, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Burndown chart */}
      <BurndownChart sprint={sprint} sprintUseCases={sprintUseCases} />

      {/* Use cases list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            Use cases ({sprintUseCases.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            )}
            <AddUseCaseToSprint
              sprintId={id}
              existingUseCaseIds={existingUseCaseIds}
              onAdded={fetchData}
            />
          </div>
        </CardHeader>
        <CardContent>
          {sprintUseCases.length > 0 ? (
            <div className="space-y-2">
              {sprintUseCases.map((suc) => {
                const uc = suc.use_case
                if (!uc) return null
                const assignments = suc.assignments || []
                const ucDays = assignments.reduce(
                  (s, a) => s + (a.estimated_days || 0),
                  0
                )
                // profile ids already picked on this UC (to disable duplicate selection)
                const pickedIds = new Set(
                  assignments.map((a) => a.profile_id).filter(Boolean)
                )
                return (
                  <div
                    key={suc.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    {/* Top: status + title + category + owner + total + remove */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Select
                          value={uc.status}
                          onValueChange={(v) =>
                            handleUcStatusChange(uc.id, v as UseCaseStatus)
                          }
                        >
                          <SelectTrigger
                            className={`h-7 w-auto min-w-[100px] text-xs font-medium border-0 ${ucStatusColors[uc.status] || ""}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ucStatusLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-sm font-medium truncate">
                          {uc.title}
                        </span>
                        <Badge
                          className={`text-xs shrink-0 ${categoryColors[uc.category]}`}
                        >
                          {uc.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {ucDays} j
                        </span>
                        <span className="text-xs text-muted-foreground w-24 truncate text-right">
                          {uc.owner?.full_name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(suc.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Assignments list */}
                    <div className="space-y-1.5 pl-1">
                      {assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <Select
                            value={a.profile_id || ""}
                            onValueChange={(v) =>
                              handleAssignmentProfileChange(suc.id, a.id, v)
                            }
                          >
                            <SelectTrigger className="w-44 h-8 text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              <SelectValue placeholder="Choisir une personne" />
                            </SelectTrigger>
                            <SelectContent>
                              {profiles.map((p) => {
                                const disabled =
                                  p.id !== a.profile_id && pickedIds.has(p.id)
                                return (
                                  <SelectItem
                                    key={p.id}
                                    value={p.id}
                                    disabled={disabled}
                                  >
                                    {p.full_name}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={a.estimated_days ?? ""}
                              onChange={(e) =>
                                handleAssignmentDaysChange(
                                  suc.id,
                                  a.id,
                                  e.target.value
                                )
                              }
                              placeholder="Jours"
                              className="w-20 h-8 text-xs text-center"
                            />
                            <span className="text-xs text-muted-foreground">
                              j
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              handleRemoveAssignment(suc.id, a.id)
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleAddAssignment(suc.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Ajouter un assigné
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun use case dans ce sprint
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
