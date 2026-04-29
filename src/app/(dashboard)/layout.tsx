import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { createClient } from '@/lib/supabase/server'
import { getCurrentIaLabRoleServer } from '@/lib/ia-lab-roles-server'
import { isAdminOnlyPath } from '@/lib/ia-lab-routes'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let role
  try {
    role = await getCurrentIaLabRoleServer()
  } catch (e) {
    console.error('Failed to read IA Lab role in layout', e)
    redirect('/login')
  }

  const pathname = (await headers()).get('x-pathname') ?? '/'

  if (isAdminOnlyPath(pathname) && role !== 'admin') {
    redirect('/backlog')
  }

  return (
    <div className="flex h-screen">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
