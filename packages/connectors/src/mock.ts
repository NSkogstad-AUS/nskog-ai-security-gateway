import { webSearchArgsSchema } from '@ai-security-gateway/shared';
import type { ToolConnector } from './registry';

/**
 * MockConnector: a no-op connector for development and CI.
 *
 * - Tool name: `web_search`
 * - Returns a static canned response regardless of input.
 * - Schema comes from the shared package so validation and connectors stay aligned.
 */
export class MockConnector implements ToolConnector {
  readonly name = 'web_search';
  readonly description = 'Mock web search connector (returns static results for dev/test)';
  readonly risk_tier = 'read' as const;

  readonly argsSchema = webSearchArgsSchema;

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
