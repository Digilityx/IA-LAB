"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  useDisplayPrefs,
  type DisplayPrefs,
} from "@/hooks/use-display-prefs"
import {
  Save,
  Plus,
  X,
  Pencil,
  Check,
  Trash2,
  User,
  Tag,
  Users,
  Settings,
  Eye,
} from "lucide-react"
import type { Tag as TagType } from "@/types/database"
import {
  getProfile,
  listAllProfiles,
  getEffectiveTjm,
} from "@/lib/stafftool/profiles"
import type { StafftoolProfile } from "@/lib/stafftool/types"
import { isIaLabAdmin } from "@/lib/ia-lab-roles"
import type { IaLabRole } from "@/lib/ia-lab-roles"

const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
]

const roleLabels: Record<string, string> = {
  admin: "Admin",
  member: "Membre",
  viewer: "Lecteur",
}

const statusConfig = [
  { value: "backlog", label: "Backlog", color: "bg-gray-500" },
  { value: "todo", label: "À faire", color: "bg-slate-500" },
  { value: "in_progress", label: "En cours", color: "bg-amber-500" },
  { value: "done", label: "Terminé", color: "bg-emerald-500" },
  { value: "abandoned", label: "Abandonné", color: "bg-red-500" },
]

const categoryConfig = [
  { value: "IMPACT", label: "IMPACT", color: "bg-red-500" },
  { value: "LAB", label: "LAB", color: "bg-slate-500" },
  { value: "PRODUCT", label: "PRODUCT", color: "bg-orange-500" },
]

export default function SettingsPage() {
  // Profile state
  const [profile, setProfile] = useState<StafftoolProfile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Tags state
  const [tags, setTags] = useState<TagType[]>([])
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState("")
  const [editingTagColor, setEditingTagColor] = useState("")

  // Users state
  const [allProfiles, setAllProfiles] = useState<StafftoolProfile[]>([])
  const [iaLabRoles, setIaLabRoles] = useState<Map<string, IaLabRole>>(new Map())

  // Display preferences
  const [displayPrefs, setDisplayPrefs] = useDisplayPrefs()

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [profileData, tagsRes, allProfilesData, rolesRes] = await Promise.all([
      getProfile(user.id),
      supabase.from("ia_lab_tags").select("*").order("name"),
      listAllProfiles(),
      supabase.from("ia_lab_user_roles").select("user_id, role"),
    ])

    if (profileData) {
      setProfile(profileData)
      isIaLabAdmin().then(setIsAdmin)
    }
    if (tagsRes.data) setTags(tagsRes.data)
    setAllProfiles(allProfilesData)
    if (rolesRes.data) {
      const roleMap = new Map<string, IaLabRole>(
        rolesRes.data.map((r) => [r.user_id, r.role as IaLabRole])
      )
      setIaLabRoles(roleMap)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Tag handlers ----
  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    const supabase = createClient()
    await supabase.from("ia_lab_tags").insert({
      name: newTagName.trim(),
      color: newTagColor,
    })
    setNewTagName("")
    fetchData()
  }

  const handleDeleteTag = async (tagId: string) => {
    const supabase = createClient()
    // Delete from use_case_tags first (junction table)
    await supabase.from("ia_lab_use_case_tags").delete().eq("tag_id", tagId)
    await supabase.from("ia_lab_tags").delete().eq("id", tagId)
    fetchData()
  }

  const handleStartEditTag = (tag: TagType) => {
    setEditingTagId(tag.id)
    setEditingTagName(tag.name)
    setEditingTagColor(tag.color)
  }

  const handleSaveEditTag = async () => {
    if (!editingTagId || !editingTagName.trim()) return
    const supabase = createClient()
    await supabase
      .from("ia_lab_tags")
      .update({ name: editingTagName.trim(), color: editingTagColor })
      .eq("id", editingTagId)
    setEditingTagId(null)
    fetchData()
  }

  // ---- User handlers ----
  const handleIaLabRoleChange = async (userId: string, newRole: 'admin' | 'member' | 'viewer') => {
    const supabase = createClient()
    if (newRole === 'viewer') {
      const { error } = await supabase
        .from('ia_lab_user_roles')
        .delete()
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('ia_lab_user_roles')
        .upsert({ user_id: userId, role: newRole })
      if (error) throw error
    }
    fetchData()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Gérez votre profil et les paramètres de l&apos;application
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-1.5 h-4 w-4" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="mr-1.5 h-4 w-4" />
            Tags
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users">
              <Users className="mr-1.5 h-4 w-4" />
              Utilisateurs
            </TabsTrigger>
          )}
          <TabsTrigger value="display">
            <Eye className="mr-1.5 h-4 w-4" />
            Affichage
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="mr-1.5 h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* ====== Tab: Profile ====== */}
        <TabsContent value="profile" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input
                  value={profile?.full_name || ""}
                  disabled
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={profile?.email || ""}
                  disabled
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Équipe</Label>
                <Input
                  value={profile?.team || ""}
                  disabled
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>TJM (année en cours)</Label>
                <Input
                  value={profile ? (getEffectiveTjm(profile) ?? "—") : ""}
                  disabled
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <div>
                  <Badge variant="outline">{profile?.role}</Badge>
                </div>
              </div>
              <div className="flex justify-end">
                <a
                  href="https://digi.stafftool.fr/profile"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline"
                >
                  Modifier mon profil dans Stafftool ↗
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab: Tags ====== */}
        <TabsContent value="tags" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gestion des tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new tag */}
              <div className="flex gap-2 items-center">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Nouveau tag..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                />
                <div className="flex items-center gap-1">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`h-6 w-6 rounded-full transition-transform ${
                        newTagColor === color
                          ? "ring-2 ring-offset-2 ring-primary scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button onClick={handleAddTag} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <Separator />

              {/* Tags table */}
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun tag créé
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Couleur</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead className="w-24 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tags.map((tag) => (
                      <TableRow key={tag.id}>
                        <TableCell>
                          {editingTagId === tag.id ? (
                            <div className="flex gap-0.5">
                              {TAG_COLORS.map((color) => (
                                <button
                                  key={color}
                                  onClick={() => setEditingTagColor(color)}
                                  className={`h-5 w-5 rounded-full transition-transform ${
                                    editingTagColor === color
                                      ? "ring-2 ring-offset-1 ring-primary scale-110"
                                      : ""
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div
                              className="h-5 w-5 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {editingTagId === tag.id ? (
                            <Input
                              value={editingTagName}
                              onChange={(e) =>
                                setEditingTagName(e.target.value)
                              }
                              className="h-8 text-sm"
                              onKeyDown={(e) =>
                                e.key === "Enter" && handleSaveEditTag()
                              }
                              autoFocus
                            />
                          ) : (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: tag.color + "20",
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingTagId === tag.id ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingTagId(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSaveEditTag}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEditTag(tag)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Supprimer le tag &ldquo;{tag.name}&rdquo; ?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Ce tag sera retiré de tous les use cases
                                      auxquels il est associé. Cette action est
                                      irréversible.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Annuler
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteTag(tag.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Supprimer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab: Users (admin only) ====== */}
        {isAdmin && (
          <TabsContent value="users" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Gestion des utilisateurs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Users table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Équipe</TableHead>
                      <TableHead className="w-24">TJM (€/j)</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="w-16 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allProfiles.map((p) => {
                      const initials =
                        p.full_name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) || "?"

                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {p.full_name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.email}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {p.team || <span className="italic">—</span>}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {getEffectiveTjm(p) ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={iaLabRoles.get(p.id) ?? 'viewer'}
                              onValueChange={(v) =>
                                handleIaLabRoleChange(p.id, v as 'admin' | 'member' | 'viewer')
                              }
                              disabled={p.id === profile?.id}
                            >
                              <SelectTrigger className="h-8 w-28 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  Admin
                                </SelectItem>
                                <SelectItem value="member">
                                  Membre
                                </SelectItem>
                                <SelectItem value="viewer">
                                  Lecteur
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right" />
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ====== Tab: Display ====== */}
        <TabsContent value="display" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carte Kanban</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Choisissez les informations affichées sur chaque carte dans la
                vue Kanban du backlog.
              </p>
              <div className="space-y-3">
                {(
                  [
                    { key: "category", label: "Catégorie" },
                    { key: "tags", label: "Tags" },
                    { key: "owner", label: "Responsable" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={`kanban-${key}`}
                      checked={displayPrefs.kanban[key]}
                      onCheckedChange={(checked) =>
                        setDisplayPrefs({
                          ...displayPrefs,
                          kanban: {
                            ...displayPrefs.kanban,
                            [key]: !!checked,
                          },
                        })
                      }
                    />
                    <Label
                      htmlFor={`kanban-${key}`}
                      className="text-sm cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vue Liste</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Choisissez les colonnes affichées dans la vue Liste du backlog.
              </p>
              <div className="space-y-3">
                {(
                  [
                    { key: "status", label: "Statut" },
                    { key: "category", label: "Catégorie" },
                    { key: "owner", label: "Responsable" },
                    { key: "tags", label: "Tags" },
                    { key: "updated_at", label: "Mis à jour" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={`list-${key}`}
                      checked={displayPrefs.list[key]}
                      onCheckedChange={(checked) =>
                        setDisplayPrefs({
                          ...displayPrefs,
                          list: {
                            ...displayPrefs.list,
                            [key]: !!checked,
                          },
                        })
                      }
                    />
                    <Label
                      htmlFor={`list-${key}`}
                      className="text-sm cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cartes Sprint</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Choisissez les informations affichées sur chaque carte dans la
                liste des sprints.
              </p>
              <div className="space-y-3">
                {(
                  [
                    { key: "dates", label: "Dates (période)" },
                    { key: "progress", label: "Progression (X/Y terminés)" },
                    { key: "days", label: "Jours attribués" },
                    { key: "capacityBar", label: "Barre de capacité" },
                    { key: "useCaseTitles", label: "Titres des use cases" },
                    { key: "owner", label: "Responsable (par use case)" },
                    { key: "contributors", label: "Contributeurs (par use case)" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox
                      id={`sprintCard-${key}`}
                      checked={displayPrefs.sprintCard[key]}
                      onCheckedChange={(checked) =>
                        setDisplayPrefs({
                          ...displayPrefs,
                          sprintCard: {
                            ...displayPrefs.sprintCard,
                            [key]: !!checked,
                          },
                        })
                      }
                    />
                    <Label
                      htmlFor={`sprintCard-${key}`}
                      className="text-sm cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab: Configuration ====== */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statuts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statusConfig.map((s) => (
                  <div key={s.value} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${s.color}`} />
                    <span className="text-sm font-medium w-24">
                      {s.label}
                    </span>
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {s.value}
                    </code>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Les statuts sont définis en base de données (enum PostgreSQL).
                Pour en ajouter, une migration SQL est nécessaire.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Catégories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categoryConfig.map((c) => (
                  <div key={c.value} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${c.color}`} />
                    <span className="text-sm font-medium w-24">
                      {c.label}
                    </span>
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {c.value}
                    </code>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Les catégories sont définies en base de données (enum
                PostgreSQL). Pour en ajouter, une migration SQL est nécessaire.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rôles utilisateurs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(roleLabels).map(([value, label]) => (
                  <div key={value} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-24">{label}</span>
                    <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

