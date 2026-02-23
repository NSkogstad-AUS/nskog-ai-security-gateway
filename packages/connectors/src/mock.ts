import type { ToolConnector } from './registry';

/**
 * MockConnector: a no-op connector for development and CI.
 *
 * - Tool name: `web_search`
 * - Returns a static canned response regardless of input.
 * - argsSchema is the canonical source for the `web_search` tool schema;
 *   the validation package's toolArgSchemas map must stay in sync with this.
 */
export class MockConnector implements ToolConnector {
  readonly name = 'web_search';
  readonly description = 'Mock web search connector (returns static results for dev/test)';
  readonly risk_tier = 'read' as const;

  readonly argsSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'tool-args/web_search',
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1 },
      max_results: { type: 'integer', minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    return {
      results: [
        {
          title: `Mock result for: ${args.query}`,
          url: 'https://example.com/mock',
          snippet: 'This is a static mock search result returned by MockConnector.',
        },
      ],
      total: 1,
    };
  }
}
