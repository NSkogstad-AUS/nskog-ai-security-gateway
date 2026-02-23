import { createHash } from 'crypto';
import { LocalPolicyEngine } from '@ai-security-gateway/policy';
import { OPAPolicyEngine } from '@ai-security-gateway/policy';
import type { PolicyEngine } from '@ai-security-gateway/policy';
import type { ToolCallIntent, PolicyDecision } from '@ai-security-gateway/shared';

let activePolicyEngine: PolicyEngine = new LocalPolicyEngine();

export function setPolicyEngine(engine: PolicyEngine): void {
  activePolicyEngine = engine;
}

export function getPolicyEngine(): PolicyEngine {
  return activePolicyEngine;
}

export function configurePolicyEngineFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyEngine {
  const backend = (env.POLICY_BACKEND ?? 'local').toLowerCase();
  if (backend === 'local') {
    const engine = new LocalPolicyEngine();
    setPolicyEngine(engine);
    return engine;
  }

  if (backend === 'opa') {
    const baseUrl = env.OPA_BASE_URL;
    if (!baseUrl) {
      throw new Error('POLICY_BACKEND=opa requires OPA_BASE_URL');
    }
    const engine = new OPAPolicyEngine({
      baseUrl,
      policyPath: env.OPA_POLICY_PATH,
      timeoutMs: parseInt(env.OPA_TIMEOUT_MS ?? '5000', 10),
    });
    setPolicyEngine(engine);
    return engine;
  }

  throw new Error(`Unsupported POLICY_BACKEND '${backend}'. Use 'local' or 'opa'.`);
}

export async function evaluatePolicy(intent: ToolCallIntent): Promise<{
  decision: PolicyDecision;
  engine: string;
  input_hash: string;
  trace?: Record<string, unknown>;
}> {
  const inputHash = hashPolicyInput(intent);
  const engine = getPolicyEngine();
  if (typeof engine.evaluateWithTrace === 'function') {
    const evaluated = await engine.evaluateWithTrace(intent);
    return {
      decision: evaluated.decision,
      engine: engine.name,
      input_hash: inputHash,
      trace: evaluated.trace,
    };
  }

  const decision = await engine.decide(intent);
  return {
    decision,
    engine: engine.name,
    input_hash: inputHash,
  };
}

function hashPolicyInput(input: ToolCallIntent): string {
  const canonical = stableStringify(input);
  return createHash('sha256').update(canonical).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
