> [← 返回文档目录](../README.md) ｜ 本分册由 `README.md` 的「Overview」章节拆分而来。

## Overview

This plugin registers:

- An HTTP endpoint at `/api/github/webhooks` that accepts GitHub issue creation webhooks
- A model-facing tool `dsh-github-review` that manually triggers a review

When an issue is created, the plugin creates a fresh DSH session with full permissions (`danger-full-access`) and workspace rooted at `~/`, then instructs the AI to examine the issue, implement a fix if feasible (creating a PR), or comment on the issue explaining why it cannot be done.
