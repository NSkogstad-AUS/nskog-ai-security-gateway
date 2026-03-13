import { execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

function canTalkToDockerDaemon() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/zsh' });
    return true;
  } catch {
    return false;
  }
}

function readDockerConfig() {
  const dir = join(homedir(), '.docker');
  const configPath = join(dir, 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, 'utf8');
    return {
      dir,
      path: configPath,
      json: JSON.parse(raw),
    };
  } catch {
    return null;
  }
}

function sanitizeDockerConfig(config) {
  const sanitized = { ...config };

  if (sanitized.credsStore === 'desktop') {
    delete sanitized.credsStore;
  }

  if (sanitized.credHelpers && typeof sanitized.credHelpers === 'object') {
    const filteredEntries = Object.entries(sanitized.credHelpers).filter(
      ([, helper]) => helper !== 'desktop',
    );

    if (filteredEntries.length === 0) {
      delete sanitized.credHelpers;
    } else {
      sanitized.credHelpers = Object.fromEntries(filteredEntries);
    }
  }

  return sanitized;
}

function createTempDockerConfigDir(config, sourceDir) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-gateway-docker-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2));

  for (const entry of readdirSync(sourceDir)) {
    if (entry === 'config.json') continue;

    symlinkSync(join(sourceDir, entry), join(dir, entry));
  }

  return dir;
}

function runCompose(env = process.env) {
  const result = spawnSync('docker', ['compose', 'up', '-d', 'postgres'], {
    env,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result;
}

if (!canTalkToDockerDaemon()) {
  console.error('Docker is installed but the Docker daemon is not running.');
  console.error('Start Docker Desktop (or your Docker daemon) and rerun `pnpm db:up`.');
  console.error('If Postgres is already running elsewhere, use `pnpm manual:gateway` instead.');
  process.exit(1);
}

const dockerConfig = readDockerConfig();
const desktopCredentialHelperMissing =
  dockerConfig &&
  (dockerConfig.json.credsStore === 'desktop' ||
    Object.values(dockerConfig.json.credHelpers ?? {}).includes('desktop')) &&
  !commandExists('docker-credential-desktop');

let tempDockerConfigDir = null;

try {
  const env = { ...process.env };

  if (desktopCredentialHelperMissing) {
    tempDockerConfigDir = createTempDockerConfigDir(
      sanitizeDockerConfig(dockerConfig.json),
      dockerConfig.dir,
    );
    env.DOCKER_CONFIG = tempDockerConfigDir;
    console.error(
      'docker-credential-desktop is missing; retrying with a temporary Docker config that skips that helper.',
    );
  }

  const result = runCompose(env);
  if (result.status === 0) {
    process.exit(0);
  }

  if ((result.stderr ?? '').includes('docker-credential-desktop')) {
    console.error('');
    console.error('Docker is running, but the Docker credential helper is misconfigured.');
    console.error(
      'Your Docker config references `docker-credential-desktop`, but that executable is not available in PATH.',
    );
    console.error('Fix options:');
    console.error('1. Restart Docker Desktop and retry `pnpm db:up`.');
    console.error(
      '2. Remove or correct the `credsStore` / `credHelpers` entry in ~/.docker/config.json that points to `desktop`.',
    );
    console.error(
      '3. If Postgres is already running elsewhere, skip Docker and use `pnpm manual:gateway`.',
    );
  }

  process.exit(result.status ?? 1);
} finally {
  if (tempDockerConfigDir) {
    rmSync(tempDockerConfigDir, { recursive: true, force: true });
  }
}
