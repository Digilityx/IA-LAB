// src/lib/stafftool/types.ts
// Hand-written types for stafftool tables we read.
// Source: spec § Appendix A2/A3 (verified against prod schema 2026-04-24).

export type TjmYearlyJsonb = Record<string, number> // e.g. { "2024": 800, "2025": 850 }
export type CjmYearlyJsonb = Record<string, number>

export interface StafftoolProfileExpertise {
  id: string
  name: string
  grade: number
}

export interface StafftoolProfileExpertises {
  expertises: StafftoolProfileExpertise[]
}

export interface StafftoolProfile {
  id: string
  email: string
  full_name: string
  created_at: string
  updated_at: string
  team: string | null
  seniority: string | null
  holidays_current_year: number | null
  holidays_previous_year: number | null
  holidays_two_years_ago: number | null
  rtt: number | null
  arrival_date: string | null
  departure_date: string | null
  avatar_url: string | null
  managed: string | null
  expertises: StafftoolProfileExpertises | null
  can_access_feature: boolean
  role: string // stafftool user category — e.g. "consultant". NOT a permission grant.
  slack_id: string | null
  tjm: TjmYearlyJsonb | null
  cjm: CjmYearlyJsonb | null
}

export interface StafftoolMission {
  id: string
  label: string
  type: string | null
  client_id: string | null
  start_date: string | null
  end_date: string | null
  // Other columns exist (budgets, manager_id, responsable_id) but we don't expose them to project-hub for now.
}

export interface StafftoolClient {
  id: string
  name: string
  // Unknown extras; we don't need them in v1.
}
