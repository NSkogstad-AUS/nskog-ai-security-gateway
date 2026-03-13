import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const removablePaths = [
  '.turbo',
  join('apps', 'console', '.next'),
  join('apps', 'console', 'tsconfig.tsbuildinfo'),
];

for (const path of removablePaths) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

for (const group of ['apps', 'packages']) {
  for (const entry of readdirSync(group)) {
    const distPath = join(group, entry, 'dist');
    if (existsSync(distPath)) {
      rmSync(distPath, { recursive: true, force: true });
    }
  }
}
