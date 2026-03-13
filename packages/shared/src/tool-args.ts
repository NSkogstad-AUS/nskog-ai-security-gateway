import type { JsonSchema } from './types';

export const webSearchArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/web_search',
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1 },
    max_results: { type: 'integer', minimum: 1, maximum: 50 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const serviceNowCreateIncidentArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/sn_create_incident',
  type: 'object',
  required: ['short_description'],
  properties: {
    short_description: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: 'string', maxLength: 4000 },
    category: { type: 'string', maxLength: 40 },
    subcategory: { type: 'string', maxLength: 40 },
    impact: { type: 'integer', enum: [1, 2, 3] },
    urgency: { type: 'integer', enum: [1, 2, 3] },
    assignment_group: { type: 'string', maxLength: 64 },
    caller_id: { type: 'string', maxLength: 64 },
    cmdb_ci: { type: 'string', maxLength: 64 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubGetFileArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_get_file',
  type: 'object',
  required: ['owner', 'repo', 'path'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    path: { type: 'string', minLength: 1, maxLength: 1024 },
    ref: { type: 'string', maxLength: 256 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubCreateIssueArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_create_issue',
  type: 'object',
  required: ['owner', 'repo', 'title'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 256 },
    body: { type: 'string', maxLength: 65536 },
    labels: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
    assignees: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 10 },
    milestone: { type: 'integer', minimum: 1 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubAddIssueCommentArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_add_issue_comment',
  type: 'object',
  required: ['owner', 'repo', 'issue_number', 'body'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    issue_number: { type: 'integer', minimum: 1 },
    body: { type: 'string', minLength: 1, maxLength: 65536 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubPushFileArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_push_file',
  type: 'object',
  required: ['owner', 'repo', 'path', 'content', 'message'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    path: { type: 'string', minLength: 1, maxLength: 1024 },
    content: { type: 'string', maxLength: 1_048_576 },
    message: { type: 'string', minLength: 1, maxLength: 512 },
    branch: { type: 'string', maxLength: 256 },
    sha: { type: 'string', maxLength: 64 },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubCreatePullRequestArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_create_pull_request',
  type: 'object',
  required: ['owner', 'repo', 'title', 'head', 'base'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    title: { type: 'string', minLength: 1, maxLength: 256 },
    head: { type: 'string', minLength: 1, maxLength: 256 },
    base: { type: 'string', minLength: 1, maxLength: 256 },
    body: { type: 'string', maxLength: 65536 },
    draft: { type: 'boolean' },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const gitHubMergePullRequestArgsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'tool-args/gh_merge_pull_request',
  type: 'object',
  required: ['owner', 'repo', 'pull_number'],
  properties: {
    owner: { type: 'string', minLength: 1, maxLength: 100 },
    repo: { type: 'string', minLength: 1, maxLength: 100 },
    pull_number: { type: 'integer', minimum: 1 },
    commit_title: { type: 'string', maxLength: 256 },
    commit_message: { type: 'string', maxLength: 65536 },
    merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const toolArgSchemas: Record<string, JsonSchema> = {
  web_search: webSearchArgsSchema,
  sn_create_incident: serviceNowCreateIncidentArgsSchema,
  gh_get_file: gitHubGetFileArgsSchema,
  gh_create_issue: gitHubCreateIssueArgsSchema,
  gh_add_issue_comment: gitHubAddIssueCommentArgsSchema,
  gh_push_file: gitHubPushFileArgsSchema,
  gh_create_pull_request: gitHubCreatePullRequestArgsSchema,
  gh_merge_pull_request: gitHubMergePullRequestArgsSchema,
};
