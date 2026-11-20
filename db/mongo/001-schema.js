// Reviewed working model. The original remains in docs/drafts/.
const trackerDb = db.getSiblingDB('campus_tracker');
const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const titleRule = { bsonType: 'string', minLength: 1, maxLength: 120, pattern: '\\S' };

trackerDb.createCollection('projects', {
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          required: ['_id', 'title', 'description', 'tasks', 'created_at', 'updated_at'],
          additionalProperties: false,
          properties: {
            _id: { bsonType: 'string', pattern: uuidPattern },
            title: titleRule,
            description: { bsonType: 'string', maxLength: 2000 },
            created_at: { bsonType: 'date' },
            updated_at: { bsonType: 'date' },
            tasks: {
              bsonType: 'array',
              maxItems: 100,
              items: {
                bsonType: 'object',
                required: ['id', 'title', 'status', 'created_at', 'updated_at'],
                additionalProperties: false,
                properties: {
                  id: { bsonType: 'string', pattern: uuidPattern },
                  title: titleRule,
                  status: { enum: ['todo', 'in_progress', 'done'] },
                  created_at: { bsonType: 'date' },
                  updated_at: { bsonType: 'date' }
                }
              }
            }
          }
        }
      },
      {
        // Audit correction: task IDs must be unique WITHIN each project.
        // A unique multikey index would not enforce this within a document.
        $expr: {
          $cond: {
            if: { $isArray: '$tasks' },
            then: {
              $eq: [
                { $size: '$tasks' },
                { $size: { $setUnion: [
                  { $map: { input: '$tasks', as: 'task', in: '$$task.id' } },
                  []
                ] } }
              ]
            },
            else: false
          }
        }
      }
    ]
  }
});

trackerDb.projects.createIndex({ created_at: -1, _id: -1 });
