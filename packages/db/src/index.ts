/**
 * Lightweight file-based storage for audit results.
 * PostgreSQL integration will be added in a future version.
 * For now, audits are stored as JSON files on disk.
 */
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditResult } from '@audit/types';

export class AuditStore {
  private baseDir: string;

  constructor(storageDir: string) {
    this.baseDir = join(storageDir, 'audits');
  }

  async init(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(audit: AuditResult): Promise<void> {
    await this.init();
    const filepath = join(this.baseDir, `${audit.id}.json`);
    await writeFile(filepath, JSON.stringify(audit, null, 2), 'utf-8');
  }

  async load(id: string): Promise<AuditResult | null> {
    try {
      const filepath = join(this.baseDir, `${id}.json`);
      const data = await readFile(filepath, 'utf-8');
      return JSON.parse(data) as AuditResult;
    } catch {
      return null;
    }
  }

  async list(): Promise<{ id: string; url: string; status: string; date: string }[]> {
    await this.init();
    const files = await readdir(this.baseDir);
    const results: { id: string; url: string; status: string; date: string }[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await readFile(join(this.baseDir, file), 'utf-8');
        const audit = JSON.parse(data) as AuditResult;
        results.push({
          id: audit.id,
          url: audit.url,
          status: audit.status,
          date: audit.startedAt?.toString() ?? '',
        });
      } catch {
        // skip corrupt files
      }
    }

    return results;
  }

  async getLatestForUrl(url: string): Promise<AuditResult | null> {
    const all = await this.list();
    const matching = all
      .filter((a) => a.url === url && a.status === 'complete')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (matching.length === 0) return null;
    return this.load(matching[0].id);
  }
}
