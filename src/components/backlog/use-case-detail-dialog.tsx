"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { UseCaseGainsPanel } from "@/components/backlog/use-case-gains-panel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  FileText,
  Users,
  BarChart3,
  Trash2,
  X,
  Upload,
  Download,
  Plus,
  Tag as TagIcon,
  Loader2,
} from "lucide-react"
import type {
  UseCase,
  UseCaseMetrics,
  UseCaseDocument,
  Tag,
  UseCaseCategory,
  UseCaseStatus,
  PriorityLevel,
  MemberRole,
} from "@/types/database"
import { listAllProfiles } from "@/lib/stafftool/profiles"
import type { StafftoolProfile } from "@/lib/stafftool/types"

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
  abandoned: "Abandonné",
}

const roleLabels: Record<string, string> = {
  owner: "Responsable",
  contributor: "Contributeur",
  reviewer: "Reviewer",
}

interface UseCaseDetailDialogProps {
  useCaseId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

interface MemberEntry {
  profile_id: string
  role: MemberRole
  profile?: StafftoolProfile
}

export function UseCaseDetailDialog({
  useCaseId,
  open,
  onOpenChange,
  onUpdate,
}: UseCaseDetailDialogProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Use case data
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [documentation, setDocumentation] = useState("")
  const [status, setStatus] = useState<UseCaseStatus>("backlog")
  const [category, setCategory] = useState<UseCaseCategory>("LAB")
  const [priority, setPriority] = useState<PriorityLevel>("medium")

  // Info fields
  const [deliverableType, setDeliverableType] = useState("")
  const [usageType, setUsageType] = useState("")
  const [tools, setTools] = useState("")
  const [targetUsers, setTargetUsers] = useState("")
  const [benchmarkUrl, setBenchmarkUrl] = useState("")
  const [journeyUrl, setJourneyUrl] = useState("")
  const [nextSteps, setNextSteps] = useState("")
  const [transferStatus, setTransferStatus] = useState("")

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState("#6366f1")

  // Members
  const [allProfiles, setAllProfiles] = useState<StafftoolProfile[]>([])
  const [ownerId, setOwnerId] = useState<string>("")
  const [membersList, setMembersList] = useState<MemberEntry[]>([])
  const [addMemberProfileId, setAddMemberProfileId] = useState("")
  const [addMemberRole, setAddMemberRole] = useState<MemberRole>("contributor")

  // Metrics
  const [metrics, setMetrics] = useState<UseCaseMetrics | null>(null)
  const [marginGenerated, setMarginGenerated] = useState("")
  const [manDaysEstimated, setManDaysEstimated] = useState("")
  const [manDaysActual, setManDaysActual] = useState("")
  const [mrr, setMrr] = useState("")
  const [additionalBusiness, setAdditionalBusiness] = useState("")
  const [metricsNotes, setMetricsNotes] = useState("")

  // Documents
  const [documents, setDocuments] = useState<UseCaseDocument[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Original tag IDs for diff
  const [originalTagIds, setOriginalTagIds] = useState<string[]>([])
  const [originalMembers, setOriginalMembers] = useState<MemberEntry[]>([])

  const tagColors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b",
  ]

  const fetchData = useCallback(async () => {
    if (!useCaseId) return
    setLoading(true)

    const supabase = createClient()

    const [ucRes, metricsRes, membersRes, tagsRes, allProfilesData, docsRes] =
      await Promise.all([
        supabase
          .from("ia_lab_use_cases")
          .select(
            `*, owner:profiles!ia_lab_use_cases_owner_id_fkey(*), sprint:ia_lab_sprints(*), tags:ia_lab_use_case_tags(tag:ia_lab_tags(*))`
          )
          .eq("id", useCaseId)
          .single(),
        supabase
          .from("ia_lab_use_case_metrics")
          .select("*")
          .eq("use_case_id", useCaseId)
          .maybeSingle(),
        supabase
          .from("ia_lab_use_case_members")
          .select("*, profile:profiles(*)")
          .eq("use_case_id", useCaseId),
        supabase.from("ia_lab_tags").select("*").order("name"),
        listAllProfiles(),
        supabase
          .from("ia_lab_use_case_documents")
          .select("*")
          .eq("use_case_id", useCaseId)
          .order("created_at", { ascending: false }),
      ])

    if (tagsRes.data) setAllTags(tagsRes.data)
    setAllProfiles(allProfilesData)

    if (ucRes.data) {
      const uc = {
        ...ucRes.data,
        tags:
          ucRes.data.tags
            ?.map((t: { tag: unknown }) => t.tag)
            .filter(Boolean) || [],
      } as UseCase
      setUseCase(uc)
      setOwnerId(uc.owner_id ?? "")
      setTitle(uc.title)
      setDescription(uc.description)
      setDocumentation(uc.documentation || "")
      setStatus(uc.status)
      setCategory(uc.category)
      setPriority(uc.priority || "medium")
      setDeliverableType(uc.deliverable_type || "")
      setUsageType(uc.usage_type || "")
      setTools(uc.tools || "")
      setTargetUsers(uc.target_users || "")
      setBenchmarkUrl(uc.benchmark_url || "")
      setJourneyUrl(uc.journey_url || "")
      setNextSteps(uc.next_steps || "")
      setTransferStatus(uc.transfer_status || "")

      const tagIds = (uc.tags || []).map((t) => t.id)
      setSelectedTagIds(tagIds)
      setOriginalTagIds(tagIds)
    }

    if (metricsRes.data) {
      setMetrics(metricsRes.data)
      setMarginGenerated(metricsRes.data.margin_generated?.toString() || "")
      setManDaysEstimated(
        metricsRes.data.man_days_estimated?.toString() || ""
      )
      setManDaysActual(metricsRes.data.man_days_actual?.toString() || "")
      setMrr(metricsRes.data.mrr?.toString() || "")
      setAdditionalBusiness(
        metricsRes.data.additional_business?.toString() || ""
      )
      setMetricsNotes(metricsRes.data.notes || "")
    } else {
      setMetrics(null)
      setMarginGenerated("")
      setManDaysEstimated("")
      setManDaysActual("")
      setMrr("")
      setAdditionalBusiness("")
      setMetricsNotes("")
    }

    if (membersRes.data) {
      const entries: MemberEntry[] = membersRes.data
        .filter((m) => m.role !== "owner")
        .map((m) => ({
          profile_id: m.profile_id,
          role: m.role as MemberRole,
          profile: m.profile as StafftoolProfile,
        }))
      setMembersList(entries)
      setOriginalMembers(entries.map((e) => ({ ...e })))
    }

    if (docsRes.data) {
      setDocuments(docsRes.data)
    } else {
      setDocuments([])
    }

    setNewFiles([])
    setDeletedDocIds([])
    setLoading(false)
  }, [useCaseId])

  useEffect(() => {
    if (open && useCaseId) {
      fetchData()
    }
  }, [open, useCaseId, fetchData])

  // --- Tag handlers ---
  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const removeTag = (tagId: string) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId))
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    setCreatingTag(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("ia_lab_tags")
      .insert({ name: newTagName.trim(), color: newTagColor })
      .select()
      .single()
    if (data) {
      setAllTags((prev) => [...prev, data])
      setSelectedTagIds((prev) => [...prev, data.id])
    }
    setNewTagName("")
    setNewTagColor("#6366f1")
    setCreatingTag(false)
  }

  // --- Member handlers ---
  const removeMember = (profileId: string) => {
    setMembersList((prev) => prev.filter((m) => m.profile_id !== profileId))
  }

  const handleAddMember = () => {
    if (!addMemberProfileId) return
    const profile = allProfiles.find((p) => p.id === addMemberProfileId)
    if (!profile) return
    setMembersList((prev) => [
      ...prev,
      { profile_id: addMemberProfileId, role: addMemberRole, profile },
    ])
    setAddMemberProfileId("")
    setAddMemberRole("contributor")
  }

  // --- File handlers ---
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    setNewFiles((prev) => [...prev, ...Array.from(files)])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeNewFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const markDocForDeletion = (docId: string) => {
    setDeletedDocIds((prev) => [...prev, docId])
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // --- Cancel ---
  const handleCancel = () => {
    onOpenChange(false)
  }

  // --- Save All ---
  const handleSaveAll = async () => {
    if (!useCaseId) return
    setSaving(true)
    const supabase = createClient()

    // 1. Update use_cases
    const updateData: Record<string, unknown> = {
      title,
      description,
      documentation,
      status,
      category,
      priority,
      owner_id: ownerId || null,
    }
    const newFieldValue = (val: string) =>
      val && val !== "none" ? val : null
    if (deliverableType || useCase?.deliverable_type)
      updateData.deliverable_type = newFieldValue(deliverableType)
    if (usageType || useCase?.usage_type)
      updateData.usage_type = newFieldValue(usageType)
    if (tools || useCase?.tools) updateData.tools = tools || null
    if (targetUsers || useCase?.target_users)
      updateData.target_users = targetUsers || null
    if (benchmarkUrl || useCase?.benchmark_url)
      updateData.benchmark_url = benchmarkUrl || null
    if (journeyUrl || useCase?.journey_url)
      updateData.journey_url = journeyUrl || null
    if (nextSteps || useCase?.next_steps)
      updateData.next_steps = nextSteps || null
    if (transferStatus || useCase?.transfer_status)
      updateData.transfer_status = transferStatus && transferStatus !== "none" ? transferStatus : null

    await supabase.from("ia_lab_use_cases").update(updateData).eq("id", useCaseId)

    // 2. Sync tags
    const tagsToRemove = originalTagIds.filter(
      (id) => !selectedTagIds.includes(id)
    )
    const tagsToAdd = selectedTagIds.filter(
      (id) => !originalTagIds.includes(id)
    )

    if (tagsToRemove.length > 0) {
      await supabase
        .from("ia_lab_use_case_tags")
        .delete()
        .eq("use_case_id", useCaseId)
        .in("tag_id", tagsToRemove)
    }
    if (tagsToAdd.length > 0) {
      await supabase.from("ia_lab_use_case_tags").insert(
        tagsToAdd.map((tag_id) => ({
          use_case_id: useCaseId,
          tag_id,
        }))
      )
    }

    // 3. Sync members (excluding owner)
    const originalMemberIds = originalMembers.map((m) => m.profile_id)
    const currentMemberIds = membersList.map((m) => m.profile_id)

    const membersToRemove = originalMemberIds.filter(
      (id) => !currentMemberIds.includes(id)
    )
    const membersToUpsert = membersList.filter(
      (m) =>
        !originalMemberIds.includes(m.profile_id) ||
        originalMembers.find((om) => om.profile_id === m.profile_id)?.role !==
          m.role
    )

    if (membersToRemove.length > 0) {
      await supabase
        .from("ia_lab_use_case_members")
        .delete()
        .eq("use_case_id", useCaseId)
        .in("profile_id", membersToRemove)
    }
    if (membersToUpsert.length > 0) {
      await supabase.from("ia_lab_use_case_members").upsert(
        membersToUpsert.map((m) => ({
          use_case_id: useCaseId,
          profile_id: m.profile_id,
          role: m.role,
        })),
        { onConflict: "use_case_id,profile_id" }
      )
    }

    // 4. Upsert metrics
    const metricsData = {
      use_case_id: useCaseId,
      margin_generated: marginGenerated ? parseFloat(marginGenerated) : null,
      man_days_estimated: manDaysEstimated
        ? parseFloat(manDaysEstimated)
        : null,
      man_days_actual: manDaysActual ? parseFloat(manDaysActual) : null,
      mrr: mrr ? parseFloat(mrr) : null,
      additional_business: additionalBusiness
        ? parseFloat(additionalBusiness)
        : null,
      notes: metricsNotes || null,
    }

    if (metrics) {
      await supabase
        .from("ia_lab_use_case_metrics")
        .update(metricsData)
        .eq("id", metrics.id)
    } else {
      const hasAnyMetric =
        marginGenerated ||
        manDaysEstimated ||
        manDaysActual ||
        mrr ||
        additionalBusiness ||
        metricsNotes
      if (hasAnyMetric) {
        await supabase.from("ia_lab_use_case_metrics").insert(metricsData)
      }
    }

    // 5. Upload new files
    for (const file of newFiles) {
      const filePath = `${useCaseId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file)

      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("documents").getPublicUrl(filePath)

        await supabase.from("ia_lab_use_case_documents").insert({
          use_case_id: useCaseId,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
        })
      }
    }

    // 6. Delete marked documents
    for (const docId of deletedDocIds) {
      const doc = documents.find((d) => d.id === docId)
      if (doc) {
        // Extract storage path from URL
        const urlParts = doc.file_url.split("/documents/")
        if (urlParts[1]) {
          await supabase.storage
            .from("documents")
            .remove([decodeURIComponent(urlParts[1])])
        }
        await supabase.from("ia_lab_use_case_documents").delete().eq("id", docId)
      }
    }

    toast.success("Use case enregistré")
    setSaving(false)
    onOpenChange(false)
    onUpdate()
  }

  // --- Delete use case ---
  const handleDelete = async () => {
    if (!useCaseId) return
    setDeleting(true)
    const supabase = createClient()

    await Promise.all([
      supabase.from("ia_lab_use_case_tags").delete().eq("use_case_id", useCaseId),
      supabase
        .from("ia_lab_use_case_members")
        .delete()
        .eq("use_case_id", useCaseId),
      supabase
        .from("ia_lab_use_case_metrics")
        .delete()
        .eq("use_case_id", useCaseId),
      supabase
        .from("ia_lab_interest_requests")
        .delete()
        .eq("use_case_id", useCaseId),
      supabase
        .from("ia_lab_use_case_documents")
        .delete()
        .eq("use_case_id", useCaseId),
    ])

    const { error } = await supabase.from("ia_lab_use_cases").delete().eq("id", useCaseId)

    if (error) toast.error("Erreur lors de la suppression")
    else toast.success("Use case supprimé")

    setDeleting(false)
    onOpenChange(false)
    onUpdate()
  }

  // Available profiles for member add (exclude owner + already added)
  const availableProfiles = allProfiles.filter(
    (p) =>
      p.id !== ownerId &&
      !membersList.some((m) => m.profile_id === p.id)
  )

  // Owner profile for display
  const ownerProfile = allProfiles.find((p) => p.id === ownerId)

  const getInitials = (name: string | undefined) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"

  const visibleDocuments = documents.filter(
    (d) => !deletedDocIds.includes(d.id)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl h-[90vh] max-h-[90vh] !flex flex-col p-0 gap-0 overflow-hidden"
        showCloseButton={true}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !useCase ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Use case introuvable</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-start justify-between pr-8">
                <div className="flex-1 min-w-0">
                  <DialogTitle className="sr-only">
                    Détail du use case
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Modifier les informations du use case
                  </DialogDescription>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg font-semibold h-auto py-1 border-transparent hover:border-input focus:border-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Statut
                  </Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as UseCaseStatus)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Catégorie
                  </Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as UseCaseCategory)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMPACT">IMPACT</SelectItem>
                      <SelectItem value="LAB">LAB</SelectItem>
                      <SelectItem value="PRODUCT">PRODUCT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Priorité
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as PriorityLevel)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Basse</SelectItem>
                      <SelectItem value="medium">Moyenne</SelectItem>
                      <SelectItem value="high">Haute</SelectItem>
                      <SelectItem value="critical">Critique</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Delete button */}
              <div className="flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Supprimer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Supprimer ce use case ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Le use case &ldquo;
                        {useCase.title}&rdquo; sera définitivement supprimé.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {deleting ? "Suppression..." : "Supprimer"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </DialogHeader>

            <Separator className="shrink-0" />

            {/* Body */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 pb-4">
                <Tabs defaultValue="details" className="mt-4">
                  <TabsList className="w-full">
                    <TabsTrigger value="details" className="flex-1">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Détails
                    </TabsTrigger>
                    <TabsTrigger value="members" className="flex-1">
                      <Users className="mr-1.5 h-3.5 w-3.5" />
                      Membres
                    </TabsTrigger>
                    <TabsTrigger value="metrics" className="flex-1">
                      <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                      Métriques
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab: Details */}
                  <TabsContent value="details" className="space-y-5 mt-4">
                    {/* Description */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Description</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Description du use case..."
                        className="text-sm"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tags</Label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedTagIds.map((tagId) => {
                          const tag = allTags.find((t) => t.id === tagId)
                          if (!tag) return null
                          return (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: tag.color + "20",
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                              <button
                                type="button"
                                onClick={() => removeTag(tag.id)}
                                className="hover:opacity-70"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          )
                        })}

                        <Popover
                          open={tagPopoverOpen}
                          onOpenChange={setTagPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                            >
                              <TagIcon className="mr-1 h-3 w-3" />
                              Ajouter
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Rechercher un tag..." />
                              <CommandList>
                                <CommandEmpty>Aucun tag trouvé</CommandEmpty>
                                <CommandGroup>
                                  {allTags.map((tag) => (
                                    <CommandItem
                                      key={tag.id}
                                      onSelect={() => toggleTag(tag.id)}
                                      className="flex items-center gap-2"
                                    >
                                      <Checkbox
                                        checked={selectedTagIds.includes(
                                          tag.id
                                        )}
                                      />
                                      <span
                                        className="h-3 w-3 rounded-full"
                                        style={{
                                          backgroundColor: tag.color,
                                        }}
                                      />
                                      <span className="text-sm">
                                        {tag.name}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                            <Separator />
                            <div className="p-2 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Créer un tag
                              </p>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={newTagName}
                                  onChange={(e) =>
                                    setNewTagName(e.target.value)
                                  }
                                  placeholder="Nom..."
                                  className="h-7 text-xs flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault()
                                      handleCreateTag()
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={handleCreateTag}
                                  disabled={
                                    !newTagName.trim() || creatingTag
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {tagColors.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`h-5 w-5 rounded-full border-2 ${
                                      newTagColor === color
                                        ? "border-foreground"
                                        : "border-transparent"
                                    }`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setNewTagColor(color)}
                                  />
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Documentation */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        Documentation
                      </Label>
                      <Textarea
                        value={documentation}
                        onChange={(e) => setDocumentation(e.target.value)}
                        rows={6}
                        placeholder="Documentation en markdown..."
                        className="font-mono text-sm"
                      />
                    </div>

                    {/* File upload zone */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Fichiers</Label>
                      <div
                        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                          isDragging
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/25 hover:border-muted-foreground/50"
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Glissez-déposez des fichiers ici ou{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            parcourir
                          </button>
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileSelect(e.target.files)}
                        />
                      </div>

                      {/* Existing documents */}
                      {visibleDocuments.length > 0 && (
                        <div className="space-y-1">
                          {visibleDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between rounded-md border px-3 py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">
                                  {doc.file_name}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatFileSize(doc.file_size)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 hover:bg-muted rounded"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => markDocForDeletion(doc.id)}
                                  className="p-1 hover:bg-red-50 text-red-500 rounded"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* New files pending upload */}
                      {newFiles.length > 0 && (
                        <div className="space-y-1">
                          {newFiles.map((file, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Upload className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-sm truncate">
                                  {file.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] shrink-0"
                                >
                                  nouveau
                                </Badge>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeNewFile(i)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Separator className="my-2" />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type de livrable</Label>
                        <Select
                          value={deliverableType || "none"}
                          onValueChange={setDeliverableType}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Non défini" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Non défini</SelectItem>
                            <SelectItem value="Build">Build</SelectItem>
                            <SelectItem value="Bonnes pratiques">
                              Bonnes pratiques
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Type d&apos;utilisation
                        </Label>
                        <Select
                          value={usageType || "none"}
                          onValueChange={setUsageType}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Non défini" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Non défini</SelectItem>
                            <SelectItem value="Interne Digi">
                              Interne Digi
                            </SelectItem>
                            <SelectItem value="Productivite missions">
                              Productivité missions
                            </SelectItem>
                            <SelectItem value="Vente">Vente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Transfert</Label>
                      <Select
                        value={transferStatus || "none"}
                        onValueChange={setTransferStatus}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Non défini" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Non défini</SelectItem>
                          <SelectItem value="Oui">Oui</SelectItem>
                          <SelectItem value="Non">Non</SelectItem>
                          <SelectItem value="Oui si confirmé">Oui si confirmé</SelectItem>
                          <SelectItem value="En cours de reprise">En cours de reprise</SelectItem>
                          <SelectItem value="Déjà transféré">Déjà transféré</SelectItem>
                          <SelectItem value="Oui si possible mais pas nécessaire">Oui si possible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  {/* Tab: Members */}
                  <TabsContent value="members" className="space-y-4 mt-4">
                    {/* Owner (editable) */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Responsable
                      </Label>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs">
                            {getInitials(ownerProfile?.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <Select
                          value={ownerId}
                          onValueChange={(newOwnerId) => {
                            // If new owner was in members list, remove them
                            setMembersList((prev) =>
                              prev.filter((m) => m.profile_id !== newOwnerId)
                            )
                            setOwnerId(newOwnerId)
                          }}
                        >
                          <SelectTrigger className="h-9 flex-1">
                            <SelectValue placeholder="Sélectionner le responsable..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allProfiles.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Members list */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Membres</Label>
                      {membersList.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Aucun membre additionnel
                        </p>
                      )}
                      {membersList.map((m) => (
                        <div
                          key={m.profile_id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">
                                {getInitials(m.profile?.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm">
                                {m.profile?.full_name}
                              </p>
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {roleLabels[m.role] || m.role}
                              </Badge>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMember(m.profile_id)}
                            className="p-1 hover:bg-red-50 text-red-500 rounded"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add member */}
                    {availableProfiles.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">Ajouter un membre</Label>
                        <div className="flex items-center gap-2">
                          <Select
                            value={addMemberProfileId}
                            onValueChange={setAddMemberProfileId}
                          >
                            <SelectTrigger className="h-9 flex-1">
                              <SelectValue placeholder="Sélectionner..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={addMemberRole}
                            onValueChange={(v) =>
                              setAddMemberRole(v as MemberRole)
                            }
                          >
                            <SelectTrigger className="h-9 w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contributor">
                                Contributeur
                              </SelectItem>
                              <SelectItem value="reviewer">
                                Reviewer
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-9"
                            onClick={handleAddMember}
                            disabled={!addMemberProfileId}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: Metrics */}
                  <TabsContent value="metrics" className="space-y-4 mt-4">
                    <UseCaseGainsPanel useCaseId={useCase.id} />
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>

            <Separator className="shrink-0" />

            {/* Footer */}
            <DialogFooter className="shrink-0 px-6 py-4 flex-row justify-between sm:justify-between">
              <Button variant="outline" onClick={handleCancel}>
                Annuler
              </Button>
              <Button onClick={handleSaveAll} disabled={saving}>
                {saving && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
