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

export class EventExportDispatcher {
  private readonly exporters: EventExporter[] = [];

  register(exporter: EventExporter): this {
    this.exporters.push(exporter);
    return this;
  }

  async exportEvent(event: AgentSecurityEvent): Promise<void> {
    for (const exporter of this.exporters) {
      await exporter.export([event]);
    }
  }
}

export const globalEventExportDispatcher = new EventExportDispatcher();

export type { SplunkHECExporterOptions } from './splunk-hec';
export { SplunkHECExporter } from './splunk-hec';
