import type { FastifyInstance } from 'fastify';
import { AuditStore } from '@audit/db';
import { generateHtmlReport } from '@audit/reporter';

const store = new AuditStore(process.env.STORAGE_DIR ?? './data');

export function registerReportRoutes(server: FastifyInstance): void {
  // GET /api/audits/:id/report — serve HTML report
  server.get('/api/audits/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const audit = await store.load(id);

    if (!audit) {
      return reply.status(404).send({ error: 'Audit not found' });
    }

    if (audit.status !== 'complete') {
      return reply.status(409).send({ error: 'Audit not yet complete', status: audit.status });
    }

    const html = generateHtmlReport(audit);
    return reply.type('text/html').send(html);
  });

  // GET /api/audits/:id/report/json — serve JSON report
  server.get('/api/audits/:id/report/json', async (request, reply) => {
    const { id } = request.params as { id: string };
    const audit = await store.load(id);

    if (!audit) {
      return reply.status(404).send({ error: 'Audit not found' });
    }

    return reply.send(audit);
  });
}
