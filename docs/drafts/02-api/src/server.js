import { connectDatabases } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const connections = await connectDatabases();
const app = createApp(connections);
const server = app.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'ready', port })));
server.requestTimeout = 15000;
server.headersTimeout = 10000;

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ event: 'shutdown', signal }));
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await connections.close();
    clearTimeout(deadline);
  } catch (error) {
    console.error(JSON.stringify({ event: 'shutdown_error', message: error.message }));
    process.exitCode = 1;
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
