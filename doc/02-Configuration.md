> [← 返回文档目录](../README.md) ｜ 本分册由 `README.md` 的「Configuration」章节拆分而来。

## Configuration

| Key | Type | Description |
|-----|------|-------------|
| `githubSecret` | string (optional) | GitHub secret for webhook signature verification. When absent, all requests are accepted without verification. |
| `githubAppPrivateKey` | string (optional) | Path to the GitHub App private key (PEM). Required for API access. |
| `githubAppInstallationId` | string (optional) | GitHub App Installation ID. Required for API access. |
| `githubAppId` | string (optional) | GitHub App ID. Required for API access. |
