"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { UseCase } from "@/types/database"
import type { KanbanDisplayPrefs } from "@/hooks/use-display-prefs"

const categoryBandColors: Record<string, string> = {
  IMPACT: "bg-red-500/90",
  LAB: "bg-slate-500/90",
  PRODUCT: "bg-orange-500/90",
}

const priorityIndicator: Record<string, { color: string; label: string }> = {
  critical: { color: "bg-red-500", label: "Critique" },
  high: { color: "bg-orange-500", label: "Haute" },
  medium: { color: "bg-amber-400", label: "Moyenne" },
  low: { color: "bg-gray-400", label: "Basse" },
}


interface UseCaseCardProps {
  useCase: UseCase
  onSelect?: (id: string) => void
  displayPrefs?: KanbanDisplayPrefs
}

export function UseCaseCard({ useCase, onSelect, displayPrefs }: UseCaseCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: useCase.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const ownerInitials = useCase.owner?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-default hover:shadow-md transition-shadow overflow-hidden !p-0 !gap-0"
    >
      <div className="flex stretch">
        {/* Bandeau vertical catégorie avec label */}
        {displayPrefs?.category !== false && (
          <div
            className={`w-6 flex-shrink-0 flex items-center justify-center ${categoryBandColors[useCase.category] || "bg-gray-400"}`}
          >
            <span
              className="text-[10px] font-bold tracking-wider text-white uppercase"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              {useCase.category}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-start gap-2">
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5">
                {useCase.priority && useCase.priority !== "medium" && (
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${priorityIndicator[useCase.priority]?.color || ""}`}
                    title={priorityIndicator[useCase.priority]?.label}
                  />
                )}
                <button
                  onClick={() => onSelect?.(useCase.id)}
                  className="text-sm font-medium hover:underline line-clamp-2 text-left"
                >
                  {useCase.title}
                </button>
              </div>
              {displayPrefs?.tags !== false && useCase.tags && useCase.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {useCase.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: tag.color + "20",
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
              {displayPrefs?.owner !== false && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[10px]">
                        {ownerInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span>{useCase.owner?.full_name}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
