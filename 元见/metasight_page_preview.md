# MetaSight 页面预览稿（独立文件）

## 页面标题：Landing 首页（公开域）
### 1. 页面结构框架（ASCII or Markdown）
```text
[Header]
  ├─ Logo
  ├─ 导航（产品/博客/定价）
  └─ 登录/注册按钮

[Hero]
  ├─ 主标题：即时命理决策辅助
  ├─ 副标题：可追问、可复盘
  ├─ CTA：开始咨询（主）/ 查看示例（次）
  └─ 可信背书（用户数/状态页）

[Value Blocks]
  ├─ 场景1：情感
  ├─ 场景2：职业
  └─ 场景3：人生方向

[How It Works]
  ├─ Step 1 注册登录
  ├─ Step 2 发起咨询
  └─ Step 3 沉淀与复盘

[Blog Preview + Footer]
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 顶部导航 | Nav | 提供一级入口 | 菜单项、登录态 | 点击跳转、滚动吸顶 | 半透明毛玻璃 + 细边框 |
| Hero 标题区 | Section | 建立价值认知 | 主标题、副标题、CTA | CTA 跳注册或首问 | 大字号、渐变高亮 |
| 场景卡片 | Card Grid | 展示适用问题 | 场景名、示例问题 | Hover 高亮、点击跳转 | 3列卡片、轻阴影 |
| 过程说明 | Stepper | 解释上手流程 | 三步描述 | 点击展开说明 | 编号圆点+连线 |
| 博客预览 | List | 承接内容转化 | 标题、标签、语言 | 点击文章详情 | 双列列表 |
### 3. HTML/Tailwind 代码示例（optional）
```html
<section class="mx-auto max-w-6xl px-6 py-16">
  <div class="text-center">
    <h1 class="text-4xl font-bold tracking-tight md:text-6xl">观象入元，见心知命</h1>
    <p class="mx-auto mt-4 max-w-2xl text-zinc-600">即时咨询、连续追问、沉淀复盘</p>
    <div class="mt-8 flex justify-center gap-3">
      <button class="rounded-xl bg-black px-5 py-3 text-white">开始咨询</button>
      <button class="rounded-xl border px-5 py-3">查看示例</button>
    </div>
  </div>
</section>
```

## 页面标题：登录/注册页（账号域）
### 1. 页面结构框架（ASCII or Markdown）
```text
[Auth Container]
  ├─ 左侧：价值简述/信任元素
  └─ 右侧：表单区
       ├─ 登录/注册切换 Tab
       ├─ 邮箱输入 + 密码输入
       ├─ OAuth 按钮（可选）
       ├─ 忘记密码入口
       └─ 提交按钮 + 错误提示区
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 模式切换 Tab | Tab | 登录/注册切换 | activeTab | 切换时保留可复用输入 | 线性指示条 |
| 表单字段 | Form Input | 收集身份信息 | email/password | 实时校验、回车提交 | 错误态红描边 |
| OAuth 区 | Button Group | 降低登录成本 | provider | 点击三方授权 | 品牌图标按钮 |
| 错误提示条 | Alert | 告知失败与下一步 | errorCode/msg | 点击重试/重发 | 浅红背景 + 图标 |
| 回跳提示 | Banner | 说明登录后去向 | returnTo | 登录成功自动回跳 | 顶部轻提示 |
### 3. HTML/Tailwind 代码示例（optional）
```html
<form class="space-y-4 rounded-2xl border p-6 shadow-sm">
  <input class="w-full rounded-lg border px-3 py-2" placeholder="邮箱" />
  <input type="password" class="w-full rounded-lg border px-3 py-2" placeholder="密码" />
  <button class="w-full rounded-lg bg-black py-2.5 text-white">继续</button>
</form>
```

## 页面标题：对话工作台（受保护域）
### 1. 页面结构框架（ASCII or Markdown）
```text
[Chat Layout]
├─ 左侧 Sidebar
│   ├─ 新建会话
│   ├─ 线程列表（最近/置顶）
│   └─ 用户信息/套餐状态
└─ 右侧 Main
    ├─ 顶栏（当前模式、标题、分享）
    ├─ 消息流区域（用户消息/助手消息/工具结果）
    └─ 输入区（编辑器/追问建议/模式切换/发送）
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 线程列表 | List | 快速复访历史会话 | threadId/title/time | 点击切换、管理会话 | active 高亮 |
| 消息气泡 | Message Block | 展示问答内容 | role/content/status | 复制/反馈 | 用户右对齐、助手左对齐 |
| 生成状态条 | Inline Status | 告知生成状态 | streamState | 中断后继续按钮 | 脉冲点 |
| 输入编辑器 | Rich Input | 支持多轮提问 | text/mentions | Enter 发送 | 圆角大输入框 |
| 模式切换器 | Segmented | 控制回答风格 | mode | 点击切换 | 胶囊按钮 |
| 边界提示 | Banner/Modal | 触顶时给决策 | remaining/plan | 升级或稍后 | 强对比 CTA |
### 3. HTML/Tailwind 代码示例（optional）
```html
<div class="grid h-screen grid-cols-[280px_1fr]">
  <aside class="border-r p-4">线程列表...</aside>
  <main class="flex flex-col">
    <header class="border-b px-4 py-3">模式切换 / 标题</header>
    <section class="flex-1 overflow-y-auto p-6">消息流...</section>
    <footer class="border-t p-4">
      <div class="rounded-2xl border p-3">
        <textarea class="w-full resize-none outline-none" rows="3" placeholder="输入你的问题..."></textarea>
        <div class="mt-3 flex items-center justify-between">
          <div class="text-sm text-zinc-500">追问建议</div>
          <button class="rounded-lg bg-black px-4 py-2 text-white">发送</button>
        </div>
      </div>
    </footer>
  </main>
</div>
```

## 页面标题：八字档案页
### 1. 页面结构框架（ASCII or Markdown）
```text
[Bazi Profile]
├─ 顶部工具栏（新建/筛选/排序）
├─ 档案列表（档案卡 + 快捷操作）
└─ 弹窗（新建/编辑）
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 新建按钮 | Primary Button | 启动建档 | - | 打开弹窗 | 高对比主色 |
| 档案卡片 | Card | 展示摘要 | name/birth/tags | 进入详情 | 分层信息 |
| 标签筛选器 | Filter | 快速定位档案 | tagKey | 多选筛选 | 标签胶囊 |
| 表单弹窗 | Modal Form | 创建/编辑 | name/time/location | 校验、保存 | 两列表单 |
| 上限提示 | Inline Alert | 说明触顶原因 | current/limit | 升级或整理 | 黄色提示条 |
### 3. HTML/Tailwind 代码示例（optional）
```html
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <article class="rounded-xl border p-4">
    <h3 class="font-semibold">张三（本人）</h3>
    <p class="mt-1 text-sm text-zinc-500">1998-08-08 08:30 · 上海</p>
    <div class="mt-3 flex gap-2 text-xs">
      <span class="rounded-full bg-zinc-100 px-2 py-1">情感</span>
      <span class="rounded-full bg-zinc-100 px-2 py-1">事业</span>
    </div>
  </article>
</div>
```

## 页面标题：星图报告页
### 1. 页面结构框架（ASCII or Markdown）
```text
[Star Map Report]
├─ 报告概览区（状态、完成度）
├─ 章节进度列表（已完成/生成中/失败可重试）
└─ 阅读区（章节内容）
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 进度条 | Progress | 告知总体进度 | completed/total | 自动刷新 | 渐变进度条 |
| 章节列表 | Timeline/List | 展示章节状态 | chapter/status | 阅读、重试 | 时间线风格 |
| 重试按钮 | Secondary Button | 修复单章失败 | chapterId | 点击重试 | loading 态 |
| 阅读区 | Content Panel | 展示报告内容 | title/body | 目录跳转 | 宽版排版 |
### 3. HTML/Tailwind 代码示例（optional）
```html
<div class="rounded-2xl border p-5">
  <div class="mb-4 h-2 w-full rounded bg-zinc-100">
    <div class="h-2 w-2/3 rounded bg-black"></div>
  </div>
  <ul class="space-y-2 text-sm">
    <li class="flex items-center justify-between"><span>事业章节</span><span class="text-emerald-600">已完成</span></li>
    <li class="flex items-center justify-between"><span>关系章节</span><button class="rounded border px-2 py-1">重试</button></li>
  </ul>
</div>
```

## 页面标题：设置中心
### 1. 页面结构框架（ASCII or Markdown）
```text
[Settings]
├─ 左侧分区导航（账户/出生信息/订阅信息/关联账户）
└─ 右侧内容面板（表单 + 状态提示）
```
### 2. 组件详细说明表格
| 元素 | 类型 | 作用 | 字段 | 交互 | 样式暗示 |
|---|---|---|---|---|---|
| 分区导航 | Side Nav | 切换设置域 | sectionKey | 切换并保留草稿 | 左栏高亮 |
| 账户表单 | Form | 管理基础身份 | name/avatar | 上传、保存 | 卡片字段组 |
| 出生信息表单 | Form | 维护咨询关键资料 | date/time/city/tz | 校验保存 | 双列对齐 |
| 订阅信息卡 | Info Card | 展示权益状态 | plan/expire/quota | 刷新权益、升级 | 强调数字 |
| 关联账户区 | Account List | 管理绑定关系 | provider/status | 绑定/解绑 | 图标 + 徽章 |
### 3. HTML/Tailwind 代码示例（optional）
```html
<div class="grid gap-6 md:grid-cols-[220px_1fr]">
  <nav class="rounded-xl border p-3">账户 / 出生信息 / 订阅信息 / 关联账户</nav>
  <section class="rounded-xl border p-6">
    <h2 class="text-lg font-semibold">出生信息</h2>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <input class="rounded border px-3 py-2" placeholder="出生日期" />
      <input class="rounded border px-3 py-2" placeholder="出生城市" />
    </div>
    <button class="mt-5 rounded bg-black px-4 py-2 text-white">保存</button>
  </section>
</div>
```
