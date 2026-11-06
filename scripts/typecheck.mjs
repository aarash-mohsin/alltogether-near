import { spawnSync } from 'node:child_process';
for (const config of ['tsconfig.server.json', 'tsconfig.web.json']) {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', config], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
