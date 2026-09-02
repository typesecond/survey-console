import { defineRelations } from 'drizzle-orm';
import * as schema from './schema.js';

/*
 * This relation builder explains to drizzle that there is a 1:many
 * relationship between surveyquestions and answer choices.
 */
export const relations = defineRelations(schema, (r) => ({
  /* 1:many relationship from surveyquestion.id to r.answerchoice.surveyid
     You can now say: "with: { choices: true }" or
     more refined

        with: {
          choices: {
            columns: {
              id: true,
              description: true,
            },
            orderBy: {
              surveypos: 'asc',
            },
          },
        },

     which will include, for each question, an array of
     answer choices as (id, description), sorted by surveypos.
  */
  surveyquestion: {
    choices: r.many.answerchoice({
      from: r.surveyquestion.id,
      to: r.answerchoice.surveyid,
    }),
  },
}));
