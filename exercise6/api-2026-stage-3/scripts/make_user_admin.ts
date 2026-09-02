import { eq } from 'drizzle-orm';

import { db, pool } from '../src/db/index.js';
import { users } from '../src/db/schema.js';

async function main() {
  const username = process.argv[2]?.trim();

  if (!username) {
    console.error(`Usage: npx tsx scripts/make_user_admin.ts <username>`);
    process.exitCode = 1;
    return;
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      admin: users.admin,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    console.error(`User not found: ${username}`);
    process.exitCode = 1;
    return;
  }

  if (user.admin) {
    console.log(`User ${user.username} is already an admin.`);
    return;
  }

  await db.update(users).set({ admin: true }).where(eq(users.id, user.id));
  console.log(`User ${user.username} is now an admin.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
