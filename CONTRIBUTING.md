# 贡献指南

感谢你对 dsh-github-review 项目的关注！

## 项目概述

本项目是一个 Cordis 插件，接收 GitHub Webhook 事件并自动启动 AI 审查代理对 Issue 进行分析和修复。

## 开发环境

- **运行时：** Node.js 18+
- **语言：** JavaScript（ESM）
- **框架：** Cordis

## 安全注意事项

本项目处理 GitHub Webhook 和 AI 代理调度，修改时请特别注意：

- Webhook 签名验证（HMAC-SHA256）的完整性
- JWT 算法声明与实际签名算法的一致性
- 请求体大小限制（防止 OOM）
- AI 代理的权限控制（`danger-full-access` 的安全边界）

## 提交 Pull Request

1. Fork 本仓库并创建功能分支
2. 确保代码可以正常加载
3. 如涉及安全相关修改，请提供安全分析说明
4. 遵循 Conventional Commits 规范提交
