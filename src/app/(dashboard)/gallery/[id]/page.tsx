"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InterestDialog } from "@/components/gallery/interest-dialog"
import {
  ArrowLeft,
  Clock,
  DollarSign,
  TrendingUp,
  Heart,
  Sparkles,
  Briefcase,
  ExternalLink,
  Wrench,
  Target,
} from "lucide-react"
import type { UseCase, UseCaseMetrics, InterestRequest } from "@/types/database"

const categoryColors: Record<string, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

const interestTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  interested: { label: "Intéressé", icon: Heart, color: "text-pink-600" },
  want_to_use: { label: "Souhaite utiliser", icon: Sparkles, color: "text-blue-600" },
  propose_to_client: { label: "Proposer à un client", icon: Briefcase, color: "text-green-600" },
}

export default function GalleryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [metrics, setMetrics] = useState<UseCaseMetrics | null>(null)
  const [interests, setInterests] = useState<InterestRequest[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const [ucRes, metricsRes, interestsRes] = await Promise.all([
      supabase
        .from("ia_lab_use_cases")
        .select("*, owner:profiles!ia_lab_use_cases_owner_id_fkey(*), tags:ia_lab_use_case_tags(tag:ia_lab_tags(*))")
        .eq("id", id)
        .single(),
      supabase.from("ia_lab_use_case_metrics").select("*").eq("use_case_id", id).maybeSingle(),
      supabase
        .from("ia_lab_interest_requests")
        .select("*, requester:profiles!ia_lab_interest_requests_requester_id_fkey(*)")
        .eq("use_case_id", id)
        .order("created_at", { ascending: false }),
    ])

    if (ucRes.data) {
      const uc = {
        ...ucRes.data,
        tags: ucRes.data.tags?.map((t: { tag: unknown }) => t.tag).filter(Boolean) || [],
      } as UseCase
      setUseCase(uc)
      setIsOwner(user?.id === uc.owner_id)
    }
    if (metricsRes.data) setMetrics(metricsRes.data)
    if (interestsRes.data) setInterests(interestsRes.data as InterestRequest[])
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatEuros = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!useCase) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Projet introuvable</p>
      </div>
    )
  }

  const ownerInitials = useCase.owner?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"

  return (
    <div className="max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/gallery")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour à la galerie
      </Button>

      {/* Cover */}
      <div className="relative h-48 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden">
        {useCase.cover_image_url ? (
          <Image
            src={useCase.cover_image_url}
            alt={useCase.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-background/80 text-4xl font-bold text-muted-foreground">
            {useCase.title.charAt(0)}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{useCase.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={categoryColors[useCase.category]}>
              {useCase.category}
            </Badge>
            {useCase.tags?.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: tag.color + "20",
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">{ownerInitials}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              {useCase.owner?.full_name}
            </span>
          </div>
        </div>
        <div className="w-56 flex-shrink-0">
          <InterestDialog useCaseId={id} onSubmitted={fetchData} />
        </div>
      </div>

      {/* Metrics summary */}
      {metrics && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {metrics.margin_generated != null && (
            <Card>
              <CardContent className="flex items-center gap-2 pt-4 pb-4">
                <DollarSign className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Marge</p>
                  <p className="text-sm font-semibold">{formatEuros(metrics.margin_generated)}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {metrics.man_days_saved != null && (
            <Card>
              <CardContent className="flex items-center gap-2 pt-4 pb-4">
                <Clock className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">JH économisés</p>
                  <p className="text-sm font-semibold">{metrics.man_days_saved}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {metrics.mrr != null && (
            <Card>
              <CardContent className="flex items-center gap-2 pt-4 pb-4">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">MRR</p>
                  <p className="text-sm font-semibold">{formatEuros(metrics.mrr)}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {metrics.additional_business != null && (
            <Card>
              <CardContent className="flex items-center gap-2 pt-4 pb-4">
                <DollarSign className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Business add.</p>
                  <p className="text-sm font-semibold">{formatEuros(metrics.additional_business)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {useCase.short_description || useCase.description || "Aucune description"}
          </p>
        </CardContent>
      </Card>

      {/* Informations complementaires (read-only) */}
      {(useCase.deliverable_type || useCase.usage_type || useCase.tools || useCase.target_users || useCase.benchmark_url || useCase.journey_url) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informations complementaires</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {useCase.deliverable_type && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Type de livrable</p>
                  <Badge variant="secondary">{useCase.deliverable_type}</Badge>
                </div>
              )}
              {useCase.usage_type && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Type d&apos;utilisation</p>
                  <Badge variant="secondary">{useCase.usage_type}</Badge>
                </div>
              )}
              {useCase.tools && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    Outils
                  </div>
                  <p className="text-sm">{useCase.tools}</p>
                </div>
              )}
              {useCase.target_users && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Target className="h-3 w-3" />
                    Utilisateurs cibles
                  </div>
                  <p className="text-sm">{useCase.target_users}</p>
                </div>
              )}
              {useCase.benchmark_url && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Benchmark</p>
                  <a
                    href={useCase.benchmark_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Voir le benchmark
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {useCase.journey_url && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Parcours</p>
                  <a
                    href={useCase.journey_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Voir le parcours
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documentation */}
      {useCase.documentation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{useCase.documentation}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interest requests (visible to owner) */}
      {isOwner && interests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Demandes d&apos;intérêt ({interests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {interests.map((req) => {
                const config = interestTypeConfig[req.type]
                const Icon = config.icon
                return (
                  <div
                    key={req.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {req.requester?.full_name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {config.label}
                        </Badge>
                      </div>
                      {req.message && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {req.message}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
