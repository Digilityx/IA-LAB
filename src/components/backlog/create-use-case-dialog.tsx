"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import type {
  UseCaseCategory,
  PriorityLevel,
  Sprint,
  Profile,
} from "@/types/database"

interface CreateUseCaseDialogProps {
  onCreated: () => void
}

export function CreateUseCaseDialog({ onCreated }: CreateUseCaseDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [members, setMembers] = useState<Profile[]>([])

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<UseCaseCategory>("LAB")
  const [priority, setPriority] = useState<PriorityLevel>("medium")
  const [sprintId, setSprintId] = useState<string>("")
  const [ownerId, setOwnerId] = useState<string>("")
  const [deliverableType, setDeliverableType] = useState("")
  const [usageType, setUsageType] = useState("")
  const [tools, setTools] = useState("")

  useEffect(() => {
    if (!open) return
    const fetchData = async () => {
      const supabase = createClient()
      const [sprintsRes, membersRes, userRes] = await Promise.all([
        supabase.from("ia_lab_sprints").select("*").order("start_date", { ascending: false }),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.auth.getUser(),
      ])
      if (sprintsRes.data) setSprints(sprintsRes.data)
      if (membersRes.data) setMembers(membersRes.data)
      if (userRes.data.user) setOwnerId(userRes.data.user.id)
    }
    fetchData()
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return // prevent double-submit
    setLoading(true)

    const supabase = createClient()

    // Ensure we have an owner — fallback to current user if state is empty
    let finalOwnerId = ownerId
    if (!finalOwnerId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        finalOwnerId = user.id
        setOwnerId(user.id)
      }
    }

    if (!finalOwnerId) {
      console.error("Impossible de déterminer le responsable (utilisateur non connecté ?)")
      setLoading(false)
      return
    }

    // Build insert data — only include new Airtable fields if non-empty
    // (allows creation to work even before migration 002 is applied)
    const insertData: Record<string, unknown> = {
      title,
      description,
      category,
      priority,
      sprint_id: sprintId && sprintId !== "none" ? sprintId : null,
      owner_id: finalOwnerId,
      status: "backlog",
    }
    if (deliverableType && deliverableType !== "none") insertData.deliverable_type = deliverableType
    if (usageType && usageType !== "none") insertData.usage_type = usageType
    if (tools) insertData.tools = tools

    const { data: insertedUc, error } = await supabase
      .from("ia_lab_use_cases")
      .insert(insertData)
      .select("id")
      .single()

    if (!error && insertedUc) {
      // Also insert into sprint_use_cases junction table if sprint selected
      if (sprintId && sprintId !== "none") {
        await supabase.from("ia_lab_sprint_use_cases").insert({
          sprint_id: sprintId,
          use_case_id: insertedUc.id,
        })
      }
      toast.success("Use case créé avec succès")
      setOpen(false)
      setTitle("")
      setDescription("")
      setCategory("LAB")
      setPriority("medium")
      setSprintId("")
      setDeliverableType("")
      setUsageType("")
      setTools("")
      onCreated()
    } else {
      toast.error("Erreur lors de la création du use case")
      console.error("Erreur création use case:", error.message)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau use case
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer un use case</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nom du use case"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du use case..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as UseCaseCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMPACT">IMPACT</SelectItem>
                  <SelectItem value="LAB">LAB</SelectItem>
                  <SelectItem value="PRODUCT">PRODUCT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as PriorityLevel)}>
                <SelectTrigger>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type de livrable</Label>
              <Select value={deliverableType} onValueChange={setDeliverableType}>
                <SelectTrigger>
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non defini</SelectItem>
                  <SelectItem value="Build">Build</SelectItem>
                  <SelectItem value="Bonnes pratiques">Bonnes pratiques</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type d&apos;utilisation</Label>
              <Select value={usageType} onValueChange={setUsageType}>
                <SelectTrigger>
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non defini</SelectItem>
                  <SelectItem value="Interne Digi">Interne Digi</SelectItem>
                  <SelectItem value="Productivite missions">Productivite missions</SelectItem>
                  <SelectItem value="Vente">Vente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Outils pressentis</Label>
            <Input
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              placeholder="Ex: ChatGPT, Cursor, Make... (optionnel)"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sprint</Label>
              <Select value={sprintId} onValueChange={setSprintId}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {sprints.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
