import type { JsonSchema, ToolRiskTier } from '@ai-security-gateway/shared';

/**
 * A ToolConnector bridges the gateway to an external tool or service.
 *
 * Each connector declares its own JSON Schema (draft 2020-12) for `tool_args`.
 * The validation package uses these schemas to validate incoming requests before
 * forwarding them to the policy engine.
 *
 * The gateway validates against `argsSchema`, evaluates policy, then calls
 * `execute()` when the request is allowed.
 */
export interface ToolConnector {
  /** Unique tool name – must match `tool_name` in ToolCallIntent */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Risk class used by policy and audit decisions */
  readonly risk_tier: ToolRiskTier;
  /** JSON Schema draft 2020-12 describing the shape of tool_args */
  readonly argsSchema: JsonSchema;
  /** Execute the tool with validated args and return a result */
  execute(args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Registry that maps tool names to their connector implementations.
 *
 * A singleton instance (`globalRegistry`) is exported for process-wide use.
 * Tests can create isolated `new ToolRegistry()` instances.
 */
export class ToolRegistry {
  private readonly connectors = new Map<string, ToolConnector>();

  /** Register a connector. Throws if the name is already taken. */
  register(connector: ToolConnector): this {
    if (this.connectors.has(connector.name)) {
      throw new Error(`Connector '${connector.name}' is already registered`);
    }
    this.connectors.set(connector.name, connector);
    return this;
  }

  /** Look up a connector by tool name. Returns undefined if not found. */
  get(name: string): ToolConnector | undefined {
    return this.connectors.get(name);
  }

  getRiskTier(name: string): ToolRiskTier | undefined {
    return this.connectors.get(name)?.risk_tier;
  }

  getArgsSchema(name: string): JsonSchema | undefined {
    return this.connectors.get(name)?.argsSchema;
  }

  has(name: string): boolean {
    return this.connectors.has(name);
  }

  /** List all registered connectors. */
  list(): ToolConnector[] {
    return [...this.connectors.values()];
  }
}

/** Process-wide singleton registry. Import this in the gateway startup. */
export const globalRegistry = new ToolRegistry();
