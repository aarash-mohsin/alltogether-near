import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : /\.(test|spec)\.(ts|mjs)$/.test(entry.name) ? [join(dir, entry.name)] : []); }
const files = walk('tests');
if (!files.length) throw new Error('No tests found.');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
