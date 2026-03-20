#!/usr/bin/env tsx
/**
 * CLI entry point for running a full website audit.
 *
 * Usage:
 *   npx tsx scripts/run-audit.ts https://example.com
 *   npx tsx scripts/run-audit.ts https://example.com --max-pages 50 --pillars seo,au
 */
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AuditConfig,
  AuditResult,
  CheckResult,
  GeoQueryResult,
} from '@audit/types';
import { DEFAULT_AUDIT_CONFIG } from '@audit/types';
import { crawlSite } from '@audit/crawler';
import { runSeoEngine } from '@audit/seo-engine';
import { runAuEngine } from '@audit/au-engine';
import { runGeoEngine } from '@audit/geo-engine';
import { aggregateScores } from '@audit/scoring';
import { generateHtmlReport, generateJsonReport } from '@audit/reporter';
import { AuditStore } from '@audit/db';

// ── Parse CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http'));

if (!url) {
  console.error('Usage: npx tsx scripts/run-audit.ts <url> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --max-pages <n>       Max pages to crawl (default: 1000)');
  console.error('  --pillars <list>      Comma-separated: seo,au,geo (default: all)');
  console.error('  --crawl-delay <ms>    Delay between requests (default: 1000)');
  console.error('  --no-js               Disable JavaScript rendering');
  console.error('  --output <dir>        Output directory (default: ./data)');
  process.exit(1);
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const maxPages = parseInt(getArg('--max-pages') ?? '1000', 10);
const pillarsArg = getArg('--pillars');
const pillars = pillarsArg
  ? (pillarsArg.split(',') as ('seo' | 'au' | 'geo')[])
  : (['seo', 'au', 'geo'] as const);
const crawlDelay = parseInt(getArg('--crawl-delay') ?? '1000', 10);
const renderJs = !args.includes('--no-js');
const outputDir = getArg('--output') ?? './data';

// ── Build config ────────────────────────────────────────────────────
const config: AuditConfig = {
  ...DEFAULT_AUDIT_CONFIG,
  url,
  maxPages,
  pillars: [...pillars],
  crawlDelay,
  renderJs,
  storageDir: outputDir,
};

const auditId = randomUUID();

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║                  AuditLens v0.1                     ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log(`  URL:        ${url}`);
console.log(`  Audit ID:   ${auditId}`);
console.log(`  Pillars:    ${pillars.join(', ')}`);
console.log(`  Max pages:  ${maxPages}`);
console.log(`  JS render:  ${renderJs}`);
console.log(`  Output:     ${outputDir}`);
console.log('');

// ── Run audit ───────────────────────────────────────────────────────
const startedAt = new Date();

try {
  // Phase 1: Crawl
  console.log('─── Phase 1: Crawling ─────────────────────────────────');
  const crawlResult = await crawlSite(config, {
    onPageCrawled: (pageUrl, index, total) => {
      const pct = Math.round((index / Math.min(total, maxPages)) * 100);
      process.stdout.write(`\r  [${pct}%] ${index}/${Math.min(total, maxPages)} pages — ${truncateUrl(pageUrl, 60)}`);
    },
    onLog: (entry) => {
      if (entry.level === 'error') {
        console.log(`\n  ⚠ ${entry.message}`);
      }
    },
  });
  console.log(`\n  ✓ Crawl complete: ${crawlResult.pages.length} pages in ${elapsed(crawlResult.startedAt, crawlResult.completedAt)}`);
  console.log('');

  // Phase 2: Analysis (run engines)
  console.log('─── Phase 2: Analyzing ────────────────────────────────');
  const allChecks: CheckResult[] = [];
  let geoQueries: GeoQueryResult[] = [];

  // Run engines in parallel
  const enginePromises: Promise<void>[] = [];

  if (pillars.includes('seo')) {
    enginePromises.push(
      (async () => {
        console.log('  Running SEO engine...');
        const seoChecks = await runSeoEngine(crawlResult);
        allChecks.push(...seoChecks);
        console.log(`  ✓ SEO: ${seoChecks.length} checks completed`);
      })()
    );
  }

  if (pillars.includes('au')) {
    enginePromises.push(
      (async () => {
        console.log('  Running AU engine...');
        const auChecks = await runAuEngine(crawlResult);
        allChecks.push(...auChecks);
        console.log(`  ✓ AU: ${auChecks.length} checks completed`);
      })()
    );
  }

  if (pillars.includes('geo')) {
    enginePromises.push(
      (async () => {
        console.log('  Running GEO engine...');
        const geoResult = await runGeoEngine(crawlResult, config);
        allChecks.push(...geoResult.checks);
        geoQueries = geoResult.geoQueries;
        console.log(`  ✓ GEO: ${geoResult.checks.length} checks completed`);
      })()
    );
  }

  await Promise.all(enginePromises);
  console.log(`  Total: ${allChecks.length} checks across ${pillars.length} pillar(s)`);
  console.log('');

  // Phase 3: Scoring
  console.log('─── Phase 3: Scoring ──────────────────────────────────');
  const scores = aggregateScores(allChecks);

  console.log(`  Overall Score: ${scores.overall}/100`);
  for (const pillar of scores.pillars) {
    if (pillar.categories.length > 0) {
      console.log(`  ${pillar.pillar.toUpperCase()}: ${pillar.score}/100`);
    }
  }
  console.log(`  Issues: ${scores.issueCount.critical} critical, ${scores.issueCount.high} high, ${scores.issueCount.warning} warnings, ${scores.issueCount.info} info`);
  console.log('');

  // Phase 4: Report Generation
  console.log('─── Phase 4: Generating Reports ───────────────────────');
  const completedAt = new Date();

  const auditResult: AuditResult = {
    id: auditId,
    url,
    status: 'complete',
    config,
    crawl: crawlResult,
    checks: allChecks,
    geoQueries,
    scores,
    startedAt,
    completedAt,
    error: null,
  };

  // Save results
  await mkdir(join(outputDir, 'reports'), { recursive: true });

  const htmlReport = generateHtmlReport(auditResult);
  const htmlPath = join(outputDir, 'reports', `${auditId}.html`);
  await writeFile(htmlPath, htmlReport, 'utf-8');
  console.log(`  ✓ HTML report: ${htmlPath}`);

  const jsonReport = generateJsonReport(auditResult);
  const jsonPath = join(outputDir, 'reports', `${auditId}.json`);
  await writeFile(jsonPath, jsonReport, 'utf-8');
  console.log(`  ✓ JSON report: ${jsonPath}`);

  // Save full audit
  const store = new AuditStore(outputDir);
  await store.save(auditResult);
  console.log(`  ✓ Audit data saved`);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  AUDIT COMPLETE — Score: ${String(scores.overall).padStart(5)}/100                   ║`);
  console.log(`║  Duration: ${elapsed(startedAt, completedAt).padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

} catch (err) {
  console.error('');
  console.error('AUDIT FAILED:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────
function elapsed(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function truncateUrl(urlStr: string, max: number): string {
  if (urlStr.length <= max) return urlStr;
  return urlStr.slice(0, max - 3) + '...';
}
