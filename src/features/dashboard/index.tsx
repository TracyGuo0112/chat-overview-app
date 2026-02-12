import { useEffect, useMemo, useState } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, RefreshCw, Star } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type MembershipValue = 'all' | '免费版' | '微光版' | '烛照版' | '洞见版'
type DateRangeValue = 'all' | '1d' | '7d' | '30d'
type RemainingValue = 'all' | '0-10' | '10+'

interface OverviewKpis {
  totalRegisteredUsers: number
  todayActiveUsers: number
  currentOnlineUsers: number
  currentSubscribedUsers: number
}

interface OverviewRow {
  conversationId: string
  customerId: string
  nickname: string
  emailMasked: string
  lastMessage: string
  lastActiveAt: string
  status: 'new' | 'in_progress' | 'resolved' | 'failed'
  membershipLevel: Exclude<MembershipValue, 'all'>
  isSubscribed: boolean
  totalChatCount: number
  remainingAiChatCount: number
  sensitiveHit: boolean
  sensitiveTypes: string[]
  important: boolean
}

interface OverviewPayload {
  kpis: OverviewKpis
  total: number
  rows: OverviewRow[]
}

const defaultKpis: OverviewKpis = {
  totalRegisteredUsers: 0,
  todayActiveUsers: 0,
  currentOnlineUsers: 0,
  currentSubscribedUsers: 0,
}

const route = getRouteApi('/_authenticated/')

export function Dashboard() {
  const search = route.useSearch()
  const routeNavigate = route.useNavigate()
  const navigate = useNavigate()
  const customerIdFilter = (search.customerId || '').trim()
  const [dateRange, setDateRange] = useState<DateRangeValue>('all')
  const [membership, setMembership] = useState<MembershipValue>('all')
  const [remaining, setRemaining] = useState<RemainingValue>('all')
  const [keyword, setKeyword] = useState('')
  const [kpis, setKpis] = useState<OverviewKpis>(defaultKpis)
  const [rows, setRows] = useState<OverviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(30)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([id]) => id),
    [selected]
  )

  const allChecked =
    rows.length > 0 && rows.every((x) => selected[x.conversationId])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const requestedLimit = customerIdFilter ? '5000' : '15'
      const qs = new URLSearchParams({
        limit: requestedLimit,
        offset: '0',
        dateRange,
        membership,
        remaining,
        q: keyword,
      })
      if (customerIdFilter) qs.set('customerId', customerIdFilter)
      const resp = await fetch(`/api/overview?${qs.toString()}`)
      const raw = await resp.text()
      let data:
        | (Partial<OverviewPayload> & { error?: string; message?: string })
        | null = null

      if (raw.trim()) {
        try {
          data = JSON.parse(raw)
        } catch {
          throw new Error(`接口返回非JSON内容（HTTP ${resp.status}）`)
        }
      }

      if (!resp.ok) {
        throw new Error(data?.message ?? `请求失败（HTTP ${resp.status}）`)
      }
      if (!data) {
        throw new Error('接口返回空内容')
      }
      setKpis({ ...defaultKpis, ...(data.kpis ?? {}) })
      const normalizedRows = (data.rows ?? []).map((row) => ({
        ...row,
        totalChatCount: Number(
          (row as Partial<OverviewRow> & { total_chat_count?: number | string })
            .totalChatCount ??
            (
              row as Partial<OverviewRow> & {
                total_chat_count?: number | string
              }
            ).total_chat_count ??
            0
        ),
        remainingAiChatCount: Number(
          (
            row as Partial<OverviewRow> & {
              remaining_ai_chat_count?: number | string
            }
          ).remainingAiChatCount ??
            (
              row as Partial<OverviewRow> & {
                remaining_ai_chat_count?: number | string
              }
            ).remaining_ai_chat_count ??
            0
        ),
      }))
      setRows(normalizedRows)
      setTotal(data.total ?? 0)
      setSelected((prev) => {
        const next: Record<string, boolean> = {}
        for (const row of normalizedRows) {
          if (prev[row.conversationId]) next[row.conversationId] = true
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadData()
      setCountdown(30)
    }, 300)
    return () => window.clearTimeout(t)
  }, [dateRange, membership, remaining, keyword, customerIdFilter])

  useEffect(() => {
    void loadData()
    const timer = window.setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          void loadData()
          return 30
        }
        return v - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const runBatchAction = (label: string) => {
    if (selectedIds.length === 0) {
      window.alert('请先勾选至少一条会话')
      return
    }
    window.alert(`${label}: ${selectedIds.length} 条（下一步可接真实接口）`)
  }

  const customerInitial = (row: OverviewRow) => {
    const source = (row.nickname || row.customerId || '?').trim()
    return source.charAt(0).toUpperCase()
  }

  const membershipBadgeClass = (level: OverviewRow['membershipLevel']) => {
    if (level === '洞见版')
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    if (level === '烛照版')
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30'
    if (level === '微光版')
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
    return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'
  }

  const remainingBadgeVariant = (
    remaining: number
  ): 'outline' | 'secondary' | 'destructive' => {
    if (remaining <= 3) return 'destructive'
    if (remaining <= 10) return 'secondary'
    return 'outline'
  }

  const shortConversationId = (id: string) => {
    if (!id) return '-'
    if (id.length <= 14) return id
    return `${id.slice(0, 8)}...${id.slice(-6)}`
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return (
    <>
      <Header>
        <TopNav links={topNav} />
        <div className='ms-auto flex items-center space-x-4'>
          <Search placeholder='搜索' />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>会话总览</h1>
            <p className='text-sm text-muted-foreground'>
              运营 10 秒查看最新会话（展示最新 10-15
              条），支持快速筛选与批量处理
            </p>
          </div>
          <Button
            variant='outline'
            className='gap-2'
            onClick={() => {
              setCountdown(30)
              void loadData()
            }}
          >
            <RefreshCw className='h-4 w-4' />
            立即刷新（{countdown}s）
          </Button>
        </div>

        <div className='mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>当前注册总人数</CardDescription>
              <CardTitle className='text-2xl'>
                {Number(kpis.totalRegisteredUsers ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>今日活跃用户数</CardDescription>
              <CardTitle className='text-2xl'>
                {Number(kpis.todayActiveUsers ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>当前在线人数（5分钟内）</CardDescription>
              <CardTitle className='text-2xl'>
                {Number(kpis.currentOnlineUsers ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>当前订阅人数</CardDescription>
              <CardTitle className='text-2xl'>
                {Number(kpis.currentSubscribedUsers ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className='mb-4'>
          <CardHeader>
            <CardTitle>快速筛选</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <Select
              value={dateRange}
              onValueChange={(v) => setDateRange(v as DateRangeValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder='日期' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>日期：全部</SelectItem>
                <SelectItem value='1d'>最近1天</SelectItem>
                <SelectItem value='7d'>最近7天</SelectItem>
                <SelectItem value='30d'>最近30天</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={membership}
              onValueChange={(v) => setMembership(v as MembershipValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder='订阅状态' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>订阅状态：全部</SelectItem>
                <SelectItem value='免费版'>免费版</SelectItem>
                <SelectItem value='微光版'>微光版</SelectItem>
                <SelectItem value='烛照版'>烛照版</SelectItem>
                <SelectItem value='洞见版'>洞见版</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={remaining}
              onValueChange={(v) => setRemaining(v as RemainingValue)}
            >
              <SelectTrigger>
                <SelectValue placeholder='剩余对话次数' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>剩余对话次数：全部</SelectItem>
                <SelectItem value='0-10'>0-10次</SelectItem>
                <SelectItem value='10+'>10次以上</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder='搜索客户ID / 邮箱 / 对话关键词'
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </CardContent>
        </Card>
        {customerIdFilter ? (
          <div className='mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2'>
            <Badge variant='outline'>
              当前仅查看用户 {customerIdFilter} 的全部历史会话
            </Badge>
            <Button
              variant='ghost'
              size='sm'
              onClick={() =>
                routeNavigate({
                  to: '/',
                  search: () => ({ customerId: undefined }),
                })
              }
            >
              返回全部会话
            </Button>
          </div>
        ) : null}

        <Card>
          <CardHeader className='gap-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <CardTitle>最新会话列表</CardTitle>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  onClick={() => runBatchAction('批量标记已处理')}
                >
                  批量标记已处理
                </Button>
                <Button
                  variant='outline'
                  onClick={() => runBatchAction('批量加标签')}
                >
                  批量加标签
                </Button>
                <Button
                  variant='outline'
                  onClick={() => runBatchAction('批量导出')}
                >
                  批量导出
                </Button>
              </div>
            </div>
            <CardDescription>
              当前筛选命中 {total} 条，默认展示最新 15 条。
              {selectedIds.length > 0 ? ` 已选 ${selectedIds.length} 条` : ''}
            </CardDescription>
            {error && (
              <p className='flex items-center gap-2 text-sm text-destructive'>
                <AlertTriangle className='h-4 w-4' />
                {error}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(val) => {
                        const checked = Boolean(val)
                        const next: Record<string, boolean> = {}
                        for (const row of rows) {
                          if (checked) next[row.conversationId] = true
                        }
                        setSelected(next)
                      }}
                    />
                  </TableHead>
                  <TableHead className='w-16'>重点</TableHead>
                  <TableHead className='w-44'>会话ID（缩略）</TableHead>
                  <TableHead>客户信息</TableHead>
                  <TableHead className='max-w-96'>最近一条消息</TableHead>
                  <TableHead>最后活跃时间</TableHead>
                  <TableHead>订阅版本｜对话进度</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.conversationId}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selected[row.conversationId])}
                        onCheckedChange={(val) => {
                          setSelected((prev) => ({
                            ...prev,
                            [row.conversationId]: Boolean(val),
                          }))
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Star
                        className={`h-4 w-4 ${row.important ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground'}`}
                      />
                    </TableCell>
                    <TableCell
                      className='font-medium'
                      title={row.conversationId}
                    >
                      {shortConversationId(row.conversationId)}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-3'>
                        <Avatar className='h-9 w-9'>
                          <AvatarFallback>
                            {customerInitial(row)}
                          </AvatarFallback>
                        </Avatar>
                        <div className='min-w-0'>
                          <div className='truncate font-medium'>
                            {row.nickname || '未知用户'}
                          </div>
                          <div className='truncate text-xs text-muted-foreground'>
                            {row.emailMasked || '-'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell
                      className='max-w-96 truncate'
                      title={row.lastMessage}
                    >
                      {row.lastMessage || '-'}
                    </TableCell>
                    <TableCell>{fmtTime(row.lastActiveAt)}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-1'>
                        <Badge
                          variant='outline'
                          className={membershipBadgeClass(row.membershipLevel)}
                        >
                          {row.membershipLevel}
                        </Badge>
                        <Badge variant='outline'>
                          已对话 {row.totalChatCount}
                        </Badge>
                        <Badge
                          variant={remainingBadgeVariant(
                            row.remainingAiChatCount
                          )}
                        >
                          剩余 {row.remainingAiChatCount}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          navigate({
                            to: '/conversations/$conversationId',
                            params: { conversationId: row.conversationId },
                            search: () =>
                              customerIdFilter
                                ? { customerId: customerIdFilter }
                                : { customerId: undefined },
                          })
                        }
                      >
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading && rows.length === 0 && (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                当前筛选无数据
              </p>
            )}
            {loading && (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                数据加载中...
              </p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: '会话总览',
    href: '/',
    isActive: true,
    disabled: false,
  },
]
