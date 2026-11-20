# Campus Project Tracker — AD371

A small project-and-task tracker for comparing relational and document database design. Example: a project named "Build a portfolio website" contains tasks named "Design the homepage" and "Test the mobile layout".

## Current stage

The **Node.js API and both database implementations are complete and verified locally**. All 21 direct database checks and all 26 API/integration test scenarios passed in the recorded local runs. The original AI drafts are preserved, and the MongoDB duplicate-task-ID correction has been verified. See [the step-by-step API walkthrough](docs/api-walkthrough.md) and [recorded QA results](docs/qa-results/README.md).

GitHub repository: [ching202/ad371-campus-project-tracker](https://github.com/ching202/ad371-campus-project-tracker). This is a local backend; the submission's Live Demo URL can be **N/A - Local Polyglot Backend**. The video link and LMS submission remain separate steps.

## Selected tools

- JavaScript on Node.js 24, Express 5, and the native `pg` and `mongodb` drivers for one HTTP API.
- PostgreSQL 17 for the relational implementation.
- MongoDB 8 for the document implementation.
- Docker Compose for a repeatable local environment, including Node.js and its package manager.
- An HTTP demonstration/test script for the initial interface. The assignment allows a local backend and does not require a frontend or hosted URL.

These are assistant-selected implementation choices; the assignment does not mandate these particular engines or versions. Compose runs the API and both databases. Dependencies are pinned in `package.json` and `package-lock.json`; the Docker build uses `npm ci`.

## Feature scope and rules

- Create, list, read, rename, and delete projects.
- Create, read, update, and delete tasks belonging to a project.
- Task status is `todo`, `in_progress`, or `done`.
- Titles contain non-whitespace text and at most 120 characters; project descriptions have at most 2,000 characters.
- Each project contains at most 100 tasks through the API. SQL task creation enforces the limit inside a transaction while holding a parent-row lock. MongoDB checks capacity in the same atomic update that appends a task, and its database validator also limits the array. Direct SQL writes can bypass the application task-count limit.
- Deleting a project also deletes its tasks.
- IDs are UUIDs. The API will generate UUIDs rather than guessing the next numeric ID.
- The API will expose the same operations under `/api/sql/projects` and `/api/nosql/projects`. Each backend has independent demonstration data; each request selects one backend.

## Initial models

```text
PostgreSQL
projects                           tasks
--------                           -----
id (primary key)  1 ---------- *   project_id (foreign key)
title                              id (primary key)
description                        title
created_at                         status
updated_at                         created_at
                                   updated_at

MongoDB
projects collection
  one document
    _id, title, description, created_at, updated_at
    tasks: [ { id, title, status, created_at, updated_at }, ... ]
```

In SQL, project details are stored once in `projects`, while task details are stored in `tasks`. Every non-key field describes the entity identified by its table's primary key; project titles are not copied into task rows. We will use a join to retrieve a complete project.

In MongoDB, the main access pattern is reading a complete small project with all its tasks. Embedding supports that read with one `findOne` operation. Cross-project task reporting would be a different access pattern and could justify a different model.

The core SQL DDL is:

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(120) NOT NULL CHECK (title ~ '[^[:space:]]'),
    description VARCHAR(2000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL CHECK (title ~ '[^[:space:]]'),
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX tasks_project_id_idx ON tasks(project_id);
CREATE INDEX projects_created_at_id_idx ON projects(created_at DESC, id DESC);
```

The [complete initialization script](db/postgres/001-schema.sql) also defines timestamp-update triggers and wraps schema creation in a transaction.

An example MongoDB document in Extended JSON is:

```json
{
  "_id": "6cb0a75c-9d1b-46ae-9cb8-81064b0dfd02",
  "title": "Build a portfolio website",
  "description": "AD371 project",
  "created_at": { "$date": "2026-11-20T15:00:00Z" },
  "updated_at": { "$date": "2026-11-20T15:00:00Z" },
  "tasks": [{
    "id": "4b075d1d-534c-4e52-9976-e7c2b6719c8a",
    "title": "Design the homepage",
    "status": "todo",
    "created_at": { "$date": "2026-11-20T15:00:00Z" },
    "updated_at": { "$date": "2026-11-20T15:00:00Z" }
  }]
}
```

The [collection validator](db/mongo/001-schema.js) enforces field types, task statuses, text lengths, the bounded task array, and distinct task IDs within each project. `_id` is indexed automatically; a second index supports ordered project lists.

Original AI-generated schema drafts are preserved in `docs/drafts/`. Reviewed working versions are under `db/`, so changes can be compared honestly. See [the schema audit](docs/schema-audit.md) for the duplicate embedded task ID issue and its correction.

- `docs/drafts/01-schema.sql`: PostgreSQL tables, constraints, indexes, and timestamp triggers.
- `docs/drafts/01-mongo-schema.js`: MongoDB collection validation and index, intended for `mongosh`.
- `docs/drafts/01-example-project.json`: sample MongoDB document in Extended JSON. The `$date` objects represent BSON dates; this is not an API request body.
- `docs/ai-prompt-log.md`: actual user prompts and assistant design decisions.
- `docs/drafts/02-api/`: preserved first API source and configuration draft.
- `docs/api-audit.md`: query, transaction, validation, and concurrency review.

## Database setup and verification

Prerequisites: Docker Desktop with a running Linux container engine, Docker Compose, and internet access for the initial image downloads. With Git installed, download the project in PowerShell:

```powershell
git clone https://github.com/ching202/ad371-campus-project-tracker.git
Set-Location ad371-campus-project-tracker
```

Alternatively, download and extract the repository ZIP and open PowerShell in that folder. From the repository folder, start the services:

```powershell
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
```

The first startup initializes the SQL tables and MongoDB validator. Named volumes retain database data across ordinary stops and starts. The PostgreSQL password in Compose is a local teaching credential; neither database publishes a host port. Only the API is published, on `127.0.0.1:3000`. This setup is intended for a local assignment and has no authentication system.

Open [the API index](http://localhost:3000) or [the health check](http://localhost:3000/health). They return JSON. Docker supplies Node.js and npm; no separate host installation is needed.

## API routes

Use `/api/sql` for PostgreSQL or `/api/nosql` for MongoDB. Both use the same request and response shapes. They have independent data; requests select one engine.

| Method | Path after `/api/sql` or `/api/nosql` | Result |
| --- | --- | --- |
| POST | `/projects` | Create a project with optional initial tasks; 201 |
| GET | `/projects?limit=50&offset=0` | List project summaries with task counts; 200 |
| GET | `/projects/:projectId` | Read a complete project and its tasks; 200 |
| PATCH | `/projects/:projectId` | Change title and/or description; 200 |
| DELETE | `/projects/:projectId` | Delete the project and its tasks; 200 |
| POST | `/projects/:projectId/tasks` | Add a task; 201 |
| GET | `/projects/:projectId/tasks` | List a project's tasks; 200 |
| GET | `/projects/:projectId/tasks/:taskId` | Read one task; 200 |
| PATCH | `/projects/:projectId/tasks/:taskId` | Change title and/or status; 200 |
| DELETE | `/projects/:projectId/tasks/:taskId` | Delete one task; 200 |

POST and PATCH require `Content-Type: application/json`. Create-project example:

```json
{
  "title": "Build a portfolio website",
  "description": "AD371 project",
  "tasks": [{ "title": "Design the homepage", "status": "todo" }]
}
```

Successful resource responses wrap their result in `data`. List-project responses also include `pagination`; the default is 50 records, the maximum page size is 100, and the allowed offset is 0–1,000,000. Follow successive pages to retrieve all projects. IDs and timestamps are server-generated; timestamps use ISO 8601. Titles are trimmed and lengths count Unicode code points. Unknown fields and empty patches are rejected. Task ordering is not part of the API contract.

Errors use `{"error":{"code":"...","message":"..."}}`: invalid input is 400, missing records are 404, task-capacity conflicts are 409, oversized bodies are 413, unsupported content types are 415, and database unavailability can produce 503. The JSON body limit is 128 KB. PATCH changes supplied fields only. Deletions return `{"data":{"id":"...","deleted":true}}`.

Run the integration tests or the narrated terminal demo:

```powershell
docker compose exec -T api npm test
docker compose exec -T api npm run demo
```

The demo prints actual HTTP statuses and bodies for both backends. Both the demo and tests clean up only the projects they create. The tests require the running API and both databases and use the real stores for rollback and query-count checks.

For the 5-7 minute screen-and-webcam recording, use [the timed video guide](docs/video-guide.md) and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\video-demo.ps1` in PowerShell. The execution-policy option applies only to this process. This guided version pauses before each operation and shows actual `psql` and `mongosh` results alongside HTTP statuses. `-Auto` runs it without speaking pauses. The guide also includes a browser Network demonstration for 201/200/400/404 responses.

Run the prepared database checks:

```powershell
docker compose exec -T postgres psql -X -U campus -d campus_tracker -v ON_ERROR_STOP=1 -f /checks/sql-checks.sql
docker compose exec -T mongo mongosh --quiet --file /checks/mongo-checks.js
```

For live inspection in the recording:

```powershell
docker compose exec postgres psql -X -U campus -d campus_tracker
docker compose exec mongo mongosh campus_tracker
```

In `psql`, `\d tasks` displays the task table and its foreign key; `\q` exits. In `mongosh`, `db.getCollectionInfos({name: 'projects'})` displays validation rules; `exit` leaves the shell. The automated checks use temporary data: SQL rolls back its changes, and MongoDB removes only the randomly identified documents it created.

To stop the databases while retaining their data:

```powershell
docker compose stop
```

Initialization scripts run only when a database volume is first initialized. Later schema changes require a migration; simply restarting an initialized volume will not reapply these files.

See [the next lesson](docs/next-lesson.md) for the schema explanation and [Docker startup notes](docs/docker-startup.md) for the resolved installation and permission issues.

## Code map

- `src/server.js`: connects at startup, starts HTTP, and closes connections on shutdown.
- `src/app.js`: routes, HTTP status codes, JSON responses, and error middleware.
- `src/validation.js`: shared field validation, UUIDs, pagination, and task limits.
- `src/db.js`: connection pools, driver command logging, and health checks.
- `src/stores/sql.js`: parameterized SQL, joins, transactions, and parent-row locks.
- `src/stores/mongo.js`: complete-document reads and atomic embedded-task operations.
- `test/api.test.js`: real HTTP/database integration and concurrency tests.
- `scripts/api-demo.js`: repeatable console demonstration.
- `scripts/video-demo.ps1`: paced recording demonstration with direct database checks.
- `scripts/browser-network-demo.js`: local browser DevTools demonstration of HTTP statuses.

SQL trace logs show statement text with placeholders and parameter counts; they omit parameter values. MongoDB logs show command names and collection names. HTTP logs show method, path, status, and elapsed time. View them with `docker compose logs --tail 60 api`. Set `LOG_QUERIES` to `'false'` in Compose if query traces are not needed, then recreate the API service.

## Remaining submission work

1. Review the walkthrough and practice explaining the schemas, API, and actual AI audit correction.
2. Include [this GitHub repository](https://github.com/ching202/ad371-campus-project-tracker) in the LMS submission.
3. Record the required 5–7 minute screen-and-webcam demonstration, showing the database CLI checks as well as API behavior, then complete the LMS submission. A hosted demo is optional; this project can be submitted as a local backend.

## QA status

Passed locally on November 20, 2026: Docker Compose configuration validation; JavaScript syntax checks for the working MongoDB schema and MongoDB checks; PowerShell parsing for the helper scripts; and parsing of the sample JSON.

Runtime checks passed on November 20, 2026: **9 PostgreSQL checks and 12 MongoDB checks**. They cover direct CRUD, joined SQL reads, foreign-key rejection, cascade deletion, rollback, embedded MongoDB reads and atomic updates, duplicate task ID rejection, blank/invalid input rejection, and MongoDB's 100-task limit. Both scripts exited with code 0. Subsequent database reads confirmed that test data was cleaned up.

Actual server versions: PostgreSQL 17.12 and MongoDB 8.0.38. Both containers are healthy. The database schemas, indexes, and validators were also inspected directly. Evidence is in [docs/qa-results](docs/qa-results/README.md).

The 26 API/integration scenarios additionally passed: full HTTP CRUD in both engines with underlying-state checks; input and Unicode-boundary validation; literal handling of injection-like text; 400/404/409/413/415 errors; pagination; cross-project task isolation; concurrent task-capacity enforcement; simultaneous partial edits; delete/append races; real SQL store rollback after partial writes; connection reuse after repeated failures; and a one-command MongoDB adapter read.

The host could reach `/health`, all three containers were healthy, and captured server logs showed parameterized SQL with no unexpected server/pool errors or driver-warning patterns. The demo produced 200, 201, 400, and 404 responses in both engines. Actual evidence and limitations are documented in [QA results](docs/qa-results/README.md). Browser UI/responsive checks are not applicable to this backend-only implementation; the student still needs to demonstrate the results live in the recording. Database-outage behavior and a large production workload have not been tested.

## References used for model design

- [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html)
- [MongoDB embedding](https://www.mongodb.com/docs/manual/data-modeling/embedding/)
- [MongoDB JSON Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/)
- [MongoDB unbounded arrays](https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/unbounded-arrays/)
