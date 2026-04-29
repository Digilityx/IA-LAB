'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SubmitUseCaseDialog } from '@/components/backlog/submit-use-case-dialog'
import type { UseCaseSubmission } from '@/types/database'

const REJECTION_VISIBLE_DAYS = 30

export function YourSubmissions() {
  const [submissions, setSubmissions] = useState<UseCaseSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UseCaseSubmission | null>(null)
  const [deleting, setDeleting] = useState<UseCaseSubmission | null>(null)

  const fetchSubmissions = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const cutoff = new Date(
      Date.now() - REJECTION_VISIBLE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const { data, error } = await supabase
      .from('ia_lab_use_case_submissions')
      .select('*')
      .eq('submitted_by', user.id)
      .or(`status.eq.pending,and(status.eq.rejected,reviewed_at.gte.${cutoff})`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load submissions', error)
      toast.error('Erreur lors du chargement de vos demandes')
    } else {
      setSubmissions((data ?? []) as UseCaseSubmission[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  const handleDelete = async () => {
    if (!deleting) return
    const supabase = createClient()
    const { error } = await supabase
      .from('ia_lab_use_case_submissions')
      .delete()
      .eq('id', deleting.id)
    if (error) {
      toast.error('Erreur lors de la suppression')
      console.error(error)
    } else {
      toast.success('Demande supprimée')
      setSubmissions((prev) => prev.filter((s) => s.id !== deleting.id))
    }
    setDeleting(null)
  }

  if (loading || submissions.length === 0) return null

  const pending = submissions.filter((s) => s.status === 'pending')
  const rejected = submissions.filter((s) => s.status === 'rejected')

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Vos demandes</h2>
        <p className="text-xs text-muted-foreground">
          Demandes en attente de validation et refus récents
        </p>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            En attente ({pending.length})
          </p>
          {pending.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{s.title}</span>
                <Badge variant="secondary" className="shrink-0">En attente</Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditing(s)}
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(s)}
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Refusées ({rejected.length})
          </p>
          {rejected.map((s) => (
            <div
              key={s.id}
              className="rounded-md border bg-card px-3 py-2 space-y-1"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{s.title}</span>
                <Badge variant="destructive" className="shrink-0">Refusée</Badge>
              </div>
              {s.rejection_reason && (
                <p className="text-xs text-muted-foreground">
                  Raison : {s.rejection_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <SubmitUseCaseDialog
        submissionToEdit={editing}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null) }}
        onSubmitted={fetchSubmissions}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette demande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La demande sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
