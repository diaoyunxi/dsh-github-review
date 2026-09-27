# dsh-github-review

GitHub webhook receiver that spawns AI review agents for opened issues.

## Overview

This plugin registers:

- An HTTP endpoint at `/api/github/webhooks` that accepts GitHub issue creation webhooks
- A model-facing tool `dsh-github-review` that manually triggers a review

When an issue is created, the plugin creates a fresh DSH session with full permissions (`danger-full-access`) and workspace rooted at `~/`, then instructs the AI to examine the issue, implement a fix if feasible (creating a PR), or comment on the issue explaining why it cannot be done.

## Configuration

| Key | Type | Description |
|-----|------|-------------|
| `githubSecret` | string (optional) | GitHub secret for webhook signature verification. When absent, all requests are accepted without verification. |
| `githubAppPrivateKey` | string (optional) | Path to the GitHub App private key (PEM). Required for API access. |
| `githubAppInstallationId` | string (optional) | GitHub App Installation ID. Required for API access. |
| `githubAppId` | string (optional) | GitHub App ID. Required for API access. |

## Usage

### Webhook Setup

1. Configure your GitHub repository to send `issues` webhook events to your server's `/api/github/webhooks` endpoint
2. Optionally set a webhook secret and configure `githubSecret` in the plugin config

### Manual Trigger

The plugin also exposes a `dsh-github-review` tool that can be invoked manually to trigger a review for a specific issue.

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

## License

See [LICENSE](LICENSE) for details.
