"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { UseCaseGainsPanel } from "@/components/backlog/use-case-gains-panel"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  ArrowLeft,
  Save,
  Pencil,
  Users,
  FileText,
  BarChart3,
} from "lucide-react"
import type {
  UseCase,
  Profile,
  UseCaseCategory,
  UseCaseStatus,
} from "@/types/database"

export default function UseCaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [documentation, setDocumentation] = useState("")
  const [status, setStatus] = useState<UseCaseStatus>("backlog")
  const [category, setCategory] = useState<UseCaseCategory>("LAB")

  // New Airtable fields
  const [deliverableType, setDeliverableType] = useState("")
  const [usageType, setUsageType] = useState("")
  const [tools, setTools] = useState("")
  const [targetUsers, setTargetUsers] = useState("")
  const [benchmarkUrl, setBenchmarkUrl] = useState("")
  const [journeyUrl, setJourneyUrl] = useState("")
  const [nextSteps, setNextSteps] = useState("")
  const [transferStatus, setTransferStatus] = useState("")

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [ucRes, membersRes] = await Promise.all([
      supabase
        .from("use_cases")
        .select(`*, owner:profiles!use_cases_owner_id_fkey(*), sprint:sprints(*), tags:use_case_tags(tag:tags(*))`)
        .eq("id", id)
        .single(),
      supabase
        .from("use_case_members")
        .select("*, profile:profiles(*)")
        .eq("use_case_id", id),
    ])

    if (ucRes.data) {
      const uc = {
        ...ucRes.data,
        tags: ucRes.data.tags?.map((t: { tag: unknown }) => t.tag).filter(Boolean) || [],
      } as UseCase
      setUseCase(uc)
      setTitle(uc.title)
      setDescription(uc.description)
      setDocumentation(uc.documentation || "")
      setStatus(uc.status)
      setCategory(uc.category)
      setDeliverableType(uc.deliverable_type || "")
      setUsageType(uc.usage_type || "")
      setTools(uc.tools || "")
      setTargetUsers(uc.target_users || "")
      setBenchmarkUrl(uc.benchmark_url || "")
      setJourneyUrl(uc.journey_url || "")
      setNextSteps(uc.next_steps || "")
      setTransferStatus(uc.transfer_status || "")
    }
    if (membersRes.data) {
      setMembers(membersRes.data.map((m) => m.profile).filter(Boolean) as Profile[])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    // Build update data — only include new fields if they have changed
    // (allows editing to work even before migration 002 is applied)
    const updateData: Record<string, unknown> = {
      title,
      description,
      documentation,
      status,
      category,
    }
    // Only send new columns if they have values (avoids error if migration not applied)
    const newFieldValue = (val: string) => val && val !== "none" ? val : null
    if (deliverableType || useCase?.deliverable_type) updateData.deliverable_type = newFieldValue(deliverableType)
    if (usageType || useCase?.usage_type) updateData.usage_type = newFieldValue(usageType)
    if (tools || useCase?.tools) updateData.tools = tools || null
    if (targetUsers || useCase?.target_users) updateData.target_users = targetUsers || null
    if (benchmarkUrl || useCase?.benchmark_url) updateData.benchmark_url = benchmarkUrl || null
    if (journeyUrl || useCase?.journey_url) updateData.journey_url = journeyUrl || null
    if (nextSteps || useCase?.next_steps) updateData.next_steps = nextSteps || null
    if (transferStatus || useCase?.transfer_status) updateData.transfer_status = transferStatus && transferStatus !== "none" ? transferStatus : null

    await supabase
      .from("use_cases")
      .update(updateData)
      .eq("id", id)

    setEditing(false)
    setSaving(false)
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!useCase) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Use case introuvable</p>
      </div>
    )
  }

  const categoryColors: Record<string, string> = {
    IMPACT: "bg-red-100 text-red-800",
    LAB: "bg-slate-100 text-slate-700",
    PRODUCT: "bg-orange-100 text-orange-800",
  }

  const statusLabels: Record<string, string> = {
    backlog: "Backlog",
    todo: "A faire",
    in_progress: "En cours",
    done: "Termine",
    abandoned: "Abandonne",
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/backlog")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {editing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold h-auto py-1"
            />
          ) : (
            <h1 className="text-2xl font-bold">{useCase.title}</h1>
          )}
          <div className="flex items-center gap-2">
            <Badge className={categoryColors[useCase.category]}>{useCase.category}</Badge>
            <Badge variant="outline">{statusLabels[useCase.status]}</Badge>
            <span className="text-sm text-muted-foreground">
              par {useCase.owner?.full_name}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">
            <FileText className="mr-2 h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Membres
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Metriques
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as UseCaseStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="todo">A faire</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="done">Termine</SelectItem>
                    <SelectItem value="abandoned">Abandonne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categorie</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as UseCaseCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMPACT">IMPACT</SelectItem>
                    <SelectItem value="LAB">LAB</SelectItem>
                    <SelectItem value="PRODUCT">PRODUCT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {useCase.description || "Aucune description"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={documentation}
                  onChange={(e) => setDocumentation(e.target.value)}
                  rows={12}
                  placeholder="Documentation en markdown..."
                  className="font-mono text-sm"
                />
              ) : documentation ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{documentation}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune documentation</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations complementaires</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type de livrable</Label>
                  {editing ? (
                    <Select value={deliverableType} onValueChange={setDeliverableType}>
                      <SelectTrigger><SelectValue placeholder="Non defini" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non defini</SelectItem>
                        <SelectItem value="Build">Build</SelectItem>
                        <SelectItem value="Bonnes pratiques">Bonnes pratiques</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {useCase.deliverable_type || "Non defini"}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Type d&apos;utilisation</Label>
                  {editing ? (
                    <Select value={usageType} onValueChange={setUsageType}>
                      <SelectTrigger><SelectValue placeholder="Non defini" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non defini</SelectItem>
                        <SelectItem value="Interne Digi">Interne Digi</SelectItem>
                        <SelectItem value="Productivite missions">Productivite missions</SelectItem>
                        <SelectItem value="Vente">Vente</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {useCase.usage_type || "Non defini"}
                    </p>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label>Transfert</Label>
                {editing ? (
                  <Select
                    value={transferStatus || "none"}
                    onValueChange={setTransferStatus}
                  >
                    <SelectTrigger>
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
                ) : (
                  <Badge variant="outline">
                    {transferStatus || "Non défini"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Membres du projet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Owner */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {useCase.owner?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{useCase.owner?.full_name}</p>
                    <p className="text-xs text-muted-foreground">Responsable</p>
                  </div>
                </div>
                <Separator />
                {members.length > 0 ? (
                  members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {m.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{m.full_name}</p>
                        <p className="text-xs text-muted-foreground">Contributeur</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun membre additionnel</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gains par catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              <UseCaseGainsPanel useCaseId={useCase.id} />
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  )
}
