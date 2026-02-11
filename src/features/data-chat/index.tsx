import { useMemo, useState } from 'react'
import { Copy, Database, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
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

interface DbChatResponse {
  answer: string
  executedSql?: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
}

const promptExamples = [
  '今天新增注册用户有多少？',
  '当前订阅人数是多少？',
  '会员等级分布给我看一下',
  '剩余次数为 0 的用户有多少？',
  '最近 10 条会话列表',
]

const initialAssistantMessage = `你好，我是数据库问答助手。

你可以直接问我：
- 今天新增注册用户有多少？
- 当前在线人数是多少？
- 当前订阅人数是多少？
- 会员等级分布
- 最近 10 条会话列表

我会返回可读结果，并附上执行 SQL。`

function nextId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function DataChat() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: 'assistant', content: initialAssistantMessage },
  ])

  const canSend = useMemo(
    () => input.trim().length > 0 && !loading,
    [input, loading]
  )

  const appendMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message])
  }

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim()
    if (!text || loading) return

    appendMessage({ id: nextId(), role: 'user', content: text })
    setInput('')
    setLoading(true)

    try {
      const resp = await fetch('/api/db-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      const raw = await resp.text()
      let payload: DbChatResponse | null = null
      if (raw.trim()) {
        payload = JSON.parse(raw) as DbChatResponse
      }

      if (!resp.ok) {
        if (resp.status === 404) {
          throw new Error(
            '接口不存在（/api/db-chat）。请在 /Users/lisa/AI/chat-overview-app 运行 npm run dev 重启后端。'
          )
        }
        throw new Error(payload?.answer || `请求失败（HTTP ${resp.status}）`)
      }

      appendMessage({
        id: nextId(),
        role: 'assistant',
        content: payload?.answer || '没有返回结果。',
        sql: payload?.executedSql,
      })
    } catch (error) {
      appendMessage({
        id: nextId(),
        role: 'assistant',
        content: `查询失败：${error instanceof Error ? error.message : '未知错误'}`,
      })
    } finally {
      setLoading(false)
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.alert('复制失败，请手动复制')
    }
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

      <Main className='flex h-[calc(100vh-4rem)] flex-col gap-4'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>数据问答</h2>
            <p className='text-muted-foreground'>
              像 GPT 一样对话查询数据库（只读）。
            </p>
          </div>
        </div>

        <Card className='flex min-h-0 flex-1 flex-col'>
          <CardHeader className='border-b py-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Database className='size-4' />
              数据库助手
            </CardTitle>
          </CardHeader>

          <CardContent className='flex min-h-0 flex-1 flex-col p-0'>
            <Conversation className='min-h-0 flex-1'>
              <ConversationContent className='gap-5 px-6 py-5'>
                {messages.map((msg) => (
                  <Message key={msg.id} from={msg.role}>
                    <MessageContent
                      className={
                        msg.role === 'assistant'
                          ? 'w-full max-w-full'
                          : undefined
                      }
                    >
                      {msg.role === 'assistant' ? (
                        <MessageResponse>{msg.content}</MessageResponse>
                      ) : (
                        <p className='whitespace-pre-wrap'>{msg.content}</p>
                      )}

                      {msg.role === 'assistant' && msg.sql ? (
                        <MessageToolbar className='mt-2'>
                          <details className='w-full rounded-md border p-2 text-xs text-muted-foreground'>
                            <summary className='cursor-pointer font-medium'>
                              查看执行 SQL
                            </summary>
                            <pre className='mt-2 overflow-x-auto break-words whitespace-pre-wrap'>
                              {msg.sql}
                            </pre>
                          </details>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            onClick={() => copyText(msg.content)}
                            title='复制回答'
                          >
                            <Copy className='size-4' />
                          </Button>
                        </MessageToolbar>
                      ) : null}
                    </MessageContent>
                  </Message>
                ))}

                {loading ? (
                  <Message from='assistant'>
                    <MessageContent>
                      <div className='flex items-center gap-2 text-muted-foreground'>
                        <Sparkles className='size-4 animate-pulse' />
                        正在查询数据库...
                      </div>
                    </MessageContent>
                  </Message>
                ) : null}
              </ConversationContent>

              <ConversationScrollButton />
            </Conversation>

            <div className='border-t p-4'>
              <div className='mb-3 flex flex-wrap gap-2'>
                {promptExamples.map((example) => (
                  <Button
                    key={example}
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => void sendMessage(example)}
                    disabled={loading}
                  >
                    {example}
                  </Button>
                ))}
              </div>

              <form
                className='flex items-end gap-2'
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage()
                }}
              >
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder='输入你想查询的数据问题，回车发送，Shift+回车换行'
                  className='min-h-[44px] flex-1 resize-y'
                />
                <Button type='submit' disabled={!canSend}>
                  <Send className='me-1 size-4' />
                  发送
                </Button>
              </form>
            </div>
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
    title: '数据问答',
    href: '/tasks',
    isActive: true,
    disabled: false,
  },
]
