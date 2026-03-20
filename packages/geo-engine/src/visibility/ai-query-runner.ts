import type { GeoQueryResult, AiEngine } from '@audit/types';

export interface AiEngineAdapter {
  engine: AiEngine;
  query(prompt: string, siteUrl: string): Promise<GeoQueryResult>;
}

// Registry of engine adapters
const adapters = new Map<AiEngine, AiEngineAdapter>();

export function registerAdapter(adapter: AiEngineAdapter): void {
  adapters.set(adapter.engine, adapter);
}

export async function runAiQueries(
  queries: string[],
  siteUrl: string,
  engines: AiEngine[],
): Promise<GeoQueryResult[]> {
  const results: GeoQueryResult[] = [];

  for (const query of queries) {
    for (const engineName of engines) {
      const adapter = adapters.get(engineName);
      if (!adapter) {
        // Skip engines without adapters — they may not be configured
        continue;
      }
      try {
        // Rate limit: 2 second delay between queries
        await new Promise(r => setTimeout(r, 2000));
        const result = await adapter.query(query, siteUrl);
        results.push(result);
      } catch (err) {
        // Record failed query as empty result
        results.push({
          engine: engineName,
          query,
          response: '',
          cited: false,
          citationPosition: null,
          citedUrl: null,
          citedSnippet: null,
          sentiment: 'neutral',
          competitorsCited: [],
          queriedAt: new Date(),
        });
      }
    }
  }
  return results;
}
