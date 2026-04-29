import type { TjmYearlyJsonb, CjmYearlyJsonb } from '@/lib/stafftool/types'

export type SprintStatus = 'planned' | 'active' | 'completed'
export type UseCaseStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'abandoned'
export type UseCaseCategory = 'IMPACT' | 'LAB' | 'PRODUCT'

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'

export type MemberRole = 'owner' | 'contributor' | 'reviewer'
export type InterestType = 'interested' | 'want_to_use' | 'propose_to_client'
export type InterestStatus = 'pending' | 'contacted' | 'resolved'

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  team: string | null
  tjm: TjmYearlyJsonb | null
  cjm: CjmYearlyJsonb | null
  arrival_date: string | null
  departure_date: string | null
  role: string  // stafftool user category (e.g. "consultant") — not a permission grant
  created_at: string
}

export interface Sprint {
  id: string
  name: string
  start_date: string
  end_date: string
  status: SprintStatus
  created_by: string
  created_at: string
}

export interface UseCase {
  id: string
  title: string
  description: string
  status: UseCaseStatus
  category: UseCaseCategory
  priority: PriorityLevel
  sprint_id: string | null
  owner_id: string | null
  documentation: string | null
  is_published: boolean
  cover_image_url: string | null
  short_description: string | null
  deliverable_type: string | null
  usage_type: string | null
  tools: string | null
  target_users: string | null
  benchmark_url: string | null
  journey_url: string | null
  next_steps: string | null
  transfer_status: string | null
  created_at: string
  updated_at: string
  // Joined fields
  owner?: Profile
  sprint?: Sprint
  members?: UseCaseMember[]
  tags?: Tag[]
  metrics?: UseCaseMetrics
  documents?: UseCaseDocument[]
}

export interface UseCaseMember {
  use_case_id: string
  profile_id: string
  role: MemberRole
  profile?: Profile
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface UseCaseTag {
  use_case_id: string
  tag_id: string
}

export interface UseCaseMetrics {
  id: string
  use_case_id: string
  margin_generated: number | null
  man_days_estimated: number | null
  man_days_actual: number | null
  man_days_saved: number | null
  mrr: number | null
  additional_business: number | null
  notes: string | null
  updated_at: string
}

export interface UseCaseDocument {
  id: string
  use_case_id: string
  file_name: string
  file_url: string
  file_size: number | null
  created_at: string
}

export const SPRINT_BUDGET_DAYS = 23

export interface SprintUseCase {
  id: string
  sprint_id: string
  use_case_id: string
  estimated_days: number | null
  assigned_to: string | null
  created_at: string
  // Joined
  use_case?: UseCase
  sprint?: Sprint
  assigned_profile?: Profile
  assignments?: SprintUseCaseAssignment[]
}

export interface SprintUseCaseAssignment {
  id: string
  sprint_use_case_id: string
  profile_id: string
  estimated_days: number | null
  created_at: string
  // Joined
  profile?: Profile
}

export interface UseCaseAccompaniment {
  id: string
  use_case_id: string
  mission_client: string | null
  consultant_id: string | null
  jours_economises: number | null
  updated_at: string
  // Joined
  consultant?: Profile
}

export interface UcMission {
  id: string
  use_case_id: string
  category: UseCaseCategory
  consultant_id: string | null
  mission_client: string | null
  days_saved: number | null
  mission_amount: number | null
  tjm_snapshot: number | null
  notes: string | null
  created_at: string
  created_by: string | null
  // Joined
  consultant?: Profile
}

export interface UcDeal {
  id: string
  use_case_id: string
  client: string
  amount: number
  quote_date: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface UcCategoryHistoryEntry {
  id: string
  use_case_id: string
  old_category: UseCaseCategory | null
  new_category: UseCaseCategory
  changed_at: string
  changed_by: string | null
  // Joined
  changed_by_profile?: Profile
}

export interface InterestRequest {
  id: string
  use_case_id: string
  requester_id: string
  type: InterestType
  message: string | null
  status: InterestStatus
  is_read: boolean
  is_archived: boolean
  created_at: string
  // Joined
  requester?: Profile
  use_case?: UseCase
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface UseCaseSubmission {
  id: string
  submitted_by: string
  title: string
  description: string | null
  usage_type: string | null
  status: SubmissionStatus
  rejection_reason: string | null
  approved_use_case_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  // Joined
  submitter?: Profile
  reviewer?: Profile
}
