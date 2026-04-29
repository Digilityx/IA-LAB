'use client'

import { useEffect, useState } from 'react'
import { getCurrentIaLabRole, type IaLabRole } from '@/lib/ia-lab-roles'

interface UseIaLabRoleResult {
  role: IaLabRole | null
  loading: boolean
}

/**
 * Client-side hook for components that need the current user's IA Lab role
 * to conditionally render UI. The DB enforces authorization via RLS — this
 * is purely for UX (hide buttons, swap labels).
 */
export function useIaLabRole(): UseIaLabRoleResult {
  const [role, setRole] = useState<IaLabRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getCurrentIaLabRole()
      .then((r) => {
        if (!cancelled) setRole(r)
      })
      .catch((e) => {
        console.error('Failed to fetch IA Lab role', e)
        if (!cancelled) setRole(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { role, loading }
}
