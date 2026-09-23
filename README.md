# Survey Console

A survey application with live vote results, graph insights, and a Kubernetes deployment. Built from the CS3754 Spring 2026 API and React starter projects; their original assignment documentation remains in the application directories.

## Project layout

| Path | Purpose |
| --- | --- |
| `exercise6/api-2026-stage-3` | Fastify and TypeScript API, PostgreSQL schema and migrations, Redis cache, Socket.IO broadcasts |
| `exercise7/react-2026-stage-2` | React survey console, live results, interactive graph views and planarity demonstrations |
| `docker-compose.yml` | Local frontend, backend, PostgreSQL and Redis services |
| `k8s` | Kubernetes deployments, services, ingress and configuration template |

## Run locally

Install Docker with Compose, then run from this directory:

```sh
docker compose up --build
```

Open <http://localhost:8080>. The backend listens on port 3000 and applies the Drizzle migrations at startup. Compose stores PostgreSQL and Redis data in named volumes. The checked-in database credentials and default JWT secrets are development values.

Register an account through the console. To promote it to an administrator for creating questions:

```sh
docker compose exec postgres psql -U appuser -d appdb \
  -c "UPDATE users SET admin = true WHERE username = 'your-username';"
```

Log in again after changing the account's role.

## Survey and graph features

Administrators create and edit questions with answer choices. Registered users vote and inspect tallies. Socket.IO broadcasts result updates across backend replicas through Redis, with polling as a fallback. Redis also caches user records and question results.

The Insights page displays question similarity and answer-choice affinity graphs. Question edges combine shared-voter overlap with vote-distribution similarity. Choice edges combine shared-voter affinity with text similarity. Both graph endpoints require authentication:

- `GET /api/question/graph/similarity`
- `GET /api/question/graph/affinity`

Selecting a node shows its strongest connections. The planarity tool checks Euler's edge bound, explicit K5 and K3,3 subgraphs, and searches for a crossing-free drawing. The drawing search is heuristic: failure to find a layout is not a general proof of non-planarity. The page includes clearly labeled mock graphs for demonstrations.

## Kubernetes

The manifests target the `3754-app` namespace and the Virginia Tech container registry. Adjust image names and the ingress hostname for another cluster. The backend has two replicas; Redis distributes live updates between them. The current PostgreSQL deployment uses `emptyDir`, so its data is lost when the pod is replaced. An unused PVC manifest is included for adapting storage to your cluster.

Create a local secret file from the template and replace the JWT placeholders before deploying:

```sh
cp k8s/secret.example.yaml k8s/secret.yaml
```

The local `k8s/secret.yaml` and `discovery.yaml` kubeconfig are excluded from Git. The namespace and `regcred` image-pull secret must already exist. With your cluster credentials configured:

```sh
kubectl kustomize k8s
kubectl apply -k k8s
```

Ingress routes `/api` and `/socket.io` to the backend and `/` to the frontend. The frontend container also proxies API and WebSocket requests for the Compose setup.

## Development checks

Use Node.js 22 and install dependencies with `npm ci` in each application directory.

```sh
# exercise6/api-2026-stage-3
npm run build:ts
npm run lint

# exercise7/react-2026-stage-2
npm run build
npm run lint
```

The backend's `npm test` suite requires a separate PostgreSQL database named `testdb`, using the connection settings in `config/default.yaml` and `config/test.yaml`. It resets test data, so use a dedicated test database. The existing test helper predates the Redis integration and does not register the realtime plugin or its cache decorators; it needs updating before running the full suite against the current API.
