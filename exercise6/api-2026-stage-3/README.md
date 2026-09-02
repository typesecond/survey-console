# User and Question API, Stage 3

## Requirements:

This stage will build on stage 2, but will expand it in 2 ways:

1. By using a relational database (PostgreSQL) + ORM (drizzle-kit)

2. By adding API entry points to implement survey question and vote
   management functions to add survey questions and answer choices.

First, make sure that your stage 2 works and passes all the tests. Although you should start
over with a new git repository, you should carry over and reuse your stage 2 implementation
of REST API calls as appropriate for this stage. Compared to stage 3, this repository
has some refactorings that move the location of some functions, but otherwise is similar
to the stage 2 one.

Endpoints to be implemented:

**Admin only**

    GET     /api/user              Lists all users
    DELETE  /api/user              Delete the entire user database
    POST    /api/question          Create a new question
    PUT     /api/question/:id      Update an existing question

**Admin or regular user with matching `id`**

    GET     /api/user/:id    Retrieve a user's information
    PUT     /api/user/:id    Update a user's information
    DELETE  /api/user/:id    Delete a user identified by its id
    POST    /api/refresh     Refresh a JWT access token

**Regular user**
GET /api/question/:id Get an existing question
POST /api/question/:id/vote Vote on a question
GET /api/question/:id/results Get vote tallies on a question
POST /api/logout Logout

**No authentication**

    POST    /api/user       Create a new user and return its id
    POST    /api/login       Authenticate a regular user or admin using a password
                             and return access and refresh tokens

For the details of the expected inputs and responses see the code.

For the assignment, I am again providing a skeleton of my own handmade implementation.
The unit tests were created and/or extended by an agent AI to test the implementation.

## Database

We will be using [PostgreSQL](https://www.postgresql.org/) as our database.
You may install it in a container, see [here](pg-installation-notes.md) for how.
Make sure to update [config/default.yaml](config/default.yaml) with the access parameters
for your database.

The database is implemented as a separate layer, which means that your API
implementation should not directly access any database (or ORM) functions.
This will allow, in the future, to switch to another ORM and/or database.
See [src/db/questions.ts](src/db/questions.ts) and [src/db/users.ts](src/db/users.ts)
for how you could structure this layer. (If you decide on different functions, that's
fine, too, as long as the database layer remains in place.)

## ORM

We will be using [drizzle](https://orm.drizzle.team/) as our ORM.
I have created the [src/db/schema.ts](sec/db/schema.ts) and relation file for you,
which you are welcome to use and build from.

## Linting and formatting:

Setup, linting, and formatting are as in the previous project using
ESLint and Prettier as per `eslint.config.js` and `.prettierrc`. You
may add additional rules, but you may not remove any.

When you're done, running `npm run formatcheck` and `npm run lint`
should not output any errors. The code should also compile via `npm run build:ts`

Right now `npm run lint` does output errors due to the removed code.

## Submission

You will be submitting the entire project directory, but you may
not make changes to the tests file we provide. To submit, please commit your
changes to your clone, then push them to your fork on git.cs.vt.edu.

_After_ you have committed your code, use `git archive` to prepare a tar file for submission:

```bash
git archive --format=tar --output=api-stage-3.tar --prefix=<yourpid>-api-stage-3/ yourbranch
```

For instance, if your pid were `gback` and you had committed your changes to a
`master` branch, it would be:

```bash
git archive --format=tar --output=api-stage-3.tar --prefix=gback-api-stage-3/ master
```

Note that `git archive` will only archive committed code, not code that's uncommitted
and dirty in your working directory. You should make it a habit to frequently
commit your code as you work and develop.

Then you upload api-stage-3.tar as part of your submission.

When done, prepare a presentation (no more than 5 slides) and record
a video of yourself narrating your presentation; no more than 4 minutes.
These limits will be strictly enforced.
In your narrated presentation, discuss

- what this exercise was about (a synopsis)
- given 2 examples, explain how the ORM translated the database accesses
  into SQL. Provide the actual SQL used.
- explain how you leveraged the ORM's relation builder to simplify your
  implementation
- explain how you communicate database conflicts from the database layer
  to the API layer
- describe whether or not you made use of generative AI in creating your solution

-- created by gback Mar 2026
