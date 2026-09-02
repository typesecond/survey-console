// See https://orm.drizzle.team/docs/seed-overview#basic-usage

import bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import { seed, reset } from 'drizzle-seed';

import { config } from '../src/config.js';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';

async function main() {
  await reset(db, { users });

  await seed(db, { users }, { count: 100 }).refine((funcs) => ({
    users: {
      columns: {
        password: funcs.default({ defaultValue: '12345678' }),
        admin: funcs.default({ defaultValue: false }),
      },
    },
  }));

  const seededUsers = await db.select({ id: users.id }).from(users);

  await Promise.all(
    seededUsers.map(async (user) => {
      const hashedPassword = await bcrypt.hash(
        '12345678',
        config.auth.bcrypt_salt_rounds,
      );

      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, user.id));
    }),
  );

  // drizzle-seed can leave identity sequences behind after inserting rows.
  // Align the users.id sequence with the current max(id) so later inserts
  // using DEFAULT generate a fresh primary key.
  await db.execute(sql`
    select setval(
      pg_get_serial_sequence('users', 'id'),
      coalesce(max(id), 1),
      max(id) is not null
    )
    from users
  `);
}

main();
