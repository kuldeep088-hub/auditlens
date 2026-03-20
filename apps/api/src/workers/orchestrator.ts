import type { AuditConfig, AuditResult, CheckResult, GeoQueryResult } from '@audit/types';
import { crawlSite } from '@audit/crawler';
import { runSeoEngine } from '@audit/seo-engine';
import { runAuEngine } from '@audit/au-engine';
import { runGeoEngine } from '@audit/geo-engine';
import { aggregateScores } from '@audit/scoring';
import type { AuditStore } from '@audit/db';

export async function runAuditPipeline(
  auditId: string,
  config: AuditConfig,
  store: AuditStore,
): Promise<void> {
  const startedAt = new Date();

  // Initialize partial result
  const result: AuditResult = {
    id: auditId,
    url: config.url,
    status: 'crawling',
    config,
    crawl: null,
    checks: [],
    geoQueries: [],
    scores: null,
    startedAt,
    completedAt: null,
    error: null,
  };

  try {
    await store.save(result);

    // Phase 1: Crawl
    result.status = 'crawling';
    const crawlResult = await crawlSite(config);
    result.crawl = crawlResult;

    // Phase 2: Analysis
    result.status = 'analyzing';
    const allChecks: CheckResult[] = [];
    let geoQueries: GeoQueryResult[] = [];

    const enginePromises: Promise<void>[] = [];

    if (config.pillars.includes('seo')) {
      enginePromises.push(
        runSeoEngine(crawlResult).then(checks => { allChecks.push(...checks); })
      );
    }

    if (config.pillars.includes('au')) {
      enginePromises.push(
        runAuEngine(crawlResult).then(checks => { allChecks.push(...checks); })
      );
    }

    if (config.pillars.includes('geo')) {
      enginePromises.push(
        runGeoEngine(crawlResult, config).then(geoResult => {
          allChecks.push(...geoResult.checks);
          geoQueries = geoResult.geoQueries;
        })
      );
    }

    await Promise.all(enginePromises);

    result.checks = allChecks;
    result.geoQueries = geoQueries;

    // Phase 3: Scoring
    result.status = 'scoring';
    result.scores = aggregateScores(allChecks);

    // Phase 4: Complete
    result.status = 'complete';
    result.completedAt = new Date();

    await store.save(result);

  } catch (err) {
    result.status = 'failed';
    result.error = err instanceof Error ? err.message : String(err);
    result.completedAt = new Date();
    await store.save(result).catch(() => {});
    throw err;
  }
}
