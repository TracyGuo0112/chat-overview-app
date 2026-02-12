import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { Button } from '@/components/ui/button'
import { ThemeSwitch } from '@/components/theme-switch'
import { UsersDialogs } from './components/users-dialogs'
import { UsersPrimaryButtons } from './components/users-primary-buttons'
import { UsersProvider } from './components/users-provider'
import { UsersTable } from './components/users-table'
import { type User } from './data/schema'

const route = getRouteApi('/_authenticated/users/')

type UsersApiPayload = {
  total: number
  rows: User[]
  filters?: {
    funnelSegment?: 'registered' | 'firstConversation' | 'subscribed' | 'renewed'
    startDate?: string
    endDate?: string
  }
}

export function Users() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const segmentLabelMap = {
    registered: '注册用户',
    firstConversation: '首次对话用户',
    subscribed: '订阅用户',
    renewed: '初次续费用户',
  } as const

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError('')
      try {
        const qs = new URLSearchParams()
        if (search.funnelSegment) qs.set('funnelSegment', search.funnelSegment)
        if (search.startDate) qs.set('startDate', search.startDate)
        if (search.endDate) qs.set('endDate', search.endDate)

        const url = qs.toString() ? `/api/users?${qs.toString()}` : '/api/users'
        const resp = await fetch(url)
        const payload = (await resp.json()) as UsersApiPayload
        if (!resp.ok) {
          throw new Error(
            (payload as { message?: string })?.message ||
              `请求失败（HTTP ${resp.status}）`
          )
        }
        setUsers(Array.isArray(payload?.rows) ? payload.rows : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : '用户数据加载失败')
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [search.endDate, search.funnelSegment, search.startDate])

  return (
    <UsersProvider>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>用户管理</h2>
            <p className='text-muted-foreground'>
              查看数据库中的真实用户信息与账户状态。
            </p>
            {search.funnelSegment ? (
              <p className='mt-1 text-xs text-muted-foreground'>
                当前筛选：{segmentLabelMap[search.funnelSegment]}（
                {search.startDate || '-'} ~ {search.endDate || '-'}）
              </p>
            ) : null}
          </div>
          <div className='flex items-center gap-2'>
            {search.source === 'membershipOps' ? (
              <Button
                variant='outline'
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back()
                    return
                  }
                  void navigate({ to: '/membership-ops' })
                }}
              >
                <ArrowLeft className='mr-1 h-4 w-4' />
                返回上一级
              </Button>
            ) : null}
            <UsersPrimaryButtons />
          </div>
        </div>

        {error ? <p className='text-sm text-red-600'>{error}</p> : null}
        {loading ? (
          <p className='text-sm text-muted-foreground'>正在加载用户数据...</p>
        ) : null}

        <UsersTable data={users} search={search} navigate={navigate} />
      </Main>

      <UsersDialogs />
    </UsersProvider>
  )
}
