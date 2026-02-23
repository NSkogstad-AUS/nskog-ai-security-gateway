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
