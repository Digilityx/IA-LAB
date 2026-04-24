"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command"
import {
  LayoutDashboard,
  KanbanSquare,
  CalendarRange,
  BarChart3,
  Store,
  Settings,
  FileText,
  Search,
} from "lucide-react"

interface SearchResult {
  id: string
  title: string
  type: "use_case" | "sprint"
  subtitle?: string
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Backlog", href: "/backlog", icon: KanbanSquare },
  { name: "Sprints", href: "/sprints", icon: CalendarRange },
  { name: "Métriques", href: "/metrics", icon: BarChart3 },
  { name: "Galerie", href: "/gallery", icon: Store },
  { name: "Paramètres", href: "/settings", icon: Settings },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Search use cases & sprints when query changes
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const supabase = createClient()
    const searchTerm = `%${q}%`

    const [ucRes, sprintRes] = await Promise.all([
      supabase
        .from("ia_lab_use_cases")
        .select("id, title, category, status")
        .ilike("title", searchTerm)
        .limit(8),
      supabase
        .from("ia_lab_sprints")
        .select("id, name, status")
        .ilike("name", searchTerm)
        .limit(5),
    ])

    const items: SearchResult[] = []

    if (ucRes.data) {
      for (const uc of ucRes.data) {
        items.push({
          id: uc.id,
          title: uc.title,
          type: "use_case",
          subtitle: `${uc.category} · ${uc.status}`,
        })
      }
    }

    if (sprintRes.data) {
      for (const s of sprintRes.data) {
        items.push({
          id: s.id,
          title: s.name,
          type: "sprint",
          subtitle: s.status,
        })
      }
    }

    setResults(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200)
    return () => clearTimeout(timer)
  }, [query, search])

  const handleSelect = (item: SearchResult) => {
    setOpen(false)
    setQuery("")
    if (item.type === "use_case") {
      router.push(`/backlog/${item.id}`)
    } else {
      router.push(`/sprints/${item.id}`)
    }
  }

  const handleNavSelect = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const useCases = results.filter((r) => r.type === "use_case")
  const sprints = results.filter((r) => r.type === "sprint")

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Rechercher...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-70">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Recherche"
        description="Rechercher des use cases, sprints ou naviguer"
      >
        <CommandInput
          placeholder="Rechercher un use case, sprint, ou page..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading
              ? "Recherche..."
              : query.length < 2
                ? "Tapez au moins 2 caractères..."
                : "Aucun résultat trouvé"}
          </CommandEmpty>

          {useCases.length > 0 && (
            <CommandGroup heading="Use cases">
              {useCases.map((uc) => (
                <CommandItem
                  key={uc.id}
                  value={`uc-${uc.title}`}
                  onSelect={() => handleSelect(uc)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm">{uc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {uc.subtitle}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {sprints.length > 0 && (
            <CommandGroup heading="Sprints">
              {sprints.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`sprint-${s.title}`}
                  onSelect={() => handleSelect(s)}
                >
                  <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm">{s.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.subtitle}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(useCases.length > 0 || sprints.length > 0) && (
            <CommandSeparator />
          )}

          <CommandGroup heading="Navigation">
            {navigation.map((item) => (
              <CommandItem
                key={item.href}
                value={`nav-${item.name}`}
                onSelect={() => handleNavSelect(item.href)}
              >
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
