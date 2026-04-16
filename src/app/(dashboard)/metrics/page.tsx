"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Clock, TrendingUp, DollarSign, PiggyBank } from "lucide-react"
import type {
  Sprint,
  UcMission,
  UcDeal,
  UseCaseCategory,
} from "@/types/database"

interface MetricsRow {
  useCaseId: string
  useCaseTitle: string
  category: UseCaseCategory
  estimatedDays: number
  daysSaved: number // IMPACT + LAB (sans mission_amount)
  gainEconomise: number // IMPACT + LAB (days × tjm) où mission_amount null
  gainRealise: number // LAB mission_amount + PRODUCT amount
}

const categoryColors: Record<UseCaseCategory, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

const formatEuros = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n)

function missionEconomise(m: UcMission): number {
  if (m.mission_amount != null) return 0
  return (m.days_saved ?? 0) * (m.tjm_snapshot ?? 0)
}

function missionRealise(m: UcMission): number {
  return m.mission_amount ?? 0
}

const FIRST_YEAR = 2025

function sprintYear(s: Sprint): number {
  return new Date(s.start_date).getFullYear()
}

export default function MetricsPage() {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number>(
    Math.max(FIRST_YEAR, currentYear)
  )
  const [selectedSprintId, setSelectedSprintId] = useState<string>("all")
  const [rows, setRows] = useState<MetricsRow[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch sprints once
  useEffect(() => {
    const fetchInitial = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("sprints")
        .select("*")
        .order("start_date", { ascending: false })
      if (data) {
        setSprints(data as Sprint[])
        const active = data.find((s: Sprint) => s.status === "active")
        if (active) {
          setSelectedSprintId(active.id)
          setSelectedYear(sprintYear(active))
        }
      }
    }
    fetchInitial()
  }, [])

  // Available years: from FIRST_YEAR to max(currentYear, any sprint year)
  const maxSprintYear = sprints.reduce(
    (m, s) => Math.max(m, sprintYear(s)),
    currentYear
  )
  const availableYears: number[] = []
  for (let y = maxSprintYear; y >= FIRST_YEAR; y--) availableYears.push(y)

  const sprintsInYear = sprints.filter((s) => sprintYear(s) === selectedYear)

  // If selected sprint no longer belongs to selected year, reset to "all"
  useEffect(() => {
    if (selectedSprintId !== "all") {
      const s = sprints.find((sp) => sp.id === selectedSprintId)
      if (s && sprintYear(s) !== selectedYear) {
        setSelectedSprintId("all")
      }
    }
  }, [selectedYear, selectedSprintId, sprints])

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    // 1. Fetch sprint_use_cases (to filter UCs by sprint/year and get IA team days)
    let sucQuery = supabase
      .from("sprint_use_cases")
      .select(
        "use_case_id, use_case:use_cases(id, title, category), assignments:sprint_use_case_assignments(estimated_days)"
      )
    if (selectedSprintId !== "all") {
      sucQuery = sucQuery.eq("sprint_id", selectedSprintId)
    } else {
      // Filter by year via sprint_ids
      const yearSprintIds = sprintsInYear.map((s) => s.id)
      if (yearSprintIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
      sucQuery = sucQuery.in("sprint_id", yearSprintIds)
    }
    const { data: sucData } = await sucQuery

    if (!sucData || sucData.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const titleMap = new Map<string, string>()
    const categoryMap = new Map<string, UseCaseCategory>()
    const daysMap = new Map<string, number>()

    for (const suc of sucData as unknown as Array<{
      use_case_id: string
      use_case: { id: string; title: string; category: UseCaseCategory } | null
      assignments: { estimated_days: number | null }[] | null
    }>) {
      const ucId = suc.use_case_id
      if (suc.use_case) {
        titleMap.set(ucId, suc.use_case.title)
        categoryMap.set(ucId, suc.use_case.category)
      }
      const sucDays = (suc.assignments || []).reduce(
        (s, a) => s + (a.estimated_days || 0),
        0
      )
      daysMap.set(ucId, (daysMap.get(ucId) || 0) + sucDays)
    }

    const ucIds = [...daysMap.keys()]

    // 2. Fetch missions and deals for these UCs
    const [missionsRes, dealsRes] = await Promise.all([
      supabase.from("uc_missions").select("*").in("use_case_id", ucIds),
      supabase.from("uc_deals").select("*").in("use_case_id", ucIds),
    ])

    const missionsByUc = new Map<string, UcMission[]>()
    for (const m of (missionsRes.data || []) as UcMission[]) {
      const arr = missionsByUc.get(m.use_case_id) || []
      arr.push(m)
      missionsByUc.set(m.use_case_id, arr)
    }
    const dealsByUc = new Map<string, UcDeal[]>()
    for (const d of (dealsRes.data || []) as UcDeal[]) {
      const arr = dealsByUc.get(d.use_case_id) || []
      arr.push(d)
      dealsByUc.set(d.use_case_id, arr)
    }

    const metricsRows: MetricsRow[] = []
    for (const ucId of ucIds) {
      const missions = missionsByUc.get(ucId) || []
      const deals = dealsByUc.get(ucId) || []
      const daysSaved = missions.reduce(
        (s, m) => s + (m.mission_amount == null ? m.days_saved ?? 0 : 0),
        0
      )
      const gainEconomise = missions.reduce((s, m) => s + missionEconomise(m), 0)
      const gainRealise =
        missions.reduce((s, m) => s + missionRealise(m), 0) +
        deals.reduce((s, d) => s + (d.amount ?? 0), 0)

      metricsRows.push({
        useCaseId: ucId,
        useCaseTitle: titleMap.get(ucId) || "—",
        category: categoryMap.get(ucId) || "IMPACT",
        estimatedDays: daysMap.get(ucId) || 0,
        daysSaved,
        gainEconomise,
        gainRealise,
      })
    }

    metricsRows.sort((a, b) =>
      b.gainEconomise + b.gainRealise - (a.gainEconomise + a.gainRealise)
    )

    setRows(metricsRows)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId, selectedYear, sprints])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const totalDaysIA = rows.reduce((s, r) => s + r.estimatedDays, 0)
  const totalDaysSaved = rows.reduce((s, r) => s + r.daysSaved, 0)
  const totalEconomise = rows.reduce((s, r) => s + r.gainEconomise, 0)
  const totalRealise = rows.reduce((s, r) => s + r.gainRealise, 0)

  // Breakdown per category
  const byCategory: Record<
    UseCaseCategory,
    { count: number; economise: number; realise: number }
  > = {
    IMPACT: { count: 0, economise: 0, realise: 0 },
    LAB: { count: 0, economise: 0, realise: 0 },
    PRODUCT: { count: 0, economise: 0, realise: 0 },
  }
  for (const r of rows) {
    byCategory[r.category].count += 1
    byCategory[r.category].economise += r.gainEconomise
    byCategory[r.category].realise += r.gainRealise
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Métriques</h1>
          <p className="text-sm text-muted-foreground">
            Gains économisés et réalisés par catégorie
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Année" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les sprints</SelectItem>
              {sprintsInYear.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Jours IA Team
                </p>
                <p className="text-2xl font-bold">{totalDaysIA.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jours économisés</p>
                <p className="text-2xl font-bold">{totalDaysSaved.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <PiggyBank className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gain économisé</p>
                <p className="text-2xl font-bold">{formatEuros(totalEconomise)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gain réalisé</p>
                <p className="text-2xl font-bold">{formatEuros(totalRealise)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-category breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(byCategory) as UseCaseCategory[]).map((cat) => {
          const b = byCategory[cat]
          return (
            <Card key={cat}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge className={categoryColors[cat]}>{cat}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {b.count} use case{b.count > 1 ? "s" : ""}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Économisé</span>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    {formatEuros(b.economise)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Réalisé</span>
                  <span className="font-semibold tabular-nums text-emerald-700">
                    {formatEuros(b.realise)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail par use case</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Chargement...
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun use case dans ce sprint
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">Use case</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Jours IA Team</TableHead>
                    <TableHead className="text-right">Jours économisés</TableHead>
                    <TableHead className="text-right">Gain économisé</TableHead>
                    <TableHead className="text-right">Gain réalisé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.useCaseId}>
                      <TableCell className="font-medium">
                        {row.useCaseTitle}
                      </TableCell>
                      <TableCell>
                        <Badge className={categoryColors[row.category]}>
                          {row.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.estimatedDays > 0
                          ? `${row.estimatedDays.toFixed(1)} j`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.daysSaved > 0
                          ? `${row.daysSaved.toFixed(1)} j`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.gainEconomise > 0 ? (
                          <span className="text-emerald-700 font-medium">
                            {formatEuros(row.gainEconomise)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.gainRealise > 0 ? (
                          <span className="text-emerald-700 font-medium">
                            {formatEuros(row.gainRealise)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-bold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {totalDaysIA.toFixed(1)} j
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {totalDaysSaved.toFixed(1)} j
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-emerald-700">
                      {formatEuros(totalEconomise)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-emerald-700">
                      {formatEuros(totalRealise)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
