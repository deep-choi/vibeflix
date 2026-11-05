// Applies drizzle/*.sql in journal order to the local D1 that `npm start` uses (.wrangler/state), once each.
// Run after `npm run build` (it reads dist/server/wrangler.json):  npm run db:migrate:local
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { projectRoot } from './sites-env.mjs';

process.chdir(projectRoot);
const persist = process.env.VIBEFLIX_QA_PERSIST || '.wrangler/state';
const base = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', persist];
function run(extra) {
  const result = spawnSync(process.execPath, [...base, ...extra], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stdout, result.stderr); process.exit(result.status ?? 1); }
  return result.stdout;
}
run(['--command', 'CREATE TABLE IF NOT EXISTS _local_migrations (tag TEXT PRIMARY KEY)']);
const applied = new Set(JSON.parse(run(['--json', '--command', 'SELECT tag FROM _local_migrations']))[0].results.map(r => r.tag));
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
let count = 0;
for (const { tag } of journal.entries) {
  if (applied.has(tag)) continue;
  run(['--file', `drizzle/${tag}.sql`]);
  run(['--command', `INSERT INTO _local_migrations (tag) VALUES ('${tag}')`]);
  console.log(`applied ${tag}`); count++;
}
console.log(count ? `Applied ${count} migration(s) to the local D1.` : 'Local D1 is up to date.');
