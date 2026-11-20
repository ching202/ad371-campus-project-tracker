# AI disclosure and prompt log

Tool: OpenAI Codex, in this chat. Draft date: November 20, 2026.

The assignment handout was supplied as an attachment and used as the requirements. Its sample prompt was not independently submitted by the student. This log distinguishes actual user prompts from design choices made by the assistant.

## Actual user prompts, verbatim

Initial context:

> This is for AD371 class, there will be multiple assignments I upload to this chat, this is the first, do you want the transcipt or is this fine?

Request to begin:

> Okay, let's get started on this assignment. Can you help me choose a project and walk me through it step by step?

Answer to the assistant's language/database preference question:

> If its not in the assignment details then choose whats best

Request to start the environment and continue:

> Open docker and continue

User's result after trying Docker directly from Windows:

> I get the same registry-key error

Request to perform the installation and continue:

> Can you run the Docker installer command for me and continue once it’s working?

Follow-up request to run the database commands:

> u rum it

Request for permission-setting guidance:

> How do I give you Docker access so you can run the commands for me?

Request after changing the permission mode:

> I switched to Full access. Retry Docker and continue with the database setup.

Request to build the HTTP API:

> Go ahead and build the Node.js API for both databases and walk me through it step by step.

Request to rehearse and prepare the recording:

> Can you run the demo for me and walk me through what I should show in the 5–7 minute video?

Request to publish the project:

> Push it to github and provide link

## Assistant design decisions

The assistant proposed Campus Project Tracker with Projects and Tasks, JavaScript/Node.js, PostgreSQL, MongoDB, and a local API/test-script interface. The student delegated tool selection where the assignment is silent. The assistant selected a 100-task project limit to make embedding appropriate for the defined scope.

## Generated output and audit status

The first saved output consists of the draft SQL schema, MongoDB validation script, sample document, and project README. The next output adds reviewed working schemas, Docker Compose, database QA scripts, setup instructions, and the audit finding described below. The HTTP API was then generated and its first source/configuration draft preserved in `docs/drafts/02-api/` before execution. It uses Express 5.3.0, pg 8.23.1, and mongodb 7.9.1 on Node.js 24.22.3, with a saved dependency lockfile.

The initial model has actual SQL primary/foreign keys, an index on `tasks.project_id`, cascade deletion, status/title checks, timestamps, and an embedded MongoDB tasks array. These are observations from reading the draft, not database test results.

Now verified against real databases: schema execution; CRUD; SQL foreign-key and cascade behavior; SQL rollback; embedded task ID uniqueness; MongoDB atomic task changes; and MongoDB's 100-task limit. API queries were reviewed for parameterization; real integration tests also passed for HTTP behavior, Unicode boundary validation, application rollback, and task-capacity enforcement under concurrent requests in both engines.

During code inspection, the assistant identified that the draft MongoDB validator checks ID format but does not enforce distinct task IDs within a project. The assistant added a validator expression to the working schema and prepared a regression check. See `schema-audit.md`. This correction was AI-assisted, not an independently written student patch. The original draft remains unchanged.

Compose configuration and script syntax checks passed. Docker initially failed with an installation registry-key error. With the user's authorization, the assistant downloaded the complete official installer, verified its Docker Inc. signature, installed version 4.99.0 through the Windows installer, and observed **Engine running** in Docker Desktop.

The command runner initially received permission denied when connecting to Docker's named pipe. The permissions tool could not represent that pipe as a grantable filesystem path, and an elevated request was rejected by the then-active approval policy. The user subsequently selected Full access for this chat. Docker access then succeeded, and the assistant started PostgreSQL 17.12 and MongoDB 8.0.38 through Compose.

All 21 direct database checks passed: 9 SQL and 12 MongoDB. Both scripts exited with code 0. The assistant inspected the live schemas and confirmed test cleanup with subsequent reads. The saved outputs and remaining application-level checks are documented in `qa-results/README.md`.

The next stage added and executed 26 real API/integration test scenarios; all passed. The console demo completed for both engines, and the API is available on localhost:3000. Logs show parameterized SQL and the expected HTTP statuses, with no unexpected server/pool errors or driver-warning patterns in the captured run. Post-test/demo reads confirmed zero leftover projects or tasks. The README, API audit, and step-by-step walkthrough document the implementation and its limits. The GitHub publication and student-recorded video have not been completed.

For the recording request, the assistant reran the API demo, added a paced PowerShell demonstration with direct SQL/MongoDB inspections, and executed it successfully without pauses. A browser Console snippet for the Network-tab demonstration was prepared, and its HTTP request sequence was checked through Node.js against the real API. The timed video guide includes accurate attribution of the AI-assisted audit correction. Actual webcam/screen recording and browser DevTools capture remain student steps; rehearsal outputs are in `docs/qa-results/`.
