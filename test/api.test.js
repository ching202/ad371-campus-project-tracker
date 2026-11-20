import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabases } from '../src/db.js';

const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
let connections;
before(async () => { connections = await connectDatabases({ trace: false }); });
after(async () => { if (connections) await connections.close(); });

async function request(method, path, body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const json = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
  if (expected >= 400) {
    assert.equal(typeof json.error?.code, 'string');
    assert.equal(typeof json.error?.message, 'string');
    assert.equal(json.error.stack, undefined);
  }
  return { json, data: json.data, headers: response.headers };
}

async function fixture(t, engine, tasks = [], extra = {}) {
  const route = `/api/${engine}/projects`;
  const created = await request('POST', route, { title: `QA API ${randomUUID()}`, tasks, ...extra }, 201);
  const path = `${route}/${created.data.id}`;
  t.after(async () => {
    const response = await fetch(`${base}${path}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
    assert.ok([200, 404].includes(response.status), `Cleanup failed for ${path}`);
  });
  return { ...created, path };
}

test('Health endpoint verifies both real databases', async () => {
  const { json } = await request('GET', '/health');
  assert.deepEqual(json, { status: 'ok', databases: { sql: 'up', nosql: 'up' } });
});

for (const engine of ['sql', 'nosql']) {
  const root = `/api/${engine}/projects`;

  test(`${engine}: complete project/task CRUD and underlying database state`, async t => {
    const created = await fixture(t, engine, [{ title: 'Design homepage' }]);
    const { path, data } = created;
    assert.equal(created.headers.get('location'), path);
    assert.match(data.id, /^[0-9a-f-]{36}$/);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].status, 'todo');
    assert.ok(Number.isFinite(Date.parse(data.created_at)));

    const read = (await request('GET', path)).data;
    assert.equal(read.id, data.id);
    assert.equal(read.tasks[0].title, 'Design homepage');
    const listed = (await request('GET', `${root}?limit=100`)).data;
    assert.equal(listed.find(project => project.id === data.id).task_count, 1);

    const renamed = (await request('PATCH', path, { title: 'Renamed project', description: 'New description' })).data;
    assert.equal(renamed.title, 'Renamed project');
    assert.equal(renamed.description, 'New description');
    const added = await request('POST', `${path}/tasks`, { title: 'Test mobile layout' }, 201);
    const taskPath = `${path}/tasks/${added.data.id}`;
    assert.equal(added.headers.get('location'), taskPath);
    const changed = (await request('PATCH', taskPath, { title: 'Test phone layout', status: 'done' })).data;
    assert.equal(changed.status, 'done');
    assert.equal((await request('GET', taskPath)).data.title, 'Test phone layout');
    assert.equal((await request('GET', `${path}/tasks`)).data.length, 2);

    if (engine === 'sql') {
      const result = await connections.pool.query('SELECT title, status FROM tasks WHERE id = $1 AND project_id = $2', [added.data.id, data.id]);
      assert.deepEqual(result.rows, [{ title: 'Test phone layout', status: 'done' }]);
    } else {
      const stored = await connections.collection.findOne({ _id: data.id });
      assert.equal(stored.tasks.find(task => task.id === added.data.id).status, 'done');
    }
    assert.equal((await request('DELETE', taskPath)).data.deleted, true);
    await request('GET', taskPath, undefined, 404);
    assert.equal((await request('DELETE', path)).data.deleted, true);
    await request('GET', path, undefined, 404);
    await request('DELETE', path, undefined, 404);
    if (engine === 'sql') {
      const remaining = await connections.pool.query('SELECT COUNT(*)::int AS total FROM tasks WHERE project_id = $1', [data.id]);
      assert.equal(remaining.rows[0].total, 0);
    } else assert.equal(await connections.collection.findOne({ _id: data.id }), null);
  });

  test(`${engine}: an empty project reads with an empty tasks array`, async t => {
    const { path } = await fixture(t, engine);
    assert.deepEqual((await request('GET', path)).data.tasks, []);
    assert.deepEqual((await request('GET', `${path}/tasks`)).data, []);
  });

  test(`${engine}: malformed, blank, long, and operator-shaped inputs are rejected`, async t => {
    const { path } = await fixture(t, engine);
    const invalid = [
      {}, { title: '' }, { title: ' \t\n\u00a0 ' }, { title: 'x'.repeat(121) },
      { title: { $ne: null } }, { title: 'Valid', $where: 'true' },
      { title: 'Valid', id: randomUUID() }, { title: 'Valid', description: null },
      { title: 'Valid', tasks: null }, { title: 'Valid', tasks: [{ title: 'Task', status: 'invalid' }] },
      { title: 'Valid', tasks: Array.from({ length: 101 }, () => ({ title: 'Task' })) },
      { title: 'Bad\u0000text' }, { title: '\ud800' },
      { title: 'Valid', description: 'x'.repeat(2001) }
    ];
    for (const body of invalid) await request('POST', root, body, 400);
    await request('PATCH', path, {}, 400);
    await request('PATCH', path, { tasks: [] }, 400);
    await request('POST', `${path}/tasks`, { title: 'Valid', status: { $ne: 'done' } }, 400);
    assert.deepEqual((await request('GET', `${path}/tasks`)).data, []);
  });

  test(`${engine}: Unicode character limits and title trimming match the contract`, async t => {
    const title = '😀'.repeat(120);
    const { path } = await fixture(t, engine, [], { title: `  ${title}  `, description: 'a'.repeat(2000) });
    assert.equal((await request('GET', path)).data.title, title);
    await request('PATCH', path, { title: '😀'.repeat(121) }, 400);
  });

  test(`${engine}: injection-like text is stored as literal data`, async t => {
    const title = "Robert'); DROP TABLE projects; --";
    const { path } = await fixture(t, engine, [], { title });
    assert.equal((await request('GET', path)).data.title, title);
    assert.ok(Array.isArray((await request('GET', root)).data));
  });

  test(`${engine}: missing and malformed IDs return 404 and 400`, async t => {
    const missing = `${root}/${randomUUID()}`;
    await request('GET', missing, undefined, 404);
    await request('PATCH', missing, { title: 'Missing' }, 404);
    await request('POST', `${missing}/tasks`, { title: 'Orphan attempt' }, 404);
    await request('GET', `${root}/not-a-uuid`, undefined, 400);
    const { path, data } = await fixture(t, engine);
    assert.equal((await request('GET', `${root}/${data.id.toUpperCase()}`)).data.id, data.id);
    const taskPath = `${path}/tasks/${randomUUID()}`;
    await request('GET', taskPath, undefined, 404);
    await request('PATCH', taskPath, { status: 'done' }, 404);
    await request('DELETE', taskPath, undefined, 404);
  });

  test(`${engine}: tasks cannot be modified through another project's URL`, async t => {
    const first = await fixture(t, engine, [{ title: 'Belongs to first' }]);
    const second = await fixture(t, engine);
    const wrongPath = `${second.path}/tasks/${first.data.tasks[0].id}`;
    await request('PATCH', wrongPath, { status: 'done' }, 404);
    await request('DELETE', wrongPath, undefined, 404);
    assert.equal((await request('GET', first.path)).data.tasks[0].status, 'todo');
  });

  test(`${engine}: pagination is bounded and rejects malformed values`, async t => {
    await fixture(t, engine);
    await fixture(t, engine);
    const first = await request('GET', `${root}?limit=1&offset=0`);
    const next = await request('GET', `${root}?limit=1&offset=1`);
    assert.equal(first.data.length, 1);
    assert.equal(next.data.length, 1);
    assert.notEqual(first.data[0].id, next.data[0].id);
    assert.deepEqual(first.json.pagination, { limit: 1, offset: 0 });
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=abc', 'limit=1&limit=2', 'sort=title']) {
      await request('GET', `${root}?${query}`, undefined, 400);
    }
  });

  test(`${engine}: concurrent appends cannot exceed the 100-task limit`, async t => {
    const { path } = await fixture(t, engine, Array.from({ length: 99 }, (_, i) => ({ title: `Existing ${i}` })));
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(`${base}${path}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Concurrent ${i}` }), signal: AbortSignal.timeout(15000)
    })));
    const statuses = [];
    for (const response of responses) {
      statuses.push(response.status);
      const json = await response.json();
      if (response.status === 409) assert.equal(json.error.code, 'TASK_LIMIT');
    }
    assert.equal(statuses.filter(status => status === 201).length, 1);
    assert.equal(statuses.filter(status => status === 409).length, 7);
    const project = (await request('GET', path)).data;
    assert.equal(project.tasks.length, 100);
    assert.equal(new Set(project.tasks.map(task => task.id)).size, 100);
  });

  test(`${engine}: simultaneous partial task and project edits are preserved`, async t => {
    const { path, data } = await fixture(t, engine, [{ title: 'Original task' }]);
    const taskPath = `${path}/tasks/${data.tasks[0].id}`;
    await Promise.all([
      request('PATCH', taskPath, { title: 'Renamed task' }),
      request('PATCH', taskPath, { status: 'done' }),
      request('PATCH', path, { title: 'Renamed project' }),
      request('PATCH', path, { description: 'Concurrent description' })
    ]);
    const project = (await request('GET', path)).data;
    assert.equal(project.title, 'Renamed project');
    assert.equal(project.description, 'Concurrent description');
    assert.equal(project.tasks[0].title, 'Renamed task');
    assert.equal(project.tasks[0].status, 'done');
  });

  test(`${engine}: parent deletion racing a task append leaves no orphan`, async t => {
    const { path, data } = await fixture(t, engine);
    const results = await Promise.all([
      fetch(`${base}${path}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) }),
      fetch(`${base}${path}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Racing task' }), signal: AbortSignal.timeout(15000) })
    ]);
    assert.equal(results[0].status, 200);
    assert.ok([201, 404].includes(results[1].status));
    await Promise.all(results.map(response => response.json()));
    await request('GET', path, undefined, 404);
    if (engine === 'sql') {
      const result = await connections.pool.query('SELECT COUNT(*)::int AS total FROM tasks WHERE project_id = $1', [data.id]);
      assert.equal(result.rows[0].total, 0);
    } else assert.equal(await connections.collection.findOne({ _id: data.id }), null);
  });
}

test('SQL store rolls back parent and earlier children after a database failure; releases clients', async () => {
  // Call the real store directly to force a database error AFTER inserts begin.
  // HTTP validation would reject this bad status before starting a transaction.
  const title = `Rollback ${randomUUID()}`;
  for (let i = 0; i < 12; i++) {
    await assert.rejects(connections.stores.sql.createProject({ title, description: '', tasks: [
      { title: 'First valid child', status: 'todo' }, { title: 'Invalid second child', status: 'invalid' }
    ] }), { code: '23514' });
  }
  const result = await connections.pool.query('SELECT COUNT(*)::int AS total FROM projects WHERE title = $1', [title]);
  assert.equal(result.rows[0].total, 0);
  assert.equal(connections.pool.waitingCount, 0);
  assert.equal(connections.pool.idleCount, connections.pool.totalCount);
  await request('GET', '/health');
});

test('MongoDB complete-project adapter read issues exactly one find command', async t => {
  const { data } = await fixture(t, 'nosql', [{ title: 'One query' }]);
  let finds = 0;
  const observe = event => { if (event.commandName === 'find') finds++; };
  connections.mongo.on('commandStarted', observe);
  try {
    const result = await connections.stores.nosql.getProject(data.id);
    assert.equal(result.tasks.length, 1);
    assert.equal(finds, 1);
  } finally { connections.mongo.off('commandStarted', observe); }
});

test('Malformed JSON, oversized requests, wrong content type, and unknown routes have JSON errors', async () => {
  for (const [body, headers, expected] of [
    ['{"title":', { 'Content-Type': 'application/json' }, 400],
    [JSON.stringify({ title: 'x'.repeat(140000) }), { 'Content-Type': 'application/json' }, 413],
    ['title=hello', { 'Content-Type': 'text/plain' }, 415]
  ]) {
    const response = await fetch(`${base}/api/sql/projects`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, expected);
    assert.ok((await response.json()).error.code);
  }
  await request('GET', '/api/unknown/projects', undefined, 404);
  await request('GET', '/missing-route', undefined, 404);
});
