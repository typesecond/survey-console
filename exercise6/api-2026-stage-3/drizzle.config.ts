import { defineConfig } from 'drizzle-kit';
import { getConfig } from './src/config.js';

const config = await getConfig();

if (!config.db.dbname) {
  throw new Error('Missing config.db.dbname for Drizzle config');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.dbname,
    ssl: false,
  },
});
