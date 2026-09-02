import {
  pgTable,
  integer,
  boolean,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';

// User management table for authentication and profile identity.
export const user = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  password: text('password').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullname: varchar('fullname', { length: 255 }).notNull(),
  admin: boolean('admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

// Survey question table that stores question text and description
export const surveyquestion = pgTable('surveyquestion', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  question: varchar('question').notNull(),
  description: varchar('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

// Answer choice table.  For each question, there is a set of tuples
// (id, surveyid, description, surveypos)
// where surveypos = 0, 1, 2, ...
export const answerchoice = pgTable(
  'answerchoice',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    description: varchar('description').notNull(),
    surveyid: integer()
      .notNull()
      .references(() => surveyquestion.id),
    surveypos: integer().notNull(),
  },
  (table) => ({
    surveyidIdx: uniqueIndex('surveyid').on(table.id, table.surveyid),

    posInSurveyUnique: uniqueIndex('pos_in_survey').on(
      table.surveyid,
      table.surveypos,
    ),
  }),
);

// Junction table: user voted on survey with answerchoice
export const vote = pgTable(
  'vote',
  {
    answerchoiceid: integer('answerchoiceid').notNull(),
    userid: integer('userid').notNull(),
    surveyid: integer('surveyid').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.answerchoiceid, table.userid, table.surveyid],
    }),

    isAUserIdx: index('is_a_user').on(table.userid),
    isASurveyquestionIdx: index('is_a_surveyquestion').on(table.surveyid),

    // answerchoice and survey must exist
    isAAnswerchoiceFk: foreignKey({
      name: 'is_a_answerchoice',
      columns: [table.answerchoiceid, table.surveyid],
      foreignColumns: [answerchoice.id, answerchoice.surveyid],
    }),

    // surveyquestion must exist
    isASurveyquestionFk: foreignKey({
      name: 'vote_surveyquestion_fk',
      columns: [table.surveyid],
      foreignColumns: [surveyquestion.id],
    }),

    // user must exist
    isAUserFk: foreignKey({
      name: 'vote_user_fk',
      columns: [table.userid],
      foreignColumns: [user.id],
    }),
  }),
);
