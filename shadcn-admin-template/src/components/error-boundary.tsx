import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className='flex h-full min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center'>
          <AlertTriangle className='h-10 w-10 text-destructive' />
          <div>
            <p className='font-medium'>页面加载出错</p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {this.state.error.message || '发生了未知错误'}
            </p>
          </div>
          <Button variant='outline' size='sm' onClick={this.reset}>
            <RefreshCw className='mr-2 h-4 w-4' />
            重试
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
