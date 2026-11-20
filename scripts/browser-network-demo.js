// Open http://localhost:3000, then run this in the browser's DevTools Console.
// The Network tab will show real 201, 200, 400, and 404 responses.
// It creates and removes only its own demonstration project.
await (async () => {
  const base = globalThis.location?.origin;
  if (!['http://localhost:3000', 'http://127.0.0.1:3000'].includes(base)) {
    throw new Error('Open http://localhost:3000 before running this demonstration.');
  }
  const results = [];
  let projectPath;
  async function request(method, path, expected, body) {
    const response = await fetch(new URL(path, base), {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    });
    const json = await response.json();
    results.push({ method, status: response.status, path });
    if (response.status !== expected) throw new Error(`Expected ${expected}, got ${response.status}: ${JSON.stringify(json)}`);
    return json;
  }
  try {
    const created = await request('POST', '/api/sql/projects', 201, {
      title: 'Video: browser Network status demonstration'
    });
    projectPath = `/api/sql/projects/${created.data.id}`;
    await request('GET', projectPath, 200);
    await request('POST', `${projectPath}/tasks`, 400, { title: '' });
    await request('DELETE', projectPath, 200);
    const deletedPath = projectPath;
    projectPath = undefined;
    await request('GET', deletedPath, 404);
    console.table(results);
  } finally {
    if (projectPath) {
      const cleanup = await fetch(new URL(projectPath, base), { method: 'DELETE' });
      if (![200, 404].includes(cleanup.status)) throw new Error(`Cleanup failed: HTTP ${cleanup.status}`);
    }
  }
})();
