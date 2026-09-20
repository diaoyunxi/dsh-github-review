# dsh-github-review

GitHub webhook receiver that spawns AI review agents for opened issues.

## Overview

This DSH (DeepSeek Harness) plugin:

- Registers an HTTP endpoint at `/api/github/webhooks` that accepts GitHub issue creation webhooks
- Provides a model-facing tool `dsh-github-review` for manually triggering reviews
- When an issue is created, spawns a fresh DSH session to examine the issue and either implement a fix (creating a PR) or comment explaining why it cannot be done

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `githubSecret` | string | No | GitHub webhook secret for HMAC signature verification |
| `githubAppPrivateKey` | string | No | GitHub App private key (PEM) for API access |
| `githubAppInstallationId` | string | No | GitHub App installation ID |
| `githubAppId` | string | No | GitHub App ID |

## Setup

1. Create a GitHub App with `issues:read` and `issues:write` permissions
2. Set the webhook URL to your DSH server's `/api/github/webhooks`
3. Configure the plugin with your GitHub App credentials

## License

MIT
