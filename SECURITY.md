# 安全策略

## 报告安全漏洞

如果你发现了安全漏洞，请通过以下方式报告：

1. **请勿**在公开的 GitHub Issue 中报告安全漏洞
2. 请通过 GitHub 的 [Security Advisories](https://github.com/diaoyunxi/dsh-github-review/security/advisories/new) 页面提交报告

## 安全范围

以下属于本项目的安全关注点：

- Webhook 签名验证（HMAC-SHA256）绕过
- JWT 算法混淆攻击（HS256/RS256）
- 请求体大小限制与 DoS 防护
- AI 代理权限控制
- GitHub App 私钥泄露
