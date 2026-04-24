// src/lib/stafftool/profiles.ts
// Read-only helpers for stafftool's profiles table.
// Project-hub code must access profiles via this module only.
import { createClient } from '@/lib/supabase/client'
import type { StafftoolProfile, TjmYearlyJsonb, CjmYearlyJsonb } from './types'

const PROFILE_COLUMNS =
  'id, email, full_name, avatar_url, team, arrival_date, departure_date, tjm, cjm, role, can_access_feature'

export async function getProfile(id: string): Promise<StafftoolProfile | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle<StafftoolProfile>()
  if (error) throw error
  return data
}

export async function listProfilesByIds(ids: string[]): Promise<StafftoolProfile[]> {
  if (ids.length === 0) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as StafftoolProfile[]
}

export async function searchProfiles(query: string, limit = 20): Promise<StafftoolProfile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .ilike('full_name', `%${query}%`)
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StafftoolProfile[]
}

/**
 * Returns the effective TJM for a given year.
 * Falls back to the most recent prior year present, then returns null.
 */
export function getEffectiveTjm(
  profile: Pick<StafftoolProfile, 'tjm'>,
  year: number = new Date().getFullYear(),
): number | null {
  return pickYearlyRate(profile.tjm, year)
}

/**
 * Returns the effective CJM for a given year. Same fallback behavior as TJM.
 */
export function getEffectiveCjm(
  profile: Pick<StafftoolProfile, 'cjm'>,
  year: number = new Date().getFullYear(),
): number | null {
  return pickYearlyRate(profile.cjm, year)
}

function pickYearlyRate(
  rates: TjmYearlyJsonb | CjmYearlyJsonb | null | undefined,
  year: number,
): number | null {
  if (!rates) return null
  const exact = rates[String(year)]
  if (typeof exact === 'number') return exact
  // Fallback: most recent prior year present
  const priors = Object.keys(rates)
    .map(Number)
    .filter((y) => !Number.isNaN(y) && y < year)
    .sort((a, b) => b - a)
  for (const y of priors) {
    const v = rates[String(y)]
    if (typeof v === 'number') return v
  }
  return null
}
