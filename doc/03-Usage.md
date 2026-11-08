> [← 返回文档目录](../README.md) ｜ 本分册由 `README.md` 的「Usage」章节拆分而来。

## Usage

### Webhook Setup

1. Configure your GitHub repository to send `issues` webhook events to your server's `/api/github/webhooks` endpoint
2. Optionally set a webhook secret and configure `githubSecret` in the plugin config

### Manual Trigger

The plugin also exposes a `dsh-github-review` tool that can be invoked manually to trigger a review for a specific issue.
