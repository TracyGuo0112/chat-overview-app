import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

type FunnelPayload = {
  visitors: number | null
  registered: number
  activeUsers: number
  subscribed: number
  renewed: number
  conversion: {
    visitToRegister: number | null
    registerToFirstConversation: number | null
    firstConversationToSubscribe: number | null
    registerToSubscribe?: number | null
    subscribeToRenew: number | null
  }
  visitorSource: {
    event: string
    dedupeBy: string
    status: 'ok' | 'missing_config' | 'missing_project' | 'error' | string
    message: string
  }
}

type TierComparisonItem = {
  tier: '免费版' | '微光版' | '烛照版' | '洞见版' | string
  totalUsers: number
  activeUsers: number
  activeRate: number
  totalUserTurns: number
  avgUserTurnsPerUser: number
  p50UserTurnsPerUser: number
  lowRemainingUsers: number
  lowRemainingRate: number
  exhaustedUsers: number
}

type TierLabel = '免费版' | '微光版' | '烛照版' | '洞见版'

type TrendPoint = {
  date: string
  label: string
  registered: number
  subscribed: number
  renewed: number
  activeUsers: number
}

type MembershipOpsPayload = {
  range: {
    timezone: string
    startDate: string
    endDate: string
  }
  funnel: FunnelPayload
  tierComparison: TierComparisonItem[]
  trend: TrendPoint[]
}

function getDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function shiftDays(base: string, delta: number) {
  const d = new Date(`${base}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return base
  d.setUTCDate(d.getUTCDate() + delta)
  return getDateString(d)
}

function calcPresetRange(preset: '7d' | '30d' | '90d', endDate: string) {
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30
  return {
    startDate: shiftDays(endDate, -(days - 1)),
    endDate,
  }
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '--'
  return `${value.toFixed(2)}%`
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '--'
  return Number(value).toLocaleString('zh-CN')
}

function getTierColor(tier: string) {
  if (tier === '洞见版') return '#f59e0b'
  if (tier === '烛照版') return '#8b5cf6'
  if (tier === '微光版') return '#3b82f6'
  return '#64748b'
}

function isTierLabel(value: string): value is TierLabel {
  return (
    value === '免费版' ||
    value === '微光版' ||
    value === '烛照版' ||
    value === '洞见版'
  )
}

export function MembershipOps() {
  const navigate = useNavigate()
  const [data, setData] = useState<MembershipOpsPayload | null>(null)
  const [draftStartDate, setDraftStartDate] = useState('')
  const [draftEndDate, setDraftEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const appliedRangeRef = useRef<{ startDate: string; endDate: string } | null>(
    null
  )

  const loadData = useCallback(
    async (nextRange?: { startDate: string; endDate: string }) => {
      setLoading(true)
      setError('')

      try {
        const startDate =
          nextRange?.startDate ?? appliedRangeRef.current?.startDate ?? ''
        const endDate =
          nextRange?.endDate ?? appliedRangeRef.current?.endDate ?? ''
        const qs = new URLSearchParams()
        if (startDate && endDate) {
          qs.set('startDate', startDate)
          qs.set('endDate', endDate)
        }

        const url = qs.toString()
          ? `/api/membership-ops?${qs.toString()}`
          : '/api/membership-ops'
        const resp = await fetch(url)
        const raw = await resp.text()
        let payload: MembershipOpsPayload | null = null

        if (raw.trim()) {
          try {
            payload = JSON.parse(raw) as MembershipOpsPayload
          } catch {
            throw new Error(`接口返回非JSON内容（HTTP ${resp.status}）`)
          }
        }

        if (!resp.ok) {
          const message = (payload as unknown as { message?: string } | null)
            ?.message
          throw new Error(message || `请求失败（HTTP ${resp.status}）`)
        }
        if (!payload) {
          throw new Error('接口返回空内容')
        }

        setData(payload)
        setDraftStartDate(payload.range.startDate)
        setDraftEndDate(payload.range.endDate)
        appliedRangeRef.current = {
          startDate: payload.range.startDate,
          endDate: payload.range.endDate,
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '会员运营分析加载失败')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadData()
  }, [])

  const funnelData = useMemo(() => {
    if (!data) return []
    return [
      {
        name: '游客',
        value: data.funnel.visitors ?? 0,
        label: `游客 ${formatNumber(data.funnel.visitors)}`,
      },
      {
        name: '注册',
        value: data.funnel.registered,
        label: `注册 ${formatNumber(data.funnel.registered)}`,
      },
      {
        name: '首次对话',
        value: data.funnel.activeUsers,
        label: `首次对话 ${formatNumber(data.funnel.activeUsers)}`,
      },
      {
        name: '订阅',
        value: data.funnel.subscribed,
        label: `订阅 ${formatNumber(data.funnel.subscribed)}`,
      },
      {
        name: '续费',
        value: data.funnel.renewed,
        label: `续费 ${formatNumber(data.funnel.renewed)}`,
      },
    ]
  }, [data])

  const tierBarData = useMemo(
    () =>
      (data?.tierComparison || []).map((row) => ({
        tier: row.tier,
        avgTurns: row.avgUserTurnsPerUser,
        p50Turns: row.p50UserTurnsPerUser,
        lowRemainingRate: row.lowRemainingRate,
        lowRemainingUsers: row.lowRemainingUsers,
        exhaustedUsers: row.exhaustedUsers,
        totalUsers: row.totalUsers,
        fill: getTierColor(row.tier),
      })),
    [data]
  )

  const goUsersByTier = (tier: string) => {
    if (!isTierLabel(tier)) return
    void navigate({
      to: '/users',
      search: () => ({
        page: 1,
        pageSize: 10,
        nickname: '',
        subscriptionStatus: [tier],
        subscriptionExpired: [] as (
          | '已用完'
          | '未用完'
          | '未过期'
          | '已过期'
        )[],
        source: 'membershipOps' as const,
        startDate: data?.range.startDate || '',
        endDate: data?.range.endDate || '',
      }),
    })
  }

  const goUsersByFunnel = (
    segment: 'registered' | 'firstConversation' | 'subscribed' | 'renewed'
  ) => {
    if (!data) return
    void navigate({
      to: '/users',
      search: () => ({
        page: 1,
        pageSize: 10,
        nickname: '',
        subscriptionStatus: [] as TierLabel[],
        subscriptionExpired: [] as (
          | '已用完'
          | '未用完'
          | '未过期'
          | '已过期'
        )[],
        source: 'membershipOps' as const,
        funnelSegment: segment,
        startDate: data.range.startDate,
        endDate: data.range.endDate,
      }),
    })
  }

  return (
    <>
      <Header fixed>
        <TopNav links={topNav} />
        <div className='ms-auto flex items-center space-x-4'>
          <Search placeholder='搜索' />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>会员运营分析</h2>
            <p className='text-muted-foreground'>
              转化漏斗（游客→注册→首次对话→订阅→续费）与会员分档对比（咨询频次、额度风险）。
            </p>
          </div>
          <Button
            variant='outline'
            className='gap-2'
            onClick={() => void loadData()}
          >
            <RefreshCw className='h-4 w-4' />
            刷新数据
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>时间筛选</CardTitle>
            <CardDescription>
              时区：{data?.range.timezone || 'Asia/Shanghai'}。游客按 PostHog 的
              $pageview（distinct_id 去重）统计。
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-4'>
            <Input
              type='date'
              value={draftStartDate}
              onChange={(event) => setDraftStartDate(event.target.value)}
            />
            <Input
              type='date'
              value={draftEndDate}
              onChange={(event) => setDraftEndDate(event.target.value)}
            />
            <div className='flex gap-2'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => {
                  const baseEnd = draftEndDate || getDateString(new Date())
                  const range = calcPresetRange('7d', baseEnd)
                  setDraftStartDate(range.startDate)
                  setDraftEndDate(range.endDate)
                }}
              >
                最近7天
              </Button>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => {
                  const baseEnd = draftEndDate || getDateString(new Date())
                  const range = calcPresetRange('30d', baseEnd)
                  setDraftStartDate(range.startDate)
                  setDraftEndDate(range.endDate)
                }}
              >
                最近30天
              </Button>
            </div>
            <Button
              onClick={() =>
                void loadData({
                  startDate: draftStartDate,
                  endDate: draftEndDate,
                })
              }
              disabled={!draftStartDate || !draftEndDate}
            >
              应用筛选
            </Button>
          </CardContent>
        </Card>

        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        {loading ? (
          <p className='text-sm text-muted-foreground'>
            正在加载会员运营分析...
          </p>
        ) : null}

        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>游客（访问）</CardDescription>
              <CardTitle className='text-2xl'>
                {formatNumber(data?.funnel.visitors)}
              </CardTitle>
              <CardDescription>来源于 PostHog 去重访客</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>注册（转化率）</CardDescription>
              <CardTitle className='text-2xl'>
                {formatNumber(data?.funnel.registered)}
              </CardTitle>
              <CardDescription>
                {formatPercent(data?.funnel.conversion.visitToRegister)}
              </CardDescription>
              <Button
                variant='ghost'
                size='sm'
                className='mt-1 h-7 justify-start px-0 text-muted-foreground'
                onClick={() => goUsersByFunnel('registered')}
              >
                查看名单
              </Button>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>首次对话（转化率）</CardDescription>
              <CardTitle className='text-2xl'>
                {formatNumber(data?.funnel.activeUsers)}
              </CardTitle>
              <CardDescription>
                {formatPercent(
                  data?.funnel.conversion.registerToFirstConversation
                )}
              </CardDescription>
              <Button
                variant='ghost'
                size='sm'
                className='mt-1 h-7 justify-start px-0 text-muted-foreground'
                onClick={() => goUsersByFunnel('firstConversation')}
              >
                查看名单
              </Button>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>订阅（转化率）</CardDescription>
              <CardTitle className='text-2xl'>
                {formatNumber(data?.funnel.subscribed)}
              </CardTitle>
              <CardDescription>
                {formatPercent(
                  data?.funnel.conversion.firstConversationToSubscribe ??
                    data?.funnel.conversion.registerToSubscribe
                )}
              </CardDescription>
              <Button
                variant='ghost'
                size='sm'
                className='mt-1 h-7 justify-start px-0 text-muted-foreground'
                onClick={() => goUsersByFunnel('subscribed')}
              >
                查看名单
              </Button>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>初次续费（转化率）</CardDescription>
              <CardTitle className='text-2xl'>
                {formatNumber(data?.funnel.renewed)}
              </CardTitle>
              <CardDescription>
                {formatPercent(data?.funnel.conversion.subscribeToRenew)}
              </CardDescription>
              <Button
                variant='ghost'
                size='sm'
                className='mt-1 h-7 justify-start px-0 text-muted-foreground'
                onClick={() => goUsersByFunnel('renewed')}
              >
                查看名单
              </Button>
            </CardHeader>
          </Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>转化漏斗</CardTitle>
              <CardDescription>
                游客 → 注册 → 首次对话 → 订阅 → 初次续费（同邮箱去重；
                首次对话按同注册区间 cohort 截至区间结束统计）。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[320px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <FunnelChart>
                    <Tooltip
                      formatter={(value) => formatNumber(Number(value))}
                    />
                    <Funnel data={funnelData} dataKey='value' isAnimationActive>
                      <LabelList
                        position='right'
                        dataKey='label'
                        fill='currentColor'
                        stroke='none'
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
              <p className='mt-2 text-xs text-muted-foreground'>
                游客来源：{data?.funnel.visitorSource.message || '-'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>分档咨询频次</CardTitle>
              <CardDescription>
                按消息发生时档位归因：人均用户消息轮数 + 中位数（P50）。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[320px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={tierBarData}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis dataKey='tier' />
                    <YAxis allowDecimals />
                    <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                    <Legend />
                    <Bar
                      dataKey='avgTurns'
                      name='人均轮数'
                      radius={[6, 6, 0, 0]}
                    >
                      {tierBarData.map((entry) => (
                        <Cell
                          key={`avg-turns-${entry.tier}`}
                          fill={entry.fill}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey='p50Turns'
                      name='中位数(P50)'
                      fill='#ef4444'
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>转化趋势（按天）</CardTitle>
            <CardDescription>
              展示活跃用户（与主页“今日对话用户数”同口径）、注册、订阅、续费人数的每日趋势。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='h-[340px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={data?.trend || []}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} />
                  <XAxis dataKey='label' minTickGap={24} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type='monotone'
                    dataKey='activeUsers'
                    name='活跃用户'
                    stroke='#10b981'
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type='monotone'
                    dataKey='registered'
                    name='注册'
                    stroke='#64748b'
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type='monotone'
                    dataKey='subscribed'
                    name='订阅'
                    stroke='#3b82f6'
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type='monotone'
                    dataKey='renewed'
                    name='续费'
                    stroke='#ef4444'
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>分档明细表</CardTitle>
            <CardDescription>
              活跃度按当前会员档位统计；咨询频次按消息发生时会员档位归因（同一用户跨档会拆分到不同档位）。
            </CardDescription>
            <CardDescription>
              可直接下钻到用户管理，再点击用户行查看其完整历史会话。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会员档位</TableHead>
                  <TableHead className='text-right'>总用户数</TableHead>
                  <TableHead className='text-right'>活跃用户数</TableHead>
                  <TableHead className='text-right'>活跃率</TableHead>
                  <TableHead className='text-right'>
                    用户消息轮数（总）
                  </TableHead>
                  <TableHead className='text-right'>人均用户消息轮数</TableHead>
                  <TableHead className='text-right'>中位数（P50）</TableHead>
                  <TableHead className='text-right'>
                    低剩余额度用户数（≤3）
                  </TableHead>
                  <TableHead className='text-right'>低剩余额度占比</TableHead>
                  <TableHead className='text-right'>
                    已用完用户数（=0）
                  </TableHead>
                  <TableHead className='text-center'>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.tierComparison || []).map((row) => (
                  <TableRow key={row.tier}>
                    <TableCell className='font-medium'>{row.tier}</TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(row.totalUsers)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(row.activeUsers)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatPercent(row.activeRate)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(row.totalUserTurns)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {row.avgUserTurnsPerUser.toFixed(2)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {row.p50UserTurnsPerUser.toFixed(2)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(row.lowRemainingUsers)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatPercent(row.lowRemainingRate)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(row.exhaustedUsers)}
                    </TableCell>
                    <TableCell className='text-center'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => goUsersByTier(row.tier)}
                      >
                        查看用户
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    isActive: false,
    disabled: false,
  },
  {
    title: '会员运营分析',
    href: '/membership-ops',
    isActive: true,
    disabled: false,
  },
]
