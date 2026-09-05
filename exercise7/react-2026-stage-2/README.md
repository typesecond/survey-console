# React Frontend 2026, Stage 1

In this assignment, you are being asked to write a rudimentary
frontend for user authentication and management using the API you created
in the last exercise.

We will be using the [React](https://reactjs.org) framework.
The learning goal is to get started with React by examining, building, and
combining React components. You will also become familiar with associated
toolchains and framework libraries, including vite and react-router.

## Preparation:

You will need to work with your API stage 2 implementation.
We assume that you started your API server (by default, it uses port 3000).
You can change this assumption in [`vite.config.ts`](vite.config.ts), which
configures a proxy server under which the API will be accessible.

## Requirements

The partial application provided in this repository provides a rudimentary
navigation bar one form to log in a user. You should add the following:

- a child route to register as a user. Newly registered users should be logged in.

- a child route to display the user's "profile", that is, the current user's username and fullname.
  This route should also allow the user to update their profile, including changing their
  password. This route should be available only to logged-in users.

- a child route to list all users in a table.
  This option should be available only if the user that is currently logged in
  is an admin.

For testing, you may find it useful to add a logout route. Supporting logout
requires clearing the refresh token cookie and access token, which requires an
additional API end point.

## Setup:

As usual, you should first fork the project on git.cs.vt.edu, then set
your fork to be private, then clone your fork onto your machine.

## Provided Code:

The provided code was created from scratch using the vite template
generator (`npm create vite`), selecting TypeScript and React, and then adding React Router.

The provided code uses [data mode](https://reactrouter.com/start/modes#data) of React Router v7.
We ask that your application uses this library and this mode. This will allow us to cleanly
separate front end and back end later on. You should use RRv7 in data mode for this project.

The provided code includes [tailwindcss](https://tailwindcss.com/) and [daisyUI](https://daisyui.com/)
but does not use a UI component library.

You are welcome to use some of the provided utility functions in `util/auth.ts`, particularly
the return result conventions in `util/result.ts`, but you are not required to.

## TypeScript, Linting, Formatting

The provided code should cleanly compile, lint, and be formatted correctly.

To verify this, you can use

```
npm run build
npm run lint
npm run formatcheck
```

## Submission

Make sure the code you submit builds, passes lint, and is correctly formatted.

Use `git archive` to prepare a tar file for submission:

```bash
git archive --format=tar --output=react-stage-1.tar --prefix=<yourpid>-react-stage-1/ yourbranch
```

For instance, if your pid were `gback` and you had committed your changes to a
`master` branch, it would be:

```bash
git archive --format=tar --output=react-stage-1.tar --prefix=gback-react-stage-1/ master
```

Then you upload react-stage-1.tar as part of your submission.

When done, prepare a narrated video demoing your application.
In your narrated demo,

- show each aspect of the required functionality
- discuss how you implemented error handling
- describe whether or not you made use of generative AI in creating your solution

-- created by gback Mar 2026
