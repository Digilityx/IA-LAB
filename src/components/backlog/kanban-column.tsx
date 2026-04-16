"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { UseCaseCard } from "./use-case-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { UseCase, UseCaseStatus } from "@/types/database"
import type { KanbanDisplayPrefs } from "@/hooks/use-display-prefs"

const columnConfig: Record<
  UseCaseStatus,
  { title: string; color: string }
> = {
  backlog: { title: "Backlog", color: "bg-gray-500" },
  todo: { title: "À faire", color: "bg-slate-500" },
  in_progress: { title: "En cours", color: "bg-amber-500" },
  done: { title: "Terminé", color: "bg-emerald-500" },
  abandoned: { title: "Abandonné", color: "bg-red-500" },
}

interface KanbanColumnProps {
  status: UseCaseStatus
  useCases: UseCase[]
  onSelectUseCase?: (id: string) => void
  displayPrefs?: KanbanDisplayPrefs
}

export function KanbanColumn({ status, useCases, onSelectUseCase, displayPrefs }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const config = columnConfig[status]

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg bg-muted/50 ${
        isOver ? "ring-2 ring-primary/50" : ""
      }`}
    >
      <div className="flex items-center gap-2 p-3 pb-2">
        <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
        <h3 className="text-sm font-semibold">{config.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {useCases.length}
        </span>
      </div>
      <ScrollArea className="flex-1 px-3 pb-3">
        <SortableContext
          items={useCases.map((uc) => uc.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {useCases.map((uc) => (
              <UseCaseCard key={uc.id} useCase={uc} onSelect={onSelectUseCase} displayPrefs={displayPrefs} />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  )
}
