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
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { UseCaseSubmission } from '@/types/database'

interface SubmitUseCaseDialogProps {
  /** When provided, the dialog opens prefilled and updates the existing submission instead of inserting. */
  submissionToEdit?: UseCaseSubmission | null
  /** Controlled open state — required when used in edit mode (no internal trigger). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmitted: () => void
}

const USAGE_TYPE_OPTIONS = [
  'Interne Digi',
  'Productivite missions',
  'Vente',
] as const

export function SubmitUseCaseDialog({
  submissionToEdit,
  open: controlledOpen,
  onOpenChange,
  onSubmitted,
}: SubmitUseCaseDialogProps) {
  const isEditMode = !!submissionToEdit
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [usageType, setUsageType] = useState<string>('')

  // Prefill on open / when submissionToEdit changes
  useEffect(() => {
    if (open) {
      setTitle(submissionToEdit?.title ?? '')
      setDescription(submissionToEdit?.description ?? '')
      setUsageType(submissionToEdit?.usage_type ?? '')
    }
  }, [open, submissionToEdit])

  const reset = () => {
    setTitle('')
    setDescription('')
    setUsageType('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (title.trim().length < 3) {
      toast.error('Le titre doit faire au moins 3 caractères')
      return
    }
    setLoading(true)

    const supabase = createClient()
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      usage_type: usageType || null,
    }

    if (isEditMode && submissionToEdit) {
      const { error } = await supabase
        .from('ia_lab_use_case_submissions')
        .update(payload)
        .eq('id', submissionToEdit.id)
      if (error) {
        toast.error('Erreur lors de la mise à jour')
        console.error(error)
        setLoading(false)
        return
      }
      toast.success('Demande mise à jour')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Utilisateur non connecté')
        setLoading(false)
        return
      }
      const { error } = await supabase
        .from('ia_lab_use_case_submissions')
        .insert({ ...payload, submitted_by: user.id })
      if (error) {
        toast.error('Erreur lors de la soumission')
        console.error(error)
        setLoading(false)
        return
      }
      toast.success('Demande envoyée — en attente de validation')
    }

    setLoading(false)
    setOpen(false)
    reset()
    onSubmitted()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEditMode && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Soumettre un use case
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Modifier la demande' : 'Soumettre un use case'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="submit-title">Titre</Label>
            <Input
              id="submit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nom du use case"
              required
              minLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="submit-description">Description</Label>
            <Textarea
              id="submit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description du use case..."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Type d&apos;utilisation</Label>
            <Select value={usageType} onValueChange={setUsageType}>
              <SelectTrigger>
                <SelectValue placeholder="Optionnel" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? (isEditMode ? 'Mise à jour...' : 'Envoi...')
                : (isEditMode ? 'Mettre à jour' : 'Soumettre')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
