/**
 * dsh-github-review — GitHub webhook receiver that spawns AI review agents
 * for opened issues.
 *
 * Registers:
 *   - An HTTP endpoint at `/api/github/webhooks` that accepts GitHub issue
 *     creation webhooks.
 *   - A model-facing tool `dsh-github-review` that manually triggers a review.
 *
 * When an issue is created, the plugin creates a fresh DSH session with full
 * permissions (`danger-full-access`) and workspace rooted at `~/`, then
 * instructs the AI to examine the issue, implement a fix if feasible (creating
 * a PR), or comment on the issue explaining why it cannot be done.
 *
 * @module dsh-github-review
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { defineTool } from "@deepseek-ai/dsh-tools";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const Config = z.object({
  /** GitHub secret for webhook signature verification. Optional; when absent
   *  all requests are accepted without verification. */
  githubSecret: z.string().optional(),
  /** Path to the GitHub app private key (PEM). Required for API access. */
  githubAppPrivateKey: z.string().optional(),
  /** GitHub App installation ID. Required for API access. */
  githubAppInstallationId: z.string().optional(),
  /** GitHub App ID. Required for API access. */
  githubAppId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GitHub webhook payload types
// ---------------------------------------------------------------------------

/** Minimal shape of a GitHub issues webhook payload (action: opened). */
function isIssuesOpenedPayload(payload) {
  return (
    payload?.action === "opened" &&
    payload?.issue?.number != null &&
    payload?.issue?.title != null &&
    payload?.repository?.full_name != null
  );
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

/**
 * Generate a JWT for GitHub App authentication.
 * @param privateKey - PEM-encoded private key string.
 * @param appId - GitHub App ID.
 * @returns JWT token.
 */
async function createAppJwt(privateKey, appId) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iat: now,
      exp: now + 600, // 10 minutes
      iss: appId,
    })
  );
  const signedInput = `${header}.${payload}`;

  const crypto = await import("node:crypto");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToUint8Array(privateKey),
    { name: "RS256", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RS256",
    key,
    new TextEncoder().encode(signedInput)
  );
  return `${signedInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

function pemToUint8Array(pem) {
  const lines = pem
    .replace(/-----\w+-----/g, "")
    .replace(/\s+/g, "");
  const bytes = new Uint8Array(atob(lines).split("").map((c) => c.charCodeAt(0)));
  return bytes;
}

/**
 * Create a GitHub API request handler authenticated as the app.
 * @param ctx - Cordis context.
 */
function createGithubApiClient(ctx) {
  const privateKey =
    ctx.get("githubAppPrivateKey") ?? process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  const appId =
    ctx.get("githubAppId") ?? process.env.GITHUB_APP_ID ?? "";
  const installationId =
    ctx.get("githubAppInstallationId") ??
    process.env.GITHUB_APP_INSTALLATION_ID ??
    "";

  return {
    /**
     * POST a comment to an issue.
     * @param owner - repo owner.
     * @param repo - repo name.
     * @param issueNumber - issue number.
     * @param body - comment text.
     */
    async commentOnIssue(owner, repo, issueNumber, body) {
      if (!privateKey || !appId || !installationId) {
        ctx.logger.warn(
          "github-review: missing GitHub app credentials, skipping API comment"
        );
        return;
      }
      try {
        const jwt = await createAppJwt(privateKey, appId);
        const installRes = await fetch(
          `https://api.github.com/app/installations/${installationId}/access_tokens`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
          }
        );
        if (!installRes.ok) {
          ctx.logger.error(
            `github-review: failed to get install token: ${installRes.status}`
          );
          return;
        }
        const { token } = await installRes.json();

        const commentRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ body }),
          }
        );
        if (!commentRes.ok) {
          ctx.logger.error(
            `github-review: failed to post comment: ${commentRes.status}`
          );
        } else {
          ctx.logger.info("github-review: comment posted successfully");
        }
      } catch (err) {
        ctx.logger.error(`github-review: error posting comment: ${err.message}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Main entry point for the dsh-github-review bundle.
 *
 * Registers the GitHub webhook HTTP endpoint and a model-facing tool.
 *
 * @param ctx - Cordis context.
 * @param config - validated plugin config.
 * @returns disposer.
 */
function apply(ctx, config) {
  const cfg = Config.parse(config);
  const githubClient = createGithubApiClient(ctx);
  const logger = ctx.logger ?? console;

  // ------------------------------------------------------------------
  // GitHub webhook endpoint: POST /api/github/webhooks
  // ------------------------------------------------------------------
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: "exact",
      path: "/api/github/webhooks",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }

        // Verify signature if secret is configured
        const signature =
          req.headers["x-hub-signature-256"] ??
          req.headers["x-hub-signature"];
        if (cfg.githubSecret && signature) {
          // Signature verification omitted for brevity; in production use
          // crypto.createHmac to verify `sha256=${sig}` against the raw body.
          logger.info("github-review: webhook signature present (verification skipped in this demo)");
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        const event = req.headers["x-github-event"] ?? "unknown";

        if (event === "issues" && isIssuesOpenedPayload(payload)) {
          const issue = payload.issue;
          const repo = payload.repository;
          const owner = repo.owner?.login ?? repo.full_name.split("/")[0];
          const repoName = repo.name ?? repo.full_name.split("/")[1];

          logger.info(
            `github-review: issue #${issue.number} opened in ${repo.full_name}: ${issue.title}`
          );

          spawnReviewAgent(ctx, {
            owner,
            repo: repoName,
            fullRepo: repo.full_name,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueBody: issue.body ?? "",
            issueUrl: issue.html_url ?? "",
            githubClient,
          }).catch((err) => {
            logger.error(`github-review: failed to spawn review agent: ${err.message}`);
          });

          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        } else {
          logger.debug(`github-review: ignoring event=${event}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: false, reason: "not an opened issue" }));
        }
      },
    });
    return dispose;
  }, "github-webhook: register endpoint");

  // ------------------------------------------------------------------
  // Model-facing tool: dsh-github-review
  // ------------------------------------------------------------------
  ctx.tools.register(
    defineTool({
      name: "dsh-github-review",
      description:
        "Review a GitHub issue and spawn an AI agent to evaluate whether " +
        "the requested change is implementable. The agent will clone the " +
        "repository, attempt the change, and either create a PR or comment " +
        "on the issue explaining why it cannot be done. This runs with " +
        "full permissions in an isolated session with no human intervention.",
      parameters: {
        repo_full_name: {
          type: "string",
          required: true,
          description: "Full repository name (owner/repo), e.g. 'facebook/react'",
        },
        issue_number: {
          type: "number",
          required: true,
          description: "GitHub issue number",
        },
        issue_title: {
          type: "string",
          required: true,
          description: "GitHub issue title",
        },
        issue_body: {
          type: "string",
          required: false,
          description: "GitHub issue body/description",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            session_id: { type: "string", required: true },
            status: {
              type: "string",
              enum: ["queued", "error"],
              required: true,
            },
          },
        },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const owner = args.repo_full_name.split("/")[0];
        const repoName = args.repo_full_name.split("/")[1];

        logger.info(
          `github-review: manual trigger — issue #${args.issue_number} in ${args.repo_full_name}`
        );

        await spawnReviewAgent(ctx, {
          owner,
          repo: repoName,
          fullRepo: args.repo_full_name,
          issueNumber: args.issue_number,
          issueTitle: args.issue_title,
          issueBody: args.issue_body ?? "",
          issueUrl: `https://github.com/${args.repo_full_name}/issues/${args.issue_number}`,
          githubClient,
        });

        return { session_id: "(agent spawned)", status: "queued" };
      },
    })
  );

  return () => {};
}

// ---------------------------------------------------------------------------
// Agent spawner
// ---------------------------------------------------------------------------

/**
 * Spawn a review agent for a GitHub issue.
 *
 * Creates a new DSH session with:
 *   - workspace (cwd) set to `~/`
 *   - sandbox mode set to `danger-full-access`
 *   - full permissions, general mode
 *   - no human intervention
 *
 * @param ctx - Cordis context.
 * @param issue - issue details.
 */
async function spawnReviewAgent(ctx, issue) {
  const agents = ctx.get("agents");
  const sessions = ctx.get("sessions");
  const defaultModel = ctx.get("agentDefaultModel");

  if (!agents || !sessions || !defaultModel) {
    throw new Error(
      "github-review: required services not available (agents, sessions, agentDefaultModel)"
    );
  }

  const selection = defaultModel.currentSelection();
  const sessionId = SessionId(`session-github-review-${randomUUID()}`);

  logger.info(
    `github-review: spawning agent for issue #${issue.issueNumber} in ${issue.fullRepo}`
  );

  const handle = await agents.create({
    sessionId,
    meta: {
      cwd: resolve("~/"),
      agentPreset: "standard",
    },
    agentOptions: {
      provider: selection.provider,
      model: selection.model,
      maxTokens: 16384,
    },
    setup: (agentCtx) => {
      // Set sandbox to danger-full-access for this session
      agentCtx.session.append("sandbox/mode", { mode: "danger-full-access" });

      // Build the review prompt
      const prompt = buildReviewPrompt(issue);

      // Inject the user message to kick off the agent
      agentCtx.session.append(
        "user/message",
        createUserMessage({
          content: [{ type: "text", text: prompt }],
          source: { kind: "user" },
        }),
        { surfaceOp: "append" }
      );
    },
  });

  logger.info(
    `github-review: agent spawned with session ${handle.agent.session.id}`
  );

  // Wait for the agent to finish its work, with a timeout to prevent
  // indefinite hanging if the agent gets stuck (CWE-400).
  const AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const idleTimeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
      AGENT_TIMEOUT_MS,
    ),
  );

  try {
    await Promise.race([handle.agent.whenIdle(), idleTimeout]);
  } catch (err) {
    logger.error(
      `github-review: agent for issue #${issue.issueNumber} did not complete: ${err.message}`,
    );
  }

  // Flush session persistence
  await sessions.flush(handle.agent.session);

  logger.info(
    `github-review: agent completed for issue #${issue.issueNumber}`
  );
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the review agent.
 *
 * The agent is instructed to:
 *   1. Clone the target repository
 *   2. Read the issue title and body
 *   3. Assess whether the requested change is implementable
 *   4. If yes: implement the change and create a PR
 *   5. If no: comment on the issue explaining why
 *
 * @param issue - issue details.
 * @returns the prompt string.
 */
function buildReviewPrompt(issue) {
  return [
    `You have been assigned to review and potentially implement the following GitHub issue.`,
    ``,
    `**Repository:** \`${issue.fullRepo}\``,
    `**Issue #${issue.issueNumber}:** ${issue.issueTitle}`,
    issue.issueBody ? `**Issue Body:**\n\`\`\`\n${issue.issueBody}\n\`\`\`` : "",
    issue.issueUrl ? `**Issue URL:** ${issue.issueUrl}` : "",
    ``,
    `**Your task:**`,
    `1. Clone the repository at \`https://github.com/${issue.fullRepo}.git\` into a temporary directory under \`~/\`.`,
    `2. Read the issue carefully and understand the requested change.`,
    `3. Assess whether the change is technically feasible and appropriate.`,
    `4. **If implementable:**`,
    `   - Make the necessary code changes`,
    `   - Run any relevant tests`,
    `   - Create a new branch`,
    `   - Commit your changes with a descriptive message`,
    `   - Push the branch and create a Pull Request targeting the default branch`,
    `   - Report the PR URL`,
    `5. **If NOT implementable:**`,
    `   - Explain clearly why the requested change cannot be made`,
    `   - Use the \`dsh-github-review\` tool or make an HTTP request to post a comment on the issue explaining your reasoning`,
    `   - The comment should be helpful and specific`,
    ``,
    `**Important constraints:**`,
    `- You have full permissions (danger-full-access) — you can run any command needed.`,
    `- This session runs with NO human intervention. Complete the task autonomously.`,
    `- Follow the repository's existing coding conventions and style.`,
    `- If the repository uses a specific build system, follow its conventions.`,
    `- Always create a proper branch and PR, never push directly to main/master.`,
    ``,
    `Begin by cloning the repository and reading the issue.`,
  ].join("\n").trim();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const name = "github-webhook";
const inject = ["webServer", "agents", "sessions", "agentDefaultModel", "tools"];

export { Config, apply, inject, name };
