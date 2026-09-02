import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { config } from '../config.js';
import { relations } from './relations.js';
import * as schema from './schema.js';

if (!config.db.dbname) {
  throw new Error('Missing config.db.dbname for Postgres connection');
}

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.dbname,
});

export const db = drizzle({ client: pool, schema, relations });

// Ensure the schema exists for tests/dev runs.
await migrate(db, { migrationsFolder: `${process.cwd()}/drizzle` });
