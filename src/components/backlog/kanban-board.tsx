"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { KanbanColumn } from "./kanban-column"
import { UseCaseCard } from "./use-case-card"
import { createClient } from "@/lib/supabase/client"
import type { UseCase, UseCaseStatus } from "@/types/database"
import type { KanbanDisplayPrefs } from "@/hooks/use-display-prefs"

const COLUMNS: UseCaseStatus[] = ["backlog", "todo", "in_progress", "done", "abandoned"]

interface KanbanBoardProps {
  useCases: UseCase[]
  onUpdate: () => void
  onSelectUseCase?: (id: string) => void
  displayPrefs?: KanbanDisplayPrefs
}

export function KanbanBoard({ useCases, onUpdate, onSelectUseCase, displayPrefs }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const activeUseCase = useCases.find((uc) => uc.id === activeId)

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const useCaseId = active.id as string
    const newStatus = over.id as UseCaseStatus

    // Check if dropped on a column
    if (COLUMNS.includes(newStatus)) {
      const currentUseCase = useCases.find((uc) => uc.id === useCaseId)
      if (currentUseCase && currentUseCase.status !== newStatus) {
        const supabase = createClient()
        const { error } = await supabase
          .from("use_cases")
          .update({ status: newStatus })
          .eq("id", useCaseId)
        if (error) toast.error("Erreur lors du changement de statut")
        onUpdate()
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 14rem)" }}>
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            useCases={useCases.filter((uc) => uc.status === status)}
            onSelectUseCase={onSelectUseCase}
            displayPrefs={displayPrefs}
          />
        ))}
      </div>
      <DragOverlay>
        {activeUseCase ? <UseCaseCard useCase={activeUseCase} displayPrefs={displayPrefs} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
