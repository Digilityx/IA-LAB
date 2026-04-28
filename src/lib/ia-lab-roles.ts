// src/lib/ia-lab-roles.ts
// Client-side IA Lab role lookup for UI gating.
// The DB is the authority — RLS will reject writes regardless of UI state — but
// hiding disabled controls is nicer UX.
import { createClient } from '@/lib/supabase/client'

export type IaLabRole = 'member' | 'admin'

export interface IaLabRoleRow {
  user_id: string
  role: IaLabRole
  granted_at: string
  granted_by: string | null
  notes: string | null
}

/**
 * Returns the current user's IA Lab role, or null if they have no row
 * (i.e. effectively a viewer).
 */
export async function getCurrentIaLabRole(): Promise<IaLabRole | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('ia_lab_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle<{ role: IaLabRole }>()
  if (error) throw error
  return data?.role ?? null
}

/**
 * True if the current user holds any of the given IA Lab roles.
 * Null role argument array is treated as "any role" (member or admin).
 */
export async function hasIaLabRole(required: IaLabRole[] = ['member', 'admin']): Promise<boolean> {
  const role = await getCurrentIaLabRole()
  return role !== null && required.includes(role)
}

export async function isIaLabAdmin(): Promise<boolean> {
  return hasIaLabRole(['admin'])
}
