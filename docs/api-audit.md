# API draft review

The first generated API source, package manifest, Dockerfile, and Compose file were saved in `docs/drafts/02-api/` before runtime execution. The original database drafts remain in `docs/drafts/01-*`. The API review below was performed before starting the service.

| Concern | Review result |
| --- | --- |
| SQL injection | Request values are passed separately as `$1`, `$2`, etc. The only SQL string interpolation is a fixed, source-controlled list of task columns, never client input. |
| SQL transactions | Project-plus-task creation, project updates, and task mutations use one checked-out client with BEGIN/COMMIT/ROLLBACK. The client is released in finally; a connection whose rollback fails is discarded. |
| SQL concurrency | Every task mutation locks its parent first. Task creation locks before counting. The count and insertion occur inside that transaction, preventing concurrent API writers from overshooting 100 tasks. Direct SQL writes can bypass this application limit; the database foreign key remains enforced. |
| SQL reads | A complete project is fetched with one LEFT JOIN and JSON aggregation. The LEFT JOIN preserves projects with zero tasks. |
| MongoDB reads | A complete project uses one findOne against the projects collection. No tasks collection or manual joins. |
| MongoDB writes | Task append checks capacity in the same findOneAndUpdate as `$push`. Task patches use `$set` on allowed fields; deletion uses `$pull`. Parent-plus-task creation is one document insert. |
| Request validation | Both backends use the same field allowlists, string checks, UUID checks, statuses, pagination bounds, and 100-task create limit. Client-provided IDs, timestamps, MongoDB operators, and whole-array patches are rejected. |
| ID generation | The server uses Node's crypto.randomUUID. URLs are validated and normalized to lowercase. |
| Responses | Both adapters expose `id`, ISO timestamps, the same task fields, and JSON errors. MongoDB `_id` is mapped to `id`. |
| Resource handling | Reused PostgreSQL and MongoDB connection pools; startup connectivity check; health endpoint; graceful HTTP shutdown and database client closure. |
| Local scope | The API is published only on 127.0.0.1:3000. Database ports stay inside the Compose network. This assignment service has no account/authentication system and is intended for local demonstration. |

Runtime verification was pending at the time of this review. The integration suite is designed to exercise real HTTP responses and database state, including concurrent requests, failed-transaction rollback, connection reuse, single-query MongoDB reads, and cleanup. The verified MongoDB schema flaw and correction are documented separately in `schema-audit.md`; no extra flaw is invented for this API review.

## Runtime result

All 26 integration scenarios subsequently passed on November 20, 2026. The demo also completed against both backends. The API source passed its first live integration run; no additional API correction was needed for those scenarios. See [test output](qa-results/api-tests.txt), [demo output](qa-results/api-demo.txt), and [server traces](qa-results/api-server.txt).

The tests directly checked the stored state, SQL rollback after earlier successful inserts, released SQL clients after 12 forced failures, one MongoDB find command per complete-project adapter read, 100-task capacity under eight concurrent append requests, concurrent partial updates, and deletion racing with an append. Host access to `/health` succeeded. No unexpected server/pool errors or driver-warning patterns appeared in the captured API log. This does not establish behavior under database outages or a large production workload.

Sources: [node-postgres parameterized queries](https://node-postgres.com/features/queries), [node-postgres transactions](https://node-postgres.com/features/transactions), [MongoDB compound operations](https://www.mongodb.com/docs/drivers/node/current/crud/compound-operations/), [Express error handling](https://expressjs.com/en/guide/error-handling/).
