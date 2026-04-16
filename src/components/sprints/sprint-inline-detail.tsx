"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  X,
  Trash2,
  Users,
  Clock,
  Save,
  Plus,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"
import { AddUseCaseToSprint } from "@/components/sprints/add-use-case-to-sprint"
import { BurndownChart } from "@/components/sprints/burndown-chart"
import type {
  Sprint,
  SprintUseCase,
  SprintUseCaseAssignment,
  Profile,
  SprintStatus,
  UseCaseStatus,
} from "@/types/database"
import { SPRINT_BUDGET_DAYS } from "@/types/database"

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

const sprintStatusLabels: Record<string, string> = {
  planned: "Planifié",
  active: "Actif",
  completed: "Terminé",
}

interface SprintInlineDetailProps {
  sprintId: string
  sprint: Sprint
  onDataChange: () => void
  onDeleted?: () => void
}

export function SprintInlineDetail({
  sprintId,
  sprint,
  onDataChange,
  onDeleted,
}: SprintInlineDetailProps) {
  const [sprintUseCases, setSprintUseCases] = useState<SprintUseCase[]>([])
  const [originalSucs, setOriginalSucs] = useState<SprintUseCase[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allSprints, setAllSprints] = useState<Sprint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [sucRes, profilesRes, sprintsRes] = await Promise.all([
      supabase
        .from("sprint_use_cases")
        .select(
          "*, use_case:use_cases(*, owner:profiles!use_cases_owner_id_fkey(*)), assignments:sprint_use_case_assignments(*, profile:profiles(*))"
        )
        .eq("sprint_id", sprintId)
        .order("created_at"),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("sprints").select("*").order("start_date"),
    ])
    if (sucRes.data) {
      const data = sucRes.data as SprintUseCase[]
      for (const suc of data) {
        if (suc.assignments) {
          suc.assignments.sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          )
        }
      }
      setSprintUseCases(data)
      setOriginalSucs(JSON.parse(JSON.stringify(data)))
      setDirty(false)
    }
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (sprintsRes.data) setAllSprints(sprintsRes.data as Sprint[])
    setLoading(false)
  }, [sprintId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSprintStatusChange = async (newStatus: SprintStatus) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("sprints")
      .update({ status: newStatus })
      .eq("id", sprintId)
    if (error) toast.error("Erreur lors du changement de statut")
    else toast.success("Statut du sprint mis à jour")
    onDataChange()
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

      const currPersistedIds = new Set(
        currAssigns.filter((a) => !a.id.startsWith("new-")).map((a) => a.id)
      )
      for (const orig of origAssigns) {
        if (!currPersistedIds.has(orig.id)) {
          ops.push(
            supabase
              .from("sprint_use_case_assignments")
              .delete()
              .eq("id", orig.id)
          )
        }
      }

      for (const a of currAssigns) {
        if (!a.profile_id) continue
        if (a.id.startsWith("new-")) {
          ops.push(
            supabase.from("sprint_use_case_assignments").insert({
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
                .from("sprint_use_case_assignments")
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
    onDataChange()
  }

  const handleUcStatusChange = async (
    useCaseId: string,
    newStatus: UseCaseStatus
  ) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("use_cases")
      .update({ status: newStatus })
      .eq("id", useCaseId)
    if (error) toast.error("Erreur lors du changement de statut")
    else toast.success(`Statut mis à jour : ${ucStatusLabels[newStatus]}`)
    fetchData()
    onDataChange()
  }

  const handleMoveUcToSprint = async (
    sucId: string,
    targetSprintId: string
  ) => {
    if (targetSprintId === sprintId) return
    const suc = sprintUseCases.find((s) => s.id === sucId)
    if (!suc?.use_case) return
    const supabase = createClient()
    const { error: e1 } = await supabase
      .from("sprint_use_cases")
      .update({ sprint_id: targetSprintId })
      .eq("id", sucId)
    if (e1) {
      toast.error("Erreur lors du changement de sprint")
      return
    }
    await supabase
      .from("use_cases")
      .update({ sprint_id: targetSprintId })
      .eq("id", suc.use_case.id)
    toast.success("Use case déplacé vers un autre sprint")
    fetchData()
    onDataChange()
  }

  const handleRemoveUc = async (sucId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("sprint_use_cases")
      .delete()
      .eq("id", sucId)
    if (error) toast.error("Erreur lors du retrait")
    else toast.success("Use case retiré du sprint")
    fetchData()
    onDataChange()
  }

  const handleDeleteSprint = async () => {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("sprints").delete().eq("id", sprintId)
    setDeleting(false)
    setDeleteOpen(false)
    if (error) {
      toast.error("Erreur lors de la suppression")
    } else {
      toast.success("Sprint supprimé")
      onDeleted?.()
    }
  }

  const doneCount = sprintUseCases.filter(
    (suc) => suc.use_case?.status === "done"
  ).length
  const progress =
    sprintUseCases.length > 0
      ? Math.round((doneCount / sprintUseCases.length) * 100)
      : 0

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

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
        <div className="h-40 bg-muted rounded" />
        <div className="space-y-2">
          <div className="h-12 bg-muted rounded" />
          <div className="h-12 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header: status + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={sprint.status}
            onValueChange={(v) => handleSprintStatusChange(v as SprintStatus)}
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sprintStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {doneCount}/{sprintUseCases.length} terminés
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "..." : "Enregistrer"}
            </Button>
          )}
          <AddUseCaseToSprint
            sprintId={sprintId}
            existingUseCaseIds={existingUseCaseIds}
            onAdded={() => {
              fetchData()
              onDataChange()
            }}
          />
          <Link href={`/sprints/${sprintId}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Détail complet
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce sprint ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le sprint « {sprint.name} »
              {sprintUseCases.length > 0
                ? ` et ses ${sprintUseCases.length} use case${sprintUseCases.length > 1 ? "s" : ""} associé${sprintUseCases.length > 1 ? "s" : ""} seront détachés.`
                : " sera supprimé définitivement."}
              {" "}Les use cases eux-mêmes ne sont pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteSprint()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress + Capacity compact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">Progression</span>
            <span className="text-xs text-muted-foreground">
              {progress}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium">Capacité</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {totalDays}/{SPRINT_BUDGET_DAYS}j ({capacityPercent}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full ${capacityColor} transition-all`}
              style={{ width: `${Math.min(capacityPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Burndown */}
      <BurndownChart sprint={sprint} sprintUseCases={sprintUseCases} />

      {/* Use cases list */}
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
            const pickedIds = new Set(
              assignments.map((a) => a.profile_id).filter(Boolean)
            )
            return (
              <div
                key={suc.id}
                className="rounded-lg border p-3 space-y-2 bg-background"
              >
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
                    <Select
                      value={sprintId}
                      onValueChange={(v) => handleMoveUcToSprint(suc.id, v)}
                    >
                      <SelectTrigger
                        className="h-7 w-auto min-w-[120px] text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allSprints.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      onClick={() => handleRemoveUc(suc.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Assignments */}
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
        <p className="text-sm text-muted-foreground text-center py-4">
          Aucun use case dans ce sprint
        </p>
      )}
    </div>
  )
}
