import { randomUUID } from 'node:crypto';
import { HttpError, requireFound } from '../errors.js';
import { MAX_TASKS } from '../validation.js';

function projectResponse(document) {
  const { _id, ...fields } = requireFound(document);
  return { id: _id, ...fields };
}

const afterUpdate = { returnDocument: 'after', includeResultMetadata: false };

export class MongoStore {
  constructor(collection) { this.collection = collection; }

  async getProject(id) {
    return projectResponse(await this.collection.findOne({ _id: id }));
  }

  async listProjects({ limit, offset }) {
    return this.collection.aggregate([
      { $sort: { created_at: -1, _id: -1 } }, { $skip: offset }, { $limit: limit },
      { $project: { _id: 0, id: '$_id', title: 1, description: 1, created_at: 1, updated_at: 1, task_count: { $size: '$tasks' } } }
    ]).toArray();
  }

  async createProject(input) {
    const now = new Date();
    const document = {
      _id: randomUUID(), title: input.title, description: input.description,
      created_at: now, updated_at: now,
      tasks: input.tasks.map(task => ({ id: randomUUID(), ...task, created_at: now, updated_at: now }))
    };
    await this.collection.insertOne(document);
    return projectResponse(document);
  }

  async updateProject(id, input) {
    return projectResponse(await this.collection.findOneAndUpdate(
      { _id: id }, { $set: input, $currentDate: { updated_at: true } }, afterUpdate
    ));
  }

  async deleteProject(id) {
    const result = await this.collection.deleteOne({ _id: id });
    requireFound(result.deletedCount);
    return { id, deleted: true };
  }

  async getTask(projectId, taskId) {
    const project = await this.getProject(projectId);
    return requireFound(project.tasks.find(task => task.id === taskId), 'Task');
  }

  async createTask(projectId, input) {
    const now = new Date();
    const task = { id: randomUUID(), ...input, created_at: now, updated_at: now };
    const document = await this.collection.findOneAndUpdate(
      // Check capacity and append in the SAME atomic database operation.
      { _id: projectId, [`tasks.${MAX_TASKS - 1}`]: { $exists: false } },
      { $push: { tasks: task }, $currentDate: { updated_at: true } }, afterUpdate
    );
    if (!document) {
      requireFound(await this.collection.findOne({ _id: projectId }, { projection: { _id: 1 } }));
      throw new HttpError(409, 'TASK_LIMIT', 'A project can contain at most 100 tasks.');
    }
    return document.tasks.find(item => item.id === task.id);
  }

  async updateTask(projectId, taskId, input) {
    const fields = {};
    // Only allow fields already checked by shared validation, never client operators.
    if (Object.hasOwn(input, 'title')) fields['tasks.$.title'] = input.title;
    if (Object.hasOwn(input, 'status')) fields['tasks.$.status'] = input.status;
    const document = await this.collection.findOneAndUpdate(
      { _id: projectId, 'tasks.id': taskId },
      { $set: fields, $currentDate: { updated_at: true, 'tasks.$.updated_at': true } }, afterUpdate
    );
    requireFound(document, 'Task');
    return document.tasks.find(task => task.id === taskId);
  }

  async deleteTask(projectId, taskId) {
    const document = await this.collection.findOneAndUpdate(
      { _id: projectId, 'tasks.id': taskId },
      { $pull: { tasks: { id: taskId } }, $currentDate: { updated_at: true } }, afterUpdate
    );
    requireFound(document, 'Task');
    return { id: taskId, deleted: true };
  }
}
