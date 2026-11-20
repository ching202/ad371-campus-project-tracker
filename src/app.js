import express from 'express';
import { HttpError, publicError } from './errors.js';
import { pagination, validateId, validateProject, validateTask } from './validation.js';

export function createApp({ stores, health, log = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    const started = performance.now();
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => {
      if (log && req.path !== '/health') console.log(JSON.stringify({ event: 'http', method: req.method, path: req.path, status: res.statusCode, duration_ms: Math.round(performance.now() - started) }));
    });
    next();
  });
  app.use(express.json({ limit: '128kb', strict: true }));

  app.get('/', (req, res) => res.json({ name: 'Campus Project Tracker', health: '/health', backends: ['/api/sql/projects', '/api/nosql/projects'] }));
  app.get('/health', async (req, res) => {
    const databases = await health();
    const ok = Object.values(databases).every(value => value === 'up');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', databases });
  });

  const router = express.Router();
  router.param('projectId', (req, res, next, value) => { req.params.projectId = validateId(value); next(); });
  router.param('taskId', (req, res, next, value) => { req.params.taskId = validateId(value); next(); });
  router.use((req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send Content-Type: application/json.');
    }
    next();
  });

  router.get('/projects', async (req, res) => {
    const page = pagination(req.query);
    res.json({ data: await req.store.listProjects(page), pagination: page });
  });
  router.post('/projects', async (req, res) => {
    const project = await req.store.createProject(validateProject(req.body));
    res.location(`${req.baseUrl}/projects/${project.id}`).status(201).json({ data: project });
  });
  router.get('/projects/:projectId', async (req, res) => res.json({ data: await req.store.getProject(req.params.projectId) }));
  router.patch('/projects/:projectId', async (req, res) => res.json({ data: await req.store.updateProject(req.params.projectId, validateProject(req.body, true)) }));
  router.delete('/projects/:projectId', async (req, res) => res.json({ data: await req.store.deleteProject(req.params.projectId) }));
  router.get('/projects/:projectId/tasks', async (req, res) => res.json({ data: (await req.store.getProject(req.params.projectId)).tasks }));
  router.post('/projects/:projectId/tasks', async (req, res) => {
    const task = await req.store.createTask(req.params.projectId, validateTask(req.body));
    res.location(`${req.baseUrl}/projects/${req.params.projectId}/tasks/${task.id}`).status(201).json({ data: task });
  });
  router.get('/projects/:projectId/tasks/:taskId', async (req, res) => res.json({ data: await req.store.getTask(req.params.projectId, req.params.taskId) }));
  router.patch('/projects/:projectId/tasks/:taskId', async (req, res) => res.json({ data: await req.store.updateTask(req.params.projectId, req.params.taskId, validateTask(req.body, true)) }));
  router.delete('/projects/:projectId/tasks/:taskId', async (req, res) => res.json({ data: await req.store.deleteTask(req.params.projectId, req.params.taskId) }));

  app.use('/api/:engine', (req, res, next) => {
    if (!['sql', 'nosql'].includes(req.params.engine)) throw new HttpError(404, 'NOT_FOUND', 'Unknown database route.');
    req.store = stores[req.params.engine];
    next();
  }, router);
  app.use((req, res) => { throw new HttpError(404, 'NOT_FOUND', 'Route not found.'); });
  // Express 5 forwards errors from async route handlers to this middleware.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const result = publicError(error);
    if (result.status === 500) console.error(JSON.stringify({ event: 'unexpected_error', name: error.name, message: error.message }));
    res.status(result.status).json({ error: { code: result.code, message: result.message } });
  });
  return app;
}
