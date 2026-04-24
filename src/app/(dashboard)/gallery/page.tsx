"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Store, User, Heart } from "lucide-react"
import type { UseCase, Tag } from "@/types/database"

const categoryColors: Record<string, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

export default function GalleryPage() {
  const [useCases, setUseCases] = useState<(UseCase & { interest_count: number })[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterTag, setFilterTag] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [ucRes, tagsRes] = await Promise.all([
      supabase
        .from("ia_lab_use_cases")
        .select(`
          *,
          owner:profiles!ia_lab_use_cases_owner_id_fkey(*),
          tags:ia_lab_use_case_tags(tag:ia_lab_tags(*)),
          ia_lab_interest_requests(count)
        `)
        .eq("is_published", true)
        .order("updated_at", { ascending: false }),
      supabase.from("ia_lab_tags").select("*").order("name"),
    ])

    if (ucRes.data) {
      const transformed = ucRes.data.map((uc) => ({
        ...uc,
        tags: uc.tags?.map((t: { tag: unknown }) => t.tag).filter(Boolean) || [],
        interest_count:
          (uc.interest_requests as unknown as { count: number }[])?.[0]?.count || 0,
      }))
      setUseCases(transformed as (UseCase & { interest_count: number })[])
    }
    if (tagsRes.data) setTags(tagsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useCases.filter((uc) => {
    if (search) {
      const q = search.toLowerCase()
      const matchTitle = uc.title.toLowerCase().includes(q)
      const matchDesc = uc.short_description?.toLowerCase().includes(q)
      const matchTags = uc.tags?.some((t) => t.name.toLowerCase().includes(q))
      if (!matchTitle && !matchDesc && !matchTags) return false
    }
    if (filterCategory !== "all" && uc.category !== filterCategory) return false
    if (filterTag !== "all" && !uc.tags?.some((t) => t.id === filterTag)) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6" />
          Galerie
        </h1>
        <p className="text-sm text-muted-foreground">
          Découvrez les outils et automatisations créés par l&apos;équipe
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un projet..."
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="IMPACT">IMPACT</SelectItem>
            <SelectItem value="LAB">LAB</SelectItem>
            <SelectItem value="PRODUCT">PRODUCT</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les tags</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{filtered.length} projets</Badge>
      </div>

      {/* Gallery Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((uc) => (
          <Link key={uc.id} href={`/gallery/${uc.id}`}>
            <Card className="h-full overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group">
              {/* Cover image placeholder */}
              <div className="relative h-40 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                {uc.cover_image_url ? (
                  <Image
                    src={uc.cover_image_url}
                    alt={uc.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/80 text-2xl font-bold text-muted-foreground">
                    {uc.title.charAt(0)}
                  </div>
                )}
                <Badge
                  className={`absolute top-2 right-2 text-xs ${categoryColors[uc.category]}`}
                >
                  {uc.category}
                </Badge>
              </div>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                  {uc.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {uc.short_description || uc.description}
                </p>
                {uc.tags && uc.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {uc.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
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
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {uc.owner?.full_name}
                  </div>
                  {uc.interest_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {uc.interest_count}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">Aucun projet publié dans la galerie</p>
        </div>
      )}
    </div>
  )
}
