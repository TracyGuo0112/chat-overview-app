import {
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
  BarChart3,
  LayoutDashboard,
  MessagesSquare,
  Users,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: '运营管理员',
    email: 'ops@example.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: '会话分析平台',
      logo: Command,
      plan: '主环境',
    },
    {
      name: '运营团队',
      logo: GalleryVerticalEnd,
      plan: '企业版',
    },
    {
      name: '客服团队',
      logo: AudioWaveform,
      plan: '标准版',
    },
  ],
  navGroups: [
    {
      items: [
        {
          title: '会话总览',
          url: '/',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      items: [
        {
          title: '用户管理',
          url: '/users',
          icon: Users,
        },
      ],
    },
    {
      items: [
        {
          title: '会员运营分析',
          url: '/membership-ops',
          icon: BarChart3,
        },
      ],
    },
    {
      items: [
        {
          title: '数据问答',
          url: '/tasks',
          icon: MessagesSquare,
        },
      ],
    },
  ],
}
