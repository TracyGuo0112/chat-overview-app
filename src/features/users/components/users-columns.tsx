import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type User } from '../data/schema'

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

function subscriptionBadgeClass(level: string) {
  if (level === '微光版') {
    return 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
  }
  if (level === '烛照版') {
    return 'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
  }
  if (level === '洞见版') {
    return 'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300'
  }
  return 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
}

function expiryBadgeClass(value: string) {
  if (value === '已过期' || value === '已用完') {
    return 'border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300'
  }
  if (value === '未过期' || value === '未用完') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
  }
  return 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
}

export const usersColumns: ColumnDef<User>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <div className='flex justify-center'>
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      </div>
    ),
    meta: {
      className: cn('max-md:sticky start-0 z-10 rounded-tl-[inherit]'),
      thClassName: 'px-2 text-center align-middle',
      tdClassName: 'px-2 text-center align-middle',
    },
    cell: ({ row }) => (
      <div className='flex justify-center'>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-[2px]'
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'nickname',
    header: ({ column }) => <DataTableColumnHeader column={column} title='昵称' className='justify-center' />,
    cell: ({ row }) => (
      <LongText className='mx-auto max-w-40 text-center md:max-w-56'>
        {row.original.nickname || row.original.username || '-'}
      </LongText>
    ),
    meta: {
      className: cn(
        'drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)]',
        'ps-0.5 max-md:sticky start-6 @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title='邮箱' className='justify-center' />,
    cell: ({ row }) => (
      <LongText className='mx-auto max-w-56 text-center md:max-w-72'>
        {String(row.getValue('email') || '-')}
      </LongText>
    ),
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title='注册时间' className='justify-center' />,
    cell: ({ row }) => (
      <div className='text-center text-nowrap'>{formatDateTime(row.getValue('createdAt'))}</div>
    ),
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    sortingFn: (rowA, rowB, columnId) => {
      const tsA = new Date(String(rowA.getValue(columnId) || '')).getTime()
      const tsB = new Date(String(rowB.getValue(columnId) || '')).getTime()
      return (Number.isNaN(tsA) ? 0 : tsA) - (Number.isNaN(tsB) ? 0 : tsB)
    },
    enableHiding: false,
  },
  {
    accessorKey: 'gender',
    header: ({ column }) => <DataTableColumnHeader column={column} title='性别' className='justify-center' />,
    cell: ({ row }) => <div className='text-center'>{row.original.gender || '-'}</div>,
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'userAge',
    header: ({ column }) => <DataTableColumnHeader column={column} title='用户年龄' className='justify-center' />,
    cell: ({ row }) => {
      const age = row.original.userAge
      return <div className='text-center'>{typeof age === 'number' ? age : '-'}</div>
    },
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    sortingFn: (rowA, rowB, columnId) => {
      const ageA = Number(rowA.getValue(columnId))
      const ageB = Number(rowB.getValue(columnId))
      const normalizedA = Number.isNaN(ageA) ? -1 : ageA
      const normalizedB = Number.isNaN(ageB) ? -1 : ageB
      return normalizedA - normalizedB
    },
    enableHiding: false,
  },
  {
    accessorKey: 'subscriptionStatus',
    header: ({ column }) => <DataTableColumnHeader column={column} title='订阅状态' className='justify-center' />,
    cell: ({ row }) => {
      const label = row.original.subscriptionStatus || '免费版'
      return (
        <div className='flex justify-center'>
          <Badge variant='outline' className={subscriptionBadgeClass(label)}>
            {label}
          </Badge>
        </div>
      )
    },
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'subscriptionExpired',
    header: ({ column }) => <DataTableColumnHeader column={column} title='状态' className='justify-center' />,
    cell: ({ row }) => {
      const label = row.original.subscriptionExpired || '已用完'
      return (
        <div className='flex justify-center'>
          <Badge variant='outline' className={expiryBadgeClass(label)}>
            {label}
          </Badge>
        </div>
      )
    },
    meta: {
      thClassName: 'px-4 text-center align-middle',
      tdClassName: 'px-4 text-center align-middle',
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    enableSorting: false,
    enableHiding: false,
  },
]
