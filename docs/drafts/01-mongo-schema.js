// Original AI schema draft, 2026-11-20. Preserve for audit comparison.
// This script targets mongosh, not the Node.js application runtime.
const trackerDb = db.getSiblingDB('campus_tracker');
const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const titleRule = { bsonType: 'string', minLength: 1, maxLength: 120, pattern: '\\S' };

trackerDb.createCollection('projects', {
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
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
  }
});

// _id already has a unique index. This index supports ordered project lists.
trackerDb.projects.createIndex({ created_at: -1, _id: -1 });
// The API will use $push/$set/$pull and update timestamps atomically.
