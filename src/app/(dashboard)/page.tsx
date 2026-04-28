"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  KanbanSquare,
  CalendarRange,
  BarChart3,
  Store,
  Heart,
  Sparkles,
  Briefcase,
  ArrowRight,
  Mail,
  MailOpen,
  Archive,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import type { Sprint, UseCase, InterestRequest } from "@/types/database"

const interestIcons: Record<string, React.ElementType> = {
  interested: Heart,
  want_to_use: Sparkles,
  propose_to_client: Briefcase,
}

const interestLabels: Record<string, string> = {
  interested: "Intéressé",
  want_to_use: "Souhaite utiliser",
  propose_to_client: "Proposer à un client",
}

export default function DashboardPage() {
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    done: 0,
    published: 0,
  })
  const [recentInterests, setRecentInterests] = useState<InterestRequest[]>([])
  const [sprintUseCases, setSprintUseCases] = useState<UseCase[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [sprintRes, ucRes, interestsRes] = await Promise.all([
      supabase
        .from("ia_lab_sprints")
        .select("*")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("ia_lab_use_cases").select("id, status, is_published"),
      supabase
        .from("ia_lab_interest_requests")
        .select("*, requester:profiles!ia_lab_interest_requests_requester_id_fkey(*), use_case:ia_lab_use_cases(title)")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(10),
    ])

    if (sprintRes.data) {
      setActiveSprint(sprintRes.data)
      // Fetch use cases for active sprint
      const { data: sprintUc } = await supabase
        .from("ia_lab_use_cases")
        .select("*, owner:profiles!ia_lab_use_cases_owner_id_fkey(*)")
        .eq("sprint_id", sprintRes.data.id)
        .order("created_at")
      if (sprintUc) setSprintUseCases(sprintUc as UseCase[])
    }

    if (ucRes.data) {
      setStats({
        total: ucRes.data.length,
        inProgress: ucRes.data.filter((uc) => uc.status === "in_progress").length,
        done: ucRes.data.filter((uc) => uc.status === "done").length,
        published: ucRes.data.filter((uc) => uc.is_published).length,
      })
    }

    if (interestsRes.data) {
      setRecentInterests(interestsRes.data as InterestRequest[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("ia_lab_interest_requests")
      .update({ is_read: !currentRead })
      .eq("id", id)
    if (error) toast.error("Erreur")
    else {
      setRecentInterests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_read: !currentRead } : r))
      )
    }
  }

  const handleArchive = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("ia_lab_interest_requests")
      .update({ is_archived: true })
      .eq("id", id)
    if (error) toast.error("Erreur")
    else {
      setRecentInterests((prev) => prev.filter((r) => r.id !== id))
      toast.success("Notification archivée")
    }
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("ia_lab_interest_requests")
      .delete()
      .eq("id", id)
    if (error) toast.error("Erreur lors de la suppression")
    else {
      setRecentInterests((prev) => prev.filter((r) => r.id !== id))
      toast.success("Notification supprimée")
    }
  }

  const statusLabels: Record<string, string> = {
    backlog: "Backlog",
    todo: "À faire",
    in_progress: "En cours",
    done: "Terminé",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble de vos projets
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/backlog">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <KanbanSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total use cases</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En cours</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Terminés</p>
              <p className="text-2xl font-bold">{stats.done}</p>
            </div>
          </CardContent>
        </Card>
        <Link href="/gallery">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Publiés</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Sprint */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {activeSprint ? `Sprint actif : ${activeSprint.name}` : "Aucun sprint actif"}
            </CardTitle>
            {activeSprint && (
              <Link
                href={`/sprints/${activeSprint.id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Voir <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {sprintUseCases.length > 0 ? (
              <div className="space-y-2">
                {sprintUseCases.slice(0, 6).map((uc) => (
                  <Link
                    key={uc.id}
                    href={`/backlog/${uc.id}`}
                    className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-accent transition-colors"
                  >
                    <span className="text-sm truncate">{uc.title}</span>
                    <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                      {statusLabels[uc.status]}
                    </Badge>
                  </Link>
                ))}
                {sprintUseCases.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    +{sprintUseCases.length - 6} autres
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                {activeSprint
                  ? "Aucun use case dans ce sprint"
                  : "Créez un sprint et passez-le en actif"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent interest requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Dernières demandes d&apos;intérêt</CardTitle>
            <Link
              href="/gallery"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Galerie <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentInterests.length > 0 ? (
              <div className="space-y-1">
                {recentInterests.map((req) => {
                  const Icon = interestIcons[req.type] || Heart
                  return (
                    <div
                      key={req.id}
                      className={`group flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                        req.is_read ? "opacity-60" : "bg-accent/40"
                      }`}
                    >
                      <div className="relative mt-0.5">
                        {!req.is_read && (
                          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary" />
                        )}
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px]">
                            {req.requester?.full_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{req.requester?.full_name}</span>
                          <span className="text-muted-foreground">
                            {" "}— {interestLabels[req.type]}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {(req.use_case as unknown as { title: string })?.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleToggleRead(req.id, req.is_read)}
                          title={req.is_read ? "Marquer comme non lu" : "Marquer comme lu"}
                        >
                          {req.is_read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleArchive(req.id)}
                          title="Archiver"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(req.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucune demande d&apos;intérêt récente
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
