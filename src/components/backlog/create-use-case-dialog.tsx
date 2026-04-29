'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type {
  UseCaseCategory,
  PriorityLevel,
  Sprint,
  UseCaseSubmission,
  Profile,
} from '@/types/database'
import { searchProfiles } from '@/lib/stafftool/profiles'
import type { StafftoolProfile } from '@/lib/stafftool/types'

export interface ApprovalSource {
  submission: UseCaseSubmission
  /** Minimum needed: id + full_name for the strip. Profile is structurally a subset of StafftoolProfile. */
  submitter: Pick<Profile, 'id' | 'full_name'>
}

interface CreateUseCaseDialogProps {
  onCreated: () => void
  approvalSource?: ApprovalSource | null
  /** Controlled open state (required when used in approval mode). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CreateUseCaseDialog({
  onCreated,
  approvalSource,
  open: controlledOpen,
  onOpenChange,
}: CreateUseCaseDialogProps) {
  const isApprovalMode = !!approvalSource
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [loading, setLoading] = useState(false)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [members, setMembers] = useState<StafftoolProfile[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<UseCaseCategory>('LAB')
  const [priority, setPriority] = useState<PriorityLevel>('medium')
  const [sprintId, setSprintId] = useState<string>('')
  const [ownerId, setOwnerId] = useState<string>('')
  const [deliverableType, setDeliverableType] = useState('')
  const [usageType, setUsageType] = useState('')
  const [tools, setTools] = useState('')

  // Reject flow
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const reset = () => {
    setTitle('')
    setDescription('')
    setCategory('LAB')
    setPriority('medium')
    setSprintId('')
    setDeliverableType('')
    setUsageType('')
    setTools('')
    setRejectReason('')
  }

  useEffect(() => {
    if (!open) return
    const fetchData = async () => {
      const supabase = createClient()
      const [sprintsRes, membersData, userRes] = await Promise.all([
        supabase.from('ia_lab_sprints').select('*').order('start_date', { ascending: false }),
        searchProfiles(''),
        supabase.auth.getUser(),
      ])
      if (sprintsRes.data) setSprints(sprintsRes.data)
      setMembers(membersData)
      if (userRes.data.user && !ownerId) setOwnerId(userRes.data.user.id)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Prefill from approvalSource on open
  useEffect(() => {
    if (open && approvalSource) {
      setTitle(approvalSource.submission.title)
      setDescription(approvalSource.submission.description ?? '')
      setUsageType(approvalSource.submission.usage_type ?? '')
    }
  }, [open, approvalSource])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    const supabase = createClient()

    let finalOwnerId = ownerId
    if (!finalOwnerId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        finalOwnerId = user.id
        setOwnerId(user.id)
      }
    }

    if (!finalOwnerId) {
      toast.error('Impossible de déterminer le responsable')
      setLoading(false)
      return
    }

    const insertData: Record<string, unknown> = {
      title,
      description,
      category,
      priority,
      sprint_id: sprintId && sprintId !== 'none' ? sprintId : null,
      owner_id: finalOwnerId,
      status: 'backlog',
    }
    if (deliverableType && deliverableType !== 'none') insertData.deliverable_type = deliverableType
    if (usageType && usageType !== 'none') insertData.usage_type = usageType
    if (tools) insertData.tools = tools

    const { data: insertedUc, error } = await supabase
      .from('ia_lab_use_cases')
      .insert(insertData)
      .select('id')
      .single()

    if (error || !insertedUc) {
      toast.error(
        isApprovalMode
          ? "Erreur lors de l'approbation"
          : 'Erreur lors de la création du use case'
      )
      console.error('Erreur création use case:', error?.message)
      setLoading(false)
      return
    }

    if (sprintId && sprintId !== 'none') {
      await supabase.from('ia_lab_sprint_use_cases').insert({
        sprint_id: sprintId,
        use_case_id: insertedUc.id,
      })
    }

    if (isApprovalMode && approvalSource) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: updatedRows, error: updErr } = await supabase
        .from('ia_lab_use_case_submissions')
        .update({
          status: 'approved',
          approved_use_case_id: insertedUc.id,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approvalSource.submission.id)
        .eq('status', 'pending')
        .select('id')
      if (updErr) {
        toast.error("UC créé, mais erreur lors de la mise à jour de la demande")
        console.error(updErr)
      } else if (!updatedRows || updatedRows.length === 0) {
        // Lost the race — the submission was already approved or rejected by another admin.
        // Roll back the UC we just created to avoid an orphan row.
        await supabase.from('ia_lab_use_cases').delete().eq('id', insertedUc.id)
        toast.error('Demande déjà traitée par un autre administrateur')
      } else {
        toast.success('Demande approuvée — use case créé')
      }
    } else {
      toast.success('Use case créé avec succès')
    }

    setOpen(false)
    reset()
    onCreated()
    setLoading(false)
  }

  const handleReject = async () => {
    if (!approvalSource) return
    if (rejectReason.trim().length === 0) return
    setRejecting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: updatedRows, error } = await supabase
      .from('ia_lab_use_case_submissions')
      .update({
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', approvalSource.submission.id)
      .eq('status', 'pending')
      .select('id')

    if (error) {
      toast.error('Erreur lors du rejet')
      console.error(error)
      setRejecting(false)
      return
    }

    if (!updatedRows || updatedRows.length === 0) {
      toast.error('Demande déjà traitée par un autre administrateur')
      setRejecting(false)
      setRejectOpen(false)
      setRejectReason('')
      setOpen(false)
      reset()
      onCreated()
      return
    }

    toast.success('Demande rejetée')
    setRejectOpen(false)
    setRejectReason('')
    setRejecting(false)
    setOpen(false)
    reset()
    onCreated()
  }

  const dialogTitle = isApprovalMode ? 'Approuver une demande' : 'Créer un use case'

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        {!isApprovalMode && (
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau use case
            </Button>
          </DialogTrigger>
        )}
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {isApprovalMode && approvalSource && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {approvalSource.submitter.full_name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span>
                Demande de <strong>{approvalSource.submitter.full_name}</strong>
                {' '}le {new Date(approvalSource.submission.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}

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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
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
                  <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
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
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {sprints.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsable</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              {isApprovalMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={loading}
                >
                  Rejeter
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading
                  ? (isApprovalMode ? 'Approbation...' : 'Création...')
                  : (isApprovalMode ? 'Approuver' : 'Créer')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter cette demande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Indiquez la raison du rejet — le demandeur pourra la lire dans son backlog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet..."
            rows={4}
          />
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setRejectOpen(false); setRejectReason('') }}
              disabled={rejecting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || rejectReason.trim().length === 0}
            >
              {rejecting ? 'Rejet...' : 'Confirmer le rejet'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
