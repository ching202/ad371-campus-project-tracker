# Next lesson: read the schemas, then prove their rules

## 1. Start with the relationship

A project is the parent. Its tasks are children. Each task belongs to one project. Our main read is "show this project with all its tasks."

## 2. Read the SQL relationship

In `db/postgres/001-schema.sql`, find:

```sql
project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
```

Read it in parts:

- `UUID`: the value is an identifier.
- `NOT NULL`: a task cannot leave its project unspecified.
- `REFERENCES projects(id)`: that project must exist in the database. This is the foreign key.
- `ON DELETE CASCADE`: removing the project also removes its tasks.

The `tasks_project_id_idx` index helps look up tasks by project. It is separate from the foreign key: PostgreSQL does not automatically create an index on the referencing column.

## 3. Read the MongoDB relationship

In `docs/drafts/01-example-project.json`, the project contains a `tasks` array. Reading this project document returns its tasks too. There is no separate tasks collection to join.

This fits our small-project scope: each project has at most 100 tasks, and titles/descriptions have bounded lengths. It would need reconsideration for projects with an unlimited activity feed or millions of tasks.

## 4. Understand the actual audit correction

The first MongoDB draft allowed two tasks to have the same ID inside one project. An ID such as "task A" should identify one task, so that omission matters when updating or deleting a task.

The correction compares:

```text
number of tasks == number of distinct task IDs
```

If three tasks have IDs A, B, and A, there are three tasks but only two distinct IDs. The write is rejected. The real implementation uses UUIDs rather than these short illustrative labels.

The original draft is preserved. See `schema-audit.md` for authorship and verification status.

## 5. Start the databases and inspect their state

Once Docker Desktop starts successfully, use the startup commands in the README. A healthy database container means the server is reachable; it does not by itself prove every schema rule. That is why the next step runs explicit checks.

The PostgreSQL check script demonstrates a joined read, updates, individual deletion, orphan rejection, cascade deletion, and rollback. The MongoDB check script demonstrates a complete-document read, atomic push and field update, individual deletion, validation rejection, and project deletion.

Each prints PASS only after checking the actual database response or subsequent state. A nonzero process exit means the checks did not finish successfully. These are direct database checks; the later API stage will add HTTP status, input validation, connection handling, and concurrency checks.

## 6. Build the HTTP API next

Once the data rules work, the API will provide the same project/task operations for each engine. SQL values must be passed as query parameters. A project-plus-tasks SQL create must use one connection and one transaction. MongoDB task changes must use atomic update operators rather than reading an array and replacing it later.

Sources: [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), [MongoDB embedding](https://www.mongodb.com/docs/manual/data-modeling/embedding/), [MongoDB unique indexes and schema validation](https://www.mongodb.com/docs/manual/tutorial/unique-indexes-schema-validation/), [node-postgres transactions](https://node-postgres.com/features/transactions).
