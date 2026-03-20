import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import type { AuditConfig } from '@audit/types';
import { DEFAULT_AUDIT_CONFIG } from '@audit/types';
import { AuditStore } from '@audit/db';
import { runAuditPipeline } from '../workers/orchestrator.js';

const store = new AuditStore(process.env.STORAGE_DIR ?? './data');

// Track running audits
const runningAudits = new Map<string, { status: string; startedAt: Date }>();

export function registerAuditRoutes(server: FastifyInstance): void {
  // POST /api/audits — start a new audit
  server.post('/api/audits', async (request, reply) => {
    const body = request.body as { url: string; maxPages?: number; pillars?: string[]; geoQueries?: string[] };

    if (!body.url) {
      return reply.status(400).send({ error: 'url is required' });
    }

    const auditId = randomUUID();
    const config: AuditConfig = {
      ...DEFAULT_AUDIT_CONFIG,
      url: body.url,
      maxPages: body.maxPages ?? DEFAULT_AUDIT_CONFIG.maxPages,
      pillars: (body.pillars as any) ?? DEFAULT_AUDIT_CONFIG.pillars,
      geoQueries: body.geoQueries ?? [],
    };

    runningAudits.set(auditId, { status: 'running', startedAt: new Date() });

    // Run async — don't await
    runAuditPipeline(auditId, config, store)
      .then(() => { runningAudits.delete(auditId); })
      .catch(() => { runningAudits.set(auditId, { status: 'failed', startedAt: new Date() }); });

    return reply.status(202).send({ id: auditId, status: 'queued', url: body.url });
  });

  // GET /api/audits — list all audits
  server.get('/api/audits', async (_request, reply) => {
    const audits = await store.list();
    return reply.send(audits);
  });

  // GET /api/audits/:id — get audit by ID
  server.get('/api/audits/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check if still running
    const running = runningAudits.get(id);
    if (running) {
      return reply.send({ id, status: running.status, startedAt: running.startedAt });
    }

    const audit = await store.load(id);
    if (!audit) {
      return reply.status(404).send({ error: 'Audit not found' });
    }
    return reply.send({
      id: audit.id,
      url: audit.url,
      status: audit.status,
      scores: audit.scores,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      totalChecks: audit.checks.length,
      issueCount: audit.scores?.issueCount ?? null,
    });
  });

  // GET /api/audits/:id/checks — get all checks for an audit
  server.get('/api/audits/:id/checks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const audit = await store.load(id);
    if (!audit) {
      return reply.status(404).send({ error: 'Audit not found' });
    }
    return reply.send(audit.checks);
  });
}
