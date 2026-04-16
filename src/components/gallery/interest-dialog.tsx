"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Heart, Sparkles, Briefcase } from "lucide-react"
import type { InterestType } from "@/types/database"

const interestOptions: {
  type: InterestType
  label: string
  description: string
  icon: React.ElementType
  color: string
}[] = [
  {
    type: "interested",
    label: "Je trouve ça intéressant",
    description: "Signaler votre intérêt au porteur du projet",
    icon: Heart,
    color: "border-red-200 hover:border-red-400 hover:bg-red-50",
  },
  {
    type: "want_to_use",
    label: "Je souhaiterais l'utiliser",
    description: "Demander à utiliser cet outil à titre individuel",
    icon: Sparkles,
    color: "border-slate-200 hover:border-slate-400 hover:bg-slate-50",
  },
  {
    type: "propose_to_client",
    label: "Proposer à un client",
    description: "Envisager de proposer cette solution à un client",
    icon: Briefcase,
    color: "border-orange-200 hover:border-orange-400 hover:bg-orange-50",
  },
]

interface InterestDialogProps {
  useCaseId: string
  onSubmitted?: () => void
}

export function InterestDialog({ useCaseId, onSubmitted }: InterestDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<InterestType | null>(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!selectedType) return
    setLoading(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from("interest_requests").insert({
      use_case_id: useCaseId,
      requester_id: user.id,
      type: selectedType,
      message: message || null,
    })

    setSubmitted(true)
    setLoading(false)
    onSubmitted?.()

    setTimeout(() => {
      setOpen(false)
      setSubmitted(false)
      setSelectedType(null)
      setMessage("")
    }, 1500)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Heart className="mr-2 h-4 w-4" />
          Je suis intéressé
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manifester votre intérêt</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Heart className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">Demande envoyée !</p>
            <p className="text-xs text-muted-foreground mt-1">
              Le porteur du projet sera notifié
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {interestOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  className={`flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                    selectedType === option.type
                      ? "border-primary bg-primary/5"
                      : option.color
                  }`}
                >
                  <option.icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Message (optionnel)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Précisez votre demande..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedType || loading}
              >
                {loading ? "Envoi..." : "Envoyer"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
