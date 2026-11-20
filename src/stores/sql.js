import { randomUUID } from 'node:crypto';
import { HttpError, requireFound } from '../errors.js';
import { MAX_TASKS } from '../validation.js';

// The JOIN keeps this a single database read, including projects with no tasks.
const completeProject = `
  SELECT p.*, COALESCE(
    jsonb_agg(to_jsonb(t) - 'project_id' ORDER BY t.created_at, t.id)
      FILTER (WHERE t.id IS NOT NULL), '[]'::jsonb
  ) AS tasks
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.id = $1 GROUP BY p.id`;

const taskColumns = 'id, title, status, created_at, updated_at';

export class SqlStore {
  constructor(pool, { trace = false } = {}) {
    this.pool = pool;
    this.trace = trace;
  }

  query(client, statement, values = []) {
    if (this.trace) console.log(JSON.stringify({ event: 'sql', statement: statement.replace(/\s+/g, ' ').trim(), parameter_count: values.length }));
    return client.query(statement, values);
  }

  async transaction(work) {
    const client = await this.pool.connect();
    let releaseError;
    try {
      await this.query(client, 'BEGIN');
      const result = await work(client);
      await this.query(client, 'COMMIT');
      return result;
    } catch (error) {
      try { await this.query(client, 'ROLLBACK'); }
      catch (rollbackError) { releaseError = rollbackError; }
      throw error;
    } finally {
      // Destroy an unusable connection; otherwise return it to the pool.
      client.release(releaseError);
    }
  }

  async withProjectLock(projectId, work) {
    return this.transaction(async client => {
      const result = await this.query(client, 'SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      requireFound(result.rows[0]);
      return work(client);
    });
  }

  async getProject(id, client = this.pool) {
    const result = await this.query(client, completeProject, [id]);
    const project = requireFound(result.rows[0]);
    // jsonb_agg returns timestamp strings; normalize them to the API's ISO format.
    project.tasks = project.tasks.map(task => ({ ...task,
      created_at: new Date(task.created_at).toISOString(), updated_at: new Date(task.updated_at).toISOString()
    }));
    return project;
  }

  async listProjects({ limit, offset }) {
    const result = await this.query(this.pool, `
      SELECT p.*, COUNT(t.id)::int AS task_count
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows;
  }

  async createProject(input) {
    const id = randomUUID();
    return this.transaction(async client => {
      await this.query(client, 'INSERT INTO projects(id, title, description) VALUES ($1, $2, $3)', [id, input.title, input.description]);
      for (const task of input.tasks) {
        await this.query(client, 'INSERT INTO tasks(id, project_id, title, status) VALUES ($1, $2, $3, $4)', [randomUUID(), id, task.title, task.status]);
      }
      return this.getProject(id, client);
    });
  }

  async updateProject(id, input) {
    return this.withProjectLock(id, async client => {
      await this.query(client, 'UPDATE projects SET title = COALESCE($2, title), description = COALESCE($3, description) WHERE id = $1',
        [id, input.title ?? null, input.description ?? null]);
      return this.getProject(id, client);
    });
  }

  async deleteProject(id) {
    const result = await this.query(this.pool, 'DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
    requireFound(result.rows[0]);
    return { id, deleted: true };
  }

  async getTask(projectId, taskId) {
    const project = await this.getProject(projectId);
    return requireFound(project.tasks.find(task => task.id === taskId), 'Task');
  }

  async createTask(projectId, input) {
    return this.withProjectLock(projectId, async client => {
      // Lock before counting: concurrent writers wait and see the committed count.
      const count = await this.query(client, 'SELECT COUNT(*)::int AS total FROM tasks WHERE project_id = $1', [projectId]);
      if (count.rows[0].total >= MAX_TASKS) throw new HttpError(409, 'TASK_LIMIT', 'A project can contain at most 100 tasks.');
      const result = await this.query(client, `INSERT INTO tasks(id, project_id, title, status) VALUES ($1, $2, $3, $4) RETURNING ${taskColumns}`,
        [randomUUID(), projectId, input.title, input.status]);
      await this.touchProject(client, projectId);
      return result.rows[0];
    });
  }

  async updateTask(projectId, taskId, input) {
    return this.withProjectLock(projectId, async client => {
      const result = await this.query(client, `UPDATE tasks SET title = COALESCE($3, title), status = COALESCE($4, status)
        WHERE project_id = $1 AND id = $2 RETURNING ${taskColumns}`, [projectId, taskId, input.title ?? null, input.status ?? null]);
      requireFound(result.rows[0], 'Task');
      await this.touchProject(client, projectId);
      return result.rows[0];
    });
  }

  async deleteTask(projectId, taskId) {
    return this.withProjectLock(projectId, async client => {
      const result = await this.query(client, 'DELETE FROM tasks WHERE project_id = $1 AND id = $2 RETURNING id', [projectId, taskId]);
      requireFound(result.rows[0], 'Task');
      await this.touchProject(client, projectId);
      return { id: taskId, deleted: true };
    });
  }

  async touchProject(client, id) {
    await this.query(client, 'UPDATE projects SET updated_at = clock_timestamp() WHERE id = $1', [id]);
  }
}
