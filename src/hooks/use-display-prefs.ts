"use client"

import { useState, useCallback, useEffect } from "react"

export interface KanbanDisplayPrefs {
  category: boolean
  tags: boolean
  owner: boolean
}

export interface ListDisplayPrefs {
  status: boolean
  category: boolean
  owner: boolean
  tags: boolean
  updated_at: boolean
}

export interface SprintCardDisplayPrefs {
  dates: boolean
  progress: boolean
  days: boolean
  capacityBar: boolean
  useCaseTitles: boolean
  owner: boolean
  contributors: boolean
}

export interface DisplayPrefs {
  kanban: KanbanDisplayPrefs
  list: ListDisplayPrefs
  sprintCard: SprintCardDisplayPrefs
}

const STORAGE_KEY = "backlog-display-prefs"

const defaultPrefs: DisplayPrefs = {
  kanban: { category: true, tags: true, owner: true },
  list: {
    status: true,
    category: true,
    owner: true,
    tags: true,
    updated_at: true,
  },
  sprintCard: {
    dates: true,
    progress: true,
    days: true,
    capacityBar: true,
    useCaseTitles: true,
    owner: true,
    contributors: true,
  },
}

function loadPrefs(): DisplayPrefs {
  if (typeof window === "undefined") return defaultPrefs
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultPrefs
    const parsed = JSON.parse(stored)
    // Merge with defaults to handle new fields added later
    return {
      kanban: { ...defaultPrefs.kanban, ...parsed.kanban },
      list: { ...defaultPrefs.list, ...parsed.list },
      sprintCard: { ...defaultPrefs.sprintCard, ...parsed.sprintCard },
    }
  } catch {
    return defaultPrefs
  }
}

export function useDisplayPrefs(): [
  DisplayPrefs,
  (prefs: DisplayPrefs) => void,
] {
  const [prefs, setPrefsState] = useState<DisplayPrefs>(defaultPrefs)

  // Load from localStorage on mount (client only)
  useEffect(() => {
    setPrefsState(loadPrefs())
  }, [])

  const setPrefs = useCallback((newPrefs: DisplayPrefs) => {
    setPrefsState(newPrefs)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
    } catch {
      // localStorage might be full or disabled
    }
  }, [])

  return [prefs, setPrefs]
}
