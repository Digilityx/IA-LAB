"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CommandPalette } from "@/components/layout/command-palette"
import { getProfile } from "@/lib/stafftool/profiles"
import type { StafftoolProfile } from "@/lib/stafftool/types"

export function Header() {
  const [profile, setProfile] = useState<StafftoolProfile | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const data = await getProfile(user.id)
        if (data) setProfile(data)
      }
    }
    fetchProfile()
  }, [])

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <CommandPalette />
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {profile?.full_name}
        </span>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
