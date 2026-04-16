"use client"

import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Sprint, SprintUseCase } from "@/types/database"

interface BurndownChartProps {
  sprint: Sprint
  sprintUseCases: SprintUseCase[]
}

function getBusinessDays(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    const dow = current.getDay()
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function BurndownChart({ sprint, sprintUseCases }: BurndownChartProps) {
  const startDate = new Date(sprint.start_date)
  const endDate = new Date(sprint.end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Total planned days (sum of all assignment estimated_days)
  const totalDays = sprintUseCases.reduce(
    (sum, suc) =>
      sum +
      (suc.assignments || []).reduce(
        (s, a) => s + (a.estimated_days || 0),
        0
      ),
    0
  )

  if (totalDays === 0) {
    return null // Don't show chart if no days allocated
  }

  // Get all business days in the sprint
  const businessDays = getBusinessDays(startDate, endDate)
  if (businessDays.length === 0) return null

  // Calculate "done" days = sum of estimated_days for UCs with status "done"
  const doneDays = sprintUseCases
    .filter((suc) => suc.use_case?.status === "done")
    .reduce(
      (sum, suc) =>
        sum +
        (suc.assignments || []).reduce(
          (s, a) => s + (a.estimated_days || 0),
          0
        ),
      0
    )

  // Calculate "in_progress" days (partial credit: 50%)
  const inProgressDays = sprintUseCases
    .filter((suc) => suc.use_case?.status === "in_progress")
    .reduce(
      (sum, suc) =>
        sum +
        (suc.assignments || []).reduce(
          (s, a) => s + (a.estimated_days || 0),
          0
        ) * 0.5,
      0
    )

  const completedWork = doneDays + inProgressDays
  const remaining = Math.max(totalDays - completedWork, 0)

  // Build chart data
  const data = businessDays.map((day, index) => {
    // Ideal burndown: linear from totalDays to 0
    const idealRemaining =
      totalDays - (totalDays * (index + 1)) / businessDays.length

    const dayStr = formatShortDate(day)
    const isPast = day <= today

    return {
      date: dayStr,
      ideal: Math.round(idealRemaining * 10) / 10,
      // Actual data: only show up to today, use a simple linear interpolation
      // from totalDays at start to current remaining at today
      actual: isPast
        ? Math.round(
            (totalDays -
              (completedWork * (index + 1)) /
                Math.max(
                  businessDays.findIndex((d) => d >= today) + 1,
                  1
                )) *
              10
          ) / 10
        : undefined,
    }
  })

  // Simpler approach: show ideal line fully, actual line only up to today
  // Actual = remaining at today for the last known point
  const todayIndex = businessDays.findIndex((d) => d >= today)
  const actualData = businessDays.map((day, index) => {
    if (day > today) return { date: formatShortDate(day), ideal: data[index].ideal }

    // Linear interpolation from totalDays (day 0) to remaining (today)
    const progress = todayIndex > 0 ? index / todayIndex : 1
    const actualRemaining = totalDays - completedWork * progress

    return {
      date: formatShortDate(day),
      ideal: data[index].ideal,
      actual: Math.round(Math.max(actualRemaining, 0) * 10) / 10,
    }
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Burndown</span>
          <span className="text-sm font-normal text-muted-foreground">
            {remaining.toFixed(1)}j restant{remaining !== 1 ? "s" : ""} / {totalDays}j
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={actualData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval={Math.max(Math.floor(businessDays.length / 6) - 1, 0)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={[0, "auto"]}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: any, name: any) => [
                  `${value ?? 0}j`,
                  name === "ideal" ? "Idéal" : "Réel",
                ]) as any}
              />
              <Legend
                formatter={(value: string) =>
                  value === "ideal" ? "Idéal" : "Réel"
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              {todayIndex >= 0 && todayIndex < businessDays.length && (
                <ReferenceLine
                  x={formatShortDate(businessDays[todayIndex])}
                  stroke="#F44241"
                  strokeDasharray="3 3"
                  label={{
                    value: "Aujourd'hui",
                    position: "top",
                    fill: "#F44241",
                    fontSize: 10,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
