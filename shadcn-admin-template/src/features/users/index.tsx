import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    registerStartDate?: string
    registerEndDate?: string
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatDateTime(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return '-'
  return dateTimeFormatter.format(date)
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r\n/g, '\n')
  return `"${text.replace(/"/g, '""')}"`
}

export function Users() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [draftRegisterStartDate, setDraftRegisterStartDate] = useState(
    search.registerStartDate || ''
  )
  const [draftRegisterEndDate, setDraftRegisterEndDate] = useState(
    search.registerEndDate || ''
  )
  const subscriptionStatus = useMemo(
    () => search.subscriptionStatus || [],
    [search.subscriptionStatus]
  )
  const subscriptionExpired = useMemo(
    () => search.subscriptionExpired || [],
    [search.subscriptionExpired]
  )
  const subscriptionStatusKey = subscriptionStatus.join(',')
  const subscriptionExpiredKey = subscriptionExpired.join(',')

  useEffect(() => {
    setDraftRegisterStartDate(search.registerStartDate || '')
    setDraftRegisterEndDate(search.registerEndDate || '')
  }, [search.registerEndDate, search.registerStartDate])

  const segmentLabelMap = {
    registered: '注册用户',
    firstConversation: '首次对话用户',
    subscribed: '订阅用户',
    renewed: '初次续费用户',
  } as const

  const buildUsersQuery = useCallback(
    (overrides?: { page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams()
      const page = overrides?.page ?? (search.page || 1)
      const pageSize = overrides?.pageSize ?? (search.pageSize || 10)
      qs.set('page', String(page))
      qs.set('pageSize', String(pageSize))

      if (search.funnelSegment) qs.set('funnelSegment', search.funnelSegment)
      if (search.startDate) qs.set('startDate', search.startDate)
      if (search.endDate) qs.set('endDate', search.endDate)
      if (search.registerStartDate) {
        qs.set('registerStartDate', search.registerStartDate)
      }
      if (search.registerEndDate) {
        qs.set('registerEndDate', search.registerEndDate)
      }
      if (search.nickname) qs.set('nickname', search.nickname)
      for (const item of subscriptionStatus) {
        qs.append('subscriptionStatus', item)
      }
      for (const item of subscriptionExpired) {
        qs.append('subscriptionExpired', item)
      }

      return qs
    },
    [
      search.endDate,
      search.funnelSegment,
      search.nickname,
      search.page,
      search.pageSize,
      search.registerEndDate,
      search.registerStartDate,
      search.startDate,
      subscriptionExpired,
      subscriptionStatus,
    ]
  )

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError('')
      try {
        const qs = buildUsersQuery()
        const url = `/api/users?${qs.toString()}`
        const resp = await fetch(url)
        const payload = (await resp.json()) as UsersApiPayload
        if (!resp.ok) {
          throw new Error(
            (payload as { message?: string })?.message || `请求失败（HTTP ${resp.status}）`
          )
        }
        setUsers(Array.isArray(payload?.rows) ? payload.rows : [])
        setTotal(Number(payload?.total || 0))
      } catch (err) {
        setError(err instanceof Error ? err.message : '用户数据加载失败')
        setUsers([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [buildUsersQuery, subscriptionExpiredKey, subscriptionStatusKey])

  const exportCurrentUsers = async () => {
    setExporting(true)
    try {
      const qs = buildUsersQuery({ page: 1, pageSize: 5000 })
      const resp = await fetch(`/api/users?${qs.toString()}`)
      const payload = (await resp.json()) as UsersApiPayload
      if (!resp.ok) {
        throw new Error(
          (payload as { message?: string })?.message ||
            `请求失败（HTTP ${resp.status}）`
        )
      }
      const exportRows = Array.isArray(payload?.rows) ? payload.rows : []
      if (exportRows.length === 0) {
        window.alert('当前筛选无可导出数据')
        return
      }

      const header = [
        '用户ID',
        '昵称',
        '邮箱',
        '注册时间',
        '性别',
        '年龄',
        '订阅版本',
        '账户状态',
      ]
      const body = exportRows.map((row) => [
        row.id,
        row.nickname || row.username || '-',
        row.email || '-',
        formatDateTime(row.createdAt),
        row.gender || '-',
        row.userAge ?? '-',
        row.subscriptionStatus || '免费版',
        row.subscriptionExpired || '-',
      ])

      const csv = [header, ...body].map((line) => line.map(escapeCsvCell).join(',')).join('\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const tag = new Date().toISOString().slice(0, 10)
      link.href = href
      link.download = `users_export_${tag}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(href)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const applyRegisterDateFilter = () => {
    if (
      draftRegisterStartDate &&
      draftRegisterEndDate &&
      draftRegisterStartDate > draftRegisterEndDate
    ) {
      window.alert('注册开始日期不能晚于结束日期')
      return
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        registerStartDate: draftRegisterStartDate || undefined,
        registerEndDate: draftRegisterEndDate || undefined,
      }),
    })
  }

  const clearRegisterDateFilter = () => {
    setDraftRegisterStartDate('')
    setDraftRegisterEndDate('')
    void navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        registerStartDate: undefined,
        registerEndDate: undefined,
      }),
    })
  }

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
            <p className='mt-1 text-xs text-muted-foreground'>
              当前结果：{total.toLocaleString()} 人
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
            <Button
              variant='outline'
              onClick={() => void exportCurrentUsers()}
              disabled={loading || exporting}
            >
              <Download className='mr-1 h-4 w-4' />
              {exporting ? '导出中...' : '导出当前筛选'}
            </Button>
          </div>
        </div>

        <div className='flex flex-wrap items-end gap-2 rounded-md border p-3'>
          <div className='space-y-1'>
            <p className='text-xs text-muted-foreground'>注册开始日期</p>
            <Input
              type='date'
              value={draftRegisterStartDate}
              onChange={(event) =>
                setDraftRegisterStartDate(event.target.value)
              }
              className='h-8 w-[170px]'
            />
          </div>
          <div className='space-y-1'>
            <p className='text-xs text-muted-foreground'>注册结束日期</p>
            <Input
              type='date'
              value={draftRegisterEndDate}
              onChange={(event) => setDraftRegisterEndDate(event.target.value)}
              className='h-8 w-[170px]'
            />
          </div>
          <Button
            variant='outline'
            className='h-8'
            onClick={applyRegisterDateFilter}
          >
            应用注册日期筛选
          </Button>
          <Button
            variant='ghost'
            className='h-8'
            onClick={clearRegisterDateFilter}
            disabled={!search.registerStartDate && !search.registerEndDate}
          >
            清空日期
          </Button>
          {search.registerStartDate || search.registerEndDate ? (
            <p className='text-xs text-muted-foreground'>
              当前注册日期：{search.registerStartDate || '不限'} ~{' '}
              {search.registerEndDate || '不限'}
            </p>
          ) : null}
        </div>

        {error ? <p className='text-sm text-red-600'>{error}</p> : null}
        {loading ? (
          <p className='text-sm text-muted-foreground'>正在加载用户数据...</p>
        ) : null}

        <UsersTable data={users} total={total} search={search} navigate={navigate} />
      </Main>

      <UsersDialogs />
    </UsersProvider>
  )
}
