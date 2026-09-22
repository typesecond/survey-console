#!/bin/sh
set -eu

exec tini -- npx fastify start -a 0.0.0.0 -p 3000 -l info dist/app.js
