import type { JsonSchema } from '@ai-security-gateway/shared';
import { ajv } from './ajv';

/**
 * Validate `data` against a JSON Schema draft 2020-12 schema.
 *
 * Returns `null` when data is valid.
 * Returns a non-empty array of human-readable error strings on failure.
 *
 * When `schemaId` is provided the compiled validator is cached by Ajv;
 * subsequent calls with the same id skip recompilation.
 */
export function validate(
  schema: JsonSchema,
  data: unknown,
  schemaId?: string,
): string[] | null {
  let validator = schemaId ? ajv.getSchema(schemaId) : undefined;

  if (!validator) {
    validator = ajv.compile(schema);
  }

  const valid = validator(data);
  if (valid) return null;

  return (validator.errors ?? []).map(
    (e) => `${e.instancePath || '/'} ${e.message ?? 'unknown error'}`,
  );
}

/**
 * Per-tool argument schemas keyed by tool name.
 *
 * Each value is a JSON Schema draft 2020-12 object that describes the shape of
 * `tool_args` for that tool. Register additional schemas here as connectors are
 * added to the platform.
 *
 * Schemas are compiled and cached by Ajv on first use.
 */
export const toolArgSchemas: Record<string, JsonSchema> = {
  // Mock "web_search" tool – mirrors MockConnector.argsSchema
  web_search: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'tool-args/web_search',
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1 },
      max_results: { type: 'integer', minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  sn_create_incident: {
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
  },
  gh_get_file: {
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
  },
  gh_create_issue: {
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
  },
  gh_add_issue_comment: {
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
  },
  gh_push_file: {
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
  },
  gh_create_pull_request: {
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
  },
  gh_merge_pull_request: {
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
  },
};

/**
 * Validate `tool_args` for a named tool using its registered JSON Schema.
 *
 * If no schema is registered for `toolName` validation fails closed.
 */
export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string[] | null {
  const schema = toolArgSchemas[toolName];
  if (!schema) return [`/ unknown tool '${toolName}'`];

  const schemaId = typeof schema.$id === 'string' ? (schema.$id as string) : undefined;
  return validate(schema, args, schemaId);
}
