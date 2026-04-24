// src/lib/stafftool/missions.ts
// Read-only helpers for stafftool's missions table.
import { createClient } from '@/lib/supabase/client'
import type { StafftoolMission } from './types'

const MISSION_COLUMNS = 'id, label, type, client_id, start_date, end_date'

export async function getMission(id: string): Promise<StafftoolMission | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('missions')
    .select(MISSION_COLUMNS)
    .eq('id', id)
    .maybeSingle<StafftoolMission>()
  if (error) throw error
  return data
}

export interface SearchMissionsOpts {
  query?: string
  consultantId?: string
}

/**
 * Searches missions the current user can see (subject to stafftool's RLS).
 * Use listAllMissionsForAdmin() when the caller must see every mission.
 */
export async function searchMissions(opts: SearchMissionsOpts = {}): Promise<StafftoolMission[]> {
  const supabase = createClient()
  let q = supabase.from('missions').select(MISSION_COLUMNS).limit(50)
  if (opts.query) q = q.ilike('label', `%${opts.query}%`)
  // consultantId: filter via mission_consultants join. Read-only here too.
  // (If opts.consultantId is set, use the embed pattern: select '*, mission_consultants!inner(consultant_id)'
  // — keeping simple for v1.)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as StafftoolMission[]
}

/**
 * IA Lab admin-only: returns ALL missions via the SECURITY DEFINER RPC.
 * Non-admins get an empty array (the RPC's internal gate rejects them).
 */
export async function listAllMissionsForAdmin(): Promise<StafftoolMission[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('ia_lab_list_all_missions')
  if (error) throw error
  return (data ?? []) as StafftoolMission[]
}
