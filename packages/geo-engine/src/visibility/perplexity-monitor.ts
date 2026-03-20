import type { GeoQueryResult } from '@audit/types';
import type { AiEngineAdapter } from './ai-query-runner.js';

export function createPerplexityAdapter(): AiEngineAdapter | null {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  return {
    engine: 'perplexity',
    async query(prompt: string, siteUrl: string): Promise<GeoQueryResult> {
      // Dynamic import to avoid requiring openai as dep if not used
      // Perplexity uses an OpenAI-compatible API
      // @ts-expect-error -- openai is an optional peer dependency
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.perplexity.ai',
      });

      const fullPrompt = `${prompt}\n\nPlease include relevant sources and citations in your response.`;

      const completion = await client.chat.completions.create({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: fullPrompt }],
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content ?? '';
      const domain = new URL(siteUrl).hostname;

      // Check if our site is cited
      const cited = response.toLowerCase().includes(domain.toLowerCase());
      let citedUrl: string | null = null;
      let citedSnippet: string | null = null;
      let citationPosition: number | null = null;

      if (cited) {
        // Find the URL match
        const urlRegex = new RegExp(`https?://[^\s]*${domain.replace('.', '\.')}[^\s]*`, 'i');
        const urlMatch = response.match(urlRegex);
        citedUrl = urlMatch?.[0] ?? siteUrl;

        // Get surrounding context
        const domainIdx = response.toLowerCase().indexOf(domain.toLowerCase());
        const start = Math.max(0, domainIdx - 100);
        const end = Math.min(response.length, domainIdx + 100);
        citedSnippet = response.slice(start, end);

        // Find position (which source number is it)
        const beforeCitation = response.slice(0, domainIdx);
        const linkCount = (beforeCitation.match(/https?:\/\//g) || []).length;
        citationPosition = linkCount + 1;
      }

      return {
        engine: 'perplexity',
        query: prompt,
        response,
        cited,
        citationPosition,
        citedUrl,
        citedSnippet,
        sentiment: 'neutral', // Will be classified by brand-sentiment
        competitorsCited: [], // Will be populated later
        queriedAt: new Date(),
      };
    },
  };
}
