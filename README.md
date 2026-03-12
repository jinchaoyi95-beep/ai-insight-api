# AI产品洞察 - 每日新闻爬取

每日自动爬取AI新闻，生成产品经理洞察。

## 数据结构

### 头条（5条）
- 深度分析，完整PM洞察
- 重要性 >= 4分

### 快速浏览（10条）
- 简要信息，快速了解
- 重要性 >= 3分 或 Agent领域

## 信息源

### 官方源
- OpenAI Blog
- Google AI Blog
- Meta AI Blog
- Anthropic Blog

### 权威媒体
- 机器之心
- 量子位
- AI Base

### Agent专项
- LangChain Blog

## 部署

1. Fork 本仓库
2. 设置 Secrets: `SILICONFLOW_API_KEY`
3. 启用 GitHub Actions

数据将自动保存到 `data/insights.json`
