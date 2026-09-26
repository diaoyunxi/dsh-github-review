# dsh-github-review

GitHub 代码审查 Agent — 基于 Webhook 自动触发 AI 审查 PR 代码。

## 安装
```bash
npm install
```

## 配置
- `GITHUB_TOKEN` — GitHub Personal Access Token
- `OPENAI_API_KEY` — AI Agent API Key
- `WEBHOOK_SECRET` — GitHub Webhook Secret

## 使用
```bash
node lib/index.js
```
