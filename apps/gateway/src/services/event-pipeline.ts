import { appendEvent } from '@ai-security-gateway/eventlog';
import type { AgentSecurityEvent } from '@ai-security-gateway/shared';
import { globalEventExportDispatcher } from '@ai-security-gateway/exporters';

/**
 * Write to the immutable local log first, then fan out to configured exporters.
 * Export errors are logged but do not fail the primary gateway decision path.
 */
export async function recordEvent(event: AgentSecurityEvent): Promise<void> {
  await appendEvent(event);
  try {
    await globalEventExportDispatcher.exportEvent(event);
  } catch (err) {
    console.error('Event export failed:', err);
  }
}
