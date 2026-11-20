# Database and API QA results

Executed November 20, 2026, at approximately 4:34 p.m. America/New_York.

**Result: 21 direct database checks plus 26 API/integration scenarios passed.** The database scripts, integration suite, and API demo exited with code 0.

Environment: Docker Desktop 4.99.0, Docker Engine 29.9.3, Docker Compose v5.7.0, PostgreSQL 17.12, MongoDB 8.0.38. Both containers reported healthy after initialization.

## PostgreSQL — 9 checks passed

1. Parent/child creation and joined read.
2. Task update visible in the next read.
3. Project update visible in the next read.
4. Orphan task rejected by the database foreign key (SQLSTATE 23503).
5. Invalid task status rejected (SQLSTATE 23514).
6. Blank project title rejected (SQLSTATE 23514).
7. Individual task deletion.
8. Project deletion cascades to its child task.
9. Transaction rollback leaves neither the parent nor the child.

Evidence: [actual test output](postgres.txt), [live SQL tables, constraints, indexes, triggers, and cleanup counts](postgres-schema.txt).

## MongoDB — 12 checks passed

1. Complete project and its embedded task returned by one `findOne`.
2. Atomic embedded-task append.
3. Atomic embedded-task status update.
4. Project update.
5. Duplicate embedded task ID rejected (code 121): regression check for the schema audit correction.
6. Rejected duplicate leaves the document unchanged.
7. Blank title rejected (code 121).
8. Invalid task status rejected (code 121).
9. Individual embedded-task deletion.
10. Task 101 rejected by the bounded-array validator (code 121).
11. Rejected append leaves the 100-task document unchanged.
12. Deleting the project removes the document and its embedded tasks.

Evidence: [actual test output](mongodb.txt), [live validator, indexes, server version, and cleanup count](mongodb-schema.json).

## Cleanup and limits of these results

Post-test reads confirmed zero SQL projects, zero SQL tasks, and zero MongoDB project documents. The checks removed only their generated test data; the schemas and database volumes remain available. [Container status](container-status.txt) records both services as healthy.

The 21 checks above directly exercise the databases. They are separate from the HTTP service tests described below. Their SQL rollback check uses an explicit database transaction; application exception handling is covered by the later store-level failure scenario.

To reproduce these results, run the database check commands in the repository README. Expected constraint errors are caught and checked by the scripts; their PASS lines confirm the rejection that the assignment requires.

## API and integration verification — 26 scenarios passed

Executed November 20, 2026, using Node.js 24.22.3, Express 5.3.0, pg 8.23.1, and mongodb 7.9.1. All three Compose services are healthy. Test output: [api-tests.txt](api-tests.txt).

- Both backends: complete project and task CRUD through real HTTP, plus direct database state checks.
- Empty projects, pagination, UUID normalization, cross-project task isolation, and missing-record errors.
- Empty, long, malformed, unknown-field, and operator-shaped input rejection; 120-character Unicode title boundary and trimming.
- Injection-like text retained as literal data without changing database schema.
- Concurrent capacity test: eight appends to a 99-task project yielded one 201 and seven 409 responses in each engine; the stored count stayed 100 with distinct IDs.
- Concurrent partial edits preserved both changed fields. Parent deletion racing an append left no orphaned data.
- The real SQL store rolled back a parent and earlier child after an invalid later child failed. Twelve repetitions returned their clients to the pool, with zero waiting clients.
- Driver command monitoring counted exactly one find for a complete-project MongoDB adapter read.
- Malformed JSON, oversized requests, and wrong content types returned 400, 413, and 415; unknown routes returned 404.

Run: `docker compose exec -T api npm test`.

## Demo and terminal health

`docker compose exec -T api npm run demo` completed for both engines. [api-demo.txt](api-demo.txt) records actual 200, 201, 400, and 404 responses and JSON bodies. The demo cleans up its own records.

[api-server.txt](api-server.txt) captures parameterized SQL statement text, parameter counts, MongoDB command names, and HTTP statuses. The captured run had no unexpected server/pool errors or driver-warning patterns. npm printed an update notice; that is package-manager information, not a database-driver warning. [api-health.json](api-health.json) records the successful health response reached from the Windows host.

After tests and the demo, direct reads again found zero projects/tasks in SQL and zero project documents in MongoDB. The API and both databases remain running. The list of current healthy services is in [container-status.txt](container-status.txt).

Not yet demonstrated: a student-recorded live walkthrough, database-outage recovery, or a large production workload. There is no frontend, so responsive-layout checks do not apply. Graceful-shutdown code is present but was not separately exercised by stopping the running service during this QA run.

## Recording rehearsal — November 20, 2026, approximately 5:00 p.m.

The original API demo was rerun successfully for both engines; [api-demo-rehearsal.txt](api-demo-rehearsal.txt) contains its actual responses.

The new paced `scripts/video-demo.ps1` was run without pauses using `-Auto`. The final version passed under Windows PowerShell 5.1 with a process-only execution-policy option. [video-demo-rehearsal.txt](video-demo-rehearsal.txt) records real HTTP requests and direct database results: SQL creation/join/update, blank-input rejection, database foreign-key error 23503, cascade cleanup, MongoDB embedded reads/updates/deletion, duplicate task ID rejection with code 121 and an unchanged-document check, 404s after deletion, health, and a parameterized SQL log sample. The run had no `unexpected_error` or `sql_pool_error` events. The earlier version also ran successfully under PowerShell 7.6.9.

The request sequence in `scripts/browser-network-demo.js` was executed against the real API using Node.js as a harness with the local origin supplied. [browser-demo-request-check.txt](browser-demo-request-check.txt) records 201, 200, 400, 200, and 404 in order. This checks the HTTP sequence and cleanup; it is not a browser DevTools capture. Displaying these requests in the browser Network tab and recording the webcam/screen remain student recording steps.

After both rehearsals, direct database reads found zero SQL projects, zero SQL tasks, and zero MongoDB project documents. All three services remained healthy. These rehearsals do not change the earlier counts of 21 direct checks and 26 integration scenarios. The timed recording instructions are in [the video guide](../video-guide.md).
