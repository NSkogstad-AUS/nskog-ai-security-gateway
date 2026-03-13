import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const gatewayEnv = join('apps', 'gateway', '.env');
const gatewayEnvExample = join('apps', 'gateway', '.env.example');

if (!existsSync(gatewayEnv) && existsSync(gatewayEnvExample)) {
  copyFileSync(gatewayEnvExample, gatewayEnv);
  console.error('Created apps/gateway/.env from apps/gateway/.env.example');
}
