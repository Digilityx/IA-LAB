# Plan d'implémentation — Vue Liste, Pop-in Détail, Admin CRUD

> **Statut au 2026-04-30 :** plan partiellement entamé. shadcn `table` + `alert-dialog` installés ; `src/components/backlog/list-view.tsx` existe ; le toggle Kanban/Liste est câblé sur `/backlog`. **Le pop-in détail reste un Dialog** (`use-case-detail-dialog.tsx`) — la conversion en Sheet n'est pas faite. **La refonte des Paramètres n'est pas démarrée.** Lire l'état des fichiers avant de suivre le plan aveuglément.

## Vue d'ensemble

3 fonctionnalités à développer :
1. **Vue Liste** — Toggle Kanban ↔ Liste sur la page backlog *(partiellement fait)*
2. **Pop-in Détail** — Sheet latérale au clic sur un use case, avec édition/suppression *(à faire — actuellement Dialog)*
3. **Admin CRUD** — Gestion des tags, utilisateurs et configuration depuis les Paramètres *(à faire)*

---

## Étape 1 : Installer le composant shadcn Table

Ajouter le composant `table` de shadcn/ui (pas encore présent dans le projet).
Il servira pour la vue liste ET pour les tables admin.

```
npx shadcn@latest add table alert-dialog
```

> `alert-dialog` servira pour la confirmation de suppression.

---

## Étape 2 : Vue Liste du Backlog

### Fichier : `src/components/backlog/list-view.tsx` (NOUVEAU)

Composant table avec :
- **Colonnes** : Titre, Statut (badge coloré), Catégorie (badge), Priorité (badge), Responsable (avatar+nom), Tags (pills), Sprint, Mis à jour
- **Tri** : Clic sur l'en-tête de colonne → tri ascendant/descendant (client-side)
- **Clic sur ligne** → appelle `onSelectUseCase(id)` (ouvre le sheet)
- **Props** : `{ useCases: UseCase[], onSelectUseCase: (id: string) => void }`

### Fichier : `src/app/(dashboard)/backlog/page.tsx` (MODIFIÉ)

- Ajouter un state `viewMode: "kanban" | "list"` (défaut: "kanban")
- Ajouter un **toggle** dans la barre de filtres (icônes `KanbanSquare` / `List`)
- Ajouter un state `selectedUseCaseId: string | null`
- Afficher `<KanbanBoard>` ou `<ListView>` selon `viewMode`
- Ajouter le `<UseCaseDetailSheet>` (étape 3) avec `open={!!selectedUseCaseId}`
- Dans KanbanBoard/Card : passer `onSelectUseCase` au lieu du `<Link>`

### Fichier : `src/components/backlog/use-case-card.tsx` (MODIFIÉ)

- Remplacer `<Link href={/backlog/${id}}>` par un `<button onClick={() => onSelect(id)}>`
- Ajouter prop `onSelect: (id: string) => void`
- Propager la prop depuis kanban-column → kanban-board → page

### Fichier : `src/components/backlog/kanban-column.tsx` (MODIFIÉ)

- Ajouter prop `onSelectUseCase` et la passer à `<UseCaseCard>`

### Fichier : `src/components/backlog/kanban-board.tsx` (MODIFIÉ)

- Ajouter prop `onSelectUseCase` et la passer à `<KanbanColumn>`

---

## Étape 3 : Pop-in Détail (Sheet)

### Fichier : `src/components/backlog/use-case-detail-sheet.tsx` (NOUVEAU)

Grand panneau latéral (Sheet côté droit, largeur élargie `sm:max-w-2xl`) contenant :

**En-tête** :
- Titre (éditable en mode édition)
- Badges catégorie + statut + priorité
- Boutons : Modifier / Enregistrer / Annuler / **Supprimer** (avec icône Trash2, rouge)

**Corps** (ScrollArea avec les 4 onglets, même structure que la page détail actuelle) :
- Tab **Détails** : status/catégorie/priorité (selects) + description + documentation (markdown)
- Tab **Infos** : deliverable_type, usage_type, tools, target_users, benchmark/journey urls
- Tab **Membres** : owner + contributeurs (lecture seule)
- Tab **Métriques** : margin, MRR, JH estimés/réels/économisés, business additionnel, notes

**Suppression** : AlertDialog de confirmation → `supabase.from("use_cases").delete().eq("id", id)` → fermer sheet + callback `onUpdate`

**Props** :
```typescript
{
  useCaseId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void  // rafraîchir la liste parent
}
```

**Logique** :
- Fetch les données quand `useCaseId` change (même pattern que la page [id])
- Vérifier le rôle admin via `profile.role === 'admin'` pour afficher boutons Modifier/Supprimer
- Réutilise la logique de save existante (handleSave, handleSaveMetrics)

### Fichier : `src/app/(dashboard)/backlog/[id]/page.tsx` (CONSERVÉ)

On garde la page pour les accès directs par URL, mais on pourrait la simplifier pour rediriger vers /backlog avec le sheet ouvert. Pour l'instant on la laisse telle quelle.

---

## Étape 4 : Admin CRUD — Refonte des Paramètres

### Fichier : `src/app/(dashboard)/settings/page.tsx` (MODIFIÉ — refonte complète)

Restructurer en **4 onglets** via `<Tabs>` :

#### Onglet 1 : Profil (existant, inchangé)
- Nom, email, département, rôle
- Bouton enregistrer

#### Onglet 2 : Tags (amélioré)
- **Table** avec colonnes : Couleur (rond), Nom (éditable inline), Actions (éditer/supprimer)
- **Édition inline** : clic sur le nom → input, clic sur la couleur → popover avec palette
- **Ajout** : ligne en bas du tableau pour créer un nouveau tag
- **Suppression** : AlertDialog de confirmation (le tag sera retiré de tous les use cases)

#### Onglet 3 : Utilisateurs (NOUVEAU)
- **Table** avec colonnes : Avatar, Nom, Email, Département, Rôle, Type (réel/placeholder), Actions
- **Modification du rôle** : Select inline (admin/member/viewer)
- **Modification du département** : Input inline
- **Suppression** : Uniquement pour les profils placeholder (is_placeholder=true), avec confirmation
- **Ajout de placeholder** : Bouton pour créer un profil placeholder (nom + département)

#### Onglet 4 : Configuration (NOUVEAU)
- **Section Statuts** : Liste des statuts existants (backlog, todo, in_progress, done, abandoned) avec leurs labels FR et couleurs. Lecture seule car ce sont des enums PostgreSQL, mais on affiche l'info pour référence.
- **Section Catégories** : Idem — IMPACT, LAB, PRODUCT avec couleurs
- **Section Priorités** : Idem — low, medium, high, critical

> Note : Les statuts/catégories/priorités sont des enums PostgreSQL qu'on ne peut pas modifier à chaud. L'onglet Configuration sert de référence visuelle. Si le besoin d'ajouter des valeurs arrive plus tard, il faudra une migration SQL.

---

## Ordre d'implémentation

1. `npx shadcn@latest add table alert-dialog` (composants UI)
2. **use-case-detail-sheet.tsx** — Le sheet de détail (composant central)
3. Modifier **use-case-card.tsx** → onClick au lieu de Link
4. Modifier **kanban-column.tsx** → prop onSelectUseCase
5. Modifier **kanban-board.tsx** → prop onSelectUseCase
6. Créer **list-view.tsx** — Vue table triable
7. Modifier **backlog/page.tsx** — Toggle vue + state selectedUseCase + Sheet
8. Refondre **settings/page.tsx** — 4 onglets avec gestion admin

---

## Fichiers impactés (résumé)

| Fichier | Action |
|---------|--------|
| `src/components/ui/table.tsx` | NOUVEAU (shadcn) |
| `src/components/ui/alert-dialog.tsx` | NOUVEAU (shadcn) |
| `src/components/backlog/use-case-detail-sheet.tsx` | NOUVEAU |
| `src/components/backlog/list-view.tsx` | NOUVEAU |
| `src/components/backlog/use-case-card.tsx` | MODIFIÉ (Link → onClick) |
| `src/components/backlog/kanban-column.tsx` | MODIFIÉ (prop onSelect) |
| `src/components/backlog/kanban-board.tsx` | MODIFIÉ (prop onSelect) |
| `src/app/(dashboard)/backlog/page.tsx` | MODIFIÉ (toggle + sheet) |
| `src/app/(dashboard)/settings/page.tsx` | MODIFIÉ (refonte 4 onglets) |
