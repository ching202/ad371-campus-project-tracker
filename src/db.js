import pg from 'pg';
import { MongoClient } from 'mongodb';
import { SqlStore } from './stores/sql.js';
import { MongoStore } from './stores/mongo.js';

export async function connectDatabases({ trace = process.env.LOG_QUERIES === 'true' } = {}) {
  if (!process.env.POSTGRES_URL || !process.env.MONGODB_URL) throw new Error('Set POSTGRES_URL and MONGODB_URL.');
  const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL,
    max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 5000, lock_timeout: 4000
  });
  pool.on('error', error => console.error(JSON.stringify({ event: 'sql_pool_error', message: error.message })));
  const mongo = new MongoClient(process.env.MONGODB_URL, {
    maxPoolSize: 10, serverSelectionTimeoutMS: 5000, monitorCommands: true
  });
  if (trace) mongo.on('commandStarted', event => {
    if (['find', 'insert', 'update', 'delete', 'findAndModify', 'aggregate'].includes(event.commandName)) {
      console.log(JSON.stringify({ event: 'mongo', command: event.commandName, collection: event.command[event.commandName] }));
    }
  });
  try {
    await Promise.all([pool.query('SELECT 1'), mongo.connect()]);
    await mongo.db('campus_tracker').command({ ping: 1 });
  } catch (error) {
    await Promise.allSettled([pool.end(), mongo.close()]);
    throw error;
  }
  const collection = mongo.db('campus_tracker').collection('projects');
  return {
    pool, mongo, collection,
    stores: { sql: new SqlStore(pool, { trace }), nosql: new MongoStore(collection) },
    async health() {
      const results = await Promise.allSettled([pool.query('SELECT 1'), mongo.db('campus_tracker').command({ ping: 1 })]);
      return { sql: results[0].status === 'fulfilled' ? 'up' : 'down', nosql: results[1].status === 'fulfilled' ? 'up' : 'down' };
    },
    async close() { await Promise.all([pool.end(), mongo.close()]); }
  };
}
