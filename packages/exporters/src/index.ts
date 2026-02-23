/**
 * Placeholder for future event exporters (Splunk, ServiceNow, webhooks, etc.).
 *
 * Each exporter should implement the EventExporter interface below and be
 * registered with the gateway at startup. The gateway will call `export()`
 * after each PolicyEvaluated event once this package is wired in.
 */

import type { AgentSecurityEvent } from '@ai-security-gateway/shared';

export interface EventExporter {
  /** Unique exporter name for logging and configuration */
  readonly name: string;
  /**
   * Export a batch of events to the destination system.
   * Implementations should be idempotent where possible.
   */
  export(events: AgentSecurityEvent[]): Promise<void>;
}
