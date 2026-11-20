// Run with mongosh. Only generated test document IDs are changed or deleted.
const { randomUUID } = require('crypto');
const projects = db.getSiblingDB('campus_tracker').projects;
const projectId = randomUUID();
const fullProjectId = randomUUID();
const firstTaskId = randomUUID();
const secondTaskId = randomUUID();
const now = new Date();

function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  print(`PASS: ${label}`);
}

function rejectInvalid(action, label) {
  let rejected = false;
  try {
    action();
  } catch (error) {
    if (error.code !== 121) throw error;
    rejected = true;
  }
  check(rejected, `${label} (MongoDB code 121)`);
}

function task(id, title) {
  return { id, title, status: 'todo', created_at: now, updated_at: now };
}

try {
  projects.insertOne({
    _id: projectId, title: 'QA: Portfolio website', description: 'Temporary verification',
    created_at: now, updated_at: now,
    tasks: [task(firstTaskId, 'Design the homepage')]
  });
  // This one database query returns the complete project and embedded tasks.
  let complete = projects.findOne({ _id: projectId });
  check(complete?.tasks.length === 1 && complete.tasks[0].id === firstTaskId,
    'Create and single-query complete-document read');
  printjson(complete);

  projects.updateOne({ _id: projectId }, {
    $push: { tasks: task(secondTaskId, 'Test the mobile layout') },
    $currentDate: { updated_at: true }
  });
  check(projects.findOne({ _id: projectId }).tasks.length === 2, 'Atomic embedded task push');

  projects.updateOne({ _id: projectId, 'tasks.id': firstTaskId }, {
    $set: { 'tasks.$.status': 'done' },
    $currentDate: { updated_at: true, 'tasks.$.updated_at': true }
  });
  complete = projects.findOne({ _id: projectId });
  check(complete.tasks.find(t => t.id === firstTaskId).status === 'done', 'Atomic embedded status update');

  projects.updateOne({ _id: projectId }, {
    $set: { title: 'QA: Updated portfolio' }, $currentDate: { updated_at: true }
  });
  check(projects.findOne({ _id: projectId }).title === 'QA: Updated portfolio', 'Project update');

  rejectInvalid(() => projects.updateOne({ _id: projectId }, {
    $push: { tasks: task(firstTaskId, 'Different title, same ID') }
  }), 'Audit fix rejects a duplicate task ID within the same project');
  check(projects.findOne({ _id: projectId }).tasks.length === 2, 'Rejected duplicate leaves the document unchanged');

  rejectInvalid(() => projects.updateOne({ _id: projectId }, { $set: { title: '   ' } }), 'Blank title rejected');
  rejectInvalid(() => projects.updateOne({ _id: projectId, 'tasks.id': firstTaskId }, {
    $set: { 'tasks.$.status': 'invalid' }
  }), 'Invalid task status rejected');

  projects.updateOne({ _id: projectId }, {
    $pull: { tasks: { id: secondTaskId } }, $currentDate: { updated_at: true }
  });
  check(projects.findOne({ _id: projectId }).tasks.length === 1, 'Individual embedded task delete');

  projects.insertOne({
    _id: fullProjectId, title: 'QA: Task limit', description: '',
    created_at: now, updated_at: now,
    tasks: Array.from({ length: 100 }, (_, i) => task(randomUUID(), `Task ${i + 1}`))
  });
  rejectInvalid(() => projects.updateOne({ _id: fullProjectId }, {
    $push: { tasks: task(randomUUID(), 'Task 101') }
  }), 'Bounded array rejects task 101');
  check(projects.findOne({ _id: fullProjectId }).tasks.length === 100, 'Rejected append preserves the 100-task limit');

  projects.deleteOne({ _id: projectId });
  check(projects.findOne({ _id: projectId }) === null, 'Project deletion also removes its embedded tasks');
} finally {
  projects.deleteMany({ _id: { $in: [projectId, fullProjectId] } });
}
