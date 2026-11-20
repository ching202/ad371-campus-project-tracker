# Schema audit — November 20, 2026

## Finding: duplicate embedded task IDs were not prevented

The original MongoDB draft (`docs/drafts/01-mongo-schema.js`) validates the shape of each task ID but has no rule requiring task IDs to be distinct within a project's `tasks` array. Code inspection identified this omission before database execution. Two differently titled tasks could use the same ID and still satisfy the original validator. An update by task ID would then be ambiguous.

The corrected working file (`db/mongo/001-schema.js`) combines the original JSON Schema with a validator expression. It maps the tasks to their IDs, creates a set of those IDs, and compares the set's size with the original task count. Different counts indicate a duplicate and reject the write.

A unique multikey index alone would not solve this: MongoDB permits repeated indexed array values within a single document. [MongoDB unique indexes and schema validation](https://www.mongodb.com/docs/manual/tutorial/unique-indexes-schema-validation/)

The assistant identified and corrected this issue. The student should review and explain it, and should not claim to have written the correction independently. Original draft files remain unchanged.

**Verification status: passed against MongoDB 8.0.38 on November 20, 2026.** `scripts/mongo-checks.js` tried to push a second task with the same ID but a different title. MongoDB rejected it with validation error 121, and a subsequent read confirmed that the document was not changed. See [the actual output](qa-results/mongodb.txt). The original draft's omission was identified by inspection; the live regression check verifies the corrected working schema.

## Other schema checks

| Item | Inspection result | Runtime verification |
| --- | --- | --- |
| SQL normalization | Project attributes live only in `projects`; task attributes live in `tasks`. No duplicated project title or derived task count. | Schema inspected; joined parent/child read passed. Normalization is a design assessment. |
| SQL primary and foreign keys | UUID primary keys; required `tasks.project_id` references `projects.id`. | Orphan insert rejected with SQLSTATE 23503 |
| SQL cascade | `ON DELETE CASCADE` is explicit. | Parent and child removal verified |
| SQL foreign-key index | `tasks_project_id_idx` exists. | Confirmed with live table inspection |
| SQL timestamps | Defaults and update triggers are defined. | Trigger definitions inspected; update/read check passed |
| MongoDB access pattern | A complete small project fits in one document; no manual collection joins. | Complete project retrieved with one `findOne` |
| MongoDB bounded growth | `maxItems: 100`, title length, and description length are bounded. | Task 101 rejected; 100 existing tasks preserved |
| ID generation | Server-generated crypto.randomUUID IDs for both backends. | HTTP create/read and UUID URL checks passed |
| Injection prevention | Application SQL uses parameter arrays; shared field allowlists reject operator-shaped inputs. | Injection-like text retained literally; malformed/operator-shaped input rejected |
| Concurrency | SQL checks task capacity under a parent-row lock in a transaction. MongoDB uses a conditional atomic append. | Eight competing appends to a 99-task project produced one 201 and seven 409 responses in each engine |

The API shares text normalization across both engines. Its integration tests verified whitespace-only rejection and the 120-character boundary using Unicode emoji. These are targeted examples, not an exhaustive proof that the databases' different regex implementations classify every Unicode character identically.
