> [← 返回文档目录](../README.md) ｜ 本分册由 `README.md` 的「Architecture」章节拆分而来。

## Architecture

```
GitHub Issue Created
        ↓
Webhook POST /api/github/webhooks
        ↓
Signature Verification (if configured)
        ↓
Create DSH Session (danger-full-access)
        ↓
AI Agent analyzes issue
        ↓
Implement fix & create PR (or comment explanation)
```
