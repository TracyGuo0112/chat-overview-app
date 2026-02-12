# 兜底单轮FAQ工作流程图

## 流程说明
这是一个基于不同机器人标签的知识库搜索系统，根据用户输入的配置标签，路由到不同的知识库进行搜索并返回结果。

## Mermaid流程图

```mermaid
flowchart TD
    A[系统配置<br/>userGuide] --> B[流程开始<br/>接收用户输入<br/>workflowStartNodeId]
    
    B --> C{判断器<br/>kiP6jrcD2bC0<br/>检查用户输入标签}
    
    C -->|包含FASTGPT2标签| D[知识库搜索1<br/>uV9dkLRxQdSy<br/>FASTGPT2专用知识库]
    C -->|包含HSRS标签| E[知识库搜索2<br/>rYhYNzdSXHaO<br/>HSRS专用知识库]
    C -->|其他情况| F[知识库搜索3<br/>MNMMMIjjWyMU<br/>默认知识库]
    
    D --> G[指定回复1<br/>h60Y8lZ23pZT<br/>返回FASTGPT2结果]
    E --> H[指定回复2<br/>csSiZ5nvmkcK<br/>返回HSRS结果]
    F --> I[指定回复3<br/>txgtLbopK8ca<br/>返回默认结果]
    
    G --> J[结束]
    H --> J
    I --> J

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style D fill:#e8f5e8
    style E fill:#e8f5e8
    style F fill:#e8f5e8
    style G fill:#fce4ec
    style H fill:#fce4ec
    style I fill:#fce4ec
    style J fill:#f1f8e9
```

## 判断条件详解

### 判断器逻辑 (kiP6jrcD2bC0)
- **条件1**: 用户输入以 `<config robot-labels="FASTGPT2"/>` 开头
  - 执行路径: 知识库搜索1 → 指定回复1
  
- **条件2**: 用户输入以 `<config robot-labels="HSRS"/>` 开头  
  - 执行路径: 知识库搜索2 → 指定回复2
  
- **默认情况**: 其他所有输入
  - 执行路径: 知识库搜索3 → 指定回复3

## 节点功能说明

### 系统配置节点
- 配置欢迎文本和系统变量
- 设置TTS和语音识别参数

### 知识库搜索节点配置
- **相似度阈值**: 0.4
- **搜索限制**: 3000字符
- **搜索模式**: embedding（语义搜索）
- **权重设置**: 0.5

### 特殊配置
- HSRS知识库启用了扩展查询功能 (`datasetSearchUsingExtensionQuery: true`)
- 使用GPT-4o-0806模型进行查询扩展
