\set ON_ERROR_STOP on

-- Session-local helpers; data created by these checks is rolled back.
CREATE TEMP TABLE qa_ids AS
SELECT gen_random_uuid() AS project_id, gen_random_uuid() AS task_id;

CREATE FUNCTION pg_temp.assert_ok(condition BOOLEAN, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF NOT COALESCE(condition, FALSE) THEN
        RAISE EXCEPTION 'FAIL: %', label;
    END IF;
    RAISE NOTICE 'PASS: %', label;
END;
$$;

BEGIN;
INSERT INTO projects(id, title, description)
SELECT project_id, 'QA: Portfolio website', 'Temporary assignment verification' FROM qa_ids;
INSERT INTO tasks(id, project_id, title)
SELECT task_id, project_id, 'Design the homepage' FROM qa_ids;

SELECT p.title AS project, t.title AS task, t.status
FROM projects p JOIN tasks t ON t.project_id = p.id
WHERE p.id = (SELECT project_id FROM qa_ids);

SELECT pg_temp.assert_ok(
    (SELECT COUNT(*) = 1 FROM projects p JOIN tasks t ON t.project_id = p.id
     WHERE p.id = (SELECT project_id FROM qa_ids)),
    'Create and joined read return the parent and child'
);

UPDATE tasks SET status = 'done' WHERE id = (SELECT task_id FROM qa_ids);
SELECT pg_temp.assert_ok(
    (SELECT status = 'done' AND updated_at >= created_at FROM tasks
     WHERE id = (SELECT task_id FROM qa_ids)),
    'Task update is visible in the next read'
);

UPDATE projects SET title = 'QA: Updated portfolio' WHERE id = (SELECT project_id FROM qa_ids);
SELECT pg_temp.assert_ok(
    (SELECT title = 'QA: Updated portfolio' FROM projects WHERE id = (SELECT project_id FROM qa_ids)),
    'Project update is visible in the next read'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO tasks(project_id, title) VALUES(gen_random_uuid(), 'Orphan attempt');
        RAISE EXCEPTION 'FAIL: Database accepted an orphan task';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS: Orphan task rejected by FK, SQLSTATE 23503';
    END;
    BEGIN
        UPDATE tasks SET status = 'invalid' WHERE id = (SELECT task_id FROM qa_ids);
        RAISE EXCEPTION 'FAIL: Database accepted an invalid task status';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Invalid status rejected, SQLSTATE 23514';
    END;
    BEGIN
        UPDATE projects SET title = '   ' WHERE id = (SELECT project_id FROM qa_ids);
        RAISE EXCEPTION 'FAIL: Database accepted a blank title';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: Blank title rejected, SQLSTATE 23514';
    END;
END;
$$;

DELETE FROM tasks WHERE id = (SELECT task_id FROM qa_ids);
SELECT pg_temp.assert_ok(
    NOT EXISTS(SELECT 1 FROM tasks WHERE id = (SELECT task_id FROM qa_ids)),
    'Individual task delete removes the child'
);
INSERT INTO tasks(id, project_id, title)
SELECT task_id, project_id, 'Task for cascade check' FROM qa_ids;
DELETE FROM projects WHERE id = (SELECT project_id FROM qa_ids);
SELECT pg_temp.assert_ok(
    NOT EXISTS(SELECT 1 FROM tasks WHERE project_id = (SELECT project_id FROM qa_ids))
    AND NOT EXISTS(SELECT 1 FROM projects WHERE id = (SELECT project_id FROM qa_ids)),
    'Deleting the parent cascades to its child'
);

-- Leave a new parent and child pending, then roll back the transaction.
INSERT INTO projects(id, title) SELECT project_id, 'Rollback demonstration' FROM qa_ids;
INSERT INTO tasks(id, project_id, title)
SELECT task_id, project_id, 'This task must roll back too' FROM qa_ids;
ROLLBACK;
SELECT pg_temp.assert_ok(
    NOT EXISTS(SELECT 1 FROM projects WHERE id = (SELECT project_id FROM qa_ids))
    AND NOT EXISTS(SELECT 1 FROM tasks WHERE id = (SELECT task_id FROM qa_ids)),
    'ROLLBACK leaves neither the parent nor the child'
);
