import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAuditRoutes } from './routes/audits.js';
import { registerReportRoutes } from './routes/reports.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });

registerAuditRoutes(server);
registerReportRoutes(server);

const port = parseInt(process.env.PORT ?? '3100', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await server.listen({ port, host });
  console.log(`Audit API server listening on http://${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
