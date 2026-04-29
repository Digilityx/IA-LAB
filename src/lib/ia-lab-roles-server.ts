// Server-side IA Lab role lookup. Mirrors src/lib/ia-lab-roles.ts but uses
// the server Supabase client so it can run in Server Components, Route
// Handlers, and middleware-adjacent code.
import { createClient } from '@/lib/supabase/server'
import type { IaLabRole } from '@/lib/ia-lab-roles'

export async function getCurrentIaLabRoleServer(): Promise<IaLabRole | null> {
  const supabase = await createClient()
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
