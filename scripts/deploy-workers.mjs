// Build, migrate and deploy VIBEFLIX to the Cloudflare Worker `vibeflix` (https://vibeflix.cryingonion77.workers.dev).
//   npm run deploy:workers            build + pending migrations + deploy
//   npm run deploy:workers -- --dry   show what would run, change nothing
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WORKER = "vibeflix";
const DATABASE = { name: "vibeflix-db", id: "78602dd4-7d12-4dea-8bcc-fd83b01f356d" };
// Applied by hand before migrations were tracked; recorded once so they are never re-run.
const BASELINE = ["0000_yummy_alice", "0001_sleepy_roxanne_simpson", "0002_cynical_the_liberteens", "0003_magical_pestilence"];
const CONFIG = "dist/server/wrangler.json";
const dry = process.argv.includes("--dry");

function run(args, { capture = false } = {}) {
  console.log(`$ ${args.join(" ")}`);
  if (dry && !capture) return "";
  const result = spawnSync(process.execPath, args, { stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}
const wrangler = (...args) => ["node_modules/wrangler/bin/wrangler.js", ...args];
const sql = (command) => JSON.parse(run(wrangler("d1", "execute", DATABASE.name, "--remote", "--json", "--command", command), { capture: true }))[0].results;

if (!dry) run(["scripts/run-framework.mjs", "build"]);

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
config.name = WORKER;
config.d1_databases = (config.d1_databases || []).map((d) => (d.binding === "DB" ? { ...d, database_name: DATABASE.name, database_id: DATABASE.id } : d));
config.observability = { enabled: true, head_sampling_rate: 1 };
if (!dry) writeFileSync(CONFIG, JSON.stringify(config));

const write = (command) => (dry ? console.log(`$ (dry) ${command}`) : sql(command));
write("CREATE TABLE IF NOT EXISTS _vibeflix_migrations (tag TEXT PRIMARY KEY, applied INTEGER NOT NULL)");
const tracked = sql("SELECT name FROM sqlite_master WHERE type='table' AND name='_vibeflix_migrations'").length > 0;
const applied = new Set(tracked ? sql("SELECT tag FROM _vibeflix_migrations").map((r) => r.tag) : []);
if (!applied.size) {
  write(`INSERT OR IGNORE INTO _vibeflix_migrations (tag, applied) VALUES ${BASELINE.map((t) => `('${t}', 0)`).join(",")}`);
  BASELINE.forEach((t) => applied.add(t));
}
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const pending = journal.entries.map((e) => e.tag).filter((t) => !applied.has(t));
console.log(pending.length ? `Pending migrations: ${pending.join(", ")}` : "No pending migrations.");
for (const tag of pending) {
  run(wrangler("d1", "execute", DATABASE.name, "--remote", "--file", `drizzle/${tag}.sql`));
  write(`INSERT INTO _vibeflix_migrations (tag, applied) VALUES ('${tag}', ${Date.now()})`);
}

run(wrangler("deploy", "--config", CONFIG));
