#!/usr/bin/env node

import { loadConfig } from 'c12';

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const envName = process.argv[2] ?? process.env.NODE_ENV ?? 'development';

const { config } = await loadConfig({
  cwd: new URL('../config/', import.meta.url).pathname,
  configFile: envName,
  rcFile: false,
  packageJson: false,
  dotenv: true,
});

const { db } = config ?? {};

if (!db || typeof db !== 'object') {
  fail(`Missing db config in config/${envName}.yaml`);
}

for (const key of ['dbname', 'user', 'password']) {
  if (typeof db[key] !== 'string' || db[key].length === 0) {
    fail(`Missing db.${key} in config/${envName}.yaml`);
  }
}

const commandParts = [
  `docker run -d`,
  `--network pgnet`,
  `--network-alias postgres`,
  `--name ${shellEscape(`${db.dbname}-db`)}`,
  `-e POSTGRES_DB=${shellEscape(db.dbname)}`,
  `-e POSTGRES_USER=${shellEscape(db.user)}`,
  `-e POSTGRES_PASSWORD=${shellEscape(db.password)}`,
  `-v pgdata:/var/lib/postgresql`,
];

if (typeof db.port === 'number' || typeof db.port === 'string') {
  commandParts.push(`-p ${shellEscape(String(db.port))}:5432`);
}

commandParts.push('postgres:16');

console.log(commandParts.join('\\\n    '));
