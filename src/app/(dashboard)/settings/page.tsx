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
import type { Profile, Tag as TagType, UserRole } from "@/types/database"

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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState("")
  const [department, setDepartment] = useState("")
  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Tags state
  const [tags, setTags] = useState<TagType[]>([])
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState("")
  const [editingTagColor, setEditingTagColor] = useState("")

  // Users state
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])

  // Placeholder creation
  const [newPlaceholderName, setNewPlaceholderName] = useState("")
  const [newPlaceholderDept, setNewPlaceholderDept] = useState("")

  // Display preferences
  const [displayPrefs, setDisplayPrefs] = useDisplayPrefs()

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, tagsRes, profilesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("tags").select("*").order("name"),
      supabase.from("profiles").select("*").order("full_name"),
    ])

    if (profileRes.data) {
      setProfile(profileRes.data)
      setFullName(profileRes.data.full_name)
      setDepartment(profileRes.data.department || "")
      setIsAdmin(profileRes.data.role === "admin")
    }
    if (tagsRes.data) setTags(tagsRes.data)
    if (profilesRes.data) setAllProfiles(profilesRes.data)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Profile handlers ----
  const handleSaveProfile = async () => {
    if (!profile) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from("profiles")
      .update({ full_name: fullName, department: department || null })
      .eq("id", profile.id)
    setSaving(false)
  }

  // ---- Tag handlers ----
  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    const supabase = createClient()
    await supabase.from("tags").insert({
      name: newTagName.trim(),
      color: newTagColor,
    })
    setNewTagName("")
    fetchData()
  }

  const handleDeleteTag = async (tagId: string) => {
    const supabase = createClient()
    // Delete from use_case_tags first (junction table)
    await supabase.from("use_case_tags").delete().eq("tag_id", tagId)
    await supabase.from("tags").delete().eq("id", tagId)
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
      .from("tags")
      .update({ name: editingTagName.trim(), color: editingTagColor })
      .eq("id", editingTagId)
    setEditingTagId(null)
    fetchData()
  }

  // ---- User handlers ----
  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    const supabase = createClient()
    await supabase.from("profiles").update({ role: newRole }).eq("id", userId)
    fetchData()
  }

  const handleUpdateUserDepartment = async (
    userId: string,
    newDept: string
  ) => {
    const supabase = createClient()
    await supabase
      .from("profiles")
      .update({ department: newDept || null })
      .eq("id", userId)
    fetchData()
  }

  const handleDeletePlaceholder = async (userId: string) => {
    const supabase = createClient()
    // Remove from use_case_members
    await supabase
      .from("use_case_members")
      .delete()
      .eq("profile_id", userId)
    // Update use_cases where this user is owner (set to current user)
    if (profile) {
      await supabase
        .from("use_cases")
        .update({ owner_id: profile.id })
        .eq("owner_id", userId)
    }
    await supabase.from("profiles").delete().eq("id", userId)
    fetchData()
  }

  const handleAddPlaceholder = async () => {
    if (!newPlaceholderName.trim()) return
    const supabase = createClient()
    const id = crypto.randomUUID()
    await supabase.from("profiles").insert({
      id,
      full_name: newPlaceholderName.trim(),
      email: `placeholder+${id.slice(0, 8)}@project-hub.local`,
      role: "member",
      is_placeholder: true,
      department: newPlaceholderDept || null,
    })
    setNewPlaceholderName("")
    setNewPlaceholderDept("")
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
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={profile?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Département</Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Ex: Data & IA"
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <div>
                  <Badge variant="outline">{profile?.role}</Badge>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
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
                {/* Add placeholder user */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Nom</Label>
                    <Input
                      value={newPlaceholderName}
                      onChange={(e) => setNewPlaceholderName(e.target.value)}
                      placeholder="Nom du profil placeholder..."
                      className="h-9"
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAddPlaceholder()
                      }
                    />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label className="text-xs">Département</Label>
                    <Input
                      value={newPlaceholderDept}
                      onChange={(e) => setNewPlaceholderDept(e.target.value)}
                      placeholder="Département..."
                      className="h-9"
                    />
                  </div>
                  <Button size="sm" className="h-9" onClick={handleAddPlaceholder}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>

                <Separator />

                {/* Users table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Département</TableHead>
                      <TableHead className="w-24">TJM (€/j)</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead className="w-16">Type</TableHead>
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
                          .map((n) => n[0])
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
                            {p.is_placeholder ? (
                              <span className="italic">placeholder</span>
                            ) : (
                              p.email
                            )}
                          </TableCell>
                          <TableCell>
                            <DepartmentEditor
                              value={p.department || ""}
                              onSave={(val) =>
                                handleUpdateUserDepartment(p.id, val)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={50}
                              value={p.tjm ?? ""}
                              onChange={async (e) => {
                                const val = e.target.value
                                  ? parseFloat(e.target.value)
                                  : null
                                const supabase = createClient()
                                await supabase
                                  .from("profiles")
                                  .update({ tjm: val })
                                  .eq("id", p.id)
                                fetchData()
                              }}
                              placeholder="—"
                              className="h-8 w-20 text-xs text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={p.role}
                              onValueChange={(v) =>
                                handleUpdateUserRole(
                                  p.id,
                                  v as UserRole
                                )
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
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                p.is_placeholder
                                  ? "border-orange-300 text-orange-600"
                                  : "border-green-300 text-green-600"
                              }`}
                            >
                              {p.is_placeholder ? "Proxy" : "Réel"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {p.is_placeholder && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Supprimer le profil &ldquo;
                                      {p.full_name}&rdquo; ?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Ce profil placeholder sera supprimé. Les
                                      use cases dont il est responsable seront
                                      réattribués à votre compte.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Annuler
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeletePlaceholder(p.id)
                                      }
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Supprimer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
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

// ---- Inline Department Editor ----
function DepartmentEditor({
  value,
  onSave,
}: {
  value: string
  onSave: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="h-7 text-xs w-28"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(localValue)
              setEditing(false)
            }
            if (e.key === "Escape") {
              setLocalValue(value)
              setEditing(false)
            }
          }}
          onBlur={() => {
            onSave(localValue)
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
    >
      {value || <span className="italic">—</span>}
    </button>
  )
}
