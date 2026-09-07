// courtesy GPT 5.2
import { loadConfig } from 'c12';
import { z } from 'zod';

export const DbConfigSchema = z.object({
  filename: z.string().min(1).optional(),
  host: z.string().min(1).default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(5432),
  user: z.string().min(1).default('postgres'),
  password: z.string().default(''),
  dbname: z.string().min(1).optional(),
});

export const RedisConfigSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(6379),
  db: z.coerce.number().int().min(0).default(0),
  password: z.string().optional(),
  cache_ttl_seconds: z.coerce.number().int().positive().default(60),
});

const ConfigSchema = z.object({
  auth: z.object({
    access_token_expiration: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600)
      .default(120),
    access_token_secret: z.string().min(32),
    refresh_token_secret: z.string().min(32),
    refresh_token_expiration: z.coerce.number().int().min(0).default(3600),
    refresh_cookie_name: z.string().min(1).default('refresh_token'),
    bcrypt_salt_rounds: z.coerce.number().int().min(4).max(14).default(10),
  }),
  db: DbConfigSchema,
  redis: RedisConfigSchema.default(() => ({
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    cache_ttl_seconds: 60,
  })),
  routes: z.object({
    api_prefix: z.string().min(1).startsWith('/').default('/api'),
    user_prefix: z.string().min(1).startsWith('/').default('/user'),
  }),
  runtime: z
    .object({
      replica_id: z
        .string()
        .min(1)
        .default(process.env.HOSTNAME ?? 'local'),
    })
    .default(() => ({
      replica_id: process.env.HOSTNAME ?? 'local',
    })),
  debug: z
    .object({
      problem_details: z.coerce.boolean().default(false),
    })
    .default(() => ({ problem_details: false })),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function getConfig(): Promise<AppConfig> {
  const env =
    (process.env.NODE_ENV as 'development' | 'test' | 'production') ??
    'development';

  const { config } = await loadConfig({
    cwd: `${process.cwd()}/config`,
    configFile: env,
    rcFile: false,
    packageJson: false,
    dotenv: true,
  });

  const runtimeReplicaId = process.env.REPLICA_ID ?? process.env.HOSTNAME;

  return ConfigSchema.parse({
    ...config,
    runtime: {
      ...(config.runtime ?? {}),
      replica_id: runtimeReplicaId ?? config.runtime?.replica_id,
    },
  });
}

export const config = await getConfig();
