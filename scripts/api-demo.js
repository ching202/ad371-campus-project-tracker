// A repeatable terminal demonstration using the actual HTTP API.
const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

async function call(method, path, body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const result = await response.json();
  console.log(`\n${method} ${path} -> HTTP ${response.status}`);
  console.log(JSON.stringify(result, null, 2));
  if (response.status !== expected) throw new Error(`Expected HTTP ${expected}.`);
  return result.data;
}

for (const engine of ['sql', 'nosql']) {
  console.log(`\n========== ${engine.toUpperCase()} ==========`);
  const root = `/api/${engine}/projects`;
  const project = await call('POST', root, {
    title: 'Build a portfolio website', description: 'AD371 live API demonstration',
    tasks: [{ title: 'Design the homepage' }]
  }, 201);
  const path = `${root}/${project.id}`;
  try {
    await call('GET', path);
    await call('GET', root);
    await call('PATCH', path, { title: 'Portfolio website — in progress' });
    const task = await call('POST', `${path}/tasks`, { title: 'Test the mobile layout' }, 201);
    await call('PATCH', `${path}/tasks/${task.id}`, { status: 'done' });
    await call('GET', `${path}/tasks/${task.id}`);
    await call('POST', `${path}/tasks`, { title: '' }, 400);
    await call('DELETE', `${path}/tasks/${task.id}`);
    await call('DELETE', path);
    await call('GET', path, undefined, 404);
  } finally {
    // Remove only the project this demo created, including if the demo fails.
    await fetch(`${base}${path}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  }
}
