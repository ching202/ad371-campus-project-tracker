# AD371 recording guide: aim for 6 minutes 30 seconds

Record your **screen and webcam/face simultaneously**. The assignment requires 5-7 minutes. Use these as speaking notes, not a script to read word for word. The actual application is a local Node.js API with PostgreSQL and MongoDB; a frontend is optional.

## Before pressing Record

1. Check that your microphone works, your face stays visible, and terminal text is readable in the recording. Keep the camera overlay away from the output.
2. Open this guide's model diagram, `docs/schema-audit.md`, the original and corrected MongoDB schemas, and `docs/qa-results/README.md` in your editor. Use a split editor for the draft/correction comparison. The relevant correction is the `$expr` block near the end of `db/mongo/001-schema.js`.
3. Open PowerShell in the repository and run the following. The guided script pauses **before** each labeled operation. Leave it waiting at `SQL 1/4` while you explain the architecture.

```powershell
Set-Location 'C:\Users\Ching\Documents\Codex\2026-11-20\thi\outputs\campus-project-tracker'
docker compose ps
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\video-demo.ps1
```

If the services are stopped, run `docker compose up -d --build --wait --wait-timeout 180` before starting the guided script. Keep setup and image builds outside the recording. Windows PowerShell currently disables script files by default on this computer; the command above permits this local script for that process only and does not change the permanent execution policy.

4. Prepare the browser Network demonstration described below. Keep it ready in a separate window or tab. Do one practice run before recording so switching screens is comfortable.

The guided script sends real HTTP requests and launches `psql` and `mongosh` for direct database verification. You press Enter at each pause; there is no need to copy UUIDs. It generates fresh records each run and removes only those records. `-Auto` skips pauses for an automated rehearsal; omit it for the video.

## 0:00-1:30: architecture and AI audit

**0:00-0:20: introduce the feature.** A project has a title and description and contains tasks with a status. One Node.js API exposes the same operations under `/api/sql/projects` and `/api/nosql/projects`. Requests select an engine; the two stores have independent data.

**0:20-0:50: show the models side by side.**

```text
PostgreSQL: two related tables          MongoDB: one project document
----------------------------------     ----------------------------------
projects                               {
  id PK                                  _id,
  title, description                     title, description,
  created_at, updated_at                 created_at, updated_at,
     | 1                                 tasks: [
     |                                     { id, title, status,
     | many                                  created_at, updated_at }
tasks                                    ]
  id PK                                }
  project_id FK -> projects.id
  title, status                        Complete project: one findOne
  created_at, updated_at                Tasks embedded, maximum 100

Complete project: LEFT JOIN
Foreign key + index + ON DELETE CASCADE
```

Explain that SQL keeps project details in one place and task details in another. Non-key columns describe the entity identified by that table's key; tasks do not duplicate the project title. That is the normalization rationale. The foreign key enforces the relationship, its index supports task lookups, and cascade deletion prevents leftover tasks. MongoDB embeds a bounded task list because the main read asks for a complete small project. Both databases can return this feature in one query; MongoDB's model avoids extra collection lookups or an application-side join.

**0:50-1:30: show the genuine audit finding.** Open `docs/drafts/01-mongo-schema.js` beside `db/mongo/001-schema.js`, then point to the corrected `$expr` block.

- The draft checked task ID format but allowed two tasks in the same project to have the same ID. Updates by that ID could become ambiguous.
- The correction compares the number of tasks with the number of distinct task IDs. Different counts reject the write. A unique multikey index alone does not enforce distinct values inside one document.
- Accurate attribution: “The AI-assisted review found a missing uniqueness rule for embedded task IDs. The corrected validator rejects duplicates, and I'll demonstrate that rejection.” The assistant identified and implemented this correction; do not claim it was independently written by you. The original omission was found by inspection, and the corrected version was tested live.

## 1:30-3:30: SQL, four Enter presses

Switch to the waiting PowerShell script. Each labeled step waits for Enter before executing. Its results remain visible at the next pause; scroll up when needed.

| Time | Run | Point out on screen |
| --- | --- | --- |
| 1:30-2:05 | SQL 1/4 | POST returns 201, GET returns 200. The JSON includes a project and task. The actual `psql` LEFT JOIN shows the persisted parent and child with status `todo`. |
| 2:05-2:35 | SQL 2/4 | PATCH changes the project title and task status. The next database read shows `done`. A blank task title returns 400 with a validation message. |
| 2:35-3:00 | SQL 3/4 | Direct SQL tries to insert a task using a nonexistent project ID. PostgreSQL returns foreign-key error **23503**. This bypasses the API, proving the database enforces the relationship. |
| 3:00-3:30 | SQL 4/4 | Deleting the project returns 200. Direct SQL reports **0 projects and 0 tasks** for that ID. The later GET returns 404. Explain `ON DELETE CASCADE`. |

Useful explanation: the SQL store binds values with placeholders such as `$1`; it does not insert user text into query syntax. Parent-plus-child creation uses one transaction and rolls back if a child write fails. The CLI queries displayed by the demo are inspection commands using generated UUIDs; the application's driver queries are in `src/stores/sql.js`.

## 3:30-5:15: MongoDB, four Enter presses

| Time | Run | Point out on screen |
| --- | --- | --- |
| 3:30-4:00 | MONGO 1/4 | POST 201 and GET 200, then an actual `mongosh` document from `findOne`. Point to the embedded `tasks` array and timestamps. No manual join is needed. |
| 4:00-4:30 | MONGO 2/4 | A second task is appended, then its status becomes `done`. The document read shows both tasks and the changed project title. The store uses atomic `$push` and `$set` operations. |
| 4:30-4:50 | MONGO 3/4 | A different task with a duplicate existing task ID is rejected with validation code **121**. The unchanged-document check passes. This verifies the audit correction described earlier. |
| 4:50-5:15 | MONGO 4/4 | Delete one task, verify one remains, then delete the project. The database reports **0 remaining documents**, and GET returns 404. Embedded tasks disappear with their document. |

For the “one read” explanation, point to `getProject()` in `src/stores/mongo.js` if needed: it calls `findOne` once. The separate `mongosh` read is an additional inspection for the video, not part of the API request. The recorded integration suite also checks the adapter's actual find-command count.

## 5:15-6:30: QA evidence and takeaway

**5:15-5:35:** Press Enter at `QA`. Show healthy connections, a real SQL statement with placeholders and a parameter count, recent MongoDB/HTTP logs, and the check for unexpected server/pool errors. The deliberate constraint and 400/404 errors were expected test results.

**5:35-6:00:** Switch to the prepared browser Network tab and run the short browser demo below. Show the actual 201, 200, 400, and 404 responses. Click a 400 or 404 row to show its JSON error response.

**6:00-6:15:** Show `docs/qa-results/README.md`. Point to **9 SQL checks + 12 MongoDB checks + 26 API/integration scenarios passed** in the recorded QA runs. Those suites include transaction rollback, connection reuse after repeated failures, concurrency, and the MongoDB one-read check. The video demonstrates a selected live subset. Responsive-layout checks are not applicable because this is a backend API.

**6:15-6:30:** End with the architectural decision: SQL suits relationships, referential integrity, and cross-project task reporting. MongoDB embedding suits retrieving a complete small project together and making atomic changes inside that document. The 100-task bound makes this embedding choice deliberate; unbounded task history would require reconsidering the model.

## Preparing the browser Network demonstration

1. Open `http://localhost:3000` in your browser. Open DevTools (F12), choose **Network**, enable **Preserve log**, and clear old entries. Keep request recording enabled.
2. In the Console, prepare the contents of `scripts/browser-network-demo.js` without executing them yet. You can copy the file in your editor, or use a second PowerShell window:

```powershell
Get-Content -Raw 'C:\Users\Ching\Documents\Codex\2026-11-20\thi\outputs\campus-project-tracker\scripts\browser-network-demo.js' | Set-Clipboard
```

3. At the QA segment, execute the code, then return to Network and filter to Fetch/XHR. You should see five requests: **POST 201, GET 200, POST 400, DELETE 200, GET 404**. The intentional 400/404 may also appear as red failed-request messages in the Console; they demonstrate error handling.
4. Open the 400 response: the title was empty. Open the 404 response: the project was already deleted. The script cleans up its own project.

Run the snippet only on the local API page; it checks the origin. Browser rendering and placement of DevTools panels may differ, so practice this screen switch before recording.

## Final recording check

- Screen and face visible together; clear microphone audio; readable data and code.
- Duration between 5:00 and 7:00. Aim for 6:30 and use natural explanations.
- Actual database rows/documents, SQL constraint rejection, cascade, MongoDB atomic update, and audit correction visible.
- HTTP statuses, healthy connections, and completed QA evidence shown.
- Mention AI help accurately. Do not claim production load testing or independent authorship of the AI-assisted fix.
- After recording, watch it once and use its actual timestamps in the LMS submission. GitHub and video publication are separate submission steps; this guide does not publish either.
