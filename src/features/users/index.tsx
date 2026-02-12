import { useEffect, useMemo, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
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
}

const shanghaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toShanghaiDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return null
  return shanghaiDayFormatter.format(date)
}

function inDateRange(
  value: unknown,
  startDate: string | undefined,
  endDate: string | undefined
) {
  const day = toShanghaiDate(value)
  if (!day) return false
  if (startDate && day < startDate) return false
  if (endDate && day > endDate) return false
  return true
}

export function Users() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [rawUsers, setRawUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const segmentLabelMap = {
    registered: '注册用户',
    firstConversation: '首次对话用户',
    subscribed: '订阅用户',
    renewed: '初次续费用户',
  } as const

  const users = useMemo(() => {
    const segment = search.funnelSegment as
      | 'registered'
      | 'firstConversation'
      | 'subscribed'
      | 'renewed'
      | undefined
    const startDate = search.startDate || ''
    const endDate = search.endDate || ''
    if (!segment) return rawUsers

    return rawUsers.filter((user) => {
      if (segment === 'registered') {
        return inDateRange(user.createdAt, startDate, endDate)
      }
      if (segment === 'firstConversation') {
        return inDateRange(user.firstConversationAt, startDate, endDate)
      }
      if (segment === 'subscribed') {
        return inDateRange(user.firstPaidAt, startDate, endDate)
      }
      return inDateRange(user.secondPaidAt, startDate, endDate)
    })
  }, [rawUsers, search.endDate, search.funnelSegment, search.startDate])

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError('')
      try {
        const resp = await fetch('/api/users')
        const payload = (await resp.json()) as UsersApiPayload
        if (!resp.ok) {
          throw new Error(
            (payload as { message?: string })?.message ||
              `请求失败（HTTP ${resp.status}）`
          )
        }
        setRawUsers(Array.isArray(payload?.rows) ? payload.rows : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : '用户数据加载失败')
        setRawUsers([])
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [])

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
          <UsersPrimaryButtons />
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
