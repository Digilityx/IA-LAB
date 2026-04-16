"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import type {
  Profile,
  UcMission,
  UcDeal,
  UcCategoryHistoryEntry,
  UseCaseCategory,
} from "@/types/database"

interface Props {
  useCaseId: string
}

const categoryColors: Record<UseCaseCategory, string> = {
  IMPACT: "bg-red-100 text-red-800",
  LAB: "bg-slate-100 text-slate-700",
  PRODUCT: "bg-orange-100 text-orange-800",
}

function formatEUR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n)
}

function missionGain(m: UcMission): number {
  if (m.mission_amount != null) return m.mission_amount
  const days = m.days_saved ?? 0
  const tjm = m.tjm_snapshot ?? 0
  return days * tjm
}

export function UseCaseGainsPanel({ useCaseId }: Props) {
  const [loading, setLoading] = useState(true)
  const [missions, setMissions] = useState<UcMission[]>([])
  const [deals, setDeals] = useState<UcDeal[]>([])
  const [history, setHistory] = useState<UcCategoryHistoryEntry[]>([])
  const [consultants, setConsultants] = useState<Profile[]>([])

  const fetchAll = useCallback(async () => {
    const supabase = createClient()
    const [mRes, dRes, hRes, cRes] = await Promise.all([
      supabase
        .from("uc_missions")
        .select("*, consultant:profiles(*)")
        .eq("use_case_id", useCaseId)
        .order("created_at"),
      supabase
        .from("uc_deals")
        .select("*")
        .eq("use_case_id", useCaseId)
        .order("created_at"),
      supabase
        .from("uc_category_history")
        .select("*, changed_by_profile:profiles!uc_category_history_changed_by_fkey(*)")
        .eq("use_case_id", useCaseId)
        .order("changed_at"),
      supabase
        .from("profiles")
        .select("*")
        .not("tjm", "is", null)
        .order("full_name"),
    ])
    if (mRes.data) setMissions(mRes.data as UcMission[])
    if (dRes.data) setDeals(dRes.data as UcDeal[])
    if (hRes.data) setHistory(hRes.data as UcCategoryHistoryEntry[])
    if (cRes.data) setConsultants(cRes.data as Profile[])
    setLoading(false)
  }, [useCaseId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // --- Missions (IMPACT + LAB) ---

  const addMission = async (category: "IMPACT" | "LAB") => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("uc_missions")
      .insert({ use_case_id: useCaseId, category })
      .select("*, consultant:profiles(*)")
      .single()
    if (error) {
      toast.error("Erreur lors de l'ajout")
      return
    }
    setMissions((prev) => [...prev, data as UcMission])
  }

  const updateMission = async (id: string, patch: Partial<UcMission>) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
    const supabase = createClient()
    const { error } = await supabase
      .from("uc_missions")
      .update(patch)
      .eq("id", id)
    if (error) toast.error("Erreur de sauvegarde")
  }

  const setMissionConsultant = async (id: string, consultantId: string) => {
    const consultant = consultants.find((c) => c.id === consultantId)
    if (!consultant) return
    await updateMission(id, {
      consultant_id: consultantId,
      tjm_snapshot: consultant.tjm ?? null,
    })
    // Refresh to pull joined consultant
    const supabase = createClient()
    const { data } = await supabase
      .from("uc_missions")
      .select("*, consultant:profiles(*)")
      .eq("id", id)
      .single()
    if (data) {
      setMissions((prev) =>
        prev.map((m) => (m.id === id ? (data as UcMission) : m))
      )
    }
  }

  const deleteMission = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("uc_missions").delete().eq("id", id)
    if (error) {
      toast.error("Erreur lors de la suppression")
      return
    }
    setMissions((prev) => prev.filter((m) => m.id !== id))
  }

  // --- Deals (PRODUCT) ---

  const addDeal = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("uc_deals")
      .insert({ use_case_id: useCaseId, client: "", amount: 0 })
      .select("*")
      .single()
    if (error) {
      toast.error("Erreur lors de l'ajout")
      return
    }
    setDeals((prev) => [...prev, data as UcDeal])
  }

  const updateDeal = async (id: string, patch: Partial<UcDeal>) => {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    const supabase = createClient()
    const { error } = await supabase.from("uc_deals").update(patch).eq("id", id)
    if (error) toast.error("Erreur de sauvegarde")
  }

  const deleteDeal = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("uc_deals").delete().eq("id", id)
    if (error) {
      toast.error("Erreur lors de la suppression")
      return
    }
    setDeals((prev) => prev.filter((d) => d.id !== id))
  }

  // --- Totals ---

  const impactMissions = useMemo(
    () => missions.filter((m) => m.category === "IMPACT"),
    [missions]
  )
  const labMissions = useMemo(
    () => missions.filter((m) => m.category === "LAB"),
    [missions]
  )

  const impactTotal = impactMissions.reduce((s, m) => s + missionGain(m), 0)
  const labTotal = labMissions.reduce((s, m) => s + missionGain(m), 0)
  const labRealise = labMissions.reduce(
    (s, m) => s + (m.mission_amount ?? 0),
    0
  )
  const labEconomise = labMissions.reduce(
    (s, m) =>
      s +
      (m.mission_amount == null
        ? (m.days_saved ?? 0) * (m.tjm_snapshot ?? 0)
        : 0),
    0
  )
  const productTotal = deals.reduce((s, d) => s + (d.amount ?? 0), 0)

  const totalEconomise = impactTotal + labEconomise
  const totalRealise = labRealise + productTotal

  if (loading) {
    return (
      <div className="py-6 text-sm text-muted-foreground text-center">
        Chargement des métriques…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Timeline */}
      {history.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Historique de catégorie
          </Label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {history.map((h, i) => (
              <div key={h.id} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                <div className="flex items-center gap-1.5">
                  <Badge className={categoryColors[h.new_category]}>
                    {h.new_category}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(h.changed_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* IMPACT */}
      <MissionSection
        title="IMPACT"
        subtitle="Jours économisés × TJM consultant"
        category="IMPACT"
        missions={impactMissions}
        consultants={consultants}
        total={impactTotal}
        onAdd={() => addMission("IMPACT")}
        onUpdate={updateMission}
        onSetConsultant={setMissionConsultant}
        onDelete={deleteMission}
        showMissionAmount={false}
      />

      <Separator />

      {/* LAB */}
      <MissionSection
        title="LAB"
        subtitle="Jours économisés × TJM consultant ou montant mission"
        category="LAB"
        missions={labMissions}
        consultants={consultants}
        total={labTotal}
        onAdd={() => addMission("LAB")}
        onUpdate={updateMission}
        onSetConsultant={setMissionConsultant}
        onDelete={deleteMission}
        showMissionAmount={true}
      />

      <Separator />

      {/* PRODUCT */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className={categoryColors.PRODUCT}>PRODUCT</Badge>
              <span className="text-sm font-medium">Devis signés</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Montant du devis par client
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {formatEUR(productTotal)}
          </span>
        </div>

        {deals.length > 0 ? (
          <div className="space-y-2">
            {deals.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-md border p-2"
              >
                <Input
                  placeholder="Client"
                  defaultValue={d.client ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (d.client ?? "") &&
                    updateDeal(d.id, { client: e.target.value })
                  }
                  className="h-8 text-sm flex-1"
                />
                <Input
                  type="number"
                  placeholder="Montant"
                  defaultValue={d.amount ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : 0
                    if (v !== d.amount) updateDeal(d.id, { amount: v })
                  }}
                  className="h-8 text-sm w-32 text-right"
                />
                <span className="text-xs text-muted-foreground shrink-0">€</span>
                <Input
                  type="date"
                  defaultValue={d.quote_date ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (d.quote_date ?? "") &&
                    updateDeal(d.id, { quote_date: e.target.value || null })
                  }
                  className="h-8 text-sm w-36"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteDeal(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Aucun devis signé
          </p>
        )}

        <Button variant="outline" size="sm" onClick={addDeal}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter un devis
        </Button>
      </div>

      <Separator />

      {/* Totals */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total gain économisé</span>
          <span className="text-base font-semibold tabular-nums text-emerald-700">
            {formatEUR(totalEconomise)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total gain réalisé</span>
          <span className="text-base font-semibold tabular-nums text-emerald-700">
            {formatEUR(totalRealise)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface MissionSectionProps {
  title: string
  subtitle: string
  category: "IMPACT" | "LAB"
  missions: UcMission[]
  consultants: Profile[]
  total: number
  showMissionAmount: boolean
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<UcMission>) => void
  onSetConsultant: (id: string, consultantId: string) => void
  onDelete: (id: string) => void
}

function MissionSection({
  title,
  subtitle,
  category,
  missions,
  consultants,
  total,
  showMissionAmount,
  onAdd,
  onUpdate,
  onSetConsultant,
  onDelete,
}: MissionSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge className={categoryColors[category]}>{title}</Badge>
            <span className="text-sm font-medium">Missions</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {formatEUR(total)}
        </span>
      </div>

      {missions.length > 0 ? (
        <div className="space-y-2">
          {missions.map((m) => (
            <div
              key={m.id}
              className="rounded-md border p-2 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Select
                  value={m.consultant_id ?? ""}
                  onValueChange={(v) => onSetConsultant(m.id, v)}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Consultant" />
                  </SelectTrigger>
                  <SelectContent>
                    {consultants.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} — {formatEUR(c.tjm ?? 0)}/j
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Mission / client"
                  defaultValue={m.mission_client ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (m.mission_client ?? "") &&
                    onUpdate(m.id, { mission_client: e.target.value })
                  }
                  className="h-8 text-sm flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onDelete(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="Jours"
                    defaultValue={m.days_saved ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : null
                      if (v !== m.days_saved) onUpdate(m.id, { days_saved: v })
                    }}
                    className="h-8 w-20 text-right"
                  />
                  <span className="text-muted-foreground">j</span>
                </div>
                <span className="text-muted-foreground">×</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="TJM"
                    defaultValue={m.tjm_snapshot ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : null
                      if (v !== m.tjm_snapshot) onUpdate(m.id, { tjm_snapshot: v })
                    }}
                    className="h-8 w-24 text-right"
                  />
                  <span className="text-muted-foreground">€/j</span>
                </div>
                {showMissionAmount && (
                  <>
                    <span className="text-muted-foreground">ou</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        placeholder="Montant mission"
                        defaultValue={m.mission_amount ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value
                            ? parseFloat(e.target.value)
                            : null
                          if (v !== m.mission_amount)
                            onUpdate(m.id, { mission_amount: v })
                        }}
                        className="h-8 w-32 text-right"
                      />
                      <span className="text-muted-foreground">€</span>
                    </div>
                  </>
                )}
                <span className="ml-auto font-semibold tabular-nums">
                  = {formatEUR(missionGain(m))}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Aucune mission</p>
      )}

      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Ajouter une mission
      </Button>
    </div>
  )
}
