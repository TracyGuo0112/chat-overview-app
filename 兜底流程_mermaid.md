# DJI智能客服系统完整流程图

## 🤖 系统整体架构图

```mermaid
flowchart TD
    Start[用户发起对话] --> MainFlow{主流程机器人<br/>总接待员}
    
    %% 主流程判断
    MainFlow -->|包含"人工"但≠"人工协助"| ShowCards[显示常见问题卡片<br/>🎯 引导自助服务]
    MainFlow -->|完全等于"人工协助"| ToHuman[转人工服务<br/>🔗 #ZRG]
    MainFlow -->|其他查询问题| APICall[调用FastGPT知识库<br/>🔍 智能搜索]
    
    %% API调用和响应处理
    APICall --> APICheck{API响应质量检查}
    APICheck -->|找到有效答案| GoodAnswer[返回AI智能回复<br/>✅ 问题解决]
    APICheck -->|无有效答案/失败| FallbackReply[兜底回复<br/>❌ 转人工引导]
    
    %% 多轮对话分支
    MainFlow -->|复杂问题需要深入咨询| MultiTurn[主多轮机器人<br/>🎓 专业顾问]
    MultiTurn --> MTProcess[多轮对话处理<br/>📝 深度交互]
    MTProcess --> MTResult[专业解答<br/>🎯 精准服务]
    
    %% FAQ快速回答分支  
    MainFlow -->|常见问题快速匹配| FAQBot[FAQ机器人<br/>⚡ 快速问答员]
    FAQBot --> FAQSearch[Top5召回匹配<br/>🔍 精确匹配]
    FAQSearch --> FAQAnswer[标准答案回复<br/>📋 标准化服务]
    
    %% 专业产品咨询分支
    MainFlow -->|特定产品咨询<br/>如Osmo Pocket 3| SpecialBot[专业子流程<br/>🔬 产品专家]
    SpecialBot --> SpecialProcess[专业产品咨询<br/>🎯 深度技术支持]
    SpecialProcess --> SpecialAnswer[专业技术回复<br/>⭐ 专家级服务]
    
    %% 知识库配置分支
    MainFlow -->|系统配置检查| ConfigCheck{配置检查器<br/>⚙️ 系统路由}
    ConfigCheck -->|FASTGPT2标签| KB1[知识库1<br/>📚 通用知识]
    ConfigCheck -->|HSRS标签| KB2[知识库2<br/>📚 专业知识]  
    ConfigCheck -->|其他配置| KB3[默认知识库<br/>📚 基础知识]
    
    KB1 --> KBAnswer1[知识库1回复]
    KB2 --> KBAnswer2[知识库2回复] 
    KB3 --> KBAnswer3[默认知识库回复]
    
    %% 结束节点
    ShowCards --> End[对话结束]
    ToHuman --> End
    GoodAnswer --> End
    FallbackReply --> End
    MTResult --> End
    FAQAnswer --> End
    SpecialAnswer --> End
    KBAnswer1 --> End
    KBAnswer2 --> End
    KBAnswer3 --> End
    
    %% 样式定义
    classDef startNode fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef processNode fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef decisionNode fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef responseNode fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef specialNode fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef endNode fill:#f5f5f5,stroke:#424242,stroke-width:2px
    
    class Start startNode
    class MainFlow,APICheck,ConfigCheck decisionNode
    class APICall,MultiTurn,FAQBot,SpecialBot,MTProcess,FAQSearch,SpecialProcess processNode
    class ShowCards,GoodAnswer,FallbackReply,MTResult,FAQAnswer,SpecialAnswer responseNode
    class ToHuman,KB1,KB2,KB3,KBAnswer1,KBAnswer2,KBAnswer3 specialNode
    class End endNode
```

## 📋 系统详细说明

### 🏢 系统架构概述
这个DJI智能客服系统就像一个大型客服中心，包含多个专业部门，每个部门都有自己的专长：

#### 🎯 核心组件
1. **主流程机器人（总接待员）**
   - 负责接收所有用户问题
   - 进行初步意图识别和分流
   - 处理人工服务请求

2. **主多轮机器人（专业顾问）** 
   - 处理复杂的多轮对话
   - 深度理解用户需求
   - 提供个性化专业服务

3. **FAQ机器人（快速问答员）**
   - 处理常见问题
   - Top5快速召回匹配
   - 提供标准化快速回答

4. **专业子流程（产品专家）**
   - 针对特定产品的专业咨询
   - 如Osmo Pocket 3专项服务
   - 提供深度技术支持

### 🔄 工作流程详解

#### 第一阶段：问题接收与初步分析
```
用户提问 → 主流程机器人接收 → 意图识别分析
```

#### 第二阶段：智能分流决策
系统会根据用户问题的特点，选择最合适的处理路径：

**🔗 人工服务路径**
- 检测到"人工"关键词但不完整 → 显示自助引导卡片
- 明确说"人工协助" → 直接转人工服务（#ZRG标识）

**🤖 智能回答路径**
- 普通问题 → 调用FastGPT知识库搜索
- 复杂问题 → 启动多轮对话机器人
- 常见问题 → FAQ快速匹配回答
- 产品问题 → 专业子流程处理

#### 第三阶段：知识库智能搜索
```
问题分析 → 知识库查询 → 答案质量评估 → 结果返回
```

#### 第四阶段：质量控制与兜底
- ✅ 找到高质量答案 → 直接回复用户
- ❌ 无满意答案 → 兜底回复 + 人工服务引导

### 🎨 系统特色功能

#### 🧠 智能配置路由
系统能够根据特殊标签自动选择不同的知识库：
- `FASTGPT2` → 通用知识库
- `HSRS` → 专业知识库  
- 默认 → 基础知识库

#### 🔄 多层容错机制
1. **API失败保护**: 网络问题时自动触发兜底回复
2. **答案质量检查**: 确保回复内容有价值
3. **人工服务兜底**: 始终保证用户能获得帮助

#### 🎯 个性化服务
- **多轮对话**: 深度理解复杂需求
- **产品专家**: 针对性技术支持
- **快速FAQ**: 常见问题秒回

### 💡 用小白话总结

想象你走进一个超级智能的客服大厅：

1. **门口接待员（主流程）**: 先问你需要什么帮助
2. **如果你说要找人工**: 
   - 说得不清楚 → 给你一个自助服务菜单
   - 说得很明确 → 直接带你去人工窗口
3. **如果你有具体问题**: 
   - 简单问题 → 查资料库直接回答
   - 复杂问题 → 安排专业顾问深入沟通  
   - 常见问题 → 快速标准回答
   - 产品问题 → 找产品专家
4. **如果找不到答案**: 礼貌道歉并引导你找人工服务

整个系统的核心思想就是：**让合适的人做合适的事，确保每个用户都能得到最好的服务体验！** 🌟
