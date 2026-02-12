import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  MessageSquare,
  Pin,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from '@/components/ai-elements/message'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type ConversationMessage = {
  id: string
  role: string
  text: string
  feedback: string | null
  createdAt: string
}

type ConversationDetail = {
  conversationId: string
  customerId: string
  nickname: string
  emailMasked: string
  membershipLevel: '免费版' | '微光版' | '烛照版' | '洞见版'
  isSubscribed: boolean
  remainingAiChatCount: number
  important: boolean
  createdAt: string
  lastActiveAt: string
  messages: ConversationMessage[]
}

function fmtTime(iso?: string) {
  if (!iso) return '-'
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

function roleLabel(role: string) {
  if (role === 'user') return '客户'
  if (role === 'assistant') return 'AI'
  if (role === 'system') return '系统'
  if (role === 'tool') return '工具'
  return role || '未知'
}

function normalizedRole(role: string): 'user' | 'assistant' | 'system' {
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  if (role === 'system') return 'system'
  return 'assistant'
}

function responseTypographyClass(role: string) {
  const base =
    'w-full font-serif text-base leading-relaxed whitespace-pre-wrap break-words [text-wrap:pretty] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_p]:leading-relaxed [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-base [&_h4]:font-semibold [&_ul]:my-1.5 [&_ol]:my-1.5 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg [&_th]:border [&_th]:bg-muted/50 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_td]:border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_[data-streamdown=table]]:mx-auto [&_[data-streamdown=table]]:my-3 [&_[data-streamdown=unordered-list]]:list-disc [&_[data-streamdown=unordered-list]]:pl-5 [&_[data-streamdown=ordered-list]]:list-decimal [&_[data-streamdown=ordered-list]]:pl-5'
  if (role === 'user') return `${base} text-zinc-900`
  return `${base} text-black/85`
}

function formatMessageForDisplay(text: string) {
  if (!text) return ''

  const splitPipeCells = (line: string) =>
    line
      .replace(/[｜¦]/g, '|')
      .trim()
      .replace(/^\|+/, '')
      .replace(/\|+$/, '')
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)

  const isSepCell = (cell: string) => /^:?-{2,}:?$/.test(cell)

  const normalizeRowLength = (cells: string[], colCount: number) => {
    const row = [...cells]
    if (row.length > colCount) {
      return [...row.slice(0, colCount - 1), row.slice(colCount - 1).join(' ')]
    }
    while (row.length < colCount) row.push('')
    return row
  }

  const buildMarkdownTable = (headers: string[], bodyRows: string[][]) => {
    const colCount = Math.max(
      2,
      headers.length,
      ...bodyRows.map((x) => x.length)
    )
    const safeHeaders = normalizeRowLength(
      headers.map((h, i) => h || `列${i + 1}`),
      colCount
    )

    const safeRows = bodyRows
      .map((row) => normalizeRowLength(row, colCount))
      .filter((row) => row.some((cell) => cell.length > 0))

    if (safeRows.length === 0) safeRows.push(Array(colCount).fill('-'))

    return [
      `| ${safeHeaders.join(' | ')} |`,
      `| ${Array(colCount).fill('---').join(' | ')} |`,
      ...safeRows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n')
  }

  const rowsToBullets = (rows: string[][]) =>
    rows
      .filter((row) => row.some((cell) => cell.length > 0))
      .map((row) => {
        if (row.length === 1) return `- ${row[0]}`
        return `- ${row[0]}：${row.slice(1).join('；')}`
      })
      .join('\n')

  const chunkTokensToRows = (tokens: string[], colCount: number) => {
    const out: string[][] = []
    for (let i = 0; i < tokens.length; i += colCount) {
      const row = tokens.slice(i, i + colCount)
      while (row.length < colCount) row.push('')
      out.push(row)
    }
    return out
  }

  const extractMixedInlineTable = (cells: string[]) => {
    const firstSep = cells.findIndex((cell) => isSepCell(cell))
    if (firstSep < 0) return null

    let sepCount = 0
    for (let i = firstSep; i < cells.length; i += 1) {
      if (!isSepCell(cells[i])) break
      sepCount += 1
    }

    if (sepCount < 2 || firstSep < sepCount) return null

    const headerStart = firstSep - sepCount
    const headers = cells.slice(headerStart, firstSep)
    if (headers.length === 0 || headers.some((h) => isSepCell(h))) return null

    return {
      prefixRows: headerStart > 0 ? [cells.slice(0, headerStart)] : [],
      headers,
      bodyTokens: cells.slice(firstSep + sepCount),
    }
  }

  const looksLikeAge = (value: string) =>
    /^\(?\d{1,3}\s*[-~至]\s*\d{1,3}岁?\)?$/.test(value)

  const looksLikeParen = (value: string) => /^[（(].+[）)]$/.test(value)

  const isLikelyRowLabel = (cells: string[]) =>
    cells.length === 1 &&
    cells[0].length > 0 &&
    cells[0].length <= 8 &&
    !isSepCell(cells[0])

  const rebuildFourColRowsFromBlocks = (rawRows: string[][]) => {
    const labelIndexes = rawRows
      .map((cells, idx) => (isLikelyRowLabel(cells) ? idx : -1))
      .filter((idx) => idx >= 0)

    if (labelIndexes.length === 0) return null

    const result: string[][] = []

    for (let i = 0; i < labelIndexes.length; i += 1) {
      const start = labelIndexes[i]
      const end =
        i + 1 < labelIndexes.length ? labelIndexes[i + 1] : rawRows.length

      const label = rawRows[start][0]
      const fragments = rawRows
        .slice(start + 1, end)
        .flat()
        .filter((cell) => cell.length > 0 && !isSepCell(cell))

      let ptr = 0
      let col1 = label
      if (ptr < fragments.length && looksLikeAge(fragments[ptr])) {
        col1 = `${col1} ${fragments[ptr]}`
        ptr += 1
      }

      const takeCol = () => {
        if (ptr >= fragments.length) return ''
        let value = fragments[ptr]
        ptr += 1

        if (ptr < fragments.length && looksLikeParen(fragments[ptr])) {
          value = `${value} ${fragments[ptr]}`
          ptr += 1
        }

        return value
      }

      const col2 = takeCol()
      let col3 = takeCol()

      if (
        ptr < fragments.length &&
        fragments[ptr].length <= 12 &&
        !/[。！？:：]/.test(fragments[ptr])
      ) {
        col3 = col3 ? `${col3} ${fragments[ptr]}` : fragments[ptr]
        ptr += 1
      }

      const col4 = fragments.slice(ptr).join(' ')
      result.push([col1, col2, col3, col4])
    }

    return result
  }

  const convertPipeGroup = (groupLines: string[]) => {
    const rows = groupLines
      .map(splitPipeCells)
      .filter((cells) => cells.length > 0)
    if (rows.length === 0) return ''

    const inline = extractMixedInlineTable(rows[0])
    if (inline) {
      const colCount = Math.max(2, inline.headers.length)
      const tokens = [...inline.bodyTokens]
      for (let i = 1; i < rows.length; i += 1) {
        if (!rows[i].every((c) => isSepCell(c))) tokens.push(...rows[i])
      }
      const bodyRows = chunkTokensToRows(tokens, colCount)
      const prefix = inline.prefixRows.length
        ? `${rowsToBullets(inline.prefixRows)}\n`
        : ''
      return `${prefix}${buildMarkdownTable(inline.headers, bodyRows)}`.trim()
    }

    let headerIndex = -1
    for (let i = 0; i < rows.length - 1; i += 1) {
      if (
        !rows[i].every((c) => isSepCell(c)) &&
        rows[i + 1].every((c) => isSepCell(c))
      ) {
        headerIndex = i
        break
      }
    }

    if (headerIndex >= 0) {
      const headers = rows[headerIndex]
      const colCount = Math.max(2, headers.length)
      const rawBodyRows = rows
        .slice(headerIndex + 2)
        .filter((cells) => !cells.every((c) => isSepCell(c)))

      let bodyRows: string[][]

      if (colCount === 4) {
        const rebuilt = rebuildFourColRowsFromBlocks(rawBodyRows)
        if (rebuilt && rebuilt.length > 0) {
          bodyRows = rebuilt
        } else {
          bodyRows = chunkTokensToRows(rawBodyRows.flat(), colCount)
        }
      } else {
        bodyRows = chunkTokensToRows(rawBodyRows.flat(), colCount)
      }

      const prefix =
        headerIndex > 0 ? `${rowsToBullets(rows.slice(0, headerIndex))}\n` : ''
      return `${prefix}${buildMarkdownTable(headers, bodyRows)}`.trim()
    }

    const maxCols = Math.max(...rows.map((r) => r.length))
    if (rows.length >= 2 && maxCols >= 3) {
      const headers = rows[0]
      const colCount = Math.max(2, headers.length)
      const bodyTokens = rows.slice(1).flat()
      return buildMarkdownTable(
        headers,
        chunkTokensToRows(bodyTokens, colCount)
      )
    }

    return rowsToBullets(rows)
  }

  const normalizePipeGroups = (input: string) => {
    const lines = input.split('\n')
    const out: string[] = []

    for (let i = 0; i < lines.length; i += 1) {
      if (!/[|｜¦]/.test(lines[i])) {
        out.push(lines[i])
        continue
      }

      const group: string[] = [lines[i]]
      let j = i + 1
      while (j < lines.length && /[|｜¦]/.test(lines[j])) {
        group.push(lines[j])
        j += 1
      }

      const converted = convertPipeGroup(group)
      if (converted) out.push(converted)
      i = j - 1
    }

    return out.join('\n')
  }

  const normalized = normalizePipeGroups(
    text
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/^\s*---+\s*(#{1,6}\s*)/gm, '$1')
      .replace(/^\s*[-*_]{3,}\s*$/gm, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\s+([•·])\s+/g, '\n- ')
      .replace(/\n?([0-9]+)[、]\s+/g, '\n$1. ')
      .replace(/([。！？])\s+(?=[^\n])/g, '$1\n')
  )
    .split('\n')
    .map((line) => line.replace(/^[\u3000\s]+/, ''))
    .map((line) =>
      line.replace(/^([一二三四五六七八九十]+[、.．]\s*.+)$/u, '## $1')
    )
    .map((line) => line.replace(/^\|?(?:\s*\|)+\s*$/, ''))
    .join('\n')

  return normalized.replace(/\n{3,}/g, '\n\n').trim()
}

function roleBadgeClass(role: string) {
  if (role === 'user') return 'bg-blue-500/10 text-blue-700 border-blue-500/25'
  if (role === 'assistant')
    return 'bg-violet-500/10 text-violet-700 border-violet-500/25'
  if (role === 'system')
    return 'bg-amber-500/10 text-amber-700 border-amber-500/25'
  return 'bg-slate-500/10 text-slate-700 border-slate-500/25'
}

export function ConversationDetailPage({
  conversationId,
  customerIdFilter,
}: {
  conversationId: string
  customerIdFilter?: string
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [copiedId, setCopiedId] = useState('')

  async function loadDetail() {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(
        `/api/conversation/${encodeURIComponent(conversationId)}`
      )
      const raw = await resp.text()
      const data = raw ? JSON.parse(raw) : null
      if (!resp.ok) {
        throw new Error(data?.message ?? `请求失败（HTTP ${resp.status}）`)
      }
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '详情加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
  }, [conversationId])

  const messages = detail?.messages ?? []
  const messageCount = messages.length
  const firstUserIndex = useMemo(
    () => messages.findIndex((x) => normalizedRole(x.role) === 'user'),
    [messages]
  )
  const firstAiIndex = useMemo(
    () => messages.findIndex((x) => normalizedRole(x.role) === 'assistant'),
    [messages]
  )

  const downloadMessages = useMemo(
    () =>
      messages.map((msg) => ({
        role: normalizedRole(msg.role),
        content: msg.text || '(空消息)',
      })),
    [messages]
  )

  const scrollToMessage = (index: number) => {
    if (index < 0) return
    const el = document.getElementById(`msg-${index}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text || '')
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(''), 1200)
    } catch {
      setCopiedId('')
    }
  }

  return (
    <>
      <Header>
        <TopNav
          links={[
            {
              title: '会话详情',
              href: `/conversations/${conversationId}`,
              isActive: true,
              disabled: false,
            },
          ]}
        />
        <div className='ms-auto flex items-center space-x-4'>
          <Search placeholder='搜索' />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              onClick={() =>
                navigate({
                  to: '/',
                  search: () =>
                    customerIdFilter
                      ? { customerId: customerIdFilter }
                      : { customerId: undefined },
                })
              }
            >
              <ArrowLeft className='mr-1 h-4 w-4' /> 返回总览
            </Button>
            <h1 className='text-2xl font-bold tracking-tight'>会话详情</h1>
          </div>
          <Button
            variant='outline'
            className='gap-2'
            onClick={() => void loadDetail()}
          >
            <RefreshCw className='h-4 w-4' /> 刷新详情
          </Button>
        </div>

        {error && (
          <Card className='mb-4 border-red-300'>
            <CardContent className='py-4 text-sm text-red-600'>
              {error}
            </CardContent>
          </Card>
        )}

        <div className='grid gap-4 xl:grid-cols-[3fr_1fr]'>
          <Card className='min-h-[78vh]'>
            <CardHeader className='space-y-3'>
              <div>
                <CardTitle>消息记录</CardTitle>
                <CardDescription>
                  样式对齐 metasight：admin 紧凑排版 + 表格优先渲染
                </CardDescription>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => scrollToMessage(0)}
                >
                  <ArrowUp className='mr-1 h-4 w-4' /> 第一条
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => scrollToMessage(firstUserIndex)}
                  disabled={firstUserIndex < 0}
                >
                  客户首条
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => scrollToMessage(firstAiIndex)}
                  disabled={firstAiIndex < 0}
                >
                  AI首条
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => scrollToMessage(Math.max(0, messageCount - 1))}
                  disabled={messageCount === 0}
                >
                  <ArrowDown className='mr-1 h-4 w-4' /> 最新消息
                </Button>
                <Badge variant='secondary'>共 {messageCount} 条</Badge>
              </div>
            </CardHeader>

            <CardContent className='h-[72vh]'>
              <Conversation className='h-full rounded-xl border'>
                <ConversationContent className='gap-3 p-6 md:p-7'>
                  {!loading && messageCount === 0 && (
                    <ConversationEmptyState
                      icon={<MessageSquare className='size-10' />}
                      title='开始会话'
                      description='消息会随着对话进行展示在这里'
                    />
                  )}

                  {loading && (
                    <p className='text-sm text-muted-foreground'>加载中...</p>
                  )}

                  {messages.map((msg, index) => {
                    const role = normalizedRole(msg.role)
                    return (
                      <Message
                        key={msg.id}
                        from={role}
                        id={`msg-${index}`}
                        className={role === 'assistant' ? 'max-w-full' : ''}
                      >
                        <MessageToolbar className='mt-0'>
                          <div className='flex items-center gap-2 text-xs'>
                            <Badge
                              variant='outline'
                              className={roleBadgeClass(msg.role)}
                            >
                              {roleLabel(msg.role)}
                            </Badge>
                            {msg.feedback ? (
                              <Badge variant='secondary'>
                                反馈：{msg.feedback}
                              </Badge>
                            ) : null}
                            <span className='text-muted-foreground'>
                              #{index + 1}
                            </span>
                          </div>

                          <MessageActions>
                            <span className='text-xs text-muted-foreground'>
                              {fmtTime(msg.createdAt)}
                            </span>
                            <MessageAction
                              tooltip='复制消息'
                              label='复制消息'
                              onClick={() =>
                                void copyText(msg.id, msg.text || '')
                              }
                            >
                              <Copy className='h-4 w-4' />
                            </MessageAction>
                          </MessageActions>
                        </MessageToolbar>

                        <MessageContent className='max-w-[100ch]'>
                          <MessageResponse
                            className={responseTypographyClass(msg.role)}
                          >
                            {formatMessageForDisplay(msg.text || '(空消息)')}
                          </MessageResponse>
                        </MessageContent>

                        {copiedId === msg.id ? (
                          <p className='text-xs text-muted-foreground'>
                            已复制
                          </p>
                        ) : null}
                      </Message>
                    )
                  })}
                </ConversationContent>

                <ConversationDownload
                  messages={downloadMessages}
                  filename={`conversation-${detail?.conversationId ?? conversationId}.md`}
                />
                <ConversationScrollButton />
              </Conversation>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                会话信息
                {detail?.important ? (
                  <Pin className='h-4 w-4 text-yellow-500' />
                ) : null}
              </CardTitle>
              <CardDescription className='break-all'>
                会话ID：{detail?.conversationId ?? conversationId}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <p className='text-xs text-muted-foreground'>客户</p>
                <p className='font-medium'>{detail?.nickname ?? '-'}</p>
                <p className='text-xs text-muted-foreground'>
                  {detail?.emailMasked ?? '-'}
                </p>
              </div>

              <div>
                <p className='text-xs text-muted-foreground'>客户ID</p>
                <p className='font-medium break-all'>
                  {detail?.customerId ?? '-'}
                </p>
              </div>

              <div>
                <p className='text-xs text-muted-foreground'>会员状态</p>
                <div className='mt-1 flex flex-wrap items-center gap-2'>
                  <Badge variant='outline'>
                    {detail?.membershipLevel ?? '-'}
                  </Badge>
                  <Badge
                    variant={detail?.isSubscribed ? 'default' : 'secondary'}
                  >
                    {detail?.isSubscribed ? '已订阅' : '未订阅'}
                  </Badge>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  剩余AI对话：{Number(detail?.remainingAiChatCount ?? 0)}
                </p>
              </div>

              <div>
                <p className='text-xs text-muted-foreground'>时间与规模</p>
                <p className='text-sm'>创建：{fmtTime(detail?.createdAt)}</p>
                <p className='text-sm'>活跃：{fmtTime(detail?.lastActiveAt)}</p>
                <p className='text-sm'>消息：{messageCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
