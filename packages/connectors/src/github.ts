import {
  gitHubAddIssueCommentArgsSchema,
  gitHubCreateIssueArgsSchema,
  gitHubCreatePullRequestArgsSchema,
  gitHubGetFileArgsSchema,
  gitHubMergePullRequestArgsSchema,
  gitHubPushFileArgsSchema,
} from '@ai-security-gateway/shared';
import type { ToolConnector } from './registry';

export interface GitHubConnectorOptions {
  /** GitHub personal access token or GitHub App installation token */
  token: string;
  /** Override for GitHub Enterprise Server. Default: https://api.github.com */
  apiBaseUrl?: string;
  timeoutMs?: number;
}

interface GitHubErrorBody {
  message?: string;
  errors?: unknown[];
  documentation_url?: string;
}

/**
 * Shared HTTP client used by all GitHub tool connectors.
 * Handles auth headers, error surfacing, and request timeouts.
 */
class GitHubClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: GitHubConnectorOptions) {
    this.token = options.token;
    this.baseUrl = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      const responseBody = (await response.json().catch(() => ({}))) as GitHubErrorBody;

      if (!response.ok) {
        throw new Error(
          `GitHub API ${method} ${path} failed with ${response.status}: ${JSON.stringify(responseBody)}`,
        );
      }

      return responseBody as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── gh_get_file ──────────────────────────────────────────────────────────────

interface GetFileArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export class GitHubGetFileConnector implements ToolConnector {
  readonly name = 'gh_get_file';
  readonly description = 'Read the contents of a file from a GitHub repository';
  readonly risk_tier = 'read' as const;

  readonly argsSchema = gitHubGetFileArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, path, ref } = args as unknown as GetFileArgs;
    const normalizedPath = path.replace(/^\/+/, '');
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';

    const result = await this.client.request<Record<string, unknown>>(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${normalizedPath}${query}`,
    );

    const rawContent = result.content as string | undefined;
    const encoding = result.encoding as string | undefined;

    let content: string | undefined;
    if (rawContent && encoding === 'base64') {
      content = Buffer.from(rawContent.replace(/\n/g, ''), 'base64').toString('utf-8');
    }

    return {
      name: result.name,
      path: result.path,
      sha: result.sha,
      size: result.size,
      html_url: result.html_url,
      content,
    };
  }
}

// ─── gh_create_issue ──────────────────────────────────────────────────────────

interface CreateIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export class GitHubCreateIssueConnector implements ToolConnector {
  readonly name = 'gh_create_issue';
  readonly description = 'Create a GitHub issue in a repository';
  readonly risk_tier = 'write' as const;

  readonly argsSchema = gitHubCreateIssueArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, ...payload } = args as unknown as CreateIssueArgs;
    const result = await this.client.request<Record<string, unknown>>(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      payload,
    );
    return {
      number: result.number,
      html_url: result.html_url,
      state: result.state,
      title: result.title,
      node_id: result.node_id,
    };
  }
}

// ─── gh_add_issue_comment ─────────────────────────────────────────────────────

interface AddIssueCommentArgs {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}

export class GitHubAddIssueCommentConnector implements ToolConnector {
  readonly name = 'gh_add_issue_comment';
  readonly description = 'Add a comment to a GitHub issue or pull request';
  readonly risk_tier = 'write' as const;

  readonly argsSchema = gitHubAddIssueCommentArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, issue_number, body } = args as unknown as AddIssueCommentArgs;
    const result = await this.client.request<Record<string, unknown>>(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issue_number}/comments`,
      { body },
    );
    return {
      id: result.id,
      html_url: result.html_url,
      created_at: result.created_at,
    };
  }
}

// ─── gh_push_file ─────────────────────────────────────────────────────────────

interface PushFileArgs {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
  sha?: string;
}

export class GitHubPushFileConnector implements ToolConnector {
  readonly name = 'gh_push_file';
  readonly description = 'Create or update a file in a GitHub repository via a commit';
  readonly risk_tier = 'write' as const;

  readonly argsSchema = gitHubPushFileArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, path, content, message, branch, sha } = args as unknown as PushFileArgs;
    const normalizedPath = path.replace(/^\/+/, '');

    const payload: Record<string, unknown> = {
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (branch) payload.branch = branch;
    if (sha) payload.sha = sha;

    const result = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${normalizedPath}`,
      payload,
    );

    const commit = result.commit as Record<string, unknown> | undefined;
    const file = result.content as Record<string, unknown> | undefined;

    return {
      sha: file?.sha,
      html_url: file?.html_url,
      commit_sha: commit?.sha,
      commit_url: commit?.html_url,
    };
  }
}

// ─── gh_create_pull_request ───────────────────────────────────────────────────

interface CreatePullRequestArgs {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export class GitHubCreatePullRequestConnector implements ToolConnector {
  readonly name = 'gh_create_pull_request';
  readonly description = 'Open a pull request on GitHub';
  readonly risk_tier = 'write' as const;

  readonly argsSchema = gitHubCreatePullRequestArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, ...payload } = args as unknown as CreatePullRequestArgs;
    const result = await this.client.request<Record<string, unknown>>(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      payload,
    );
    return {
      number: result.number,
      html_url: result.html_url,
      state: result.state,
      draft: result.draft,
      title: result.title,
      node_id: result.node_id,
    };
  }
}

// ─── gh_merge_pull_request ────────────────────────────────────────────────────

interface MergePullRequestArgs {
  owner: string;
  repo: string;
  pull_number: number;
  commit_title?: string;
  commit_message?: string;
  merge_method?: 'merge' | 'squash' | 'rebase';
}

export class GitHubMergePullRequestConnector implements ToolConnector {
  readonly name = 'gh_merge_pull_request';
  readonly description = 'Merge a GitHub pull request';
  readonly risk_tier = 'admin' as const;

  readonly argsSchema = gitHubMergePullRequestArgsSchema;

  constructor(private readonly client: GitHubClient) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const { owner, repo, pull_number, commit_title, commit_message, merge_method } =
      args as unknown as MergePullRequestArgs;

    const payload: Record<string, unknown> = {};
    if (commit_title) payload.commit_title = commit_title;
    if (commit_message) payload.commit_message = commit_message;
    if (merge_method) payload.merge_method = merge_method;

    const result = await this.client.request<Record<string, unknown>>(
      'PUT',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pull_number}/merge`,
      payload,
    );
    return {
      sha: result.sha,
      merged: result.merged,
      message: result.message,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create all GitHub tool connectors sharing a single authenticated HTTP client.
 * Register the returned array with the global ToolRegistry at gateway startup.
 */
export function createGitHubConnectors(options: GitHubConnectorOptions): ToolConnector[] {
  const client = new GitHubClient(options);
  return [
    new GitHubGetFileConnector(client),
    new GitHubCreateIssueConnector(client),
    new GitHubAddIssueCommentConnector(client),
    new GitHubPushFileConnector(client),
    new GitHubCreatePullRequestConnector(client),
    new GitHubMergePullRequestConnector(client),
  ];
}
