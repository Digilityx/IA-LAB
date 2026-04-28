"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import type { UseCase } from "@/types/database"

const categoryColors: Record<string, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

interface AddUseCaseToSprintProps {
  sprintId: string
  existingUseCaseIds: string[]
  onAdded: () => void
}

export function AddUseCaseToSprint({
  sprintId,
  existingUseCaseIds,
  onAdded,
}: AddUseCaseToSprintProps) {
  const [open, setOpen] = useState(false)
  const [useCases, setUseCases] = useState<UseCase[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const fetchUseCases = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from("ia_lab_use_cases")
        .select("id, title, category, status")
        .order("title")

      if (data) {
        setUseCases(
          (data as UseCase[]).filter(
            (uc) => !existingUseCaseIds.includes(uc.id)
          )
        )
      }
      setLoading(false)
    }
    fetchUseCases()
  }, [open, existingUseCaseIds])

  const handleSelect = async (useCaseId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("ia_lab_sprint_use_cases").insert({
      sprint_id: sprintId,
      use_case_id: useCaseId,
    })

    if (!error) {
      toast.success("Use case ajouté au sprint")
      setOpen(false)
      onAdded()
    } else {
      toast.error("Erreur lors de l'ajout au sprint")
      console.error("Erreur ajout use case au sprint:", error.message)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un use case
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher un use case..." />
          <CommandList>
            <CommandEmpty>
              {loading ? "Chargement..." : "Aucun use case trouvé"}
            </CommandEmpty>
            <CommandGroup>
              {useCases.map((uc) => (
                <CommandItem
                  key={uc.id}
                  value={uc.title}
                  onSelect={() => handleSelect(uc.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-sm">{uc.title}</span>
                  <Badge
                    className={`ml-2 text-xs shrink-0 ${categoryColors[uc.category] || ""}`}
                  >
                    {uc.category}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
